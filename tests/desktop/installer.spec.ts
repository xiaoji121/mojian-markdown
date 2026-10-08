import { _electron as electron, expect, test, type ElectronApplication, type Page, type TestInfo } from '@playwright/test';
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInstallerSession, validateInstallerInputs } from '../../scripts/installer-smoke.mjs';
import { mockCliEnv } from '../helpers/mockCli';
import { closeEditorWindow } from './restartScenarios';
import { freezeRendererClock } from './freezeRendererClock';

// These tests run only against deliberately separate TEST installers. The normal
// desktop suite skips them. The CLI wrapper rejects missing inputs, so a CI
// installer job cannot accidentally pass by skipping the entire scenario.
const installerPath = process.env.MOJIAN_INSTALLER_PATH;
test.skip(!installerPath || !['win32', 'darwin'].includes(process.platform),
  'Requires a Windows TEST NSIS installer or macOS TEST DMG');
test.setTimeout(300_000);

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'mojian TEST installer '));
  const userData = join(root, '用户 数据');
  const home = join(root, 'empty-home');
  const bin = join(root, 'empty-bin');
  const documents = join(root, '中文 文档');
  await Promise.all([userData, home, bin, documents].map(path => mkdir(path)));
  const documentPath = join(documents, 'synthetic-preserved.md');
  const documentContent = '# Synthetic installer fixture\n\nNever a real user document.\n';
  await writeFile(documentPath, documentContent, 'utf8');
  const sentinelPath = join(userData, 'synthetic-preserved.txt');
  await writeFile(sentinelPath, 'TEST userData must survive installation changes.\n', 'utf8');
  const env = {
    ...mockCliEnv(bin), HOME: home, USERPROFILE: home, APPDATA: home, LOCALAPPDATA: home,
    XDG_CONFIG_HOME: home, XDG_CACHE_HOME: home, MOJIAN_USER_DATA: userData,
    AGENT_BRIDGE_WORKSPACE: '', NO_PROXY: 'localhost,127.0.0.1,::1',
    AGENT_BRIDGE_CLAUDE_COMMAND: join(bin, 'missing-test-claude'),
    AGENT_BRIDGE_CODEX_COMMAND: join(bin, 'missing-test-codex'),
    AGENT_BRIDGE_LARK_COMMAND: join(bin, 'missing-test-lark'),
    AGENT_BRIDGE_DWS_COMMAND: join(bin, 'missing-test-dws')
  };
  return { root, userData, env, documentPath, documentContent, sentinelPath };
}

type Fixture = Awaited<ReturnType<typeof createFixture>>;

async function launchInstalled(executablePath: string, fixture: Fixture, onLaunch: (app: ElectronApplication) => void) {
  const app = await electron.launch({
    executablePath, cwd: fixture.root, env: fixture.env,
    args: ['--lang=zh-CN', '--disable-background-networking', '--use-mock-keychain',
      '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=localhost;127.0.0.1;[::1]']
  });
  onLaunch(app);
  // No credentials are seeded or used. Make accidental credential operations
  // fail, and guard Node sockets as well as Chromium's loopback-only proxy.
  await app.evaluate(({ safeStorage, shell }) => {
    safeStorage.isEncryptionAvailable = () => false;
    safeStorage.encryptString = () => { throw new Error('Installer smoke forbids credential writes'); };
    safeStorage.decryptString = () => { throw new Error('Installer smoke forbids credential reads'); };
    shell.openExternal = async () => { throw new Error('Installer smoke forbids external links'); };
    const net = process.getBuiltinModule('net');
    const connect = net.Socket.prototype.connect;
    net.Socket.prototype.connect = function (...args) {
      const value = Array.isArray(args[0]) ? args[0][0] : args[0];
      const host = value && typeof value === 'object' ? (value.host || value.hostname || 'localhost')
        : typeof args[1] === 'string' ? args[1] : 'localhost';
      if (!['127.0.0.1', '::1', 'localhost'].includes(host)) throw new Error('Test blocked external network');
      return connect.apply(this, args);
    };
  });
  const context = app.context();
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      ? route.continue() : route.abort();
  });
  const details = await app.evaluate(({ app }) => ({
    packaged: app.isPackaged, name: app.getName(), version: app.getVersion(), userData: app.getPath('userData')
  }));
  expect(details.packaged).toBe(true);
  expect(details.name).toBe('Mojian Markdown TEST');
  expect(details.userData).toBe(fixture.userData);
  expect(details.version).toMatch(/^1\.0\.0-test\.[0-9A-Za-z-]+\.[12]$/);
  const page = await app.firstWindow();
  await expect(page.locator('.md-source')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => page.locator('img[src$="/favicon.svg"]').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  expect(await page.evaluate(() => fetch('/health').then(response => response.json()))).toEqual({ ok: true });
  return { app, page, version: details.version };
}

async function editImmediatelyBeforeClose(page: Page, content: string) {
  // The shared clock fixture makes close persistence deterministic, even if a
  // hosted runner stalls longer than the ordinary autosave debounce.
  await freezeRendererClock(page);
  await page.locator('.md-source').evaluate((element, value) => {
    const source = element as HTMLTextAreaElement;
    source.value = value;
    source.dispatchEvent(new Event('input', { bubbles: true }));
  }, content);
}

async function assertPreserved(fixture: Fixture, content: string) {
  const state = JSON.parse(await readFile(join(fixture.userData, 'editor-state.json'), 'utf8'));
  expect(state.state.content).toBe(content);
  expect(state.state.localFilePath || '').toBe('');
  expect(await readFile(fixture.documentPath, 'utf8')).toBe(fixture.documentContent);
  expect(await readFile(fixture.sentinelPath, 'utf8')).toBe('TEST userData must survive installation changes.\n');
}

async function recordStage(testInfo: TestInfo, page: Page, stage: string, version: string) {
  testInfo.annotations.push({ type: stage, description: `Packaged TEST version ${version}` });
  const loaded = await page.evaluate(async () => {
    const roman = await document.fonts.load('400 16px "Source Serif 4"');
    const italic = await document.fonts.load('italic 700 16px "Source Serif 4"');
    await document.fonts.ready;
    return [roman.length, italic.length];
  });
  expect(loaded.every(count => count > 0)).toBe(true);
  const path = testInfo.outputPath(`${stage}.png`);
  await page.screenshot({ path });
  await testInfo.attach(stage, { path, contentType: 'image/png' });
}

async function stopFailedApp(app?: ElectronApplication) {
  if (!app) return;
  const child = app.process();
  if (child.exitCode !== null || child.signalCode !== null) return;
  // Only error cleanup force-kills; all tested restarts use the real window
  // close/save handshake. Never use process-name/taskkill matching here.
  await new Promise<void>(resolve => {
    const timer = setTimeout(resolve, 10_000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.kill('SIGKILL');
  });
}

test('TEST installer preserves an unnamed draft across restart and Windows upgrade/uninstall', async ({}, testInfo) => {
  const inputs = await validateInstallerInputs(process.platform, process.env);
  const fixture = await createFixture();
  const installer = createInstallerSession({ ...inputs, root: fixture.root, env: fixture.env,
    diagnosticsDir: testInfo.outputPath('native') });
  const stage = async (message: string) => {
    const line = `[${new Date().toISOString()}] ${message}`;
    console.log(line);
    await appendFile(testInfo.outputPath('smoke-stages.log'), line + '\n');
  };
  let active: ElectronApplication | undefined;
  const launch = () => launchInstalled(installer.executablePath, fixture, app => { active = app; });
  let completed = false;
  try {
    await stage('Installing TEST package');
    await installer.install();
    await stage('Launching installed TEST package');
    let current = await launch();
    expect(current.version).toMatch(/\.1$/);
    const initialVersion = current.version;
    let content = '# Installer synthetic draft\n\n中文空格路径，关闭前最后输入。\n\nReading with **bold**, *italic*, ***bold italic*** and `code()`. 日本語の文章。\n';
    await editImmediatelyBeforeClose(current.page, content);
    await recordStage(testInfo, current.page, 'installed-editor', current.version);
    await closeEditorWindow(current.app);
    active = undefined;
    await assertPreserved(fixture, content);

    await stage('First window closed; restarting installed TEST package');
    current = await launch();
    expect(current.version).toBe(initialVersion);
    await expect(current.page.locator('.md-source')).toHaveValue(content);
    await recordStage(testInfo, current.page, 'restarted-editor', current.version);
    await closeEditorWindow(current.app);
    active = undefined;

    if (process.platform === 'win32') {
      await stage('Restart window closed; beginning Windows upgrade');
      await installer.upgrade();
      await stage('Upgrade returned; launching newer TEST package');
      await assertPreserved(fixture, content);
      current = await launch();
      expect(current.version).toBe(initialVersion.replace(/\.1$/, '.2'));
      await expect(current.page.locator('.md-source')).toHaveValue(content);
      content += '\n升级后继续编辑，退出后仍然保存。\n';
      await editImmediatelyBeforeClose(current.page, content);
      await recordStage(testInfo, current.page, 'upgraded-editor', current.version);
      await closeEditorWindow(current.app);
      active = undefined;
      await assertPreserved(fixture, content);
      const draftBeforeUninstall = await readFile(join(fixture.userData, 'editor-state.json'));
      await stage('Upgraded window closed; beginning Windows uninstall');
      await installer.uninstall();
      await stage('Uninstaller returned; checking preserved data');
      await assertPreserved(fixture, content);
      expect(await readFile(join(fixture.userData, 'editor-state.json'))).toEqual(draftBeforeUninstall);
      testInfo.annotations.push({ type: 'uninstalled', description: 'App removed; synthetic document and userData preserved' });
    }
    completed = true;
  } catch (error) {
    const failurePath = testInfo.outputPath('installer-failure.txt');
    await writeFile(failurePath, String(error instanceof Error ? error.stack : error));
    await testInfo.attach('installer-failure', { path: failurePath, contentType: 'text/plain' });
    const page = active?.windows().find(page => !page.isClosed());
    if (page) await page.screenshot({ path: testInfo.outputPath('failure-editor.png'), timeout: 5_000 }).catch(() => {});
    throw error;
  } finally {
    await stopFailedApp(active);
    // Detach mounted images and remove only this fixture's test installation.
    // Failed artifacts remain under the printed temporary path for diagnosis.
    try {
      await installer.dispose();
      if (completed) await rm(fixture.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch (error) {
      testInfo.annotations.push({ type: 'cleanup', description: String(error) });
      if (completed) throw error;
    }
    if (!completed) {
      const message = `Installer smoke fixture retained at ${fixture.root}`;
      console.error(message);
      await writeFile(testInfo.outputPath('retained-fixture.txt'), message);
    }
  }
});
