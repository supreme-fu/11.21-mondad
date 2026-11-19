import type { Badge } from '@/lib/badges';

/**
 * 徽章 3D 查看器的只读快照。用于 e2e 断言（松手是否回弹、动画是否停止、相机是否被每帧重置），
 * 不参与渲染逻辑，也不写入 React 状态，避免每帧触发重渲染。
 */
export interface BadgeViewerSnapshot {
  id: string;
  status: 'loading' | 'ready' | 'error';
  frames: number;
  azimuth: number;
  polar: number;
  distance: number;
  camera: [number, number, number];
  target: [number, number, number];
  message: string | null;
}

export type BadgeViewerStatus = 'loading' | 'ready' | 'error';

export interface BadgeViewer {
  /** 复位到初始视角，只在用户点击时调用一次。 */
  reset(): void;
  /** 快速翻看背面微雕或回到正面。 */
  flip(toBack: boolean): void;
  /** 调节全息虹彩镀层强度（0 ~ 1）。 */
  setFoil(intensity: number): void;
  /** 调节主光方位角（-180 ~ 180 度）。 */
  setLightAngle(degrees: number): void;
  /** 调节环境反射强度（0.4 ~ 1.6）。 */
  setEnvIntensity(intensity: number): void;
  /** 导出当前时刻的透明背景 PNG 数据 URL。 */
  capturePng(): string | null;
  /** 加载失败后重新拉取同一个 GLB。 */
  retry(): void;
  /** 关闭时调用：停监听、解事件、释放 GPU 资源、移除 canvas。 */
  dispose(): void;
}

interface CreateOptions {
  container: HTMLElement;
  badge: Badge;
  initialFoil?: number;
  initialLightAngle?: number;
  initialEnvIntensity?: number;
  onStatusChange: (status: BadgeViewerStatus, message: string | null) => void;
  onSideChange?: (isBack: boolean) => void;
}

declare global {
  interface Window {
    __badgeViewer?: BadgeViewerSnapshot;
  }
}

const MAX_DPR = 2;
const FOV = 34;

/**
 * 借鉴 holo-card-studio 的视图依赖虹彩光谱与斜向扫光公式，
 * 直接基于视图空间法线与视线方向注入标准 PBR 材质，无需 UV 贴图即可呈现“光随手动”的微光层次。
 */
function enhanceHoloMaterial(
  material: import('three').Material,
  uniforms: { uFoil: { value: number }; uLightAngle: { value: number } },
) {
  const std = material as import('three').MeshStandardMaterial;
  if (!std.isMeshStandardMaterial) return;
  std.customProgramCacheKey = () => 'do-something-holo-badge-v1';
  std.onBeforeCompile = (shader) => {
    shader.uniforms.uFoil = uniforms.uFoil;
    shader.uniforms.uLightAngle = uniforms.uLightAngle;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uFoil;
uniform float uLightAngle;
vec3 dsSpectrum(float t) {
  t = fract(t);
  vec3 pink = vec3(1.0, 0.38, 0.66);
  vec3 gold = vec3(1.0, 0.86, 0.40);
  vec3 blue = vec3(0.32, 0.72, 1.0);
  if (t < 0.35) return mix(pink, gold, t / 0.35);
  if (t < 0.70) return mix(gold, blue, (t - 0.35) / 0.35);
  return mix(blue, vec3(1.0), (t - 0.70) / 0.30);
}`,
      )
      .replace(
        '#include <dithering_fragment>',
        `if (uFoil > 0.001) {
  vec3 holoN = normalize(normal);
  vec3 holoV = normalize(vViewPosition);
  float holoFresnel = pow(1.0 - clamp(abs(dot(holoN, holoV)), 0.0, 1.0), 2.15);
  float holoPhase = dot(holoN.xy, vec2(0.848, -0.530)) * 0.62 + holoV.x * 0.92 + holoV.y * 0.48 + uLightAngle * 0.18;
  vec3 holoSpec = dsSpectrum(holoPhase);
  float holoSweep = pow(max(0.0, sin((holoN.x * 0.83 + holoN.y * 0.35 + holoV.x * 1.45 + uLightAngle * 0.45) * 6.28318)), 8.0);
  gl_FragColor.rgb += holoSpec * (holoFresnel * 0.24 + holoSweep * 0.13) * uFoil;
}
#include <dithering_fragment>`,
      );
  };
  std.needsUpdate = true;
}

function disposeObject(root: import('three').Object3D) {
  root.traverse((object) => {
    const mesh = object as import('three').Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      for (const value of Object.values(material as unknown as Record<string, unknown>)) {
        if (value && typeof value === 'object' && 'isTexture' in value) {
          (value as import('three').Texture).dispose();
        }
      }
      material?.dispose();
    }
  });
}

/**
 * 在 container 内创建唯一的 canvas 与一套 three.js 场景。
 * three 与 GLTFLoader 在这里才被动态 import，徽章列表首屏不会下载 3D 运行库。
 */
export async function createBadgeViewer({
  container,
  badge,
  initialFoil = 0.45,
  initialLightAngle = 28,
  initialEnvIntensity = 1.05,
  onStatusChange,
  onSideChange,
}: CreateOptions): Promise<BadgeViewer | null> {
  const [THREE, { GLTFLoader }, { OrbitControls }, { RoomEnvironment }] = await Promise.all([
    import('three'),
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/controls/OrbitControls.js'),
    import('three/addons/environments/RoomEnvironment.js'),
  ]);

  let renderer: import('three').WebGLRenderer;
  try {
    // 透明背景 + preserveDrawingBuffer：舞台光影交给 CSS，同时支持“定格此刻”导出高清透明 PNG。
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
  } catch {
    onStatusChange('error', '当前浏览器没有可用的 WebGL，无法显示 3D 徽章。可以重试，或改用缩略图查看。');
    return null;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  const scene = new THREE.Scene();

  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = environment;
  scene.environmentIntensity = initialEnvIntensity;

  scene.add(new THREE.AmbientLight(0xffffff, 0.24));

  // 可调方位角的工作室主光群组（参考 holo-card-studio 柔光主灯 + 冷色补光 + 顶部金光）
  const lightRig = new THREE.Group();
  const key = new THREE.DirectionalLight(0xffe9ca, 2.15);
  key.position.set(2.4, 3.0, 4.2);
  const fill = new THREE.DirectionalLight(0xc3ddf6, 0.95);
  fill.position.set(-3.4, 0.6, 2.4);
  const side = new THREE.DirectionalLight(0xffffff, 0.85);
  side.position.set(4.5, 0.8, 0.2);
  const topGold = new THREE.DirectionalLight(0xffcb7a, 0.9);
  topGold.position.set(-0.6, 3.8, 1.8);
  lightRig.add(key, fill, side, topGold);
  lightRig.rotation.y = THREE.MathUtils.degToRad(initialLightAngle);
  scene.add(lightRig);

  const rim = new THREE.DirectionalLight(0xffffff, 1.15);
  rim.position.set(-1.2, 2.2, -3.6);
  // 单独补一盏背后的灯：转到背面时不能只剩剪影，正面法线朝前，这盏灯基本不影响正面亮度。
  const back = new THREE.DirectionalLight(0xfff2df, 1.3);
  back.position.set(0.4, 1.4, -4.2);
  scene.add(rim, back);

  const holoUniforms = {
    uFoil: { value: initialFoil },
    uLightAngle: { value: THREE.MathUtils.degToRad(initialLightAngle) },
  };

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 100);
  camera.position.set(0, 0, 3);

  const controls = new OrbitControls(camera, renderer.domElement);
  // 松手即停：不开阻尼，不用 autoRotate，松手不会继续滑也不会回弹。
  controls.enableDamping = false;
  controls.autoRotate = false;
  controls.enablePan = false;
  controls.zoomSpeed = 0.8;
  controls.rotateSpeed = 0.9;

  const canvas = renderer.domElement;
  canvas.className = 'badge-viewer-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `${badge.name} 三维模型，可拖拽旋转、滚轮或双指缩放`);
  container.appendChild(canvas);

  let disposed = false;
  let model: import('three').Object3D | null = null;
  let lastBackSide: boolean | null = null;
  const initial = { position: new THREE.Vector3(), target: new THREE.Vector3(), distance: 3 };

  const snapshot: BadgeViewerSnapshot = {
    id: badge.id,
    status: 'loading',
    frames: 0,
    azimuth: 0,
    polar: 0,
    distance: 0,
    camera: [0, 0, 0],
    target: [0, 0, 0],
    message: null,
  };

  function publish(status?: BadgeViewerStatus, message: string | null = null) {
    if (status) snapshot.status = status;
    snapshot.message = message;
    snapshot.azimuth = controls.getAzimuthalAngle();
    snapshot.polar = controls.getPolarAngle();
    snapshot.distance = camera.position.distanceTo(controls.target);
    snapshot.camera = camera.position.toArray() as [number, number, number];
    snapshot.target = controls.target.toArray() as [number, number, number];
    if (!disposed) {
      window.__badgeViewer = { ...snapshot };
      const isBack = camera.position.z < 0;
      if (isBack !== lastBackSide) {
        lastBackSide = isBack;
        onSideChange?.(isBack);
      }
    }
  }

  function render() {
    if (disposed) return;
    snapshot.frames += 1;
    renderer.render(scene, camera);
    publish();
  }

  function resize() {
    if (disposed) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    render();
  }

  function frameModel(loaded: import('three').Object3D) {
    const box = new THREE.Box3().setFromObject(loaded);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, 0.001);
    loaded.position.sub(center);

    const distance = (radius / Math.sin(THREE.MathUtils.degToRad(FOV / 2))) * 1.08;
    camera.position.set(0, 0, distance);
    controls.target.set(0, 0, 0);
    controls.minDistance = distance * 0.45;
    controls.maxDistance = distance * 2.2;
    camera.lookAt(controls.target);
    camera.updateProjectionMatrix();

    initial.position.copy(camera.position);
    initial.target.copy(controls.target);
    initial.distance = distance;
  }

  function loadModel() {
    onStatusChange('loading', null);
    publish('loading', null);
    const loader = new GLTFLoader();
    loader.load(
      badge.modelUrl,
      (gltf) => {
        // 快速关闭后异步 load 才完成：直接丢弃，不挂进场景、不留资源。
        if (disposed) { disposeObject(gltf.scene); return; }
        if (model) { scene.remove(model); disposeObject(model); }
        model = gltf.scene;
        model.traverse((object) => {
          const mesh = object as import('three').Mesh;
          if (!mesh.isMesh) return;
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const material of materials) enhanceHoloMaterial(material, holoUniforms);
        });
        scene.add(model);
        frameModel(model);
        resize();
        onStatusChange('ready', null);
        publish('ready', null);
      },
      undefined,
      () => {
        if (disposed) return;
        onStatusChange('error', '模型加载失败，可能是网络中断或资源被移除。可以重试。');
        publish('error', '模型加载失败，可能是网络中断或资源被移除。可以重试。');
      },
    );
  }

  const observer = new ResizeObserver(() => resize());
  observer.observe(container);
  // 只有交互、复位、光影调校、尺寸变化才渲染：不常驻 RAF，也不开 autoRotate。
  function onWindowResize() {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
    resize();
  }
  window.addEventListener('resize', onWindowResize);
  controls.addEventListener('change', () => render());
  controls.addEventListener('end', () => publish());

  resize();
  loadModel();

  return {
    reset() {
      if (disposed || !model) return;
      camera.position.copy(initial.position);
      controls.target.copy(initial.target);
      camera.lookAt(controls.target);
      camera.updateProjectionMatrix();
      controls.update();
      publish();
    },
    flip(toBack: boolean) {
      if (disposed || !model) return;
      const dist = camera.position.distanceTo(controls.target) || initial.distance;
      camera.position.set(0, 0, toBack ? -dist : dist);
      controls.target.set(0, 0, 0);
      camera.lookAt(controls.target);
      camera.updateProjectionMatrix();
      controls.update();
      publish();
    },
    setFoil(intensity: number) {
      if (disposed) return;
      holoUniforms.uFoil.value = Math.max(0, Math.min(1.2, intensity));
      render();
    },
    setLightAngle(degrees: number) {
      if (disposed) return;
      const rad = THREE.MathUtils.degToRad(degrees);
      lightRig.rotation.y = rad;
      holoUniforms.uLightAngle.value = rad;
      render();
    },
    setEnvIntensity(intensity: number) {
      if (disposed) return;
      scene.environmentIntensity = Math.max(0.3, Math.min(1.8, intensity));
      render();
    },
    capturePng() {
      if (disposed || !model) return null;
      renderer.render(scene, camera);
      return canvas.toDataURL('image/png');
    },
    retry() {
      if (disposed) return;
      loadModel();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      window.removeEventListener('resize', onWindowResize);
      controls.dispose();
      if (model) { scene.remove(model); disposeObject(model); model = null; }
      environment.dispose();
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch { /* 某些环境下上下文已丢失 */ }
      canvas.remove();
      if (window.__badgeViewer?.id === badge.id) delete window.__badgeViewer;
    },
  };
}
