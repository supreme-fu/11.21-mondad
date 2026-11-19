// 打包三个交付 zip，路径与内部目录结构都固定，不靠手敲：
//   deliverables/badges/badge-models.zip   内部 badge-studio/public/models/**（查看器数据源）
//   deliverables/badges/badge-source.zip   内部 badge-studio/**（源码，排除 node_modules / dist / deliverables）
//   deliverables/badges/badge-images.zip   内部 deliverables/badges/images/**（10×4 张图 + contact-sheet）
// 打包前先删两处嵌套副本：
//   badge-studio/deliverables            早期报告路径按 cwd 解析留下的旧报告
//   deliverables/badges/badge-studio     有人把 badge-models.zip 解压进 deliverables/，装的是第一轮 GLB
// 旧的 zip 先写到 .tmp，打包成功再替换：中途失败不会把上一版交付包删掉。
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));          // badge-studio/
const repo = fileURLToPath(new URL('../..', import.meta.url));       // 仓库根
const outDir = `${repo}deliverables/badges`;

function fail(message) { console.error(message); process.exit(1); }

// 自己走目录树，不调 find：find 的 -not -path 引号在 spawnSync 里要靠 shell 解析，
// 拼错就是语法错误或静默漏文件。
function walk(dir, base) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === '.DS_Store') continue;
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) found.push(...walk(full, base));
    else if (entry.isFile()) found.push(full.slice(base.length + 1));
  }
  return found;
}

// zip 的输出路径必须给绝对路径：spawnSync 的 cwd 只决定“待打包文件的相对起点”，
// 归档本身写在 cwd 下，写相对名会把 zip 落到 badge-studio/ 或仓库根。
function zip(target, cwd, files) {
  if (!files.length) fail(`没有文件可打包：${target}`);
  const temp = `${target}.tmp`;
  rmSync(temp, { force: true });
  const result = spawnSync('zip', ['-q', '-X', temp, ...files], { cwd });
  if (result.status !== 0) { rmSync(temp, { force: true }); fail(`zip 失败（退出码 ${result.status}）：${target}\n${result.stderr}`); }
  return statSync(temp).size;
}

// 1) 模型包：内部路径必须是 badge-studio/public/models/，与 app/scripts/sync-badge-assets.mjs 的源路径一致
const modelFiles = ['public/models/reading.glb', 'public/models/cooking.glb', 'public/models/travel.glb', 'public/models/meeting.glb',
  'public/models/contract.glb', 'public/models/bronze10.glb', 'public/models/silver50.glb', 'public/models/gold100.glb',
  'public/models/platinum100.glb', 'public/models/diamond100.glb', 'public/models/manifest.json'];
for (const file of modelFiles) if (!existsSync(`${root}${file}`)) fail(`缺少 ${file}：先跑 node scripts/export-badges.mjs`);

// 2) 源码包：把 badge-studio 自身打进去。排除 node_modules（可重装）、dist（构建产物）、deliverables（嵌套旧副本）。
const stale = [`${root}deliverables`, `${outDir}/badge-studio`];
for (const dir of stale) {
  if (existsSync(dir)) { rmSync(dir, { recursive: true, force: true }); console.log(`已删除嵌套旧副本 ${dir}`); }
}
const skip = new Set(['node_modules', 'dist', 'deliverables']);
const sourceFiles = readdirSync(root, { withFileTypes: true })
  .filter((entry) => (entry.isDirectory() ? !skip.has(entry.name) : true))
  .flatMap((entry) => (entry.isDirectory() ? walk(`${root}${entry.name}`, `${root}${entry.name}`).map((f) => `${entry.name}/${f}`) : [entry.name]))
  .sort();

// 3) 图像包：内部路径保持 deliverables/badges/images/，和仓库内相对位置一致
const imageDir = `${outDir}/images`;
const imageFiles = walk(imageDir, outDir).map((file) => `deliverables/badges/${file}`).sort();
if (imageFiles.length !== 41) fail(`图像数量应为 41（10×4 + contact-sheet），实际 ${imageFiles.length}`);

const jobs = [
  { file: 'badge-models.zip', cwd: root, files: modelFiles, note: 'badge-studio/public/models/**' },
  { file: 'badge-source.zip', cwd: repo, files: sourceFiles.map((f) => `badge-studio/${f}`), note: 'badge-studio/**（源码）' },
  { file: 'badge-images.zip', cwd: repo, files: imageFiles, note: 'deliverables/badges/images/**' },
];

for (const job of jobs) {
  const target = `${outDir}/${job.file}`;
  const bytes = zip(target, job.cwd, job.files);
  renameSync(`${target}.tmp`, target);   // 只有打包成功才替换上一版
  console.log(`${job.file}\t${job.files.length} 个文件\t${bytes} 字节\t内部 ${job.note}`);
}
console.log('三个 zip 已重打包到 deliverables/badges/');
