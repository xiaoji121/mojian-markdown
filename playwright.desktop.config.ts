import { defineConfig } from '@playwright/test';

// 桌面端（Electron）冒烟测试：先 npm run build:bridge 生成 dist，再执行。
// 不进 CI 默认流程（CI 无显示环境且未装 Electron 二进制时跳过）。
export default defineConfig({
  testDir: 'tests/desktop',
  timeout: 60_000,
  workers: 1,
  reporter: 'list'
});
