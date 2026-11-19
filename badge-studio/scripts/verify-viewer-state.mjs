// 查看器状态回归：用最小 DOM 桩驱动 src/game.js，验证三件 Astra 反馈过的事——
//   1) 点击后只剩被点中的徽章可见，展墙/陈列架隐藏，但 displayRoot 不能一起藏
//      （徽章挂在 displayRoot 下，藏父级会把聚焦的那枚也藏没）；
//   2) 拾取沿祖先链判可见，不会命中被父级藏起来的网格；
//   3) 复位（R）只重置取景、不退出聚焦，返回集合（Esc）才退出。
// 纯逻辑测试，不起 WebGL：OrbitControls 只用 DOM 事件，相机与射线都跑在 CPU 上。
import * as THREE from 'three';

// ---- 最小 DOM 桩：只要 game.js 用到的那些成员 ----
function fakeElement(tag) {
  const element = {
    tagName: tag, style: {}, dataset: {}, children: [], handlers: {}, attributes: {},
    _html: '',
    set innerHTML(html) {
      element._html = html;
      element.children = [];
      for (const [, action] of html.matchAll(/<button data-action="([^"]+)"/g)) {
        const button = fakeElement('button');
        button.dataset.action = action;
        element.children.push(button);
      }
    },
    get innerHTML() { return element._html; },
    querySelector(selector) {
      const wanted = selector.replace(/[[\]"]/g, '');
      if (selector.startsWith('[data-action')) return element.children.find((child) => child.dataset.action === wanted.replace('data-action=', ''));
      const stub = fakeElement('div');
      stub.dataset[wanted.replace('data-', '')] = '';
      return stub;
    },
    querySelectorAll(selector) { return selector === 'button' ? element.children.slice() : []; },
    appendChild(child) { element.children.push(child); return child; },
    removeChild(child) { element.children = element.children.filter((item) => item !== child); },
    remove() {},
    setAttribute(name, value) { element.attributes[name] = value; },
    addEventListener(type, handler) { (element.handlers[type] ||= []).push(handler); },
    removeEventListener(type, handler) { element.handlers[type] = (element.handlers[type] || []).filter((item) => item !== handler); },
    dispatchEvent(event) { for (const handler of element.handlers[event.type] || []) handler({ currentTarget: element, ...event }); return true; },
  };
  return element;
}
const documentStub = {
  createElement: (tag) => fakeElement(tag),
  addEventListener() {}, removeEventListener() {},
};
// game.js 直接用全局 document，Node 下先把桩装上再加载模块
globalThis.document = documentStub;
const { playBadges } = await import('../src/game.js');
const controller = new AbortController();
const canvas = {
  style: {}, width: 800, height: 600, ownerDocument: documentStub, listeners: {},
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); },
  removeEventListener(type, handler) { this.listeners[type] = (this.listeners[type] || []).filter((h) => h !== handler); },
  setPointerCapture() {}, releasePointerCapture() {},
  getRootNode() { return documentStub; },
  getBoundingClientRect() { return { left: 0, top: 0, width: this.width, height: this.height }; },
  dispatch(type, event = {}) { for (const handler of this.listeners[type] || []) handler({ preventDefault() {}, ...event }); },
};
const container = { dataset: {}, children: [], appendChild(node) { this.children.push(node); }, removeChild(node) { this.children = this.children.filter((c) => c !== node); } };

const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 60);
camera.position.set(0, -0.2, 10.2);
camera.lookAt(0, -0.45, 0);
camera.updateMatrixWorld(true);
camera.updateProjectionMatrix();

const displayRoot = new THREE.Group();
displayRoot.name = 'display-wall';
const badges = [];
for (const [index, id] of ['reading', 'cooking', 'travel'].entries()) {
  const object = new THREE.Group();
  object.name = id;
  object.userData.badgeId = id;
  object.position.set((index - 1) * 1.88, 0, 0);
  const shell = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.7, 0.15), new THREE.MeshBasicMaterial());
  shell.userData.badgeId = id;   // createBadge 会把 badgeId 写到每个子网格上，拾取靠它认领
  object.add(shell);
  displayRoot.add(object);
  badges.push({ definition: { id, name: `徽章 ${id}`, material: '测试材质' }, object, basePosition: object.position.clone() });
}
const wall = new THREE.Mesh(new THREE.BoxGeometry(10.8, 5.3, 0.18), new THREE.MeshBasicMaterial());
const shelf = new THREE.Mesh(new THREE.BoxGeometry(10.1, 0.12, 0.72), new THREE.MeshBasicMaterial());

const viewer = playBadges({ canvas, container, signal: controller.signal }, badges, { rotationSpeed: 0.5 }, camera, displayRoot, { walls: [wall], shelves: [shelf] });

const failures = [];
function check(label, condition) { if (!condition) failures.push(label); }

check('初始是集合态', container.dataset.mode === 'collection');
check('集合态下三枚都可见', badges.every((badge) => badge.object.visible));
check('集合态下展墙可见', wall.visible && shelf.visible);
check('集合态下 displayRoot 可见', displayRoot.visible);

// 把世界坐标换算成指针事件的 clientX/Y，模拟一次“点在中间那枚上”
function clickAt(target) {
  const point = target.clone().project(camera);
  const clientX = ((point.x + 1) / 2) * canvas.width;
  const clientY = ((1 - point.y) / 2) * canvas.height;
  canvas.dispatch('pointermove', { clientX, clientY });
  canvas.dispatch('pointerdown', { clientX, clientY });
  canvas.dispatch('pointerup', { clientX, clientY });
}

// 真实渲染循环每帧都会更新矩阵，测试里显式更新一次，否则射线打到的还是单位矩阵位置
displayRoot.updateMatrixWorld(true);
clickAt(badges[1].object.position);
check('点击后进入聚焦态', container.dataset.mode === 'focus');
check('聚焦的是被点中的那枚', container.dataset.activeBadge === 'cooking');
check('聚焦态只剩它可见', badges.filter((badge) => badge.object.visible).length === 1 && badges[1].object.visible);
check('聚焦态展墙与陈列架隐藏', !wall.visible && !shelf.visible);
check('聚焦态 displayRoot 仍然可见（否则连聚焦那枚一起藏掉）', displayRoot.visible === true);

// 聚焦态按 R：只重置取景，不退出聚焦
canvas.dispatch('keydown', { key: 'r' });
check('R 之后仍是聚焦态', container.dataset.mode === 'focus');
check('R 之后仍聚焦同一枚', container.dataset.activeBadge === 'cooking');

// 聚焦态按 Esc：返回集合
canvas.dispatch('keydown', { key: 'Escape' });
check('Esc 之后回到集合态', container.dataset.mode === 'collection');
check('返回集合后三枚都恢复可见', badges.every((badge) => badge.object.visible));
check('返回集合后展墙恢复可见', wall.visible && shelf.visible);

// 复位按钮：集合态下也应回到总览，而不是卡在中间态
const hud = container.children.at(-1);
const resetButton = hud.querySelectorAll('button').find((button) => button.dataset.action === 'reset');
resetButton.dispatchEvent({ type: 'click' });
check('集合态点复位仍是集合态', container.dataset.mode === 'collection');
check('集合态点复位后三枚都可见', badges.every((badge) => badge.object.visible));

viewer.update(0.016);
viewer.dispose();
controller.abort();

if (failures.length) { console.error(`FAIL ${failures.join('；')}`); process.exit(1); }
console.log('查看器状态回归通过：聚焦隔离 / 祖先链拾取 / 复位与返回集合分离');
