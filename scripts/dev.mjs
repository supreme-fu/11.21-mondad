import { spawn } from 'node:child_process';

const forwarded = process.argv.slice(2);
const hasPort = forwarded.some((arg) => arg === '--port' || arg.startsWith('--port='));
const hasHost = forwarded.some((arg) => arg === '--host' || arg.startsWith('--host='));
const viteArgs = [
  ...forwarded,
  ...(hasPort ? [] : ['--port', '7100']),
  ...(hasHost ? [] : ['--host', '0.0.0.0']),
  '--strictPort',
];

const children = [
  spawn('npm', ['run', 'dev', '--prefix', 'server'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: '3100' },
  }),
  spawn('npm', ['run', 'dev', '--prefix', 'app', '--', ...viteArgs], {
    stdio: 'inherit',
    env: process.env,
  }),
];

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 250).unref();
}

for (const child of children) {
  child.on('error', () => stop(1));
  child.on('exit', (code) => {
    if (!stopping && code !== 0) stop(code ?? 1);
  });
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
