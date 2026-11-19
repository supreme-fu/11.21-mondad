const api = require('../../services/api');

const glyphs = { cooking: '菜', meeting: '见', reading: '读', outing: '行' };

Page({
  data: { activities: [], records: [], user: null, loading: true, error: '' },
  onShow() { this.load(); },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()); },
  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const session = await api.ensureSession();
      const [activities, records] = await Promise.all([api.activities(), api.records()]);
      const decorated = activities.map((activity) => {
        const themeRecords = records.filter((item) => item.activity.id === activity.id);
        const active = themeRecords.find((item) => item.participationStatus === 'joined' && !item.completion);
        const completedCount = themeRecords.filter((item) => item.completion !== null).length;
        const status = active
          ? '已约定'
          : completedCount === 1
            ? '已完成 · 1 次'
            : completedCount > 1
              ? `已完成 ${completedCount} 次`
              : '';
        return { ...activity, glyph: glyphs[activity.id] || '事', status };
      });
      this.setData({ activities: decorated, records, user: session.user, loading: false });
    } catch (error) {
      this.setData({ loading: false, error: error.message || '页面暂时无法加载。' });
    }
  },
  openActivity(event) {
    wx.navigateTo({ url: `/pages/activity/activity?id=${event.currentTarget.dataset.id}` });
  },
});
