// TEST-only installer smoke entry point and native lifecycle helpers. Importing
// this module never installs anything; Playwright owns the UI assertions.
import { execFile, spawn } from 'node:child_process';
import { copyFile, mkdir, readdir, realpath, stat } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const execute = promisify(execFile);
const PRODUCT = 'Mojian Markdown TEST';
const TEST_APP_ID = 'com.yuxizhai.mojian-markdown.test';

export async function validateInstallerInputs(platform, env) {
  if (!['win32', 'darwin'].includes(platform)) {
    throw new Error('Installer smoke requires Windows or macOS; it cannot pass on an unsupported host.');
  }
  const extension = platform === 'win32' ? '.exe' : '.dmg';
  const validate = async (key) => {
    if (!env[key]) throw new Error(`${key} is required; refusing a skipped installer smoke.`);
    const path = resolve(env[key]);
    if (extname(path).toLowerCase() !== extension || !/(?:^|[ ._-])TEST(?:[ ._-]|$)/i.test(basename(path))) {
      throw new Error(`${key} must name a separate TEST ${extension} installer.`);
    }
    if (!(await stat(path)).isFile()) throw new Error(`${key} is not a file.`);
    return realpath(path);
  };
  const installerPath = await validate('MOJIAN_INSTALLER_PATH');
  const upgradeInstallerPath = platform === 'win32' ? await validate('MOJIAN_UPGRADE_INSTALLER_PATH') : undefined;
  if (installerPath === upgradeInstallerPath) throw new Error('Windows upgrade must use a different, newer TEST installer.');
  return { platform, installerPath, upgradeInstallerPath };
}

export function nsisInstallArguments(installDir) {
  // NSIS requires /D= to be LAST and unquoted, even when it contains spaces.
  // Pass with windowsVerbatimArguments and shell:false; never through cmd.exe.
  return ['/S', '/currentuser', `/D=${installDir}`];
}

async function run(file, args, options) {
  try {
    return await execute(file, args, {
      timeout: 120_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true,
      shell: false, ...options
    });
  } catch (error) {
    throw new Error(`${basename(file)} failed (${error.code ?? error.signal ?? 'unknown'}):\n${error.stderr || error.message}`,
      { cause: error });
  }
}

async function exists(path) {
  try { await stat(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function waitForPath(path, present) {
  const deadline = Date.now() + 30_000;
  do {
    if (await exists(path) === present) return;
    await delay(200);
  } while (Date.now() < deadline);
  throw new Error(`Expected ${path} to ${present ? 'exist after installation' : 'be removed by the uninstaller'}.`);
}

function windowsSession({ installerPath, upgradeInstallerPath, root, env }) {
  const installDir = join(root, `installed ${PRODUCT}`);
  const executablePath = join(installDir, `${PRODUCT}.exe`);
  const options = { cwd: root, env, windowsVerbatimArguments: true };
  const install = async (path) => {
    await run(path, nsisInstallArguments(installDir), options);
    await waitForPath(executablePath, true);
  };
  const uninstall = async () => {
    if (!await exists(installDir)) return;
    const uninstallers = (await readdir(installDir)).filter(name => /^Uninstall .+\.exe$/i.test(name));
    if (uninstallers.length !== 1) {
      throw new Error(`Expected exactly one TEST uninstaller in ${installDir}; found ${uninstallers.length}.`);
    }
    // Run an isolated copy with _?= last/unquoted so NSIS does not fork and
    // return early. Its installed original can then be removed synchronously.
    const isolated = join(root, 'run TEST uninstaller.exe');
    await copyFile(join(installDir, uninstallers[0]), isolated);
    await run(isolated, ['/S', '/currentuser', `_?=${installDir}`], options);
    await waitForPath(executablePath, false);
  };
  return {
    executablePath,
    install: () => install(installerPath),
    upgrade: () => install(upgradeInstallerPath),
    uninstall,
    async dispose() {
      // An earlier failed install may still have registered its uninstaller.
      if (await exists(installDir)) {
        const names = await readdir(installDir);
        if (names.some(name => /^Uninstall .+\.exe$/i.test(name))) await uninstall();
        else if (await exists(executablePath)) throw new Error('TEST app remains without an uninstaller.');
      }
    }
  };
}

function macSession({ installerPath, root, env }) {
  const mountPoint = join(root, 'readonly TEST image');
  const appName = `${PRODUCT}.app`;
  const installedBundle = join(root, appName);
  let executablePath;
  let mounted = false;
  const options = { cwd: root, env };
  const detach = async () => {
    if (!mounted) return;
    // Never force-detach a busy volume; surface the cleanup failure instead.
    await run('/usr/bin/hdiutil', ['detach', mountPoint], options);
    mounted = false;
  };
  return {
    get executablePath() {
      if (mounted || !executablePath) throw new Error('DMG must be copied and detached before launch.');
      return executablePath;
    },
    async install() {
      await mkdir(mountPoint);
      await run('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-noautoopen',
        '-mountpoint', mountPoint, installerPath], options);
      mounted = true;
      try {
        const source = join(mountPoint, appName);
        const plist = join(source, 'Contents', 'Info.plist');
        const bundleId = (await run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', plist], options)).stdout.trim();
        if (bundleId !== TEST_APP_ID) throw new Error(`Refusing non-TEST bundle: ${bundleId}`);
        const executable = (await run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleExecutable', plist], options)).stdout.trim();
        if (executable !== PRODUCT) throw new Error(`Unexpected TEST app executable: ${executable}`);
        // ditto preserves the bundle's symlinks, executable bits and metadata.
        await run('/usr/bin/ditto', [source, installedBundle], options);
        executablePath = join(installedBundle, 'Contents', 'MacOS', executable);
        await waitForPath(executablePath, true);
      } finally {
        await detach();
      }
    },
    dispose: detach
  };
}

export function createInstallerSession(options) {
  if (options.platform === 'win32') return windowsSession(options);
  if (options.platform === 'darwin') return macSession(options);
  throw new Error('Unsupported installer smoke platform.');
}

async function main() {
  const inputs = await validateInstallerInputs(process.platform, process.env);
  const require = createRequire(import.meta.url);
  const repository = fileURLToPath(new URL('../', import.meta.url));
  const child = spawn(process.execPath, [require.resolve('@playwright/test/cli'), 'test',
    '--config', 'playwright.desktop.config.ts', 'installer.spec.ts'], {
    cwd: repository, stdio: 'inherit', shell: false,
    env: { ...process.env, MOJIAN_INSTALLER_PATH: inputs.installerPath,
      ...(inputs.upgradeInstallerPath ? { MOJIAN_UPGRADE_INSTALLER_PATH: inputs.upgradeInstallerPath } : {}) }
  });
  process.exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => signal ? reject(new Error(`Playwright exited with ${signal}`)) : resolve(code ?? 1));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
