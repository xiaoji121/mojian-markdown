// TEST-only installer smoke entry point and native lifecycle helpers. Importing
// this module never installs anything; Playwright owns the UI assertions.
import { execFile, spawn } from 'node:child_process';
import { appendFile, copyFile, mkdir, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve, win32 } from 'node:path';
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

// The app keeps the stricter mock CLI environment. Stock NSIS process checks
// additionally need Windows bootstrap tools, USERNAME and system module paths.
// Never inherit tokens, user PATH entries, profiles or arbitrary PSModulePath.
export function windowsInstallerEnv(appEnv, host = process.env) {
  const env = { ...appEnv };
  const allowed = /^(SystemRoot|windir|COMSPEC|PATHEXT|USERNAME|USERDOMAIN|COMPUTERNAME|ProgramFiles|ProgramFiles\(x86\)|ProgramW6432|ProgramData|ALLUSERSPROFILE)$/i;
  for (const [key, value] of Object.entries(host)) if (allowed.test(key) && value) env[key] = value;
  const systemRoot = Object.entries(env).find(([key]) => /^systemroot$/i.test(key))?.[1];
  if (!systemRoot) throw new Error('Windows installer requires SystemRoot.');
  const system32 = win32.join(systemRoot, 'System32');
  const powershell = win32.join(system32, 'WindowsPowerShell', 'v1.0');
  const appPath = Object.entries(appEnv).find(([key]) => /^path$/i.test(key))?.[1];
  for (const key of Object.keys(env)) if (/^path$/i.test(key)) delete env[key];
  env.Path = [appPath, systemRoot, system32, win32.join(system32, 'Wbem'), powershell].filter(Boolean).join(';');
  env.PSModulePath = [win32.join(powershell, 'Modules'),
    env.ProgramFiles && win32.join(env.ProgramFiles, 'WindowsPowerShell', 'Modules')].filter(Boolean).join(';');
  return env;
}

export function installerKillArguments(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Refusing invalid installer PID.');
  return ['/PID', String(pid), '/T', '/F'];
}

export async function runInstallerCommand(file, args, options) {
  const { stage, report, diagnose, stop, timeout = 120_000, execute: start = execute, ...spawnOptions } = options;
  const started = Date.now();
  report(`${stage}: starting ${basename(file)}`);
  const pending = start(file, args, { maxBuffer: 4 * 1024 * 1024, windowsHide: true,
    shell: false, ...spawnOptions });
  report(`${stage}: native PID ${pending.child?.pid ?? 'unavailable'}`);
  let timedOut = false;
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(async () => {
      timedOut = true;
      report(`${stage}: timed out after ${timeout}ms; collecting diagnostics before PID-tree termination`);
      try { await diagnose(pending.child?.pid); }
      catch (error) { report(`${stage}: diagnostic error: ${error.message}`); }
      try {
        if (pending.child?.exitCode === null && pending.child?.signalCode === null) await stop(pending.child.pid);
      } catch (error) { report(`${stage}: PID-tree termination error: ${error.message}`); }
      reject(new Error(`${stage} timed out after ${timeout}ms: ${basename(file)}`));
    }, timeout);
  });
  // Once timeout collection starts, an exit cannot turn this into success or
  // hide diagnostics behind execFile's less useful SIGTERM exception.
  const completion = pending.then(value => timedOut ? deadline : value, error => timedOut ? deadline : Promise.reject(error));
  try {
    const result = await Promise.race([completion, deadline]);
    report(`${stage}: completed in ${Date.now() - started}ms`);
    return result;
  } catch (error) {
    report(`${stage}: failed after ${Date.now() - started}ms: ${error.message}`);
    throw error;
  } finally { clearTimeout(timer); }
}

async function nativeDiagnostics(pid, root, directory, env, stage) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return;
  await mkdir(directory, { recursive: true });
  const systemRoot = Object.entries(env).find(([key]) => /^systemroot$/i.test(key))[1];
  const powershell = win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const script = `
$ErrorActionPreference = 'Stop'
$root = $env:MOJIAN_SMOKE_ROOT
$out = $env:MOJIAN_SMOKE_DIAGNOSTICS
$targetPid = [int]$env:MOJIAN_SMOKE_PID
# Write an initial snapshot before CIM, in case CIM itself is what has stalled.
$scoped = @(Get-Process | Where-Object { $_.Id -eq $targetPid -or ($_.Path -and $_.Path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) })
$scoped | Select-Object Id,ProcessName,Path,MainWindowTitle | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath ($out + '-processes.json')
$all = @(Get-CimInstance Win32_Process)
$ids = @($targetPid)
do { $next = @($all | Where-Object { $ids -contains $_.ParentProcessId -and $ids -notcontains $_.ProcessId } | ForEach-Object { [int]$_.ProcessId }); $ids += $next } while ($next.Count)
$all | Where-Object { $ids -contains $_.ProcessId -or ($_.ExecutablePath -and $_.ExecutablePath.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) } | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath ($out + '-process-tree.json')
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class SmokeWindow {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left,Top,Right,Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out Rect r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
}
'@
# Capture only windows owned by this fixture/installer tree, never other apps.
Get-Process | Where-Object { ($ids -contains $_.Id -or ($_.Path -and $_.Path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase))) -and $_.MainWindowHandle -ne 0 } | ForEach-Object {
  $rect = New-Object SmokeWindow+Rect
  if ([SmokeWindow]::GetWindowRect($_.MainWindowHandle, [ref]$rect) -and ($rect.Right - $rect.Left) -gt 0 -and ($rect.Bottom - $rect.Top) -gt 0) {
    $bitmap = New-Object Drawing.Bitmap ($rect.Right - $rect.Left),($rect.Bottom - $rect.Top)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $dc = $graphics.GetHdc()
    try { $captured = [SmokeWindow]::PrintWindow($_.MainWindowHandle, $dc, 2) } finally { $graphics.ReleaseHdc($dc); $graphics.Dispose() }
    if ($captured) { $bitmap.Save(($out + '-window-' + $_.Id + '.png'), [Drawing.Imaging.ImageFormat]::Png) }
    $bitmap.Dispose()
  }
}
`;
  try {
    await run(powershell, ['-NoProfile', '-NonInteractive', '-Command', script], {
      timeout: 15_000, env: { ...env, MOJIAN_SMOKE_ROOT: root,
        MOJIAN_SMOKE_DIAGNOSTICS: join(directory, stage), MOJIAN_SMOKE_PID: String(pid) }
    });
  } catch (error) {
    await writeFile(join(directory, `${stage}-diagnostic-error.txt`), String(error.stack || error));
  }
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

function windowsSession({ installerPath, upgradeInstallerPath, root, env: appEnv, diagnosticsDir = root }) {
  const env = windowsInstallerEnv(appEnv);
  const installDir = join(root, `installed ${PRODUCT}`);
  const executablePath = join(installDir, `${PRODUCT}.exe`);
  const options = { cwd: root, env, windowsVerbatimArguments: true };
  let nativeFailed = false;
  let logWrites = Promise.resolve();
  const report = message => {
    const line = `[${new Date().toISOString()}] ${message}`;
    console.log(line);
    logWrites = logWrites.then(async () => {
      await mkdir(diagnosticsDir, { recursive: true });
      await appendFile(join(diagnosticsDir, 'native-stages.log'), line + '\n');
    });
  };
  const native = async (file, args, stage, timeout = 120_000) => {
    try {
      const systemRoot = Object.entries(env).find(([key]) => /^systemroot$/i.test(key))[1];
      return await runInstallerCommand(file, args, { ...options, stage, timeout, report,
        diagnose: pid => nativeDiagnostics(pid, root, diagnosticsDir, env, stage),
        stop: pid => run(win32.join(systemRoot, 'System32', 'taskkill.exe'), installerKillArguments(pid),
          { env, timeout: 10_000 })
      });
    } catch (error) { nativeFailed = true; throw error; }
    finally { await logWrites; }
  };
  const install = async (path, stage) => {
    await native(path, nsisInstallArguments(installDir), stage);
    await waitForPath(executablePath, true);
  };
  const uninstall = async (stage = 'uninstall', timeout = 120_000) => {
    if (!await exists(installDir)) return;
    const uninstallers = (await readdir(installDir)).filter(name => /^Uninstall .+\.exe$/i.test(name));
    if (uninstallers.length !== 1) {
      throw new Error(`Expected exactly one TEST uninstaller in ${installDir}; found ${uninstallers.length}.`);
    }
    const isolated = join(root, 'run TEST uninstaller.exe');
    await copyFile(join(installDir, uninstallers[0]), isolated);
    // _?= last/unquoted runs synchronously instead of forking a second copy.
    await native(isolated, ['/S', '/currentuser', `_?=${installDir}`], stage, timeout);
    await waitForPath(executablePath, false);
  };
  return {
    executablePath,
    install: () => install(installerPath, 'install'),
    upgrade: () => install(upgradeInstallerPath, 'upgrade'),
    uninstall,
    async dispose() {
      if (nativeFailed) {
        report('cleanup: native failure already recorded; retaining TEST fixture instead of starting another uninstaller');
        await logWrites;
        return;
      }
      if (await exists(installDir)) {
        const names = await readdir(installDir);
        if (names.some(name => /^Uninstall .+\.exe$/i.test(name))) await uninstall('cleanup-uninstall', 30_000);
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
