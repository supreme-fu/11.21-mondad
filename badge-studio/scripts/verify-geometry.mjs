// 徽章几何断言：不靠肉眼，也不靠 bbox 口头声明。全部用真实三角形与世界包围盒。
// 规则（2026-11-10 按 Astra 反馈修订，旧版“所有 relief minZ>=0.115 且禁止任意相交”
// 把正常贴底浮雕也判成失败，逼出爆炸图式的悬浮层，已作废）：
//  1) 平面轴：coinBase 圆柱轴向必须沿 Z（六边形曾被 Euler[π/2,0,π/6] 倾斜 30°）。
//  2) 穿背板：任何网格的局部 Z 下限不得低于背圈平面（做饭锅体曾伸到 z=-0.13）。
//  3) 连通实体：整枚徽章必须是一个连通体——任何网格与其它网格的真实表面不相接
//     （不相交且最近距离 > CONTACT_EPS）即判“未连接”。包围盒间隙只做粗筛，判定本身
//     走三角形：外圈凸出的包围盒比实际表面高 0.0275，拿包围盒当表面会放过近距离浮空。
//     这一条同时抓住浮雕悬浮与六角吊环悬空。
//  4) 设计接合：网格对实体相交，只有在 badges.js 为双方声明接合号（userData.joints）
//     时才允许，且接合必须是浅嵌入（重叠包围盒至少一个轴 <= JOINT_MAX_DEPTH）。
//     'disc-mount' 只授权浮雕嵌进内盘；两块浮雕互相咬必须另声明零件级接合号
//     （pot-neck / knob-neck / plaque-text），否则算错误穿透。
//     未声明的互穿（同深度双环、互叠山峰）一律算错误穿透。
//  5) 正面贴底：relief 只允许从盘前嵌入，zMin 不得低于 DISC_FRONT_Z - JOINT_MAX_DEPTH。
//  6) 浮雕可见：relief 必须高出盘前至少 0.004，不允许整块埋进内盘。
//  7) 书页层级：阅读页纹路必须是书页面组的子元素，继承 Y/Z 旋转。
//  8) 锅体绕序与法线朝外：FrontSide 前方射线第一命中必须是锅盖斜面（可见锅面），
//     命中面法线朝观察者，且 normal 属性在锅盖斜面上整体 +Z。
//     早期 LatheGeometry 吃正序 profile，解析法线（normal=(dy,-dx)）与三角绕序
//     一起朝内：DoubleSide 下锅面可见但 face.normal.z=-0.998（受光全错），
//     FrontSide 下只剩被内盘挡住的锅底 z=0.1065——正面渲染整口锅消失。
//     修法是反序 profile，不是把材质改成 DoubleSide 掩盖。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { badgeDefinitions, createBadge, BACK_LIMIT_Z, BASE_FRONT_Z, DISC_FRONT_Z } from '../src/badges.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const reportPath = process.env.BADGE_GEOMETRY_REPORT || `${root}../deliverables/badges/geometry-report.json`;
const font = new FontLoader().parse(JSON.parse(readFileSync(`${root}public/fonts/helvetiker_regular.typeface.json`, 'utf8')));
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), v5 = new THREE.Vector3(), v6 = new THREE.Vector3();
const ab = new THREE.Vector3(), ac = new THREE.Vector3(), qp = new THREE.Vector3(), ap = new THREE.Vector3(), n = new THREE.Vector3(), e = new THREE.Vector3();

const CONTACT_EPS = 0.004;   // 真实表面距离 <= 此值算“接触”（叠层圆环已实体嵌入，不用再靠它）
const JOINT_MAX_DEPTH = 0.02; // 声明接合允许的最大嵌入深度
// 锅盖斜面最外沿的世界 Z：锅心 z=MOUNT_Z+0.062=0.1685，profile 末点 0.022。
// 锅底在 0.1065（内盘前面 DISC_FRONT_Z=0.1145 之后），所以 FrontSide 第一命中
// 低于这个值就说明命中的是被挡的锅底而不是可见锅面。
const POT_LID_MIN_Z = 0.1905;

// Möller–Trumbore：线段 p→q 是否穿过三角形 a,b,c
function segmentTriangle(p, q, a, b, c) {
  ab.subVectors(b, a);            // e1
  ac.subVectors(c, a);            // e2
  qp.subVectors(q, p);            // D
  n.crossVectors(qp, ac);         // P = D × e2
  const det = ab.dot(n);
  if (Math.abs(det) < 1e-12) return false;
  const inv = 1 / det;
  ap.subVectors(p, a);            // T
  const u = ap.dot(n) * inv;
  if (u < 0 || u > 1) return false;
  e.crossVectors(ap, ab);         // Q = T × e1
  const v = qp.dot(e) * inv;
  if (v < 0 || u + v > 1) return false;
  const t = ac.dot(e) * inv;
  return t >= 0 && t <= 1;
}

function trianglesIntersect(t1, t2) {
  for (const [p, q] of [[t1[0], t1[1]], [t1[1], t1[2]], [t1[2], t1[0]]]) {
    if (segmentTriangle(p, q, t2[0], t2[1], t2[2])) return true;
  }
  for (const [p, q] of [[t2[0], t2[1]], [t2[1], t2[2]], [t2[2], t2[0]]]) {
    if (segmentTriangle(p, q, t1[0], t1[1], t1[2])) return true;
  }
  return false;
}

// 点是否落在三角形的 eps 邻域内。 Ericson《Real-Time Collision Detection》
// closestPtPointTriangle 的判定版：Voronoi 区编号写错一次，连通性判定就整体失效，
// 所以文件末尾有 selfTest() 用已知答案逐区校验。
const cpA = new THREE.Vector3();
const cpAB = new THREE.Vector3(), cpAC = new THREE.Vector3(), cpAP = new THREE.Vector3();
const cpBP = new THREE.Vector3(), cpCP = new THREE.Vector3(), cpTmp = new THREE.Vector3();
function pointTriangleWithin(p, a, b, c, eps) {
  const eps2 = eps * eps;
  cpAB.subVectors(b, a); cpAC.subVectors(c, a); cpAP.subVectors(p, a);
  const d1 = cpAB.dot(cpAP), d2 = cpAC.dot(cpAP);
  if (d1 <= 0 && d2 <= 0) return cpA.copy(a).distanceToSquared(p) <= eps2;        // 顶点 A 区
  cpBP.subVectors(p, b);
  const d3 = cpAB.dot(cpBP), d4 = cpAC.dot(cpBP);
  if (d3 >= 0 && d4 <= d3) return cpA.copy(b).distanceToSquared(p) <= eps2;       // 顶点 B 区
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {                                            // 边 AB
    const v = d1 / (d1 - d3);
    return cpA.copy(a).addScaledVector(cpAB, v).distanceToSquared(p) <= eps2;
  }
  cpCP.subVectors(p, c);
  const d5 = cpAB.dot(cpCP), d6 = cpAC.dot(cpCP);
  if (d6 >= 0 && d5 <= d6) return cpA.copy(c).distanceToSquared(p) <= eps2;       // 顶点 C 区
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {                                            // 边 AC
    const w = d2 / (d2 - d6);
    return cpA.copy(a).addScaledVector(cpAC, w).distanceToSquared(p) <= eps2;
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {                                  // 边 BC
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    cpTmp.subVectors(c, b);
    return cpA.copy(b).addScaledVector(cpTmp, w).distanceToSquared(p) <= eps2;
  }
  const denom = 1 / (va + vb + vc);                                               // 面内
  return cpA.copy(a).addScaledVector(cpAB, vb * denom).addScaledVector(cpAC, vc * denom).distanceToSquared(p) <= eps2;
}

// 两个网格的真实表面是否相接（相交，或最近距离 <= eps）。
// 只用三角形级判定，不用包围盒：外圈这种外凸网格的包围盒比实际表面高 0.0275，
// 拿包围盒当表面会让 0.004~0.03 的近距离浮空被判成“已连接”。
function surfacesTouch(a, b, eps) {
  for (const t1 of a.triangles) {
    const lo = Math.min(t1[0].z, t1[1].z, t1[2].z) - eps;
    const hi = Math.max(t1[0].z, t1[1].z, t1[2].z) + eps;
    for (const t2 of b.triangles) {
      if (t2[0].z > hi && t2[1].z > hi && t2[2].z > hi) continue;
      if (t2[0].z < lo && t2[1].z < lo && t2[2].z < lo) continue;
      if (trianglesIntersect(t1, t2)) return true;
      for (const p of t1) {
        if (pointTriangleWithin(p, t2[0], t2[1], t2[2], eps)) return true;
      }
      for (const p of t2) {
        if (pointTriangleWithin(p, t1[0], t1[1], t1[2], eps)) return true;
      }
    }
  }
  return false;
}

// 两个包围盒的切比雪夫距离：三轴间隙的最大值，重叠为 0。
function boxGap(a, b) {
  return Math.max(
    Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x),
    Math.max(0, a.min.y - b.max.y, b.min.y - a.max.y),
    Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z),
  );
}

// 重叠包围盒在最薄的一个轴上的厚度：浅接合（贴底嵌入）很薄，错误互穿很厚。
function overlapThickness(a, b) {
  return Math.min(
    Math.max(0, Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x)),
    Math.max(0, Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y)),
    Math.max(0, Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z)),
  );
}

function collect(object, out) {
  object.updateMatrixWorld(true);
  object.traverse((child) => {
    if (!child.isMesh) return;
    const position = child.geometry.getAttribute('position');
    const index = child.geometry.getIndex();
    const triangles = [];
    const matrix = child.matrixWorld;
    const push = (i, j, k) => {
      const a = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(matrix);
      const b = new THREE.Vector3().fromBufferAttribute(position, j).applyMatrix4(matrix);
      const c = new THREE.Vector3().fromBufferAttribute(position, k).applyMatrix4(matrix);
      triangles.push([a, b, c]);
    };
    if (index) { for (let i = 0; i < index.count; i += 3) push(index.getX(i), index.getX(i + 1), index.getX(i + 2)); }
    else { for (let i = 0; i < position.count; i += 3) push(i, i + 1, i + 2); }
    const box = new THREE.Box3();
    for (const t of triangles) box.expandByPoint(t[0]).expandByPoint(t[1]).expandByPoint(t[2]);
    out.push({ name: child.name || '(未命名)', triangles, box, vertices: position.count, joints: child.userData.joints || [] });
  });
  return out;
}

const report = { generatedAt: new Date().toISOString(), badges: [], failures: [] };
function fail(message) { report.failures.push(message); console.error(`FAIL ${message}`); }

let totalTriangles = 0;
let totalVertices = 0;

for (const definition of badgeDefinitions) {
  const group = createBadge(definition, font);
  const meshes = collect(group, []);
  const entry = { id: definition.id, meshes: meshes.length, triangles: 0, vertices: 0, depthZ: null, perMesh: [], checks: {} };
  for (const item of meshes) {
    entry.triangles += item.triangles.length;
    entry.vertices += item.vertices;
    entry.perMesh.push({
      name: item.name,
      triangles: item.triangles.length,
      zMin: Number(item.box.min.z.toFixed(4)),
      zMax: Number(item.box.max.z.toFixed(4)),
      x: Number((item.box.max.x - item.box.min.x).toFixed(4)),
      y: Number((item.box.max.y - item.box.min.y).toFixed(4)),
      z: Number((item.box.max.z - item.box.min.z).toFixed(4)),
      joints: item.joints,
    });
  }
  totalTriangles += entry.triangles;
  totalVertices += entry.vertices;
  entry.depthZ = Number((Math.max(...entry.perMesh.map((m) => m.zMax)) - Math.min(...entry.perMesh.map((m) => m.zMin))).toFixed(4));

  // 1) 平面轴：背板圆柱的 Z 向厚度必须等于 0.15，而不是倾斜后的 0.797
  const body = meshes.find((item) => item.name === 'base-body');
  const bodySize = body.box.getSize(new THREE.Vector3());
  entry.checks.flatAxis = Number(bodySize.z.toFixed(4));
  if (bodySize.z > 0.2) fail(`${definition.id} base-body 轴向倾斜：Z 向厚度 ${bodySize.z.toFixed(3)}，应为 0.150`);
  if (bodySize.x < 1.2 || bodySize.x > 1.7 || bodySize.y < 1.2 || bodySize.y > 1.7) fail(`${definition.id} base-body 截面异常：${bodySize.x.toFixed(3)}×${bodySize.y.toFixed(3)}`);

  // 2) 穿背板：任何网格都不得低于背圈平面
  for (const item of meshes) {
    if (item.box.min.z < BACK_LIMIT_Z) fail(`${definition.id} ${item.name} 穿出背板：zMin=${item.box.min.z.toFixed(3)} < ${BACK_LIMIT_Z}`);
  }

  // 3) 连通实体：并查集，边 = 真实表面相接（相交或最近距离 <= CONTACT_EPS）。
  //    包围盒间隙只用来做粗筛（间隙 > CONTACT_EPS 必然不相接），判定本身走三角形，
  //    否则外圈凸出的包围盒会把近距离浮空吞掉。这一条同时抓浮雕悬浮与六角吊环悬空。
  const parent = meshes.map((_, index) => index);
  const find = (index) => { while (parent[index] !== index) { parent[index] = parent[parent[index]]; index = parent[index]; } return index; };
  let contactPairs = 0;
  for (let i = 0; i < meshes.length; i += 1) {
    for (let j = i + 1; j < meshes.length; j += 1) {
      if (boxGap(meshes[i].box, meshes[j].box) > CONTACT_EPS) continue;
      if (!surfacesTouch(meshes[i], meshes[j], CONTACT_EPS)) continue;
      contactPairs += 1;
      const a = find(i), b = find(j);
      if (a !== b) parent[a] = b;
    }
  }
  const components = new Map();
  for (let index = 0; index < meshes.length; index += 1) {
    const root_ = find(index);
    if (!components.has(root_)) components.set(root_, []);
    components.get(root_).push(meshes[index].name);
  }
  entry.checks.connectedComponents = components.size;
  entry.checks.contactPairs = contactPairs;
  if (components.size > 1) {
    for (const names of components.values()) {
      if (names.length < meshes.length) fail(`${definition.id} 未连接（浮空）：${names.join(' + ')} 与徽章主体的包围盒间隙 > ${CONTACT_EPS}`);
    }
  }

  // 4) 设计接合：先做三角形级实测（包围盒相交不等于实体相交），确认真的互穿后，
  //    只有双方声明了同一接合号才放行，且接合必须是浅嵌入（重叠包围盒最薄轴 <= JOINT_MAX_DEPTH）。
  //    未声明的互穿（同深度双环、互叠山峰）一律算错误穿透。
  let pairsTested = 0;
  let jointsUsed = 0;
  const declaredPairs = [];
  for (let i = 0; i < meshes.length; i += 1) {
    for (let j = i + 1; j < meshes.length; j += 1) {
      const a = meshes[i], b = meshes[j];
      // 币身自身构造（背板/内盘/外圈/背圈/吊环）本来互相嵌入，不属于浮雕接合
      if (!a.name.startsWith('relief-') && !b.name.startsWith('relief-')) continue;
      if (!a.box.intersectsBox(b.box)) continue;
      pairsTested += 1;
      let crossed = false;
      outer: for (const t1 of a.triangles) {
        const lo = Math.min(t1[0].z, t1[1].z, t1[2].z), hi = Math.max(t1[0].z, t1[1].z, t1[2].z);
        for (const t2 of b.triangles) {
          if (t2[0].z > hi && t2[1].z > hi && t2[2].z > hi) continue;
          if (t2[0].z < lo && t2[1].z < lo && t2[2].z < lo) continue;
          if (trianglesIntersect(t1, t2)) { crossed = true; break outer; }
        }
      }
      if (!crossed) continue; // 投影重叠但实体留缝，正是叠层浮雕该有的样子
      const shared = a.joints.filter((joint) => b.joints.includes(joint));
      // 'disc-mount' 只授权“浮雕嵌进内盘”，不授权两块浮雕互相咬：双环回到同一深度、
      // 两座山峰互叠，双方都带 disc-mount，若不区分就会被这条规则放过去。
      // 两块浮雕之间要相交，必须另声明零件级接合号（pot-neck / plaque-text …）。
      const toBase = a.name.startsWith('base-') || b.name.startsWith('base-');
      const declared = toBase ? shared.length > 0 : shared.some((joint) => joint !== 'disc-mount');
      if (!declared) {
        fail(`${definition.id} 实体相交：${a.name} × ${b.name}（未声明接合号，属错误穿透）`);
        continue;
      }
      jointsUsed += 1;
      declaredPairs.push(`${a.name} × ${b.name}（${shared.filter((joint) => !toBase || joint !== 'disc-mount').join('/') || 'disc-mount'}）`);
      const thickness = overlapThickness(a.box, b.box);
      if (thickness > JOINT_MAX_DEPTH) {
        fail(`${definition.id} 接合过深：${a.name} × ${b.name}（${shared.join('/')}）重叠厚度 ${thickness.toFixed(3)} > ${JOINT_MAX_DEPTH}`);
      }
    }
  }
  entry.checks.intersectionPairsTested = pairsTested;
  entry.checks.declaredJoints = jointsUsed;
  entry.declaredPairs = declaredPairs;

  // 5) 正面贴底：relief 不允许绕到背面
  for (const item of meshes) {
    if (!item.name.startsWith('relief-')) continue;
    if (item.box.min.z < DISC_FRONT_Z - JOINT_MAX_DEPTH) {
      fail(`${definition.id} ${item.name} 绕到背面：zMin=${item.box.min.z.toFixed(3)} < ${(DISC_FRONT_Z - JOINT_MAX_DEPTH).toFixed(3)}`);
    }
    // 6) 浮雕可见：不能整块埋进内盘
    if (item.box.max.z < BASE_FRONT_Z + 0.004) {
      fail(`${definition.id} ${item.name} 完全埋进内盘：zMax=${item.box.max.z.toFixed(3)}`);
    }
  }

  // 7) 书页层级：纹路必须挂在书页面组下，且因继承旋转而在 Z 向展开
  if (definition.id === 'reading') {
    const lines = meshes.filter((item) => item.name === 'relief-page-lines');
    const pages = group.children.filter((child) => child.name.startsWith('reading-page-'));
    entry.checks.pageGroups = pages.length;
    entry.checks.linesMeshes = lines.length;
    if (pages.length !== 2 || lines.length !== 2) fail('reading 书页面组或纹路数量不是 2');
    for (const page of pages) {
      const child = page.children.find((item) => item.name === 'relief-page-lines');
      if (!child) fail(`reading ${page.name} 书页纹路未挂在页面组下（会丢失继承旋转）`);
      const size = new THREE.Box3().setFromObject(child).getSize(new THREE.Vector3());
      if (size.z < 0.02) fail(`reading ${page.name} 纹路未继承页面旋转：Z 向厚度 ${size.z.toFixed(4)}，应 >= 0.02`);
      entry.checks[`${page.name}-linesZ`] = Number(size.z.toFixed(4));
    }
  }

  // 8) 锅体绕序与法线：真实 FrontSide 射线，而不是肉眼看图。
  //    锅盖斜面（profile 0.05→0.022）平移后世界 z 落在 0.1905~0.2185，
  //    锅底在 0.1065、内盘前面在 DISC_FRONT_Z=0.1145——绕序朝内时 FrontSide
  //    第一命中就是被内盘挡住的锅底，正面图里整口锅不见。
  if (definition.id === 'cooking') {
    const pot = group.getObjectByName('relief-pot');
    const raycaster = new THREE.Raycaster();
    const previousSide = pot.material.side;
    pot.material.side = THREE.FrontSide;
    const samples = [[0.1, 0.02], [-0.12, 0.05], [0.02, 0.135], [0.2, 0.06]];
    const frontHits = [];
    for (const [x, y] of samples) {
      raycaster.set(new THREE.Vector3(x, y, 0.6), new THREE.Vector3(0, 0, -1));
      const found = raycaster.intersectObject(pot, false);
      if (!found.length) {
        fail(`cooking 前方射线 (${x},${y}) FrontSide 未命中任何锅面：锅体绕序朝内`);
        continue;
      }
      const hit = found[0];
      frontHits.push({ x, y, z: Number(hit.point.z.toFixed(4)), normalZ: Number(hit.face.normal.z.toFixed(4)) });
      if (hit.point.z < POT_LID_MIN_Z) {
        fail(`cooking 前方射线 (${x},${y}) 第一命中 z=${hit.point.z.toFixed(4)} 不是锅盖斜面（应 >= ${POT_LID_MIN_Z}）：锅体绕序/法线朝内，FrontSide 只剩被内盘挡住的锅底`);
      }
      if (hit.face.normal.z <= 0.5) {
        fail(`cooking 前方射线 (${x},${y}) 命中面法线朝内：normal.z=${hit.face.normal.z.toFixed(4)}，应 > 0.5`);
      }
    }
    pot.material.side = previousSide;
    entry.checks.potFrontHits = frontHits;
    // normal 属性与绕序必须一致：绕序对了但法线属性仍朝内，着色一样是黑的。
    // 锅盖斜面是 profile 末段 0.022~0.05，取局部 z >= 0.02 的全部顶点。
    const position = pot.geometry.getAttribute('position');
    const normal = pot.geometry.getAttribute('normal');
    let lidVerts = 0, lidOutward = 0;
    for (let i = 0; i < position.count; i += 1) {
      if (position.getZ(i) < 0.02) continue;
      lidVerts += 1;
      if (normal.getZ(i) > 0.9) lidOutward += 1;
    }
    entry.checks.potLidNormalsOutward = `${lidOutward}/${lidVerts}`;
    if (lidVerts === 0 || lidOutward !== lidVerts) {
      fail(`cooking 锅体 normal 属性朝内：锅盖斜面 ${lidVerts} 个顶点只有 ${lidOutward} 个法线 +Z`);
    }
  }

  report.badges.push(entry);
}

// 几何原语自检：Voronoi 区判定错一处，规则 3 的“未连接（浮空）”就会整体失效。
// 用一个固定三角形加已知答案逐区跑一遍，任何一处不符直接以非零退出码结束。
(function selfTest() {
  const a = new THREE.Vector3(0, 0, 0), b = new THREE.Vector3(1, 0, 0), c = new THREE.Vector3(0, 1, 0);
  const cases = [
    [[0.25, 0.25, 0.001], true],   // 面内，垂直距离 0.001
    [[0.25, 0.25, 0.05], false],   // 面内，垂直距离 0.05
    [[0.5, 0.5, 0.001], true],     // 斜边 BC 上
    [[0.6, 0.401, 0], true],       // BC 外侧 0.0007
    [[0.6, 0.45, 0], false],       // BC 外侧 0.035
    [[-0.001, 0.25, 0], true],     // 顶点 A 外侧
    [[-0.05, 0.25, 0], false],
    [[1.001, 0, 0], true],         // 顶点 B 外侧
    [[1.05, 0, 0], false],
    [[0, 1.001, 0], true],         // 顶点 C 外侧
    [[0, 1.05, 0], false],
    [[0.5, -0.001, 0], true],      // 边 AB 外侧
    [[0.5, -0.05, 0], false],
    [[-0.001, -0.001, 0], true],   // 边 AC 外侧
    [[-0.05, -0.05, 0], false],
  ];
  for (const [[x, y, z], expect] of cases) {
    const got = pointTriangleWithin(new THREE.Vector3(x, y, z), a, b, c, 0.004);
    if (got !== expect) {
      console.error(`SELFTEST FAIL pointTriangleWithin(${x},${y},${z}) 期望 ${expect}，实得 ${got}`);
      process.exit(1);
    }
  }
})();

report.totalTriangles = totalTriangles;
report.totalVertices = totalVertices;
report.status = report.failures.length ? 'failed' : 'passed';
mkdirSync(reportPath.replace(/\/[^/]*$/, ''), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

for (const entry of report.badges) {
  console.log(`${entry.id}\t${entry.meshes} meshes\t${entry.triangles} tris\t${entry.vertices} verts\tdepthZ=${entry.depthZ}\tbodyZ=${entry.checks.flatAxis}\tcomponents=${entry.checks.connectedComponents}\tjoints=${entry.checks.declaredJoints}`);
}
console.log(`TOTAL ${totalTriangles} tris, ${totalVertices} verts, ${report.badges.length} badges`);
if (report.failures.length) { console.error(`${report.failures.length} 项断言失败`); process.exit(1); }
console.log('全部几何断言通过');
