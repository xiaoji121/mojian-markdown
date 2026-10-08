import { spawnCli } from './agent-bridge-process.js';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Launch the actual Node entrypoints: npm.cmd shipped with Node is not always a
// standard npm shim, and an extra npm process also complicates shutdown.
export function developmentInvocations() {
  const vite = new URL('./bin/vite.js', import.meta.resolve('vite/package.json'));
  return [
    { label: 'bridge', command: process.execPath,
      args: [fileURLToPath(new URL('./agent-bridge.js', import.meta.url))] },
    { label: 'vite', command: process.execPath, args: [fileURLToPath(vite), '--mode', 'bridge'] }
  ];
}
const children = new Set();
let shuttingDown = false;

function start(label, command, args) {
  let child;
  try {
    child = spawnCli(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    console.error(`[${label}] ${error.message}`);
    shutdown(1);
    return;
  }
  children.add(child);

  child.stdout.on('data', (chunk) => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${label}] ${chunk}`));
  child.on('error', (error) => {
    console.error(`[${label}] ${error.message}`);
    shutdown(1);
  });
  child.on('exit', (code, signal) => {
    children.delete(child);
    if (!shuttingDown && code !== 0) {
      console.error(`[${label}] exited with ${signal || code}`);
      shutdown(code || 1);
    }
  });
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 150);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
  for (const { label, command, args } of developmentInvocations()) start(label, command, args);
}
