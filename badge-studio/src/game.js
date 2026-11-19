import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Play 模式两种状态：
//   collection  集合视图，相机可以整场拖动，异或徽章有轻微待机浮动；
//   focus       单枚视图，隐藏其它徽章与展墙/陈列架，相机只绕这一枚转。
// 关键约束：相机插值只在切换状态时进行，用户一拖动（controls 的 start 事件）立即移交
// OrbitControls。早期每帧 camera.position.lerp(desiredCamera) 会把用户转出的角度拽回来，
// 等于“能看不能转”。
// 复位与返回集合是两个动作：复位（R）只把相机挪回默认机位，聚焦态下不退出聚焦；
// 返回集合（Esc / 按钮）才切回 collection。
export function playBadges({ canvas, container, signal }, badges, settings, camera, displayRoot, scenery = {}) {
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 3;
  controls.maxDistance = 16;
  controls.maxPolarAngle = Math.PI * 0.72;
  controls.minPolarAngle = Math.PI * 0.25;
  controls.autoRotateSpeed = settings.rotationSpeed * 2;

  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;inset:0;pointer-events:none;font-family:ui-sans-serif,system-ui,"PingFang SC",sans-serif;color:#f5f1e8;';
  hud.innerHTML = `
    <section style="position:absolute;left:24px;top:22px;max-width:360px;padding:16px 18px;border-radius:16px;background:#223238ed;box-shadow:0 8px 24px #16262a33">
      <div style="font-size:12px;letter-spacing:.12em;opacity:.82">DO SOMETHING · 物料系列</div>
      <h1 style="margin:7px 0 4px;font:600 27px Georgia,'Songti SC',serif">生活徽章收藏室</h1>
      <div data-current style="font-size:15px">十枚徽章，十种生活的质感</div>
      <div data-material style="margin-top:3px;font-size:12px;opacity:.82">拖动探索 · 点击一枚靠近看看</div>
    </section>
    <div style="position:absolute;right:22px;top:22px;padding:7px 11px;border:1px solid #f1c78366;border-radius:999px;background:#223238ed;color:#f1d6a6;font-size:11px">DEMO · 非真实链上发行</div>
    <nav aria-label="徽章操作" style="position:absolute;left:50%;bottom:24px;transform:translateX(-50%);display:flex;gap:8px;pointer-events:auto;white-space:nowrap">
      <button data-action="previous" title="快捷键 A 或左方向键" style="padding:11px 15px;border:1px solid #e8e1d555;border-radius:12px;background:#223238e8;color:#f5f1e8">← 上一枚 <small>A</small></button>
      <button data-action="auto" title="快捷键空格" style="padding:11px 15px;border:1px solid #e8e1d555;border-radius:12px;background:#d7b06a;color:#223238">自动旋转 <small>空格</small></button>
      <button data-action="next" title="快捷键 D 或右方向键" style="padding:11px 15px;border:1px solid #e8e1d555;border-radius:12px;background:#223238e8;color:#f5f1e8">下一枚 → <small>D</small></button>
      <button data-action="back" title="返回集合视图（Esc）" style="padding:11px 15px;border:1px solid #e8e1d555;border-radius:12px;background:#223238e8;color:#f5f1e8">返回集合 <small>Esc</small></button>
      <button data-action="reset" title="只重置取景：聚焦态回到这枚的默认机位，集合态回到全场总览" style="padding:11px 15px;border:1px solid #e8e1d555;border-radius:12px;background:#223238e8;color:#f5f1e8">复位 <small>R</small></button>
    </nav>`;
  container.appendChild(hud);
  const current = hud.querySelector('[data-current]');
  const material = hud.querySelector('[data-material]');
  const autoButton = hud.querySelector('[data-action="auto"]');
  const backButton = hud.querySelector('[data-action="back"]');
  for (const button of hud.querySelectorAll('button')) button.style.cursor = 'pointer';

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(2, 2);
  const overviewCamera = new THREE.Vector3(0, -0.2, 10.2);
  const overviewTarget = new THREE.Vector3(0, -0.45, 0);
  // 聚焦时只隐藏展墙与陈列架，不隐藏 displayRoot：徽章全部挂在 displayRoot 下，
  // 把父级藏起来会连聚焦的那一枚一起藏掉（整个聚焦视图变空）。
  const hidden = [...(scenery.walls || []), ...(scenery.shelves || [])].filter(Boolean);
  // 徽章是 displayRoot 的子节点，父级 visible=false 时子网格自己的 visible 仍是 true，
  // 所以拾取要沿祖先链判可见，不能只筛 hit.object.visible。
  function visibleChain(object) {
    for (let node = object; node; node = node.parent) if (node.visible === false) return false;
    return true;
  }
  let mode = 'collection';
  let hovered = -1;
  let selected = -1;
  let autoRotate = false;
  let elapsed = 0;
  let down = null;
  let transition = null;

  function updateHud() {
    if (mode === 'focus') {
      const badge = badges[selected];
      current.textContent = badge.definition.name;
      material.textContent = `${badge.definition.material} · 拖动可自由旋转这一枚`;
    } else {
      current.textContent = '十枚徽章，十种生活的质感';
      material.textContent = '拖动探索 · 点击一枚靠近看看';
    }
    autoButton.textContent = `${autoRotate ? '暂停旋转' : '自动旋转'} 空格`;
    autoButton.setAttribute('aria-pressed', String(autoRotate));
    backButton.disabled = mode !== 'focus';
    backButton.style.opacity = mode === 'focus' ? '1' : '0.45';
    container.dataset.mode = mode;
    container.dataset.activeBadge = mode === 'focus' ? badges[selected].definition.id : 'collection';
    container.dataset.autoRotate = String(autoRotate);
  }

  // 聚焦时把其它徽章与展墙、陈列架全部隐藏：相机不会穿过展墙，也不会被别的徽章挡住
  function applyIsolation() {
    for (const badge of badges) badge.object.visible = mode === 'collection' || badge.object.userData.badgeId === badges[selected]?.definition.id;
    for (const object of hidden) object.visible = mode === 'collection';
  }

  function moveTo(cameraPosition, targetPosition, distanceRange) {
    transition = { camera: cameraPosition.clone(), target: targetPosition.clone() };
    controls.minDistance = distanceRange[0];
    controls.maxDistance = distanceRange[1];
  }

  function frameBadge(index) {
    selected = index;
    mode = 'focus';
    applyIsolation();
    const target = badges[selected].object.position;
    moveTo(new THREE.Vector3(target.x, target.y + 0.12, 2.7), target, [1.3, 6]);
    updateHud();
  }

  function focus(index) {
    autoRotate = false;
    frameBadge((index + badges.length) % badges.length);
  }

  function enterCollection() {
    mode = 'collection';
    selected = -1;
    autoRotate = false;
    applyIsolation();
    moveTo(overviewCamera, overviewTarget, [3, 16]);
    updateHud();
  }

  // 复位 = 只重置取景。聚焦态下把相机挪回这枚徽章的默认机位（自动旋转开关保持原样），
  // 集合态下回到全场总览；它不承担“退出聚焦”，那是返回集合的动作。
  function reset() {
    if (mode === 'focus') frameBadge(selected);
    else enterCollection();
  }

  function toggleAuto() { autoRotate = !autoRotate; updateHud(); }

  function hitTest() {
    if (mode !== 'collection') return -1;
    raycaster.setFromCamera(pointer, camera);
    const candidates = badges.filter((badge) => visibleChain(badge.object)).map((badge) => badge.object);
    const hits = raycaster.intersectObjects(candidates, true).filter((hit) => visibleChain(hit.object));
    return hits.length ? badges.findIndex((badge) => badge.definition.id === hits[0].object.userData.badgeId) : -1;
  }
  function pointerMove(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    hovered = mode === 'collection' ? hitTest() : -1;
    canvas.style.cursor = hovered >= 0 ? 'pointer' : 'grab';
  }
  function pointerDown(event) { down = { x: event.clientX, y: event.clientY }; }
  function pointerUp(event) {
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return;
    pointerMove(event);
    if (mode === 'collection') {
      const hit = hitTest();
      if (hit >= 0) focus(hit);
    }
    down = null;
  }
  function pointerLeave() { hovered = -1; pointer.set(2, 2); }
  function keyDown(event) {
    if (event.key === 'a' || event.key === 'A' || event.key === 'ArrowLeft') focus(selected < 0 ? badges.length - 1 : selected - 1);
    if (event.key === 'd' || event.key === 'D' || event.key === 'ArrowRight') focus(selected + 1);
    if (event.code === 'Space') { event.preventDefault(); toggleAuto(); }
    if (event.key === 'Escape' && mode === 'focus') enterCollection();
    if (event.key === 'r' || event.key === 'R') reset();
  }
  function action(event) {
    const name = event.currentTarget.dataset.action;
    if (name === 'previous') focus(selected < 0 ? badges.length - 1 : selected - 1);
    if (name === 'next') focus(selected + 1);
    if (name === 'auto') toggleAuto();
    if (name === 'back') enterCollection();
    if (name === 'reset') reset();
  }
  // 用户接管相机就立刻停止插值，这是“能自由旋转”的关键
  controls.addEventListener('start', () => { transition = null; }, { signal });
  canvas.addEventListener('pointermove', pointerMove, { signal });
  canvas.addEventListener('pointerdown', pointerDown, { signal });
  canvas.addEventListener('pointerup', pointerUp, { signal });
  canvas.addEventListener('pointerleave', pointerLeave, { signal });
  canvas.addEventListener('keydown', keyDown, { signal });
  for (const button of hud.querySelectorAll('button')) button.addEventListener('click', action, { signal });
  updateHud();

  return {
    update(dt) {
      elapsed += Math.min(dt, 0.1);
      if (transition) {
        camera.position.lerp(transition.camera, 0.09);
        controls.target.lerp(transition.target, 0.09);
        if (camera.position.distanceTo(transition.camera) < 0.02 && controls.target.distanceTo(transition.target) < 0.02) transition = null;
      }
      controls.autoRotate = autoRotate;
      controls.update();
      // 集合模式下的轻微视差；聚焦时关掉，否则会和用户旋转互相拉扯
      if (mode === 'collection') {
        displayRoot.rotation.y = THREE.MathUtils.lerp(displayRoot.rotation.y, pointer.x * 0.018, 0.06);
        displayRoot.rotation.x = THREE.MathUtils.lerp(displayRoot.rotation.x, pointer.y * 0.008, 0.06);
      }
      badges.forEach((badge, index) => {
        const active = mode === 'focus' ? index === selected : index === hovered;
        if (mode === 'focus') {
          badge.object.rotation.y = THREE.MathUtils.lerp(badge.object.rotation.y, 0, 0.12);
          badge.object.rotation.x = THREE.MathUtils.lerp(badge.object.rotation.x, 0, 0.12);
        } else {
          badge.object.rotation.y = THREE.MathUtils.lerp(badge.object.rotation.y, active ? pointer.x * 0.24 : Math.sin(elapsed * 0.45 + index) * 0.025, 0.09);
          badge.object.rotation.x = THREE.MathUtils.lerp(badge.object.rotation.x, active ? -pointer.y * 0.16 : 0, 0.09);
        }
        const scale = active ? 1.075 : 1;
        badge.object.scale.setScalar(THREE.MathUtils.lerp(badge.object.scale.x, scale, 0.1));
        badge.object.position.z = THREE.MathUtils.lerp(badge.object.position.z, active ? 0.18 : 0, 0.08);
      });
    },
    dispose() {
      controls.dispose();
      hud.remove();
      delete container.dataset.mode;
      delete container.dataset.activeBadge;
      delete container.dataset.autoRotate;
    },
  };
}
