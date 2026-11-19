const badges = require('../../services/badges');

Page({
  data: {
    groups: [],
    error: '',
  },

  onLoad() {
    try {
      const list = badges.listBadges();
      const titles = { task: '主题徽章', chain: '链上完成', milestone: '10 / 50 / 100 里程碑' };
      const notes = {
        task: '主题徽章的造型预览，先看看质感。',
        chain: '链上完成场景的系列预览，与凭证系统无关。',
        milestone: '10 / 50 / 100 里程碑的系列预览，只展示造型。',
      };
      this.setData({
        groups: ['task', 'chain', 'milestone']
          .map((series) => ({ series, title: titles[series], note: notes[series], items: list.filter((badge) => badge.series === series) }))
          .filter((group) => group.items.length > 0),
        error: '',
      });
    } catch (error) {
      this.setData({ error: error.message || '徽章目录读取失败。' });
    }
  },

  onShareAppMessage() {
    return { title: '徽章只是造型，不是成绩单。', path: '/pages/badges/badges' };
  },

  // 列表页只渲染缩略图，不实例化 xr-frame 组件，也不请求任何 GLB。
  openBadge(event) {
    const id = event.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/badge-detail/badge-detail?id=${id}` });
  },
});
