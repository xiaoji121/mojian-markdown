import { defineConfig, devices } from '@playwright/test';

// 本机 shell 常配有全局 HTTP 代理；webServer 健康检查与浏览器都必须直连 localhost。
for (const key of ['NO_PROXY', 'no_proxy']) {
  process.env[key] = [process.env[key], 'localhost,127.0.0.1'].filter(Boolean).join(',');
}

// 端到端测试：由 Playwright 自动启动 Vite dev server（默认模式，不含 Agent Bridge），
// 在真实 Chromium 中驱动「落地页 → 编辑器 → 编辑 → 预览 → 持久化」等核心链路。
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4650',
    trace: 'on-first-retry',
    // 本机 shell 常配有 HTTP 代理，直连以确保 localhost 可达
    launchOptions: { args: ['--no-proxy-server'] }
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],
  webServer: {
    command: 'npx vite --port 4650 --strictPort',
    url: 'http://localhost:4650',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
