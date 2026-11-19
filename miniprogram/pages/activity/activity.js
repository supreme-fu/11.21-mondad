const api = require('../../services/api');

Page({
  data: { id: '', activity: null, loading: true, pending: false, error: '' },
  onLoad(options) { this.setData({ id: options.id || '' }); this.load(); },
  async load() {
    try {
      const activity = await api.activity(this.data.id);
      this.setData({ activity, loading: false, error: '' });
    } catch (error) { this.setData({ loading: false, error: error.message }); }
  },
  async join() {
    this.setData({ pending: true });
    try {
      await api.join(this.data.id);
      await this.load();
      wx.showToast({ title: '约定已收下', icon: 'success' });
    } catch (error) { this.setData({ error: error.message }); }
    finally { this.setData({ pending: false }); }
  },
  async leave() {
    const active = this.data.activity.activeParticipation || this.data.activity.participation;
    if (!active) return;
    this.setData({ pending: true });
    try { await api.leave(active.id); await this.load(); }
    catch (error) { this.setData({ error: error.message }); }
    finally { this.setData({ pending: false }); }
  },
  complete() {
    const target = this.data.activity.activeParticipation || this.data.activity.participation;
    if (!target) return;
    wx.navigateTo({ url: `/pages/complete/complete?participationId=${target.id}` });
  },
});
