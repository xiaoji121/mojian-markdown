import { after } from 'node:test';
import { Socket } from 'node:net';

// Guard the socket boundary too: an explicit undici ProxyAgent bypasses its
// global dispatcher. Mock API tests must never dial a remote service or proxy.
export function allowOnlyLoopbackConnections() {
  const connect = Socket.prototype.connect;
  Socket.prototype.connect = function (...args: any[]) {
    const value = Array.isArray(args[0]) ? args[0][0] : args[0];
    const host = value && typeof value === 'object'
      ? (value.host || value.hostname || 'localhost')
      : typeof args[1] === 'string' ? args[1] : 'localhost';
    if (!['127.0.0.1', '::1', 'localhost'].includes(host)) {
      throw new Error(`Mock protocol tests blocked non-loopback connection: ${host}`);
    }
    return connect.apply(this, args as any);
  } as typeof connect;
  after(() => { Socket.prototype.connect = connect; });
}
