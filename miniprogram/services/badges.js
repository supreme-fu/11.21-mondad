/**
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
  { id: 'reading', name: '阅读 · 一页之间', material: '鼠尾草珐琅 / 黄铜书签', series: 'task', file: 'reading.glb', bytes: 180952, triangles: 4844 },
  { id: 'cooking', name: '做饭 · 烟火日常', material: '赤铜炖锅 / 奶油搪瓷', series: 'task', file: 'cooking.glb', bytes: 179700, triangles: 5964 },
  { id: 'travel', name: '旅行 · 去有风的地方', material: '青钛金属 / 罗盘金', series: 'task', file: 'travel.glb', bytes: 142388, triangles: 4676 },
  { id: 'meeting', name: '相见 · 环环相扣', material: '玫瑰金轨迹 / 柔光珍珠', series: 'task', file: 'meeting.glb', bytes: 152188, triangles: 5872 },
  { id: 'contract', name: '链上 · 完成声明', material: '拉丝钛金属 / 演示编号', series: 'chain', file: 'contract.glb', bytes: 202864, triangles: 4472 },
  { id: 'bronze10', name: '10 次 · 铜色起步', material: '暖铜 / 拉丝内盘', series: 'milestone', file: 'bronze10.glb', bytes: 111616, triangles: 2336 },
  { id: 'silver50', name: '50 次 · 银色回响', material: '镜面银 / 细刻外圈', series: 'milestone', file: 'silver50.glb', bytes: 133944, triangles: 2676 },
  { id: 'gold100', name: '100 次 · 金色共识', material: '镜面金 / 浮雕数字', series: 'milestone', file: 'gold100.glb', bytes: 124848, triangles: 2580 },
  { id: 'platinum100', name: '100 次 · 白金珍藏', material: '冷色白金 / 深岩刻度盘', series: 'milestone', file: 'platinum100.glb', bytes: 124888, triangles: 2580 },
  { id: 'diamond100', name: '100 次 · 钻石微光', material: '折射晶体 / 白金底座', series: 'milestone', file: 'diamond100.glb', bytes: 126608, triangles: 2588 },
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
      thumb: `${config.badgeThumbBase}/${entry.id}.webp`,
      modelSrc: `${config.badgeModelBase}/${entry.file}`,
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
