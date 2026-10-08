import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mockCliEnv } from '../helpers/mockCli';
import { closeEditorWindow } from './restartScenarios';

export function registerSecureSettingsScenario(label: string, executablePath?: string) {
  test(`${label} fake secure settings require consent and survive save/clear/restart`, async () => {
    test.skip(process.platform !== 'win32', 'Mocked Windows safeStorage integration');
    const root = await mkdtemp(join(tmpdir(), '墨笺 fake 安全存储 '));
    const userData = join(root, '用户 数据');
    const workspace = join(root, 'reading-workspace');
    await mkdir(workspace); await mkdir(userData);
    const settingsPath = join(workspace, 'settings.json');
    const fakeKey = 'FAKE-ONLY-mojian-key-never-valid';
    await writeFile(settingsPath, JSON.stringify({ providers: { gemini: { apiKey: fakeKey } } }));
    const launch = async () => {
      const app = await electron.launch({ executablePath,
        args: [...(executablePath ? [] : ['.']), '--lang=zh-CN', '--disable-background-networking',
          '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=localhost;127.0.0.1;[::1]'],
        env: { ...mockCliEnv(root), MOJIAN_USER_DATA: userData, AGENT_BRIDGE_WORKSPACE: workspace,
          AGENT_BRIDGE_CLAUDE_COMMAND: join(root, 'missing-test-claude'),
          AGENT_BRIDGE_CODEX_COMMAND: join(root, 'missing-test-codex'),
          AGENT_BRIDGE_LARK_COMMAND: join(root, 'missing-test-lark'),
          AGENT_BRIDGE_DWS_COMMAND: join(root, 'missing-test-dws') }
      });
      // OS encryption is always replaced before a save/migration/use. This tests
      // the packaged wiring and transaction, not the runner's actual keychain.
      await app.evaluate(({ safeStorage }) => {
        const crypto = process.getBuiltinModule('crypto');
        const key = Buffer.alloc(32, 71); // deliberately fake fixture key
        safeStorage.isEncryptionAvailable = () => true;
        safeStorage.encryptString = (value) => {
          const iv = crypto.randomBytes(12);
          const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
          return Buffer.concat([iv, cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()]);
        };
        safeStorage.decryptString = (value) => {
          const decipher = crypto.createDecipheriv('aes-256-gcm', key, value.subarray(0, 12));
          decipher.setAuthTag(value.subarray(-16));
          return Buffer.concat([decipher.update(value.subarray(12, -16)), decipher.final()]).toString('utf8');
        };
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
      const page = await app.firstWindow();
      await page.route('**/*', (route) => {
        const url = new URL(route.request().url());
        return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort();
      });
      await expect(page.locator('.md-source')).toBeVisible();
      return { app, page };
    };
    let current = await launch();
    try {
      const call = (operation, payload = undefined) => current.page.evaluate(({ operation, payload }) =>
        (window as any).mojianDesktop.aiSettings(operation, payload), { operation, payload });
      const before = await call('load');
      expect(before.value.providers.gemini.credentialStatus).toBe('migration-required');
      expect(JSON.stringify(before)).not.toContain(fakeKey);
      expect(await readFile(settingsPath, 'utf8')).toContain(fakeKey);
      expect((await call('migrate', { consent: false })).ok).toBe(false);
      expect(await readFile(settingsPath, 'utf8')).toContain(fakeKey);
      await current.page.getByRole('button', { name: '更多操作', exact: true }).click();
      await current.page.locator('.settings-entry').click();
      await expect(current.page.locator('.ai-settings-note')).toContainText('点击“同意迁移”');
      await current.page.getByRole('button', { name: '同意迁移旧明文 Key', exact: true }).click();
      await expect(current.page.locator('.ai-settings-migrate')).toBeHidden();
      await current.page.locator('.ai-settings-modal').getByRole('button', { name: '关闭', exact: true }).click();
      expect(await readFile(settingsPath, 'utf8')).not.toContain(fakeKey);
      expect(await readdir(workspace)).not.toContain('settings.json.bak');
      expect((await current.page.evaluate(() => fetch('/api/settings').then(r => r.status)))).toBe(403);
      expect((await fetch(new URL('/api/chat', current.page.url()), { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(403);
      await closeEditorWindow(current.app);
      current = await launch();
      expect((await call('load')).value.providers.gemini.configured).toBe(true);
      expect((await call('save', { gemini: { apiKey: '' } })).ok).toBe(true);
      await closeEditorWindow(current.app);
      current = await launch();
      expect((await call('load')).value.providers.gemini.configured).toBe(false);
      expect(await readFile(settingsPath, 'utf8')).not.toContain('ciphertext');
      expect((await call('save', { gemini: { apiKey: fakeKey } })).ok).toBe(true);
      expect(await readFile(settingsPath, 'utf8')).not.toContain(fakeKey);
    } finally {
      await current.app.close();
      await rm(root, { recursive: true, force: true });
    }
  });
}
