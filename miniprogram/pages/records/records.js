const api = require('../../services/api');

Page({
  data: { records: [], user: null, loading: true, error: '' },
  onShow() { this.load(); },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()); },
  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const session = await api.ensureSession();
      const records = await api.records();
      this.setData({ user: session.user, records, loading: false });
    } catch (error) { this.setData({ user: null, loading: false, error: error.message }); }
  },
  async switchAccount(event) {
    try {
      const session = await api.login(event.currentTarget.dataset.account);
      const records = await api.records();
      this.setData({ user: session.user, records, error: '' });
    } catch (error) { this.setData({ error: error.message }); }
  },
  openRecord(event) {
    const record = this.data.records[event.currentTarget.dataset.index];
    if (record.participationStatus === 'left') {
      wx.navigateTo({ url: `/pages/activity/activity?id=${record.activity.id}` });
      return;
    }
    wx.navigateTo({ url: `/pages/complete/complete?participationId=${record.participationId}` });
  },
  openBadges() {
    wx.navigateTo({ url: '/pages/badges/badges' });
  },
  removeAccount() {
    wx.showModal({
      title: '注销当前演示账户？',
      content: '将删除会话、参与关联、正文和凭证链下映射。真实链上已广播或确认的历史无法抹除；本地模拟记录会随链下数据删除。',
      confirmText: '永久注销',
      confirmColor: '#a43e32',
      success: async (result) => {
        if (!result.confirm) return;
        try {
          await api.deleteAccount();
          this.setData({ user: null, records: [], error: '账户已注销。请选择另一个演示身份继续。' });
        } catch (error) { this.setData({ error: error.message }); }
      },
    });
  },
});
