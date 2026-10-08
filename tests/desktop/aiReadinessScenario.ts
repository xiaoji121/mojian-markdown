import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp, mkdir, readFile, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMockCli, mockCliEnv } from '../helpers/mockCli';

export function registerAIReadinessScenario(label: string, executablePath?: string) {
  test(`${label} missing AI remains optional and filesystem readiness never invokes a CLI`, async () => {
    const root = await mkdtemp(join(tmpdir(), '墨笺 AI readiness '));
    const userData = join(root, 'user-data');
    const workspace = join(root, 'workspace');
    await mkdir(userData); await mkdir(workspace);
    const marker = join(root, 'CLI-MUST-NOT-RUN');
    const cli = await createMockCli(root, 'mojian-test-readiness-claude',
      `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'invoked'); process.exit(91);`);
    const documentPath = join(root, '没有 AI 也能编辑.md');
    await writeFile(documentPath, '# First run\n\nhello world\n');
    await writeFile(join(userData, 'granted-paths.json'), JSON.stringify([documentPath]));
    console.info('[readiness fixture] launch isolated app');
    const app = await electron.launch({ executablePath,
      args: [...(executablePath ? [] : ['.']), '--lang=zh-CN', documentPath, '--disable-background-networking',
        '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=localhost;127.0.0.1;[::1]'],
      env: { ...mockCliEnv(root), MOJIAN_USER_DATA: userData, AGENT_BRIDGE_WORKSPACE: workspace,
        AGENT_BRIDGE_CLAUDE_COMMAND: cli, AGENT_BRIDGE_CODEX_COMMAND: join(root, 'mojian-test-missing-codex'),
        AGENT_BRIDGE_LARK_COMMAND: join(root, 'mojian-test-missing-lark'),
        AGENT_BRIDGE_DWS_COMMAND: join(root, 'mojian-test-missing-dws') }
    });
    try {
      console.info('[readiness fixture] install loopback guard');
      await app.evaluate(() => {
        const net = process.getBuiltinModule('net');
        const connect = net.Socket.prototype.connect;
        net.Socket.prototype.connect = function (...args) {
          const value = Array.isArray(args[0]) ? args[0][0] : args[0];
          const host = value && typeof value === 'object' ? (value.host || value.hostname || 'localhost')
            : typeof args[1] === 'string' ? args[1] : 'localhost';
          if (!['127.0.0.1', '::1', 'localhost'].includes(host)) throw new Error('External network blocked');
          return connect.apply(this, args);
        };
      });
      console.info('[readiness fixture] wait for first window');
      const page = await app.firstWindow();
      await page.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
        ? route.continue() : route.abort());
      let providerRequests = 0;
      page.on('request', request => { if (/\/api\/(chat|translate|settings\/test)$/.test(new URL(request.url()).pathname)) providerRequests++; });
      console.info('[readiness fixture] open linked document');
      const source = page.locator('.md-source');
      await expect(source).toHaveValue(/First run/);
      console.info('[readiness fixture] open AI panel');
      await page.getByRole('button', { name: 'AI 助手', exact: true }).click();
      await page.locator('.ai-readiness').getByRole('button', { name: '配置 AI', exact: true }).click();
      await page.getByRole('radio', { name: /Codex/ }).click();
      await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
      await expect(page.locator('.ai-readiness')).toContainText('未找到');
      await page.locator('.ai-input').fill('Keep this unsent question');
      await page.locator('.ai-send').dblclick();
      await expect(page.locator('.ai-input')).toHaveValue('Keep this unsent question');
      await page.getByRole('button', { name: '继续编辑，不使用 AI', exact: true }).click();
      await expect(page.locator('.ai-panel')).toBeHidden();
      console.info('[readiness fixture] edit and save without AI');
      await source.fill('# Still editing\n\nhello world\n');
      await expect(page.locator('.md-preview h1')).toHaveText('Still editing');
      await expect.poll(() => readFile(documentPath, 'utf8')).toContain('Still editing');
      console.info('[readiness fixture] open AI panel');
      await page.getByRole('button', { name: 'AI 助手', exact: true }).click();
      await page.locator('.ai-readiness').getByRole('button', { name: '配置 AI', exact: true }).click();
      await page.getByRole('radio', { name: /Claude/ }).click();
      await expect(page.getByRole('dialog', { name: 'AI 设置' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('.ai-readiness')).toContainText('登录尚未验证');
      await page.getByRole('button', { name: '重新检查', exact: true }).click();
      await expect(page.locator('.ai-readiness')).toContainText('登录尚未验证');
      await expect(page.getByRole('button', { name: '重新检查', exact: true })).toBeFocused();
      await page.locator('.ai-readiness').getByRole('button', { name: '配置 AI', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'AI 设置' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('.ai-readiness').getByRole('button', { name: '配置 AI', exact: true })).toBeFocused();
      console.info('[readiness fixture] translation setup return');
      await page.locator('.md-preview p').first().evaluate(element => {
        const range = document.createRange(); range.selectNodeContents(element);
        const selection = window.getSelection()!;
        selection.removeAllRanges(); selection.addRange(range);
        element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      });
      await page.locator('.translate-entry').click();
      await expect(page.locator('.translate-popover-body')).toContainText('Gemini');
      await page.getByRole('button', { name: '配置 Gemini', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'AI 设置' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: '重新翻译', exact: true })).toBeVisible();
      expect(providerRequests).toBe(0);
      await expect(access(marker)).rejects.toThrow();
    } finally {
      // This scenario verifies readiness, not window-close durability (covered
      // by restartScenarios). Force fixture teardown so a pending native dialog
      // cannot swallow the original assertion and its diagnostic stack.
      console.info('[readiness fixture] teardown');
      await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
      await app.close().catch(() => {});
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  });
}
