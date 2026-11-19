const badges = require('../../services/badges');

Page({
  data: {
    badge: null,
    width: 0,
    height: 0,
    resetToken: 0,
    loading: true,
    error: '',
    unsupported: '',
  },

  onLoad(options) {
    const badge = badges.findBadge(options.id);
    if (!badge) {
      this.setData({ error: '没有找到这一枚徽章。', loading: false });
      return;
    }
    // 舞台尺寸按官方示例的做法：CSS px 给组件排版，再按 dpi 算出渲染像素。
    const info = wx.getSystemInfoSync();
    const width = info.windowWidth;
    const height = Math.min(Math.round(info.windowWidth), Math.round(info.windowHeight * 0.62));
    this.setData({
      badge,
      width,
      height,
      renderWidth: Math.round(width * info.pixelRatio),
      renderHeight: Math.round(height * info.pixelRatio),
    });
    wx.setNavigationBarTitle({ title: badge.name });
  },

  onReady() {
    if (this.data.badge) this.setData({ modelSrc: this.data.badge.modelSrc });
  },

  onUnload() {
    // 组件随页面销毁，releaseAsset 在组件的 detached 里做；这里只丢掉引用。
    this.setData({ modelSrc: '' });
  },

  handleViewerReady() {
    this.setData({ unsupported: '' });
  },

  handleViewerLoaded() {
    this.setData({ loading: false, error: '' });
  },

  handleViewerError(event) {
    this.setData({ loading: false, error: (event.detail && event.detail.message) || '模型加载失败。' });
  },

  handleViewerUnsupported(event) {
    const reason = (event.detail && event.detail.reason) || '当前环境不支持三维预览。';
    this.setData({ loading: false, unsupported: reason });
  },

  retry() {
    if (!this.data.badge) return;
    this.setData({ loading: true, error: '' });
    // 通过重设 src 触发组件的 observer；先清空再赋值，保证 observer 一定触发。
    this.setData({ modelSrc: '' }, () => {
      this.setData({ modelSrc: this.data.badge.modelSrc });
    });
  },

  resetView() {
    this.setData({ resetToken: this.data.resetToken + 1 });
  },
});
