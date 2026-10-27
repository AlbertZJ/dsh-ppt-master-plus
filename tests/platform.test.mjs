import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  IS_WINDOWS,
  PYTHON_CANDIDATES,
  VENV_PIP_REL,
  VENV_PYTHON_REL,
  candidateLabel,
  homeDir,
  isStoreAliasFailure,
  venvPipPath,
  venvPythonPath,
} from '../lib/platform.js';

/**
 * 平台事实源的单测：解释器候选顺序、venv 布局、HOME 语义与 Store 别名诊断。
 *
 * 这些常量同时被 venv.js / tools.js / skill-provider.js 消费——任何一处与平台约定
 * 分叉，都会表现为「探测说有解释器、真正 spawn 的却是另一条命令」。本套件把
 * 约定钉在单一模块上，其余套件的断言语义由它兜底。
 */

test('IS_WINDOWS 与 process.platform 同源', () => {
  assert.equal(IS_WINDOWS, process.platform === 'win32');
});

test('venv 布局：Windows 用 Scripts/python.exe + Scripts/pip.exe，POSIX 用 bin/python3 + bin/pip3', () => {
  const expectedPython = IS_WINDOWS ? join('Scripts', 'python.exe') : join('bin', 'python3');
  const expectedPip = IS_WINDOWS ? join('Scripts', 'pip.exe') : join('bin', 'pip3');
  assert.equal(VENV_PYTHON_REL, expectedPython);
  assert.equal(VENV_PIP_REL, expectedPip);
  assert.equal(venvPythonPath('/tmp/venv'), join('/tmp/venv', expectedPython));
  assert.equal(venvPipPath('/tmp/venv'), join('/tmp/venv', expectedPip));
});

test('解释器候选：POSIX 只认 python3；Windows 依次 python3 → py -3 → python', () => {
  if (IS_WINDOWS) {
    assert.deepEqual(PYTHON_CANDIDATES, [
      { command: 'python3', args: [] },
      { command: 'py', args: ['-3'] },
      { command: 'python', args: [] },
    ]);
  } else {
    assert.deepEqual(PYTHON_CANDIDATES, [{ command: 'python3', args: [] }]);
  }
});

test('candidateLabel：把参数前缀拼成诊断用命令名（py -3）', () => {
  assert.equal(candidateLabel({ command: 'python3', args: [] }), 'python3');
  assert.equal(candidateLabel({ command: 'py', args: ['-3'] }), 'py -3');
});

test('homeDir：显式 HOME 优先（含空串），未设置时回退 os.homedir()', () => {
  const original = process.env.HOME;
  try {
    process.env.HOME = '/tmp/explicit-home';
    assert.equal(homeDir(), '/tmp/explicit-home');

    // 空串也是「显式设置」：容器/test fixture 常用 HOME='' 隔离状态目录。
    process.env.HOME = '';
    assert.equal(homeDir(), '', '空串不得被当成未设置');
  } finally {
    // 仓库约定：teardown 赋回原值，不 delete。
    process.env.HOME = original ?? '';
  }
});

test('homeDir：HOME 未设置时与 os.homedir() 同值', () => {
  // 在子进程中验证「未设置」分支，避免改本进程环境后影响同文件的其它用例。
  const original = process.env.HOME;
  try {
    delete process.env.HOME;
    assert.equal(homeDir(), homedir());
  } finally {
    process.env.HOME = original ?? '';
  }
});

test('isStoreAliasFailure：POSIX 恒 false；Windows 识别退出码 49 与 store 线索', () => {
  if (!IS_WINDOWS) {
    assert.equal(isStoreAliasFailure('python3', 'Microsoft Store', 49), false);
    return;
  }
  assert.equal(isStoreAliasFailure('python3', '', 49), true, 'Store alias 的退出码 49');
  assert.equal(
    isStoreAliasFailure('python3', 'Python was not found; run without arguments to install from the Microsoft Store', null),
    true,
    'stderr 点名 Microsoft Store',
  );
  assert.equal(
    isStoreAliasFailure('python3', 'C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps\\python3.exe', null),
    true,
    'stderr 点名 WindowsApps',
  );
  assert.equal(isStoreAliasFailure('py', '', 49), false, '49 只对 python 系命令生效');
  assert.equal(isStoreAliasFailure('python3', 'some other failure', 1), false);
});
