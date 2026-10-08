import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { delimiter, dirname, join } from 'node:path';

// This is the npm/cmd-shim wrapper shape, not a hand-written cmd /c stand-in.
function npmShim(target: string) {
  return `@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\nIF EXIST "%dp0%\\node.exe" (\r\n  SET "_prog=%dp0%\\node.exe"\r\n) ELSE (\r\n  SET "_prog=node"\r\n  SET PATHEXT=%PATHEXT:;.JS;=;%\r\n)\r\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%" "%dp0%\\${target}" %*\r\n`;
}

// Use a distinct mock name in PATH tests so a regression cannot launch an installed real CLI.
export async function createMockCli(dir: string, name: string, source: string) {
  const targetDir = join(dir, 'node_modules', 'mojian-test-clis');
  await mkdir(targetDir, { recursive: true });
  const script = source.startsWith('#!') ? source : '#!/usr/bin/env node\n' + source;
  await writeFile(join(targetDir, name + '.cjs'), script);
  const command = join(dir, name + (process.platform === 'win32' ? '.cmd' : ''));
  if (process.platform === 'win32') {
    await writeFile(command, npmShim('node_modules\\mojian-test-clis\\' + name + '.cjs'));
  } else {
    await writeFile(command, script);
    await chmod(command, 0o755);
  }
  return command;
}

// Fixtures receive no credentials, HOME, proxies, or provider configuration from the host.
export function mockCliEnv(bin: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of Object.keys(process.env)) {
    if (/^(SystemRoot|windir|TEMP|TMP)$/i.test(key)) env[key] = process.env[key];
  }
  env[process.platform === 'win32' ? 'Path' : 'PATH'] = [bin, dirname(process.execPath)].join(delimiter);
  if (process.platform === 'win32') env.PATHEXT = '.COM;.EXE;.BAT;.CMD';
  return env;
}
