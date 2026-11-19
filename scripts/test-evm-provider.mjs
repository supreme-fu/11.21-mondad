import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

const port = await freePort();
const rpcUrl = `http://127.0.0.1:${port}`;
const node = spawn('npx', ['hardhat', 'node', '--hostname', '127.0.0.1', '--port', String(port)], {
  cwd: 'contracts', stdio: ['ignore', 'pipe', 'pipe'],
});
node.stdout.on('data', () => {});
node.stderr.on('data', (data) => process.stderr.write(data));

let test;
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      });
      if (response.ok) { ready = true; break; }
    } catch {}
  }
  if (!ready) throw new Error('本地 Hardhat EVM 未能启动。');
  test = spawn('server/node_modules/.bin/tsx', ['--test', 'server/test/evm-provider.integration.ts'], {
    stdio: 'inherit', env: { ...process.env, LOCAL_EVM_RPC_URL: rpcUrl },
  });
  const exitCode = await new Promise((resolve) => test.once('exit', resolve));
  if (exitCode !== 0) process.exitCode = exitCode || 1;
} finally {
  node.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => node.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
}
