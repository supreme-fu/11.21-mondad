/**
 * 浏览器侧徽章缩略图渲染器。由 sync-badge-assets.mjs 用 esbuild 打包后注入 Chromium 执行。
 *
 * 光照与环境刻意复刻 badge-studio/thumbnails.html 的方案：RoomEnvironment 程序化环境反射
 * （不下载任何 HDRI 文件）+ 四盏方向光，ACESFilmic 色调映射，正面视角。
 *
 * 背景保持透明，让缩略图落在列表卡片自己的浅色底上；这样同一张图在五套主题里都不会糊，
 * 高反射材质（白金 / 钻石）也不会像压在深色背板上那样丢掉边缘。
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const FOV = 34;

function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  return renderer;
}

function createScene(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const scene = new THREE.Scene();
  scene.environment = environment;

  scene.add(new THREE.AmbientLight(0xffffff, 0.22));
  const key = new THREE.DirectionalLight(0xfff1dd, 2.0);
  key.position.set(2.4, 3.0, 4.2);
  const fill = new THREE.DirectionalLight(0xcfe0f2, 0.85);
  fill.position.set(-3.4, 0.6, 2.4);
  const side = new THREE.DirectionalLight(0xffffff, 0.9);
  side.position.set(4.5, 0.8, 0.2);
  const rim = new THREE.DirectionalLight(0xffffff, 1.2);
  rim.position.set(-1.2, 2.2, -3.6);
  scene.add(key, fill, side, rim);
  return scene;
}

function frameModel(camera, model) {
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const radius = box.getSize(new THREE.Vector3()).length() / 2;
  model.position.sub(center);
  const distance = (radius / Math.sin(THREE.MathUtils.degToRad(FOV / 2))) * 1.04;
  camera.aspect = 1;
  camera.position.set(0, 0, distance);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  return radius;
}

/** 渲染一枚徽章的正面缩略图，返回带透明通道的 WebP data URL。 */
export async function renderBadgeThumb(glbBase64, size = 256, quality = 0.9, options = {}) {
  const { exposure = 1.05, environmentIntensity = 1 } = options;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const renderer = createRenderer(canvas);
  renderer.toneMappingExposure = exposure;
  const scene = createScene(renderer);
  scene.environmentIntensity = environmentIntensity;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 100);

  try {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(`data:model/gltf-binary;base64,${glbBase64}`);
    const model = gltf.scene;
    const wrapper = new THREE.Group();
    wrapper.add(model);
    frameModel(camera, model);
    scene.add(wrapper);

    renderer.setSize(size, size, false);
    renderer.render(scene, camera);
    return canvas.toDataURL('image/webp', quality);
  } finally {
    renderer.dispose();
    scene.traverse((object) => {
      if (object.isMesh) object.geometry.dispose();
    });
    scene.environment?.dispose();
  }
}
