import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const badgeDefinitions = [
  { id: 'reading', name: '阅读 · 一页之间', material: '鼠尾草珐琅 / 黄铜书签', type: 'task' },
  { id: 'cooking', name: '做饭 · 烟火日常', material: '赤铜炖锅 / 奶油搪瓷', type: 'task' },
  { id: 'travel', name: '旅行 · 去有风的地方', material: '青钛金属 / 罗盘金', type: 'task' },
  { id: 'meeting', name: '相见 · 环环相扣', material: '玫瑰金轨迹 / 柔光珍珠', type: 'task' },
  { id: 'contract', name: '链上 · 完成声明', material: '拉丝钛金属 / 演示编号', type: 'chain' },
  { id: 'bronze10', name: '10 次 · 铜色起步', material: '暖铜 / 拉丝内盘', type: 'milestone' },
  { id: 'silver50', name: '50 次 · 银色回响', material: '镜面银 / 细刻外圈', type: 'milestone' },
  { id: 'gold100', name: '100 次 · 金色共识', material: '镜面金 / 浮雕数字', type: 'milestone' },
  { id: 'platinum100', name: '100 次 · 白金珍藏', material: '冷色白金 / 深岩刻度盘', type: 'milestone' },
  { id: 'diamond100', name: '100 次 · 钻石微光', material: '折射晶体 / 白金底座', type: 'milestone' },
];

// 徽章局部坐标约定：+Z 为正面，coinBase 建立背板、内盘与外圈，内盘前面在 z=0.1145。
// 所有浮雕一律贴底：嵌入 EMBED 到所依托的面（内盘前面 / 锅盖 / 铭牌 / 另一层浮雕），
// 不允许悬浮在盘面前方——早期版本所有 relief 都架在盘前 0.02~0.28，侧视就是爆炸图。
// scripts/verify-geometry.mjs 用真实三角形断言两件事：
//   1) 整枚徽章是一个连通实体：任何网格与其它网格的包围盒间隙 > CONTACT_EPS 即失败；
//   2) 网格对相交必须在 badges.js 声明同一接合号（userData.joints），且接合是浅嵌入
//      （重叠包围盒至少一个轴 <= JOINT_MAX_DEPTH）——未声明的互穿一律算错误穿透。
export const BASE_FRONT_Z = 0.115;
export const BACK_LIMIT_Z = -0.125;
export const LAYER_GAP = 0.004;
export const DISC_FRONT_Z = 0.1145;
const EMBED = 0.008;
// 立在内盘前面的浮雕底面：嵌入 EMBED，既消除缝隙又不咬穿内盘（内盘厚 0.045）。
const MOUNT_Z = DISC_FRONT_Z - EMBED;
// 叠层嵌入：上一层圆环坐下层环顶面之后再多压进去 LAYER_EMBED，两个管在投影重叠区
// 真的互相咬住——连通不靠"距离小于容差"，而是靠实体相交。
const LAYER_EMBED = 0.006;
// 接合号：浮雕贴内盘；两块浮雕互相咬要另声明零件级接合号，否则校验算错误穿透。
const MOUNT = ['disc-mount'];
const RING_STACK = ['disc-mount', 'ring-stack'];

// 文字的顶点数只由曲线分段数决定，与字号无关；小字号标签用 3 段足够，
// 里程碑大数字用 5 段保住圆弧。
const TEXT_OPTIONS = { curveSegments: 3, bevelEnabled: false };

function physical(name, color, roughness, metalness = 0) {
  const material = new THREE.MeshPhysicalMaterial({ color, roughness, metalness });
  material.name = name;
  return material;
}

function mesh(geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], name = '', joints = []) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(...position);
  object.rotation.set(...rotation);
  object.castShadow = true;
  object.receiveShadow = true;
  if (name) object.name = name;
  if (joints.length) object.userData.joints = joints;
  return object;
}

function rounded(width, height, depth, radius = 0.04, segments = 2) {
  return new RoundedBoxGeometry(width, height, depth, segments, radius);
}

function merge(geometries) {
  const combined = mergeGeometries(geometries, false);
  for (const geometry of geometries) geometry.dispose();
  return combined;
}

// 修正水平与垂直居中：使用包围盒中心 (box.max + box.min) / 2 而非仅半宽 (box.max - box.min) / 2，
// 消除首字符左侧字距偏移（如 '100' 中 '1' 的正 min.x 导致的整体右偏）。
function textMesh(font, text, size, depth, material, position, name = `立体文字-${text}`, joints = MOUNT) {
  const geometry = new TextGeometry(text, { font, size, depth, ...TEXT_OPTIONS });
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const centerX = (box.max.x + box.min.x) / 2;
  const centerY = (box.max.y + box.min.y) / 2;
  return mesh(geometry, material, [position[0] - centerX, position[1] - centerY, position[2]], [0, 0, 0], name, joints);
}

function countText(font, text, size, depth, position, material, name, curveSegments = 3) {
  const geometry = new TextGeometry(text, { font, size, depth, curveSegments, bevelEnabled: false });
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const opticalX = text === '100' ? -0.014 : 0;
  return mesh(
    geometry,
    material,
    [position[0] - (box.max.x + box.min.x) / 2 + opticalX, position[1] - (box.max.y + box.min.y) / 2, position[2]],
    [0, 0, 0],
    name,
    MOUNT,
  );
}

// ExtrudeGeometry 的斜角把几何体向两端各伸出 bevelThickness，平移后整体 Z 跨度为
// [-0.4d, d]（bevelSize=bevelThickness=0.2d）。贴底时按这个偏移摆放，底面正好落在 MOUNT_Z。
function extrudeZ(depth) {
  return MOUNT_Z + depth * 0.4;
}

function extrude(points, depth, material, position, name, joints = MOUNT) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (const point of points.slice(1)) shape.lineTo(point[0], point[1]);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: depth * 0.2, bevelThickness: depth * 0.2, bevelSegments: 1 });
  geometry.translate(0, 0, -(depth * 0.2));
  return mesh(geometry, material, position, [0, 0, 0], name, joints);
}

function ringTube(band, depth) {
  return Math.min(band, depth) / 2;
}

function annulus(outer, band, depth, material, position, name, joints = MOUNT) {
  const tube = ringTube(band, depth);
  const geometry = new THREE.TorusGeometry(outer - tube, tube, 8, 40);
  return mesh(geometry, material, [position[0], position[1], position[2] + tube], [0, 0, 0], name, joints);
}

function stackInRing(sittingPlane, band, depth) {
  return sittingPlane + ringTube(band, depth) * 2 - LAYER_EMBED;
}

// 构建背面双轨交汇微雕印记：让用户翻转到背面时看到品牌标志性的“两条独立轨迹交汇于一点”印记，
// 同时控制在轻量顶点预算内（每枚仅增加约 400 顶点，保证 contract.glb 仍在 200KB 预算内）。
function buildBackHallmark(segments) {
  const parts = [];
  const ringLeft = new THREE.TorusGeometry(0.19, 0.014, 6, 20);
  ringLeft.scale(1.25, 0.7, 1);
  ringLeft.rotateZ(0.46);
  ringLeft.translate(0, 0, -0.086);
  parts.push(ringLeft);

  const ringRight = new THREE.TorusGeometry(0.19, 0.014, 6, 20);
  ringRight.scale(1.25, 0.7, 1);
  ringRight.rotateZ(-0.46);
  ringRight.translate(0, 0, -0.086);
  parts.push(ringRight);

  const node = new THREE.CylinderGeometry(0.045, 0.045, 0.022, 12);
  node.rotateX(Math.PI / 2);
  node.translate(0, 0, -0.085);
  parts.push(node);

  // CylinderGeometry 绕 X 旋转 90° 后六边形默认为尖顶，rotateZ(π/6) 变为平顶；
  // 而 TorusGeometry 默认顶点在 +X（已为平顶），无需再旋转 π/6。
  const innerFrame = new THREE.TorusGeometry(0.51, 0.011, 6, Math.min(segments, 24));
  innerFrame.translate(0, 0, -0.084);
  parts.push(innerFrame);

  return merge(parts);
}

function coinBase(group, materials, hex = false) {
  const segments = hex ? 6 : 48;
  const body = new THREE.CylinderGeometry(0.77, 0.77, 0.15, segments);
  body.rotateX(Math.PI / 2);
  if (hex) body.rotateZ(Math.PI / 6);
  group.add(mesh(body, materials.body, [0, 0, 0], [0, 0, 0], 'base-body', MOUNT));

  const inner = new THREE.CylinderGeometry(0.655, 0.655, 0.045, segments);
  inner.rotateX(Math.PI / 2);
  if (hex) inner.rotateZ(Math.PI / 6);
  group.add(mesh(inner, materials.inner, [0, 0, 0.092], [0, 0, 0], 'base-inner', MOUNT));

  const rim = new THREE.TorusGeometry(0.718, 0.054, 12, segments);
  group.add(mesh(rim, materials.rim, [0, 0, 0.09], [0, 0, 0], 'base-rim', MOUNT));

  const backRim = new THREE.TorusGeometry(0.734, 0.038, 8, segments);
  group.add(mesh(backRim, materials.rim, [0, 0, -0.078], [0, 0, 0], 'base-back-rim'));

  const backInner = new THREE.CylinderGeometry(0.66, 0.66, 0.022, segments);
  backInner.rotateX(Math.PI / 2);
  if (hex) backInner.rotateZ(Math.PI / 6);
  group.add(mesh(backInner, materials.inner, [0, 0, -0.072], [0, 0, 0], 'base-back-inner'));

  group.add(mesh(buildBackHallmark(segments), materials.rim, [0, 0, 0], [0, 0, 0], 'base-back-hallmark'));

  const loopY = hex ? 0.78 : 0.82;
  group.add(mesh(new THREE.TorusGeometry(0.105, 0.026, 8, 24), materials.rim, [0, loopY, 0], [0, 0, 0], 'base-loop'));
}

function ticks(count, material, hex = false) {
  const radius = hex ? 0.515 : 0.6;
  const geometries = [];
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    const isMajor = index % 5 === 0;
    const geometry = new THREE.BoxGeometry(isMajor ? 0.028 : 0.02, isMajor ? 0.07 : 0.048, 0.024);
    geometry.rotateZ(-angle);
    geometry.translate(Math.sin(angle) * radius, Math.cos(angle) * radius, MOUNT_Z + 0.012);
    geometries.push(geometry);
  }
  return mesh(merge(geometries), material, [0, 0, 0], [0, 0, 0], 'relief-ticks', MOUNT);
}

function baseMaterials(palette) {
  return {
    body: physical(`${palette.label} · 主体`, palette.body, 0.32, palette.metalness ?? 0.75),
    inner: physical(`${palette.label} · 内盘`, palette.inner, palette.innerRoughness ?? 0.28, palette.innerMetalness ?? 0.35),
    rim: physical(`${palette.label} · 外圈`, palette.rim, palette.rimRoughness ?? 0.18, 0.95),
    detail: physical(`${palette.label} · 符号`, palette.detail, 0.22, palette.detailMetalness ?? 0.75),
  };
}

// 阅读徽章：双页微倾展开 + 垂落式黄铜书签丝带
function buildReading(group, font, m) {
  const pages = physical('阅读 · 暖白书页', '#ece7da', 0.38, 0.02);
  const ink = physical('阅读 · 黄铜文字线', '#b69254', 0.28, 0.78);
  for (const side of [-1, 1]) {
    const page = new THREE.Group();
    page.name = `reading-page-${side > 0 ? 'right' : 'left'}`;
    page.position.set(side * 0.27, 0.05, 0.1603);
    page.rotation.set(0, side * -0.14, side * -0.09);
    page.add(mesh(rounded(0.4, 0.48, 0.055, 0.028), pages, [0, 0, 0], [0, 0, 0], 'relief-page-sheet', MOUNT));
    const lines = [];
    for (let line = 0; line < 4; line += 1) {
      const geometry = new THREE.BoxGeometry(line === 3 ? 0.17 : 0.25, 0.018, 0.015);
      geometry.translate(line === 3 ? -0.04 : 0, 0.14 - line * 0.088, 0.036);
      lines.push(geometry);
    }
    page.add(mesh(merge(lines), ink, [0, 0, 0], [0, 0, 0], 'relief-page-lines'));
    group.add(page);
  }
  // 书脊下沿在 y = 0.04 - 0.25 = -0.21；书签丝带上沿含斜角在 -0.202，与书脊浅嵌入 0.008 <= JOINT_MAX_DEPTH
  group.add(mesh(new THREE.BoxGeometry(0.052, 0.5, 0.07), m.detail, [0, 0.04, MOUNT_Z + 0.035], [0, 0, 0], 'relief-spine', [...MOUNT, 'spine-ribbon']));
  group.add(extrude([[-0.018, -0.206], [0.018, -0.206], [0.024, -0.32], [0, -0.288], [-0.024, -0.32]], 0.02, m.rim, [0, 0, extrudeZ(0.02)], 'relief-bookmark', [...MOUNT, 'spine-ribbon']));
  group.add(textMesh(font, 'READ', 0.11, 0.025, m.detail, [0, -0.43, MOUNT_Z], 'relief-label'));
}

// 做饭徽章：立体搪瓷炖锅 + S 形柔美升腾蒸汽曲线
function buildCooking(group, font, m) {
  const enamel = physical('做饭 · 奶油搪瓷', '#efe6d5', 0.16, 0.06);
  const profile = [
    new THREE.Vector2(0.0, 0.05),
    new THREE.Vector2(0.14, 0.042),
    new THREE.Vector2(0.24, 0.022),
    new THREE.Vector2(0.3, -0.012),
    new THREE.Vector2(0.3, -0.055),
    new THREE.Vector2(0.3, -0.062),
    new THREE.Vector2(0.0, -0.062),
  ];
  const pot = new THREE.LatheGeometry([...profile].reverse(), 28);
  pot.rotateX(Math.PI / 2);
  const handles = [];
  for (const side of [-1, 1]) {
    const handle = new THREE.TorusGeometry(0.075, 0.02, 8, 18, Math.PI);
    handle.rotateZ(side > 0 ? -Math.PI / 2 : Math.PI / 2);
    handle.translate(side * 0.28, 0, -0.036);
    handles.push(handle);
  }
  const potZ = MOUNT_Z + 0.062;
  group.add(mesh(merge([pot, ...handles]), m.detail, [0, 0.02, potZ], [0, 0, 0], 'relief-pot', ['disc-mount', 'pot-neck']));
  const neck = new THREE.CylinderGeometry(0.022, 0.027, 0.026, 12);
  neck.rotateX(Math.PI / 2);
  group.add(mesh(neck, m.rim, [0, 0.02, potZ + 0.055], [0, 0, 0], 'relief-knob-neck', ['pot-neck', 'knob-neck']));
  group.add(mesh(new THREE.SphereGeometry(0.042, 14, 10), m.rim, [0, 0.02, potZ + 0.102], [0, 0, 0], 'relief-knob', ['knob-neck']));
  for (const side of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.08, 0.33, MOUNT_Z + 0.014),
      new THREE.Vector3(side * 0.16, 0.38, MOUNT_Z + 0.022),
      new THREE.Vector3(side * 0.07, 0.44, MOUNT_Z + 0.03),
      new THREE.Vector3(side * 0.14, 0.50, MOUNT_Z + 0.038),
    ]);
    group.add(mesh(new THREE.TubeGeometry(curve, 18, 0.014, 6, false), enamel, [0, 0, 0], [0, 0, 0], `relief-steam-${side > 0 ? 'right' : 'left'}`, MOUNT));
  }
  group.add(textMesh(font, 'COOK', 0.105, 0.025, m.detail, [0, -0.45, MOUNT_Z], 'relief-label'));
}

function buildTravel(group, font, m) {
  const snow = physical('旅行 · 珍珠山峰', '#e8ede8', 0.34, 0.05);
  const accent = physical('旅行 · 罗盘指针', '#d48265', 0.22, 0.72);
  group.add(extrude([[-0.5, 0.0], [-0.13, 0.4], [0.14, 0.0]], 0.05, m.detail, [0, 0, extrudeZ(0.05)], 'relief-mountain-back'));
  group.add(extrude([[0.2, 0.0], [0.4, 0.22], [0.58, 0.0]], 0.05, snow, [0, 0, extrudeZ(0.05)], 'relief-mountain-front'));
  group.add(mesh(new THREE.TorusGeometry(0.18, 0.02, 8, 32), m.rim, [0, -0.25, MOUNT_Z + 0.02], [0, 0, 0], 'relief-compass-ring', MOUNT));
  group.add(extrude([[0, -0.16], [-0.04, -0.3], [0.04, -0.3]], 0.03, accent, [0, 0, extrudeZ(0.03)], 'relief-compass-needle'));
  group.add(textMesh(font, 'GO', 0.095, 0.022, m.detail, [0, -0.53, MOUNT_Z], 'relief-label'));
}

// 相见徽章：双环交叠 + 两侧异步交汇轨迹弧拥抱柔光珍珠节点，区分于链上合约章的硬朗链节
function buildMeeting(group, font, m) {
  const pearl = physical('相见 · 柔光珍珠', '#f6f0e8', 0.16, 0.08);
  const band = 0.036;
  group.add(annulus(0.19, band, 0.03, m.detail, [-0.17, 0.03, MOUNT_Z], 'relief-ring-back', RING_STACK));
  group.add(annulus(0.19, band, 0.03, m.rim, [0.17, 0.03, stackInRing(MOUNT_Z, band, 0.03)], 'relief-ring-front', RING_STACK));
  for (const side of [-1, 1]) {
    const arc = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.42, 0.12, MOUNT_Z + 0.014),
      new THREE.Vector3(side * 0.30, 0.27, MOUNT_Z + 0.02),
      new THREE.Vector3(side * 0.12, 0.34, MOUNT_Z + 0.026),
    ]);
    group.add(mesh(new THREE.TubeGeometry(arc, 14, 0.013, 6, false), m.rim, [0, 0, 0], [0, 0, 0], `relief-orbit-${side > 0 ? 'right' : 'left'}`, MOUNT));
  }
  group.add(mesh(new THREE.SphereGeometry(0.072, 18, 12), pearl, [0, 0.34, DISC_FRONT_Z + 0.072 - 0.01], [0, 0, 0], 'relief-pearl', MOUNT));
  group.add(textMesh(font, 'MEET', 0.105, 0.025, m.detail, [0, -0.44, MOUNT_Z], 'relief-label'));
}

function buildContract(group, font, m, contractId) {
  const plaque = physical('合约 · 铭牌烤漆', '#1d272e', 0.28, 0.25);
  const letters = physical('合约 · 编号文字', '#e2e0d4', 0.24, 0.68);
  const band = 0.045;
  group.add(annulus(0.17, band, 0.032, m.detail, [-0.15, 0.16, MOUNT_Z], 'relief-link-back', RING_STACK));
  group.add(annulus(0.17, band, 0.032, m.detail, [0.15, 0.16, stackInRing(MOUNT_Z, band, 0.032)], 'relief-link-front', RING_STACK));
  group.add(mesh(rounded(0.62, 0.24, 0.045, 0.03), plaque, [0, -0.3, MOUNT_Z + 0.0225], [0, 0, 0], 'relief-plaque', ['disc-mount', 'plaque-text']));
  group.add(textMesh(font, contractId, 0.063, 0.014, letters, [0, -0.3, MOUNT_Z + 0.037], 'relief-contract-id', ['plaque-text']));
  group.add(textMesh(font, 'SELF REPORT', 0.07, 0.018, letters, [0, 0.44, MOUNT_Z], 'relief-label'));
}

function buildMilestone(group, font, m, definition) {
  const count = definition.id === 'bronze10' ? '10' : definition.id === 'silver50' ? '50' : '100';
  const caption = definition.id === 'bronze10' ? 'BEGIN' : definition.id === 'silver50' ? 'ECHO' : 'UNITY';
  group.add(ticks(definition.id === 'bronze10' ? 10 : definition.id === 'silver50' ? 20 : 30, m.detail, true));
  if (definition.id === 'diamond100') {
    const gem = physical('钻石 · 刻面晶体', '#e6f4f7', 0.05, 0.2);
    group.add(mesh(new THREE.OctahedronGeometry(0.135, 0), gem, [0, 0.13, 0.228], [0.1, 0.35, 0.08], 'relief-gem', MOUNT));
    group.add(countText(font, '100', 0.125, 0.042, [0, -0.2, MOUNT_Z], m.detail, 'relief-count', 5));
  } else {
    group.add(countText(font, count, count === '100' ? 0.22 : 0.34, 0.065, [0, 0.06, MOUNT_Z], m.detail, 'relief-count', 5));
  }
  group.add(textMesh(font, caption, 0.052, 0.02, m.detail, [0, -0.42, MOUNT_Z], 'relief-label'));
}

const palettes = {
  reading: { label: '阅读', body: '#5a7866', inner: '#769680', rim: '#c4a464', detail: '#cca968', innerRoughness: 0.34, innerMetalness: 0.22 },
  cooking: { label: '做饭', body: '#9e5b3c', inner: '#e0d2b8', rim: '#c27b52', detail: '#bc734a', innerRoughness: 0.32, innerMetalness: 0.15 },
  travel: { label: '旅行', body: '#2f666c', inner: '#488285', rim: '#d4b068', detail: '#36757c', innerRoughness: 0.32, innerMetalness: 0.25 },
  meeting: { label: '相见', body: '#9e6b62', inner: '#dfcac0', rim: '#d49b89', detail: '#b87666', innerRoughness: 0.3, innerMetalness: 0.18 },
  contract: { label: '合约', body: '#48525a', inner: '#2d3940', rim: '#949fa6', detail: '#b8c0c4', innerRoughness: 0.38, innerMetalness: 0.85 },
  bronze10: { label: '铜章', body: '#9c5636', inner: '#5e3726', rim: '#c98057', detail: '#e0a882', innerRoughness: 0.4, innerMetalness: 0.75 },
  silver50: { label: '银章', body: '#bfc6cb', inner: '#4f5961', rim: '#e4e8ea', detail: '#eef2f4', rimRoughness: 0.1, innerRoughness: 0.38, innerMetalness: 0.65 },
  gold100: { label: '金章', body: '#c29638', inner: '#6e5019', rim: '#e6c265', detail: '#f7de92', rimRoughness: 0.12, innerRoughness: 0.36, innerMetalness: 0.65 },
  // 白金珍藏：采用深岩灰绿哑光内盘衬托高抛光冷色白金字与钟表级放射刻度，彻底解决白底白字无对比度问题
  platinum100: { label: '白金', body: '#cfd6d8', inner: '#364549', rim: '#f0f3f1', detail: '#f4f7f5', rimRoughness: 0.08, innerRoughness: 0.4, innerMetalness: 0.28 },
  diamond100: { label: '钻石底座', body: '#b8c3c7', inner: '#3b4d54', rim: '#e8eded', detail: '#f2f6f6', rimRoughness: 0.08, innerRoughness: 0.38, innerMetalness: 0.32 },
};

export const DEFAULT_CONTRACT_ID = '0x71A4';

export function createBadge(definition, font, contractId = DEFAULT_CONTRACT_ID) {
  const group = new THREE.Group();
  group.name = definition.name;
  group.userData.badgeId = definition.id;
  const materials = baseMaterials(palettes[definition.id]);
  coinBase(group, materials, definition.type !== 'task');
  if (definition.id === 'reading') buildReading(group, font, materials);
  if (definition.id === 'cooking') buildCooking(group, font, materials);
  if (definition.id === 'travel') buildTravel(group, font, materials);
  if (definition.id === 'meeting') buildMeeting(group, font, materials);
  if (definition.id === 'contract') buildContract(group, font, materials, contractId.slice(0, 8));
  if (definition.type === 'milestone') buildMilestone(group, font, materials, definition);
  group.traverse((object) => { if (object.isMesh) object.userData.badgeId = definition.id; });
  return group;
}

export function updateContractId(group, font, contractId) {
  const previous = group.getObjectByName('relief-contract-id');
  const material = previous?.material || physical('合约 · 编号文字', '#e2e0d4', 0.24, 0.68);
  if (previous) {
    previous.parent.remove(previous);
    previous.geometry.dispose();
  }
  const id = textMesh(font, (contractId || DEFAULT_CONTRACT_ID).slice(0, 8), 0.063, 0.014, material, [0, -0.3, MOUNT_Z + 0.037], 'relief-contract-id', ['plaque-text']);
  group.add(id);
}

export function disposeObject(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of [object.material].flat()) if (material) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}
