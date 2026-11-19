import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { badgeDefinitions, createBadge, disposeObject, updateContractId } from './badges.js';
import { playBadges } from './game.js';
import { enableToneMapping } from './environment/tonemap.js';
import { excludeFromFraming, framingReport } from './kit/edit3d.js';

export async function createScene({ asset }) {
  enableToneMapping({ curve: 'neutral' });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#d7d3ca');
  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 60);
  camera.position.set(0, -0.2, 10.2);
  camera.lookAt(0, -0.45, 0);

  const [font, environment] = await Promise.all([
    new FontLoader().loadAsync('/fonts/helvetiker_regular.typeface.json'),
    new HDRLoader().loadAsync('/textures/studio_small_09_1k.hdr'),
  ]);
  environment.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = environment;
  scene.environmentIntensity = 0.85;

  const displayRoot = new THREE.Group();
  displayRoot.name = '十枚生活徽章';
  scene.add(displayRoot);
  // 演示编号只保留 8 个字符：完整编号在界面上用文本展示，不烘焙进几何体
  const settings = { rotationSpeed: 0.55, contractId: 'DEMO-0x71A4' };
  const badges = badgeDefinitions.map((definition, index) => {
    const object = createBadge(definition, font, settings.contractId);
    const position = new THREE.Vector3((index % 5 - 2) * 1.88, index < 5 ? 0.95 : -1.1, 0);
    object.position.copy(position);
    displayRoot.add(object);
    asset.register(`badge-${definition.id}`, object, { name: definition.name, parent: 'collection' });
    return { definition, object, basePosition: position.clone() };
  });
  asset.register('collection', displayRoot, { name: '生活徽章收藏墙' });

  const wallMaterial = new THREE.MeshStandardMaterial({ color: '#26353a', roughness: 0.82, metalness: 0.05 });
  wallMaterial.name = '展墙 · 深灰绿磨砂';
  const wall = new THREE.Mesh(new RoundedBoxGeometry(10.8, 5.3, 0.18, 4, 0.08), wallMaterial);
  wall.position.set(0, -0.15, -0.35);
  wall.receiveShadow = true;
  scene.add(wall);
  asset.register('gallery-wall', wall, { name: '深灰绿展墙' });

  const shelfMaterial = new THREE.MeshStandardMaterial({ color: '#56635d', roughness: 0.48, metalness: 0.3 });
  shelfMaterial.name = '陈列架 · 拉丝灰绿金属';
  const shelves = [];
  for (const [index, y] of [0.08, -1.97].entries()) {
    const shelf = new THREE.Mesh(new RoundedBoxGeometry(10.1, 0.12, 0.72, 3, 0.035), shelfMaterial);
    shelf.position.set(0, y, 0.02);
    shelf.castShadow = true;
    shelf.receiveShadow = true;
    scene.add(shelf);
    shelves.push(shelf);
    asset.register(`shelf-${index + 1}`, shelf, { name: `第 ${index + 1} 排陈列架` });
  }

  const key = new THREE.DirectionalLight('#ffe3c2', 3.2);
  key.name = '主光 · 暖色柔光';
  key.position.set(4, 5, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -6;
  key.shadow.camera.right = 6;
  key.shadow.camera.top = 5;
  key.shadow.camera.bottom = -5;
  key.shadow.normalBias = 0.025;
  const fill = new THREE.DirectionalLight('#c7deef', 1.1);
  fill.name = '补光 · 冷色反射';
  fill.position.set(-5, 1, 4);
  const rim = new THREE.DirectionalLight('#fff0d5', 1.4);
  rim.name = '轮廓光 · 顶部暖白';
  rim.position.set(0, 5, -1);
  scene.add(key, fill, rim);
  asset.register('key-light', key, { name: key.name });
  asset.register('fill-light', fill, { name: fill.name });
  asset.register('rim-light', rim, { name: rim.name });
  asset.register('camera', camera, { name: '收藏室主相机' });

  excludeFromFraming(wall);
  const report = framingReport(scene, displayRoot);
  if (!report.ok) console.warn('Badge framing needs review', report);

  asset.registerParams('collection-settings', settings, {
    rotationSpeed: { label: '自动旋转速度', type: 'number', min: 0, max: 2, step: 0.05 },
    contractId: { label: '演示合约编号', type: 'string' },
  }, { name: '收藏室设置', objectId: 'collection' });
  const unsubscribe = asset.subscribe(({ type }) => {
    if (type === 'change') {
      const contract = badges.find((badge) => badge.definition.id === 'contract');
      if (contract) updateContractId(contract.object, font, settings.contractId);
    }
  });

  asset.registerText('controls-hint', {
    name: '操作提示',
    text: '拖动旋转 · 点击聚焦 · A/D 切换 · 空格自动旋转 · R 复位',
    position: [0.5, 0.055],
    visible: true,
    style: { font: '26px sans-serif', color: '#F2EEE5', align: 'center', strokeColor: '#1C292D', strokeWidth: 4 },
  });

  return {
    scene,
    camera,
    play: (context) => playBadges(context, badges, settings, camera, displayRoot, { walls: [wall], shelves }),
    dispose() {
      unsubscribe();
      environment.dispose();
      disposeObject(scene);
    },
  };
}
