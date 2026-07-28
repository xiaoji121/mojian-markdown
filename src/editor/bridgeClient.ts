// Agent Bridge 地址解析：
//   网页版 —— bridge 独立运行在本机 4317 端口，前端跨源访问；
//   桌面端 —— 前端由嵌入 bridge 的同一 HTTP 服务托管（preload 注入 window.mojianDesktop），
//             同源相对路径即可，bridge 端口随机也不受影响。
export function bridgeUrl(path: string): string {
  const w = typeof window === 'undefined' ? undefined : (window as { mojianDesktop?: unknown });
  return w?.mojianDesktop ? path : 'http://127.0.0.1:4317' + path;
}
