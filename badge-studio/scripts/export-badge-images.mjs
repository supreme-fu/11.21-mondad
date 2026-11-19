// 用 Playwright 真实渲染「已导出的 GLB」，产出四张图（都在仓库根 deliverables/badges/images）：
//   <id>.png          1000×1000 浅底，3/4 视角主图，替代早期按展厅场景渲染的旧单枚图
//   <id>-front.png    1000×1000 正视图
//   <id>-side.png     1000×1000 侧视图（Astra 判断浮雕是否贴底、是否浮空的主视角）
//   <id>-back.png     1000×1000 后视图
// app/public/badges/thumbs 与 miniprogram/assets/badges 归另一执行器，这里不再写，避免冲突。
// 渲染走 badge-studio/thumbnails.html：程序化 RoomEnvironment + 三点光，不加载 HDRI 文件，
// 也不用 Edit3D 编辑器。任何一步失败都以非零退出码结束，不用硬编码 PASS。
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { badgeDefinitions } from '../src/badges.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(fileURLToPath(new URL('../../package.json', import.meta.url)));
const { chromium } = require('@playwright/test');

const PORT = Number(process.env.BADGE_RENDER_PORT || 5175);
const base = `http://localhost:${PORT}`;
const imageDir = `${root}../deliverables/badges/images`;
// 每个徽章四张图：主图用 3/4 视角，另三张是正/侧/背，侧视图专门用来核查浮雕贴底。
const jobs = [
  { suffix: '', view: 'quarter' },
  { suffix: '-front', view: 'front' },
  { suffix: '-side', view: 'side' },
  { suffix: '-back', view: 'back' },
];
const SIZE = 1000;
const BACKGROUND = '#f2f4ef';
mkdirSync(imageDir, { recursive: true });

async function reachable() {
  try { return (await fetch(`${base}/thumbnails.html`)).ok; } catch { return false; }
}

let server = null;
if (!(await reachable())) {
  server = spawn('npm', ['run', 'dev', '--', '--host', 'localhost', '--port', String(PORT)], { cwd: root, stdio: 'ignore', detached: true });
  server.stderr.on('data', (data) => process.stderr.write(data));
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (await reachable()) break;
  }
  if (!(await reachable())) { process.kill(-server.pid, 'SIGTERM'); throw new Error(`渲染服务未启动：${base}`); }
}

const report = { generatedAt: new Date().toISOString(), badges: [], failures: [] };
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1200 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${base}/thumbnails.html`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => window.badgeRenderer?.ready === true, { timeout: 30000 });

  for (const definition of badgeDefinitions) {
    const stats = await page.evaluate((id) => window.badgeRenderer.stats(id), definition.id);
    if (!stats.meshes) { report.failures.push(`${definition.id} 渲染台加载后没有网格`); continue; }
    const entry = { id: definition.id, meshes: stats.meshes, triangles: stats.triangles, vertices: stats.vertices, bounds: stats.size.map((v) => Number(v.toFixed(4))), files: [] };

    for (const job of jobs) {
      const dataUrl = await page.evaluate(({ id, view, size, background }) => window.badgeRenderer.render(id, view, size, background), { id: definition.id, view: job.view, size: SIZE, background: BACKGROUND });
      const path = `${imageDir}/${definition.id}${job.suffix}.png`;
      const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
      // 空白或加载失败会产生极小的 PNG，用真实字节数挡住
      if (buffer.byteLength < 20000) {
        report.failures.push(`${path} 只有 ${buffer.byteLength} 字节，疑似空白或加载失败`);
      }
      writeFileSync(path, buffer);
      entry.files.push({ path: path.replace(root, ''), bytes: buffer.byteLength, view: job.view || 'quarter' });
    }
    report.badges.push(entry);
    console.log(`${definition.id}\t${stats.meshes} meshes\t${stats.triangles} tris\t${entry.files.map((f) => `${f.view}:${f.bytes}B`).join(' / ')}`);
  }
  if (errors.length) report.failures.push(...errors);
} finally {
  if (browser) await browser.close();
  if (server?.pid) process.kill(-server.pid, 'SIGTERM');
}

writeFileSync(`${root}../deliverables/badges/render-report.json`, `${JSON.stringify(report, null, 2)}\n`);
if (report.failures.length) { console.error(report.failures.join('\n')); process.exit(1); }
console.log(`${report.badges.length} 枚徽章的主图（3/4 视角）与正/侧/背审查图已由真实渲染产出`);
