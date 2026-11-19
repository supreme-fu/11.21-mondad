import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

/**
 * 徽章小程序侧的检查：目录逻辑、xr-frame 组件逻辑、以及 JSON/WXML/资源路径的静态一致性。
 *
 * 这里全部是静态与逻辑检查：没有微信 IDE、没有真机，不能据此声称原生三维效果已验证。
 */
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const badges = require('../../miniprogram/services/badges.js');
const config = require('../../miniprogram/services/config.js');
const xrSupport = require('../../miniprogram/services/xr-support.js');

/** 复刻微信 Component 的最小行为：属性默认值、属性 observer、lifetimes、methods、setData、triggerEvent。 */
function instantiate(definition: any, env: { SDKVersion?: string; hasXrFrameSystem?: boolean } = { SDKVersion: '3.4.1' }) {
  const events: Array<{ name: string; detail: any }> = [];
  (globalThis as any).wx = {
    SDKVersion: env.SDKVersion,
    getSystemInfoSync: () => ({ SDKVersion: env.SDKVersion }),
    getXrFrameSystem: env.hasXrFrameSystem === false ? undefined : () => vectorFactory(),
  };
  const instance: any = {
    data: { ...(definition.data || {}) },
    events,
    setData(patch: Record<string, any>, callback?: () => void) {
      Object.assign(this.data, patch);
      if (callback) callback();
    },
    triggerEvent(name: string, detail: any) {
      events.push({ name, detail });
    },
  };
  for (const [name, method] of Object.entries(definition.methods || {})) {
    instance[name] = (method as any).bind(instance);
  }
  for (const [name, spec] of Object.entries<any>(definition.properties || {})) {
    if ('value' in spec) instance.data[name] = spec.value;
  }
  instance.setProperty = (name: string, value: any) => {
    const spec = (definition.properties || {})[name];
    const previous = instance.data[name];
    instance.data[name] = value;
    if (spec && typeof spec.observer === 'function') spec.observer.call(instance, value, previous);
  };
  definition.lifetimes?.attached?.call(instance);
  return instance;
}

const vectorFactory = () => ({
  Vector3: { createFromNumber: (...values: number[]) => ({ type: 'vector3', values }) },
});

function loadComponentDefinition() {
  let definition: any = null;
  (globalThis as any).Component = (candidate: any) => { definition = candidate; };
  try {
    delete require.cache[require.resolve('../../miniprogram/components/badge-viewer/index.js')];
    require('../../miniprogram/components/badge-viewer/index.js');
  } finally {
    delete (globalThis as any).Component;
  }
  assert.ok(definition, '组件没有调用 Component()');
  return definition;
}

/** 造一个假 scene，只实现组件真正用到的那几个方法。 */
function createSceneMock() {
  const calls: Array<{ method: string; args: any[] }> = [];
  const counts = { load: 0, release: 0 };
  const transforms: Array<{ position: any; quaternion: any }> = [];
  const camera = {
    getComponent: () => ({
      position: { set: (vector: any) => transforms.push({ position: vector, quaternion: null }) },
      quaternion: { setFromYawRollPitch: (...values: number[]) => transforms.push({ position: null, quaternion: values }) },
    }),
  };
  const record = (method: string, result?: any) => (...args: any[]) => {
    calls.push({ method, args });
    return result;
  };
  return {
    calls,
    counts,
    transforms,
    assets: {
      loadAsset: (...args: any[]) => { counts.load += 1; return calls.push({ method: 'loadAsset', args }), undefined as any; },
      releaseAsset: (...args: any[]) => { counts.release += 1; calls.push({ method: 'releaseAsset', args }); },
    },
    getElementById: record('getElementById', camera),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('小程序徽章目录', () => {
  it('十个系列，缩略图走包内路径、模型走可配置的静态服务', () => {
    const list = badges.listBadges();
    assert.equal(list.length, 10);
    for (const badge of list) {
      assert.match(badge.thumb, /^\/assets\/badges\/[a-z0-9]+\.webp$/);
      assert.match(badge.modelSrc, /^https?:\/\/.+\/badges\/models\/[a-z0-9]+\.glb$/);
      assert.ok(badge.seriesLabel.length > 0);
      assert.ok(badge.triangles > 0);
    }
    // 主题徽章在前，里程碑按名称排在后。
    assert.deepEqual(list.map((badge: any) => badge.series), ['task', 'task', 'task', 'task', 'chain', 'milestone', 'milestone', 'milestone', 'milestone', 'milestone']);
  });

  it('findBadge 命中与未命中', () => {
    assert.equal(badges.findBadge('reading').name, '阅读 · 一页之间');
    assert.equal(badges.findBadge('不存在'), null);
    assert.equal(badges.findBadge(undefined), null);
  });

  it('模型地址来自 config，改成 HTTPS 合法域名即可上真机', () => {
    assert.equal(config.badgeModelBase, 'http://localhost:7100/badges/models');
    assert.equal(badges.findBadge('reading').modelSrc, `${config.badgeModelBase}/reading.glb`);
    assert.equal(config.badgeThumbBase, '/assets/badges');
  });
});

describe('xr-frame 运行环境判断', () => {
  it('版本号比较', () => {
    assert.equal(xrSupport.compareVersion('2.32.0', '2.32.0'), 0);
    assert.equal(xrSupport.compareVersion('2.31.1', '2.32.0'), -1);
    assert.equal(xrSupport.compareVersion('2.33.0', '2.32.0'), 1);
    assert.equal(xrSupport.compareVersion('3.0.0', '2.99.99'), 1);
    assert.equal(xrSupport.compareVersion('2.32', '2.32.0'), 0);
    assert.equal(xrSupport.compareVersion(undefined, '2.32.0'), -1);
  });

  it('低于 2.32.0 或缺少渲染器时给出不可用理由', () => {
    assert.deepEqual(xrSupport.checkXrSupport({ SDKVersion: '2.31.0', hasXrFrameSystem: true }), {
      supported: false,
      reason: '需要微信基础库 2.32.0 以上，当前是 2.31.0。',
    });
    assert.equal(xrSupport.checkXrSupport({ SDKVersion: '2.32.0', hasXrFrameSystem: false }).supported, false);
    assert.equal(xrSupport.checkXrSupport({}).supported, false);
    assert.deepEqual(xrSupport.checkXrSupport({ SDKVersion: '3.4.1', hasXrFrameSystem: true }), { supported: true, reason: '' });
  });
});

describe('badge-viewer 组件逻辑', () => {
  it('src 变化时按需加载一枚 GLB', () => {
    const definition = loadComponentDefinition();
    const component = instantiate(definition);
    const scene = createSceneMock();
    component.handleReady({ detail: { value: scene } });

    component.setProperty('src', 'http://localhost:7100/badges/models/reading.glb');
    assert.deepEqual(scene.calls, [{
      method: 'loadAsset',
      args: [{ type: 'gltf', assetId: 'badge-gltf', src: 'http://localhost:7100/badges/models/reading.glb' }],
    }]);
    assert.equal(component.data.loading, true);
    assert.equal(component.data.gltfLoaded, false);
  });

  it('加载完成后置 gltfLoaded 并抛出 loaded 事件', async () => {
    const definition = loadComponentDefinition();
    const component = instantiate(definition);
    const scene = createSceneMock();
    let resolveLoad: (value?: unknown) => void = () => {};
    scene.assets.loadAsset = () => new Promise((resolve) => { resolveLoad = resolve as any; });
    component.handleReady({ detail: { value: scene } });

    component.setProperty('src', 'http://localhost:7100/badges/models/reading.glb');
    assert.equal(component.data.gltfLoaded, false);
    resolveLoad();
    await settle();
    assert.equal(component.data.loading, false);
    assert.equal(component.data.gltfLoaded, true);
    assert.deepEqual(component.events.at(-1), {
      name: 'loaded',
      detail: { id: 'badge-gltf', src: 'http://localhost:7100/badges/models/reading.glb' },
    });
  });

  it('加载失败给出可重试的错误状态', async () => {
    const definition = loadComponentDefinition();
    const component = instantiate(definition);
    const scene = createSceneMock();
    let attempts = 0;
    let rejectLoad: (reason?: any) => void = () => {};
    scene.assets.loadAsset = () => { attempts += 1; return new Promise((_resolve, reject) => { rejectLoad = reject; }); };
    component.handleReady({ detail: { value: scene } });

    component.setProperty('src', 'http://localhost:7100/badges/models/reading.glb');
    assert.equal(attempts, 1);
    rejectLoad(new Error('network down'));
    await settle();
    assert.equal(component.data.gltfLoaded, false);
    assert.equal(component.data.error, 'network down');
    assert.deepEqual(component.events.at(-1), { name: 'error', detail: { message: 'network down' } });

    // 重试会重新发起一次加载。
    component.retry();
    assert.equal(attempts, 2);
  });

  it('释放时先摘节点再 releaseAsset', async () => {
    const definition = loadComponentDefinition();
    const component = instantiate(definition);
    const scene = createSceneMock();
    scene.assets.loadAsset = () => Promise.resolve();
    component.handleReady({ detail: { value: scene } });
    component.setProperty('src', 'http://localhost:7100/badges/models/reading.glb');
    await settle();
    assert.equal(component.data.gltfLoaded, true);

    component.releaseModel();
    assert.equal(component.data.gltfLoaded, false);
    assert.deepEqual(scene.calls.at(-1), { method: 'releaseAsset', args: ['gltf', 'badge-gltf'] });

    // 重复释放是幂等的：第二次没有 asset 可放，不会重复调用也不会抛错。
    component.releaseModel();
    assert.equal(scene.counts.release, 1);
  });

  it('组件销毁时释放资源，scene 已拆掉也不抛错', async () => {
    const definition = loadComponentDefinition();
    const component = instantiate(definition);
    const scene = createSceneMock();
    scene.assets.loadAsset = () => Promise.resolve();
    component.handleReady({ detail: { value: scene } });
    component.setProperty('src', 'http://localhost:7100/badges/models/reading.glb');
    await settle();

    definition.lifetimes?.detached?.call(component);
    assert.deepEqual(scene.calls.at(-1), { method: 'releaseAsset', args: ['gltf', 'badge-gltf'] });

    // scene 先没了再 detached：不能把异常抛到界面上。
    component.scene = null;
    definition.lifetimes?.detached?.call(component);
  });

  it('快速切换 src：晚到的旧加载不会污染新模型', async () => {
    const definition = loadComponentDefinition();
    const component = instantiate(definition);
    const scene = createSceneMock();
    let attempts = 0;
    const resolvers: Array<(value?: unknown) => void> = [];
    scene.assets.loadAsset = () => { attempts += 1; return new Promise((resolve) => { resolvers.push(resolve as any); }); };
    component.handleReady({ detail: { value: scene } });

    component.setProperty('src', 'http://localhost:7100/badges/models/reading.glb');
    component.setProperty('src', 'http://localhost:7100/badges/models/cooking.glb');
    assert.equal(attempts, 2);

    // 旧请求后到：必须被丢弃并释放，不能把 gltfLoaded 置真。
    resolvers[0]();
    await settle();
    assert.equal(component.data.gltfLoaded, false);
    assert.deepEqual(scene.calls.at(-1), { method: 'releaseAsset', args: ['gltf', 'badge-gltf'] });

    resolvers[1]();
    await settle();
    assert.equal(component.data.gltfLoaded, true);
    assert.equal(component.data.loading, false);
  });

  it('src 置空只释放不加载', () => {
    const definition = loadComponentDefinition();
    const component = instantiate(definition);
    const scene = createSceneMock();
    component.handleReady({ detail: { value: scene } });
    component.setProperty('src', '');
    assert.equal(scene.calls.length, 0);
  });

  it('复位把相机 Transform 送回初始位姿', () => {
    const definition = loadComponentDefinition();
    const component = instantiate(definition);
    const scene = createSceneMock();
    component.handleReady({ detail: { value: scene } });
    component.data.gltfLoaded = true;

    component.setProperty('resetToken', 1);
    assert.deepEqual(scene.transforms, [
      { position: { type: 'vector3', values: [0, 0, 3] }, quaternion: null },
      { position: null, quaternion: [0, 0, 0] },
    ]);
    assert.deepEqual(component.events.at(-1), { name: 'reset', detail: {} });
  });

  it('未加载模型时复位不动作', () => {
    const definition = loadComponentDefinition();
    const component = instantiate(definition);
    const scene = createSceneMock();
    component.handleReady({ detail: { value: scene } });
    component.setProperty('resetToken', 1);
    assert.deepEqual(scene.transforms, []);
  });

  it('基础库过低时抛 unsupported 而不是白屏', () => {
    const definition = loadComponentDefinition();
    const component = instantiate(definition, { SDKVersion: '2.30.1' });
    assert.equal(component.data.supported, false);
    assert.match(component.data.unsupportedReason, /2\.32\.0/);
    assert.deepEqual(component.events.at(-1), { name: 'unsupported', detail: { reason: component.data.unsupportedReason } });
  });
});

describe('小程序徽章资源静态检查', () => {
  it('组件 JSON 声明为 xr-frame 渲染器，宿主页面声明 webview', async () => {
    const component = JSON.parse(await readFile(path.join(root, 'miniprogram/components/badge-viewer/index.json'), 'utf8'));
    assert.equal(component.component, true);
    assert.equal(component.renderer, 'xr-frame');
    assert.deepEqual(component.usingComponents, {});

    const host = JSON.parse(await readFile(path.join(root, 'miniprogram/pages/badge-detail/badge-detail.json'), 'utf8'));
    assert.equal(host.renderer, 'webview');
    assert.equal(host.disableScroll, true);
    assert.equal(host.usingComponents['badge-viewer'], '/components/badge-viewer/index');
  });

  it('列表页不实例化三维组件，只在详情页实例化', async () => {
    const list = await readFile(path.join(root, 'miniprogram/pages/badges/badges.wxml'), 'utf8');
    const detail = await readFile(path.join(root, 'miniprogram/pages/badge-detail/badge-detail.wxml'), 'utf8');
    assert.equal(list.includes('badge-viewer'), false);
    assert.equal(list.includes('xr-scene'), false);
    assert.equal(detail.includes('<badge-viewer'), true);
  });

  it('目录里的每个模型与缩略图都真实存在', async () => {
    const models = await readdir(path.join(root, 'app/public/badges/models'));
    const thumbs = await readdir(path.join(root, 'miniprogram/assets/badges'));
    for (const badge of badges.listBadges()) {
      const model = badge.modelSrc.split('/').pop();
      assert.ok(models.includes(model), `缺少模型 ${model}`);
      const thumb = badge.thumb.split('/').pop();
      assert.ok(thumbs.includes(thumb), `缺少缩略图 ${thumb}`);
    }
    assert.equal(thumbs.filter((file) => !file.endsWith('.webp')).length, 0);
  });

  it('缩略图总量受控，不会把主包顶到上限', async () => {
    const files = await readdir(path.join(root, 'miniprogram/assets/badges'));
    let total = 0;
    for (const file of files) total += (await stat(path.join(root, 'miniprogram/assets/badges', file))).size;
    assert.ok(total < 200 * 1024, `包内徽章资源 ${total} 字节，超出预期`);
    assert.equal(files.length, 10);
  });

  it('两个新页面已在 app.json 注册，并开启按需注入', async () => {
    const app = JSON.parse(await readFile(path.join(root, 'miniprogram/app.json'), 'utf8'));
    assert.ok(app.pages.includes('pages/badges/badges'));
    assert.ok(app.pages.includes('pages/badge-detail/badge-detail'));
    assert.equal(app.lazyCodeLoading, 'requiredComponents');
  });

  it('详情页按官方示例设置渲染尺寸：CSS px 排版，renderWidth/renderHeight 决定分辨率', async () => {
    const wxml = await readFile(path.join(root, 'miniprogram/pages/badge-detail/badge-detail.wxml'), 'utf8');
    const js = await readFile(path.join(root, 'miniprogram/pages/badge-detail/badge-detail.js'), 'utf8');
    // 官方 pages/template/xr-template-loading/index.wxml 的写法：
    // width="{{renderWidth}}" height="{{renderHeight}}" style="width:{{width}}px;height:{{height}}px"
    assert.match(wxml, /width="\{\{renderWidth\}\}"/);
    assert.match(wxml, /height="\{\{renderHeight\}\}"/);
    assert.match(wxml, /style="width:\{\{width\}\}px;height:\{\{height\}\}px/);
    // 官方 behavior-scene/scene-ready.js：renderWidth = width * pixelRatio
    assert.match(js, /renderWidth: Math\.round\(width \* info\.pixelRatio\)/);
    assert.match(js, /renderHeight: Math\.round\(height \* info\.pixelRatio\)/);
  });

  it('记录页提供徽章预览入口', async () => {
    const wxml = await readFile(path.join(root, 'miniprogram/pages/records/records.wxml'), 'utf8');
    const js = await readFile(path.join(root, 'miniprogram/pages/records/records.js'), 'utf8');
    assert.equal(wxml.includes('bindtap="openBadges"'), true);
    assert.equal(js.includes("url: '/pages/badges/badges'"), true);
  });

  it('组件只用官方 xr-frame 元素与事件', async () => {
    const wxml = await readFile(path.join(root, 'miniprogram/components/badge-viewer/index.wxml'), 'utf8');
    for (const tag of ['xr-scene', 'xr-assets', 'xr-node', 'xr-gltf', 'xr-camera', 'xr-light']) {
      assert.ok(wxml.includes(`<${tag}`), `缺少官方元素 ${tag}`);
    }
    assert.ok(wxml.includes('camera-orbit-control=""'), '相机必须带 camera-orbit-control');
    assert.ok(wxml.includes('bind:ready="handleReady"'));
    assert.ok(wxml.includes('bind:pause="handlePause"'));
    assert.ok(wxml.includes('bind:resume="handleResume"'));
    assert.ok(wxml.includes('bind:progress="handleAssetsProgress"'));
    assert.ok(wxml.includes('bind:loaded="handleAssetsLoaded"'));
    // 列表不预载：xr-gltf 必须被 wx:if 门控。
    assert.ok(/<xr-node wx:if="\{\{gltfLoaded\}\}">/.test(wxml));
  });
});
