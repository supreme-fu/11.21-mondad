// 轻量 GLB 导出：单枚 <=200KB、十枚合计 <=2MB。
// 体积主要来自顶点数（GLB 每个顶点写 position+normal=24 字节），所以：
//   1) 删除 uv 属性——徽章材质没有任何贴图，UV 是纯浪费；
//   2) 文字关闭 bevel、curveSegments 降到 4；
//   3) 圆角盒只在看得见的位置用，纹线和书脊用 BoxGeometry；
//   4) 演示编号只保留 8 个字符，完整编号在界面用文本展示。
// 导出后用 GLTFLoader 真实重载校验网格数量与包围盒，不用文件大小代替验收。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { badgeDefinitions, createBadge } from '../src/badges.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const PER_BADGE_BUDGET = 200 * 1024;
const TOTAL_BUDGET = 2 * 1024 * 1024;

class NodeFileReader {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((buffer) => { this.result = buffer; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then((buffer) => { this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buffer).toString('base64')}`; this.onloadend?.(); }); }
}
globalThis.FileReader = NodeFileReader;
globalThis.self = globalThis;

const font = new FontLoader().parse(JSON.parse(readFileSync(`${root}public/fonts/helvetiker_regular.typeface.json`, 'utf8')));
// 输出目录只有两处，都在本次改动所有权内：
//   badge-studio/public/models        本地查看器与 thumbnails.html 渲染台的数据源
//   ../../deliverables/badges/models 仓库根 deliverables，公开交付路径
// app/public/badges/models 与 miniprogram/assets 归另一执行器，这里不再写，
// 避免两个进程互相覆盖；UI 侧从 badge-studio/public/models 同步即可。
const outputDirs = [
  `${root}public/models`,
  `${root}../deliverables/badges/models`,
];
for (const dir of outputDirs) mkdirSync(dir, { recursive: true });

const baselinePath = `${root}data/export-baseline.json`;
const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : null;

const exporter = new GLTFExporter();
const loader = new GLTFLoader();
const manifest = [];
let totalBytes = 0;
const failures = [];

for (const definition of badgeDefinitions) {
  const badge = createBadge(definition, font);
  let vertices = 0;
  let triangles = 0;
  const world = new THREE.Box3();
  badge.updateMatrixWorld(true);
  badge.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry.deleteAttribute('uv');
    if (!object.geometry.getAttribute('normal')) object.geometry.computeVertexNormals();
    const position = object.geometry.getAttribute('position');
    vertices += position.count;
    triangles += object.geometry.getIndex() ? object.geometry.getIndex().count / 3 : position.count / 3;
    world.expandByObject(object);
  });

  const buffer = await exporter.parseAsync(badge, { binary: true, onlyVisible: true });
  const bytes = buffer.byteLength;
  totalBytes += bytes;

  // 真实重载：确认 GLB 能被 GLTFLoader 解析且网格与包围盒一致
  const reloaded = await loader.parseAsync(buffer, '');
  let reloadedMeshes = 0;
  let reloadedVertices = 0;
  const reloadedBox = new THREE.Box3();
  reloaded.scene.updateMatrixWorld(true);
  reloaded.scene.traverse((object) => {
    if (!object.isMesh) return;
    reloadedMeshes += 1;
    reloadedVertices += object.geometry.getAttribute('position').count;
    reloadedBox.expandByObject(object);
  });
  const drift = reloadedBox.getSize(new THREE.Vector3()).sub(world.getSize(new THREE.Vector3())).length();
  if (reloadedMeshes === 0) failures.push(`${definition.id} 重载后没有网格`);
  if (drift > 1e-3) failures.push(`${definition.id} 重载包围盒漂移 ${drift.toFixed(4)}`);

  const file = `models/${definition.id}.glb`;
  for (const dir of outputDirs) writeFileSync(`${dir}/${definition.id}.glb`, Buffer.from(buffer));
  const previous = baseline?.badges?.[definition.id];
  manifest.push({
    id: definition.id,
    name: definition.name,
    material: definition.material,
    series: definition.type,
    file,
    bytes,
    meshes: reloadedMeshes,
    triangles,
    vertices,
    bounds: {
      min: world.min.toArray().map((value) => Number(value.toFixed(4))),
      max: world.max.toArray().map((value) => Number(value.toFixed(4))),
    },
    previousBytes: previous?.bytes ?? null,
    previousVertices: previous?.vertices ?? null,
  });
  const delta = previous ? `（修复前 ${previous.bytes} → ${Math.round((1 - bytes / previous.bytes) * 100)}%↓）` : '';
  const flag = bytes <= PER_BADGE_BUDGET ? '' : '  [超预算]';
  console.log(`${definition.id}\t${bytes} bytes\t${reloadedMeshes} meshes\t${triangles} tris\t${vertices} verts\t重载OK${delta}${flag}`);
  if (bytes > PER_BADGE_BUDGET) failures.push(`${definition.id} ${bytes} bytes 超过单枚 ${PER_BADGE_BUDGET} 预算`);
}

for (const dir of outputDirs) writeFileSync(`${dir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
const totalDelta = baseline ? `（修复前 ${baseline.totalBytes} → ${Math.round((1 - totalBytes / baseline.totalBytes) * 100)}%↓）` : '';
console.log(`TOTAL ${totalBytes} bytes（预算 ${TOTAL_BUDGET}）${totalDelta}`);
if (totalBytes > TOTAL_BUDGET) failures.push(`合计 ${totalBytes} bytes 超过 ${TOTAL_BUDGET} 预算`);
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('导出完成：全部通过 GLTFLoader 重载与体积预算');
