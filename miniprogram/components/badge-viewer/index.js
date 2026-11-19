/**
 * 单枚徽章的 xr-frame 查看器组件。
 *
 * 只做三件事：按需加载一枚 GLB、用 camera-orbit-control 让用户自己转、卸载时把资源还回去。
 * 列表页不实例化本组件；详情页 onUnload 时组件 detached，这里负责 releaseAsset。
 *
 * API 全部来自微信官方示例（miniprogram-demo/packageXRFrame）：
 *   - xr-scene bind:ready / bind:pause / bind:resume / bind:progress / bind:loaded
 *   - scene.assets.loadAsset({ type: 'gltf', assetId, src }) 见 components/template/xr-template-loading
 *   - scene.assets.releaseAsset('gltf', assetId)              同上
 *   - scene.getElementById('camera').getComponent(Transform)  见 components/template/xr-template-control
 */
const { checkXrSupport } = require('../../services/xr-support');

const ASSET_TYPE = 'gltf';
const ASSET_ID = 'badge-gltf';
// 徽章造型高度约 1.6，相机距离 3 与官方 damageHelmet 示例一致。
const CAMERA_POSITION = [0, 0, 3];

Component({
  properties: {
    /** 这一枚徽章的 GLB 地址，空字符串表示还没有选中任何徽章。 */
    src: {
      type: String,
      value: '',
      observer(next) {
        if (!next) {
          this.releaseModel();
          return;
        }
        this.loadModel(next);
      },
    },
    /**
     * 渲染像素宽高，宿主页面传的是 renderWidth / renderHeight（CSS px × pixelRatio），
     * 与官方示例 xr-template-loading 页面一致；CSS 尺寸另由元素 style 决定。
     */
    width: { type: Number, value: 0 },
    height: { type: Number, value: 0 },
    /** 宿主页面每次点“复位”就 +1，用计数器触发，连点两次也能生效。 */
    resetToken: {
      type: Number,
      value: 0,
      observer() {
        this.resetView();
      },
    },
  },

  data: {
    loading: false,
    gltfLoaded: false,
    error: '',
    supported: true,
    unsupportedReason: '',
    /** 仅供逻辑测试与调试读取，不参与渲染。 */
    debugAssetId: ASSET_ID,
  },

  lifetimes: {
    attached() {
      const info = typeof wx !== 'undefined' && typeof wx.getSystemInfoSync === 'function' ? wx.getSystemInfoSync() : {};
      const support = checkXrSupport({
        SDKVersion: info.SDKVersion,
        hasXrFrameSystem: typeof wx !== 'undefined' && typeof wx.getXrFrameSystem === 'function',
      });
      this.setData({ supported: support.supported, unsupportedReason: support.reason });
      if (!support.supported) this.triggerEvent('unsupported', { reason: support.reason });
    },
    detached() {
      this.releaseModel();
      this.scene = null;
    },
  },

  methods: {
    handleReady({ detail }) {
      this.scene = detail.value;
      // src 可能在 scene ready 之前就设好了，这里补一次加载。
      if (this.data.src) this.loadModel(this.data.src);
      this.triggerEvent('ready', {});
    },

    handleAssetsProgress({ detail }) {
      this.triggerEvent('progress', { value: detail.value });
    },

    handleAssetsLoaded() {
      // xr-assets 里没有静态资源，这里只作为资产系统就绪的信号。
    },

    handlePause() {
      this.triggerEvent('pause', {});
    },

    handleResume() {
      this.triggerEvent('resume', {});
    },

    /** 拉取并挂载一枚 GLB。重复调用会先释放上一枚。 */
    async loadModel(src) {
      if (!src) return;
      const scene = this.scene;
      if (!scene) return; // scene 未 ready，等 handleReady 里补加载

      this.releaseModel();
      this.setData({ loading: true, error: '' });

      const token = (this._loadToken || 0) + 1;
      this._loadToken = token;

      try {
        await scene.assets.loadAsset({ type: ASSET_TYPE, assetId: ASSET_ID, src });
        this._assetHeld = true;
        // 加载期间被卸载或被新的 src 顶掉：立刻释放，不挂进场景。
        if (token !== this._loadToken || !this.scene) {
          this.releaseAsset();
          return;
        }
        this.setData({ loading: false, gltfLoaded: true });
        this.triggerEvent('loaded', { id: ASSET_ID, src });
      } catch (error) {
        if (token !== this._loadToken) return;
        this.setData({
          loading: false,
          gltfLoaded: false,
          error: (error && error.message) || '模型加载失败，可能是网络中断或资源被移除。',
        });
        this.triggerEvent('error', { message: this.data.error });
      }
    },

    /** 先摘掉 xr-gltf 节点，再释放 asset，顺序不能反。 */
    releaseModel() {
      this._loadToken = (this._loadToken || 0) + 1;
      if (this.data.gltfLoaded) this.setData({ gltfLoaded: false });
      this.releaseAsset();
    },

    releaseAsset() {
      const scene = this.scene;
      // 没有持有 asset 时什么都不做，避免对没加载过的资源反复调用 release。
      if (!scene || !scene.assets || !this._assetHeld) return;
      this._assetHeld = false;
      try {
        scene.assets.releaseAsset(ASSET_TYPE, ASSET_ID);
      } catch (error) {
        // 页面销毁时 scene 可能已经拆干净，重复释放不该抛到界面上。
      }
    },

    retry() {
      this.setData({ error: '' });
      this.loadModel(this.data.src);
    },

    /** 把相机送回初始位姿。触发器是宿主页面的“复位视角”按钮。 */
    resetView() {
      const scene = this.scene;
      if (!scene || !this.data.gltfLoaded) return;
      try {
        const xrFrameSystem = wx.getXrFrameSystem();
        const camera = scene.getElementById('camera');
        if (!camera) return;
        const transform = camera.getComponent(xrFrameSystem.Transform);
        transform.position.set(xrFrameSystem.Vector3.createFromNumber(...CAMERA_POSITION));
        transform.quaternion.setFromYawRollPitch(0, 0, 0);
        this.triggerEvent('reset', {});
      } catch (error) {
        this.setData({ error: '视角复位失败，可以重新进入这一页。' });
      }
    },
  },
});
