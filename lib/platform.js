/**
 * Platform facts shared by the venv and tool layers.
 *
 * Upstream ppt-master is a Python skill, so the wrapper only needs the interpreter,
 * the installer and the two venv entry points. Keeping them in one module means the
 * existence probe, the interpreter reported to the model and the command that is
 * actually spawned cannot drift apart — and it is the single place that knows the
 * Windows spellings (`py -3`, `Scripts/python.exe`) instead of the POSIX ones
 * (`python3`, `bin/python3`).
 *
 * @module dsh-ppt-master-plus/lib/platform
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

/** `process.platform` narrowed once, so no consumer re-tests the string. */
export const IS_WINDOWS = process.platform === 'win32';

/**
 * The home directory, with POSIX `$HOME` semantics on every platform.
 *
 * `os.homedir()` reads `USERPROFILE` on Windows and ignores `HOME`; `$HOME` is
 * still how containers, CI and test fixtures isolate a home directory, so an
 * explicitly set `HOME` (including the empty string) wins. When it is unset the
 * platform default from `os.homedir()` applies.
 *
 * @returns {string}
 */
export function homeDir() {
  return Object.prototype.hasOwnProperty.call(process.env, 'HOME')
    ? process.env.HOME
    : homedir();
}

/**
 * Interpreter path relative to a venv root. CPython's venv layout is part of the
 * platform contract: `bin/python3` on POSIX, `Scripts/python.exe` on Windows.
 */
export const VENV_PYTHON_REL = IS_WINDOWS ? join('Scripts', 'python.exe') : join('bin', 'python3');

/** Installer entry relative to a venv root, with the same platform split. */
export const VENV_PIP_REL = IS_WINDOWS ? join('Scripts', 'pip.exe') : join('bin', 'pip3');

/**
 * System interpreters to try, in order. A candidate is `{ command, args }`; `args`
 * is the prefix inserted before `--version`, `-c`, `-m` and so on, which is what
 * lets `py -3` look like an ordinary command to the rest of the module.
 *
 * Windows gets three candidates because no single spelling is guaranteed: the
 * Microsoft Store alias installs a `python3.exe` that may be a stub (exit 49), the
 * python.org installer provides `py.exe`, and some distributions only ship
 * `python.exe`. POSIX keeps the upstream contract (`python3`).
 */
export const PYTHON_CANDIDATES = IS_WINDOWS
  ? [
      { command: 'python3', args: [] },
      { command: 'py', args: ['-3'] },
      { command: 'python', args: [] },
    ]
  : [{ command: 'python3', args: [] }];

/**
 * The venv interpreter path for a resolved venv directory.
 *
 * @param {string} venvDir Absolute venv directory.
 * @returns {string} `<venvDir>/bin/python3` or `<venvDir>\\Scripts\\python.exe`.
 */
export function venvPythonPath(venvDir) {
  return join(venvDir, VENV_PYTHON_REL);
}

/**
 * The venv installer path for a resolved venv directory.
 *
 * @param {string} venvDir Absolute venv directory.
 * @returns {string} `<venvDir>/bin/pip3` or `<venvDir>\\Scripts\\pip.exe`.
 */
export function venvPipPath(venvDir) {
  return join(venvDir, VENV_PIP_REL);
}

/**
 * The label for a candidate — only diagnostics and error messages use it.
 *
 * @param {{ command: string, args: string[] }} candidate
 * @returns {string} e.g. `python3` or `py -3`.
 */
export function candidateLabel(candidate) {
  return [candidate.command, ...candidate.args].join(' ');
}

/**
 * Whether a path spells the Microsoft Store execution-alias stub. The stub starts
 * and exits with code 49 without running Python, so treating it as an interpreter
 * produces the misleading "python3 exists but cannot run" state this wrapper tries
 * to explain.
 *
 * @param {string} command
 * @param {string} [stderr]
 * @param {number|null} [exitCode]
 * @returns {boolean}
 */
export function isStoreAliasFailure(command, stderr = '', exitCode = null) {
  if (!IS_WINDOWS) return false;
  const text = String(stderr).toLowerCase();
  return (exitCode === 49 && /python/i.test(command))
    || text.includes('windowsapps')
    || text.includes('microsoft store');
}

