import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApp } from './app.js';
import { DISPOSE_TIMEOUT_MS } from './receipts.js';
import type { ReceiptMode } from './types.js';

// 确定路径加载根目录 .env（已存在于环境变量中的值优先，loadEnvFile 不覆盖）。
for (const candidate of [
  fileURLToPath(new URL('../../.env', import.meta.url)),
  fileURLToPath(new URL('../.env', import.meta.url)),
]) {
  if (existsSync(candidate)) {
    process.loadEnvFile(candidate);
    break;
  }
}

const databasePath = process.env.DATABASE_PATH || fileURLToPath(new URL('../data/do-something.db', import.meta.url));
const receiptMode = (process.env.RECEIPT_MODE || 'simulation') as ReceiptMode;
const { app, store, receipts } = createApp({ databasePath, receiptMode });
const frontendPath = fileURLToPath(new URL('../../app/dist', import.meta.url));

app.use(express.static(frontendPath));
app.get('/intro', (_request, response) => {
  response.redirect('/intro.html');
});
app.use((request, response, next) => {
  if (request.path.startsWith('/api/') || request.method !== 'GET') return next();
  if (!existsSync(`${frontendPath}/index.html`)) {
    return response.status(503).send('前端尚未构建，请先运行 npm run build。');
  }
  response.sendFile(`${frontendPath}/index.html`);
});

const port = Number(process.env.PORT || 7100);
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Do Something server listening on http://localhost:${port} (${receiptMode})`);
  receipts.resume();
});

async function shutdown() {
  // 强制退出只作为兜底，必须大于凭证队列的 drain 期限，否则在途哈希来不及落库。
  const forced = setTimeout(() => process.exit(0), DISPOSE_TIMEOUT_MS + 1_000);
  forced.unref();
  server.close(() => {});
  server.closeAllConnections?.();
  try {
    // 先停凭证队列与 provider，再关数据库，避免关闭后回调写库报错。
    await receipts.dispose(DISPOSE_TIMEOUT_MS);
  } catch (error) {
    console.error('凭证队列退出时出错：', error instanceof Error ? error.message : error);
  }
  store.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
