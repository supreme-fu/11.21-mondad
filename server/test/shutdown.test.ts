import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { after, describe, it } from 'node:test';
import { DISPOSE_TIMEOUT_MS } from '../src/receipts.js';

const created: string[] = [];

after(() => {
  for (const directory of created) rmSync(directory, { recursive: true, force: true });
});

function freePort() {
  const server = createServer();
  return new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

/**
 * 真实启动服务端入口（tsx src/index.ts），用显式 PID 发 SIGINT，
 * 验证“先停凭证队列、再关数据库”的退出顺序与统一期限。
 */
describe('服务退出顺序', () => {
  it('SIGINT 后在统一期限内干净退出，且不触碰真实数据库文件', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'do-something-shutdown-'));
    created.push(directory);
    const databasePath = join(directory, 'shutdown.db');
    const port = await freePort();
    const tsx = fileURLToPath(new URL('../node_modules/.bin/tsx', import.meta.url));
    const entry = fileURLToPath(new URL('../src/index.ts', import.meta.url));

    const child = spawn(tsx, [entry], {
      env: {
        ...process.env,
        DATABASE_PATH: databasePath,
        RECEIPT_MODE: 'simulation',
        PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });

    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      child.on('exit', (code, signal) => resolve({ code, signal }));
    });

    try {
      // 等真正监听端口，而不是固定 sleep。
      const deadline = Date.now() + 30_000;
      let ready = false;
      while (Date.now() < deadline && !ready) {
        if (stdout.includes('listening')) { ready = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.ok(ready, `服务端未就绪：${stdout}${stderr}`);

      const startedAt = Date.now();
      child.kill('SIGINT');
      const result = await Promise.race([
        exited,
        new Promise<never>((_resolve, reject) => {
          setTimeout(() => reject(new Error('服务端未在期限内退出')), DISPOSE_TIMEOUT_MS + 6_000);
        }),
      ]);
      const elapsed = Date.now() - startedAt;
      assert.equal(result.code, 0, `退出码应为 0，实际 ${result.code}（${stderr}）`);
      assert.equal(result.signal, null, '不应被信号杀死');
      assert.ok(elapsed < DISPOSE_TIMEOUT_MS + 5_000, `退出耗时 ${elapsed}ms 超过统一期限`);
      assert.match(stdout, /listening on http:\/\/localhost:\d+ \(simulation\)/);
      assert.doesNotMatch(stdout, /凭证状态写入失败/, '退出过程不应出现写库失败');
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  });
});
