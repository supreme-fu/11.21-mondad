// 变异测试：把用户（Astra）指出的缺陷逐条塞回 badges.js，确认几何断言真的会失败。
// 一条从不失败的断言等于没有断言。只在本地运行，产物是退出码与失败信息。
// 2026-11-10 起断言改为“连通实体 + 声明接合”，变异集随之更新：
// 新增悬浮浮雕、六角吊环悬空、锅钮短颈断开三条 Astra 实拍缺陷，
// 并保留“删掉接合声明必须被抓”这一条，证明接合号不是橡皮图章。
// 同日追加锅体绕序两条：profile 正序（绕序+法线一起朝内，正面缺锅面）、
// 只反法线不动绕序——证明规则 8 的 FrontSide 射线与 normal 属性断言都活着。
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = readFileSync(`${root}src/badges.js`, 'utf8');
const verifier = readFileSync(`${root}scripts/verify-geometry.mjs`, 'utf8');

const mutations = [
  {
    name: '六边形背板回到 Euler[π/2,0,π/6]（轴倾斜 30°）',
    expect: '轴向倾斜',
    from: `  const body = new THREE.CylinderGeometry(0.77, 0.77, 0.15, segments);
  body.rotateX(Math.PI / 2);
  if (hex) body.rotateZ(Math.PI / 6);
  group.add(mesh(body, materials.body, [0, 0, 0], [0, 0, 0], 'base-body', MOUNT));`,
    to: `  const body = new THREE.CylinderGeometry(0.77, 0.77, 0.15, segments);
  group.add(mesh(body, materials.body, [0, 0, 0], [Math.PI / 2, 0, hex ? Math.PI / 6 : 0], 'base-body', MOUNT));`,
  },
  {
    name: '做饭锅体回到 Lathe 轴沿 Y、半径 0.33、z=0.2（穿背板）',
    expect: '穿出背板',
    from: `  const pot = new THREE.LatheGeometry([...profile].reverse(), 28);
  pot.rotateX(Math.PI / 2);
  const handles = [];
  for (const side of [-1, 1]) {
    const handle = new THREE.TorusGeometry(0.075, 0.02, 8, 18, Math.PI);
    handle.rotateZ(side > 0 ? -Math.PI / 2 : Math.PI / 2);
    handle.translate(side * 0.28, 0, -0.036);
    handles.push(handle);
  }
  const potZ = MOUNT_Z + 0.062;
  group.add(mesh(merge([pot, ...handles]), m.detail, [0, 0.02, potZ], [0, 0, 0], 'relief-pot', ['disc-mount', 'pot-neck']));`,
    to: `  const pot = new THREE.LatheGeometry([
    new THREE.Vector2(0.12, -0.22), new THREE.Vector2(0.28, -0.18), new THREE.Vector2(0.33, 0.05),
    new THREE.Vector2(0.29, 0.14), new THREE.Vector2(0.18, 0.16)], 40);
  const handles = [];
  const potZ = 0.2;
  group.add(mesh(merge([pot]), m.detail, [0, -0.05, potZ], [0, 0, 0], 'relief-pot', MOUNT));`,
  },
  {
    name: '相见双环回到同一深度且只带 disc-mount（未声明的浮雕互咬）',
    expect: '实体相交',
    from: `group.add(annulus(0.19, band, 0.03, m.rim, [0.17, 0.03, stackInRing(MOUNT_Z, band, 0.03)], 'relief-ring-front', RING_STACK));`,
    to: `group.add(annulus(0.19, band, 0.03, m.rim, [0.17, 0.03, MOUNT_Z], 'relief-ring-front', MOUNT));`,
  },
  {
    name: '旅行前山回到与后山互相重叠（实体交叉）',
    expect: '实体相交',
    from: `group.add(extrude([[0.2, 0.0], [0.4, 0.22], [0.58, 0.0]], 0.05, snow, [0, 0, extrudeZ(0.05)], 'relief-mountain-front'));`,
    to: `group.add(extrude([[-0.08, 0.0], [0.24, 0.3], [0.49, 0.0]], 0.05, snow, [0, 0, extrudeZ(0.05)], 'relief-mountain-front'));`,
  },
  {
    name: '删掉锅体的接合声明（贴底嵌入不再被声明）',
    expect: '实体相交',
    from: `group.add(mesh(merge([pot, ...handles]), m.detail, [0, 0.02, potZ], [0, 0, 0], 'relief-pot', ['disc-mount', 'pot-neck']));`,
    to: `group.add(mesh(merge([pot, ...handles]), m.detail, [0, 0.02, potZ], [0, 0, 0], 'relief-pot', []));`,
  },
  {
    name: '阅读页纹路回到按世界坐标摆放（不继承页面旋转）',
    expect: '未挂在页面组下',
    from: `    page.add(mesh(merge(lines), ink, [0, 0, 0], [0, 0, 0], 'relief-page-lines'));
    group.add(page);`,
    to: `    group.add(mesh(merge(lines), ink, [side * 0.27, 0.03 + 0.15, 0.196], [0, 0, 0], 'relief-page-lines'));
    group.add(page);`,
  },
  {
    name: 'READ 文字回到悬浮在盘前 0.045（Astra：文字浮空）',
    expect: '未连接',
    from: `group.add(textMesh(font, 'READ', 0.11, 0.025, m.detail, [0, -0.43, MOUNT_Z], 'relief-label'));`,
    to: `group.add(textMesh(font, 'READ', 0.11, 0.025, m.detail, [0, -0.43, 0.16], 'relief-label'));`,
  },
  {
    name: '六角吊环回到 y=0.82（环底 0.689 悬在六角上沿 0.667 之上）',
    expect: '未连接',
    from: `  const loopY = hex ? 0.78 : 0.82;`,
    to: `  const loopY = 0.82;`,
  },
  {
    name: '相见前环按 band（而非环高）算叠层，浮起 0.012（外圈包围盒会掩盖它）',
    expect: '未连接',
    from: `group.add(annulus(0.19, band, 0.03, m.rim, [0.17, 0.03, stackInRing(MOUNT_Z, band, 0.03)], 'relief-ring-front', RING_STACK));`,
    to: `group.add(annulus(0.19, band, 0.03, m.rim, [0.17, 0.03, MOUNT_Z + band], 'relief-ring-front', RING_STACK));`,
  },
  {
    name: '叠层嵌入加深到 0.03（超过 JOINT_MAX_DEPTH 的浅嵌上限）',
    expect: '接合过深',
    from: `const LAYER_EMBED = 0.006;`,
    to: `const LAYER_EMBED = 0.03;`,
  },
  {
    name: '锅钮短颈上移 0.02（球钮组件与锅盖断开）',
    expect: '未连接',
    from: `group.add(mesh(neck, m.rim, [0, 0.02, potZ + 0.055], [0, 0, 0], 'relief-knob-neck', ['pot-neck', 'knob-neck']));`,
    to: `group.add(mesh(neck, m.rim, [0, 0.02, potZ + 0.075], [0, 0, 0], 'relief-knob-neck', ['pot-neck', 'knob-neck']));`,
  },
  {
    name: '锅体 Lathe profile 回到正序（绕序与法线一起朝内，正面缺锅面）',
    expect: '不是锅盖斜面',
    from: `  const pot = new THREE.LatheGeometry([...profile].reverse(), 28);`,
    to: `  const pot = new THREE.LatheGeometry(profile, 28);`,
  },
  {
    name: '只把锅体 normal 属性取反、绕序不动（法线朝内，着色全错）',
    expect: 'normal 属性朝内',
    from: `  const pot = new THREE.LatheGeometry([...profile].reverse(), 28);`,
    to: `  const pot = new THREE.LatheGeometry([...profile].reverse(), 28);
  const flipped = pot.getAttribute('normal');
  for (let i = 0; i < flipped.count; i += 1) flipped.setXYZ(i, -flipped.getX(i), -flipped.getY(i), -flipped.getZ(i));`,
  },
];

let failed = 0;
for (const mutation of mutations) {
  if (!source.includes(mutation.from)) {
    console.error(`SKIP ${mutation.name}：源串未命中，变异脚本需要更新`);
    failed += 1;
    continue;
  }
  const report = join(tmpdir(), `mutant-geometry-${process.pid}.json`);
  writeFileSync(`${root}scripts/.mutant-badges.mjs`, source.replace(mutation.from, mutation.to));
  writeFileSync(`${root}scripts/.mutant-verify.mjs`, verifier.replace("from '../src/badges.js'", "from './.mutant-badges.mjs'"));
  let output = '';
  let code = 0;
  try {
    execFileSync('node', [`${root}scripts/.mutant-verify.mjs`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, BADGE_GEOMETRY_REPORT: report } });
  } catch (error) {
    code = error.status ?? 1;
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
  rmSync(report, { force: true });
  const caught = code !== 0 && output.includes(mutation.expect);
  if (!caught) failed += 1;
  const line = output.split('\n').find((text) => text.includes(mutation.expect)) || '(无匹配失败信息)';
  console.log(`${caught ? 'caught' : 'MISSED'} ${mutation.name}\n        ${line.trim()}`);
}

rmSync(`${root}scripts/.mutant-badges.mjs`, { force: true });
rmSync(`${root}scripts/.mutant-verify.mjs`, { force: true });
if (failed) { console.error(`${failed} 项变异未被断言捕获`); process.exit(1); }
console.log(`${mutations.length} 项缺陷变异全部被断言捕获`);
