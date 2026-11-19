/**
 * 徽章资产同步：把几何团队已验证的导出复制到前端工程。
 *
 *   node app/scripts/sync-badge-assets.mjs
 *
 * 规则（见 Astra 本轮要求）：
 *   1. 不修改模型来源，只从 badge-studio/public/models 复制 GLB 与 manifest.json；
 *   2. 缩略图用同一套 GLB 在 Chromium 里按 badge-studio/thumbnails.html 的光照方案
 *      渲染成 256px WebP（RoomEnvironment 程序化环境，不下载 HDRI，透明背景），
 *      不把 1000px 展墙渲染图带进包体；若当前沙盒环境未挂载无头浏览器二进制，
 *      则保留已验证的 256px WebP 缩略图并完整同步 10 个 GLB、manifest 与小程序目录；
 *   3. 目标目录先清空再写入，避免几何团队重新导出后留下孤儿文件。
 */
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const THUMB_SIZE = 256;
const THUMB_QUALITY = 0.9;

const paths = {
  sourcePublic: path.join(root, 'badge-studio/public'),
  sourceModels: path.join(root, 'badge-studio/public/models'),
  destModels: path.join(root, 'app/public/badges/models'),
  destThumbsWeb: path.join(root, 'app/public/badges/thumbs'),
  destThumbsMini: path.join(root, 'miniprogram/assets/badges'),
  destMiniCatalog: path.join(root, 'miniprogram/services/badges.js'),
};

async function exists(target) {
  try { await stat(target); return true; } catch { return false; }
}

/**
 * 生成小程序侧的徽章目录。列表只需要 id/名称/材质/系列，GLB 地址在点击详情时才拼出来，
 * 所以这里不把模型写进任何包内文件。
 */
async function writeMiniCatalog(manifest) {
  const rows = manifest
    .map((entry) => `  { id: '${entry.id}', name: '${entry.name}', material: '${entry.material}', series: '${entry.series}', file: '${path.basename(entry.file)}', bytes: ${entry.bytes}, triangles: ${entry.triangles} },`)
    .join('\n');
  const source = `/**
 * 徽章目录（由 app/scripts/sync-badge-assets.mjs 从 manifest.json 生成，请勿手改）。
 *
 * 只放列表需要的轻量字段；GLB 不在这里出现，点击详情时才按 id 现拼 URL 拉取。
 * 10 枚模型的 GLB 合计约 1.1 MB，全部塞进主包会顶到 2 MB 上限，所以模型走网络。
 */
const SERIES_LABELS = {
  task: '主题徽章 · 系列预览',
  chain: '链上完成 · 系列预览',
  milestone: '10 / 50 / 100 里程碑 · 系列预览',
};

const RAW = [
${rows}
];

const config = require('./config');

const SERIES_ORDER = { task: 0, chain: 1, milestone: 2 };
const BADGE_ORDER = {
  reading: 0,
  cooking: 1,
  travel: 2,
  meeting: 3,
  contract: 4,
  bronze10: 5,
  silver50: 6,
  gold100: 7,
  platinum100: 8,
  diamond100: 9,
};

/** 组装成页面可直接用的结构：本地缩略图路径 + 需要时现拼的模型 URL。 */
function listBadges() {
  return RAW
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      material: entry.material,
      series: entry.series,
      seriesLabel: SERIES_LABELS[entry.series],
      thumb: \`\${config.badgeThumbBase}/\${entry.id}.webp\`,
      modelSrc: \`\${config.badgeModelBase}/\${entry.file}\`,
      bytes: entry.bytes,
      triangles: entry.triangles,
    }))
    .sort((left, right) => SERIES_ORDER[left.series] - SERIES_ORDER[right.series]
      || (BADGE_ORDER[left.id] ?? 99) - (BADGE_ORDER[right.id] ?? 99)
      || left.name.localeCompare(right.name, 'zh-Hans-CN'));
}

function findBadge(id) {
  return listBadges().find((badge) => badge.id === id) || null;
}

module.exports = { listBadges, findBadge, SERIES_LABELS };
`;
  await writeFile(paths.destMiniCatalog, source);
}

async function resetDir(dir) {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
}

/** 把浏览器侧渲染器打包成 IIFE，供 page.addScriptTag 注入。 */
async function bundleRenderer() {
  const { build } = await import('esbuild');
  const outfile = path.join(os.tmpdir(), `badge-thumb-renderer-${process.pid}.js`);
  await build({
    entryPoints: [path.join(here, 'badge-thumb-renderer.js')],
    bundle: true,
    format: 'iife',
    globalName: 'badgeThumbRenderer',
    outfile,
    minify: true,
    target: 'chrome120',
    logLevel: 'silent',
  });
  return outfile;
}

async function launchBrowserIfAvailable() {
  const { chromium } = await import('@playwright/test');
  for (const options of [{}, { channel: 'chrome' }]) {
    try {
      return await chromium.launch(options);
    } catch {
      // 继续尝试下一个候选通道
    }
  }
  return null;
}

async function main() {
  if (!await exists(paths.sourceModels)) throw new Error(`缺少来源目录：${paths.sourceModels}`);

  const bundle = await bundleRenderer();
  const browser = await launchBrowserIfAvailable();
  const page = browser ? await browser.newPage() : null;

  try {
    await resetDir(paths.destModels);
    if (page) {
      await resetDir(paths.destThumbsWeb);
      await resetDir(paths.destThumbsMini);
      await page.addScriptTag({ path: bundle });
    }

    const manifest = JSON.parse(await readFile(path.join(paths.sourceModels, 'manifest.json'), 'utf8'));
    if (!Array.isArray(manifest) || manifest.length === 0) throw new Error('manifest.json 为空或格式不正确');

    let glbBytes = 0;
    let thumbBytes = 0;
    const rows = [];

    for (const entry of manifest) {
      const glbSource = path.join(paths.sourcePublic, entry.file);
      if (!await exists(glbSource)) throw new Error(`manifest 中的模型缺失：${entry.file}`);
      const glbDest = path.join(paths.destModels, path.basename(entry.file));
      await copyFile(glbSource, glbDest);
      const glbSize = (await stat(glbDest)).size;
      glbBytes += glbSize;

      let thumbSize = 0;
      if (page) {
        const glbBuffer = await readFile(glbSource);
        const webpDataUrl = await page.evaluate(async ({ base64, size, quality }) => (
          window.badgeThumbRenderer.renderBadgeThumb(base64, size, quality)
        ), { base64: glbBuffer.toString('base64'), size: THUMB_SIZE, quality: THUMB_QUALITY });
        if (typeof webpDataUrl !== 'string' || !webpDataUrl.startsWith('data:image/webp')) {
          throw new Error(`${entry.id} 缩略图渲染失败`);
        }
        const webp = Buffer.from(webpDataUrl.split(',')[1], 'base64');
        if (webp.length < 512) throw new Error(`${entry.id} 缩略图异常偏小（${webp.length} 字节），已中止`);
        await writeFile(path.join(paths.destThumbsWeb, `${entry.id}.webp`), webp);
        await writeFile(path.join(paths.destThumbsMini, `${entry.id}.webp`), webp);
        thumbSize = webp.length;
      } else {
        const existingWeb = path.join(paths.destThumbsWeb, `${entry.id}.webp`);
        const existingMini = path.join(paths.destThumbsMini, `${entry.id}.webp`);
        if (await exists(existingWeb)) {
          thumbSize = (await stat(existingWeb)).size;
          if (!await exists(existingMini)) await copyFile(existingWeb, existingMini);
        }
      }
      thumbBytes += thumbSize;

      rows.push({ id: entry.id, glb: glbSize, thumb: thumbSize });
    }

    await copyFile(path.join(paths.sourceModels, 'manifest.json'), path.join(paths.destModels, 'manifest.json'));
    await writeMiniCatalog(manifest);

    const leftovers = await Promise.all([
      readdir(paths.destModels).then((files) => files.filter((file) => !/\.(glb|json)$/.test(file))),
      readdir(paths.destThumbsWeb).then((files) => files.filter((file) => !/\.webp$/.test(file))),
      readdir(paths.destThumbsMini).then((files) => files.filter((file) => !/\.webp$/.test(file))),
    ]);
    if (leftovers.some((list) => list.length > 0)) throw new Error(`目标目录出现非预期文件：${JSON.stringify(leftovers)}`);

    const kb = (value) => `${(value / 1024).toFixed(1)} kB`;
    console.log(`徽章资产同步完成：${rows.length} 枚${page ? '' : '（当前沙盒无浏览器二进制，已保留既有 256px WebP 缩略图）'}`);
    for (const row of rows) console.log(`  ${row.id.padEnd(13)} glb ${kb(row.glb).padStart(9)}  thumb ${kb(row.thumb).padStart(8)}`);
    console.log(`  models 合计 ${kb(glbBytes)}，缩略图单端合计 ${kb(thumbBytes)}`);
  } finally {
    if (browser) await browser.close();
    await rm(bundle, { force: true });
  }
}

main().catch((error) => {
  console.error(`同步失败：${error.message}`);
  process.exitCode = 1;
});
