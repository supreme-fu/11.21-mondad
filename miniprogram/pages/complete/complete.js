const api = require('../../services/api');

const SAMPLE_LITTLE_PRINCE_REVIEW =
  '我原以为驯养是占有，读到狐狸那一章才发现，它更像是主动拿出时间，让一个原本普通的人对自己变得独一无二。';

Page({
  data: {
    participationId: '', record: null, loading: true, pending: false, error: '',
    text: '', shared: false, acknowledged: false, echo: null, echoTotal: 0, echoLoading: false,
    readingChallenge: null, readingLoading: false, readingPending: false, readingError: '',
  },
  onLoad(options) {
    this.active = true;
    this.setData({ participationId: options.participationId || '' });
    this.load();
  },
  onUnload() { this.active = false; if (this.pollTimer) clearTimeout(this.pollTimer); },
  async load() {
    try {
      const records = await api.records();
      const record = records.find((item) => item.participationId === this.data.participationId);
      if (!record) throw new Error('没有找到这条约定，它可能属于另一个演示账户。');
      const completion = record.completion;
      this.setData({
        record, loading: false, error: '',
        text: completion ? completion.reflection.text || '' : '',
        shared: completion ? completion.reflection.visibility === 'shared' : false,
      });
      if (completion) {
        this.loadEcho(record.activity.id);
        if (record.activity.id === 'reading') this.loadReadingChallenge();
      }
    } catch (error) { this.setData({ loading: false, error: error.message }); }
  },
  async loadReadingChallenge() {
    this.setData({ readingLoading: true, readingError: '' });
    try {
      const state = await api.readingChallenge(this.data.participationId);
      if (this.active) this.setData({ readingChallenge: state, readingLoading: false });
    } catch (error) {
      if (this.active) this.setData({ readingLoading: false, readingError: error.message });
    }
  },
  async syncReadingPreset(event) {
    const { preset } = event.currentTarget.dataset;
    if (!preset) return;
    this.setData({ readingPending: true, readingError: '' });
    try {
      const state = await api.syncReadingProgress(this.data.participationId, preset);
      if (this.active) this.setData({ readingChallenge: state });
      wx.showToast({ title: '阅读进度已同步', icon: 'success' });
    } catch (error) {
      if (this.active) this.setData({ readingError: error.message });
    } finally {
      if (this.active) this.setData({ readingPending: false });
    }
  },
  async fillSampleLittlePrinceReview() {
    const { record } = this.data;
    if (!record || !record.completion) return;
    this.setData({ readingPending: true, readingError: '' });
    try {
      await api.saveReflection(record.completion.id, SAMPLE_LITTLE_PRINCE_REVIEW, 'private');
      await this.load();
      wx.showToast({ title: '已填入示例书评', icon: 'success' });
    } catch (error) {
      if (this.active) this.setData({ readingError: error.message });
    } finally {
      if (this.active) this.setData({ readingPending: false });
    }
  },
  async claimReadingReward(event) {
    const { kind } = event.currentTarget.dataset;
    if (!kind) return;
    this.setData({ readingPending: true, readingError: '' });
    try {
      const state = await api.claimReadingReward(this.data.participationId, kind);
      if (this.active) this.setData({ readingChallenge: state });
      wx.showToast({
        title: kind === 'reading' ? '已领取 10 DSDEMO 与勋章' : '已叠加 2 DSDEMO 书评奖',
        icon: 'success',
      });
    } catch (error) {
      if (this.active) this.setData({ readingError: error.message });
    } finally {
      if (this.active) this.setData({ readingPending: false });
    }
  },
  async declare() {
    this.setData({ pending: true, error: '' });
    const storageKey = `completion_key_${this.data.participationId}`;
    let idempotencyKey = wx.getStorageSync(storageKey);
    if (!idempotencyKey) {
      idempotencyKey = `mini-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      wx.setStorageSync(storageKey, idempotencyKey);
    }
    try {
      await api.complete(this.data.participationId, idempotencyKey);
      await this.load();
      wx.showToast({ title: '这件事已经算数', icon: 'success' });
    } catch (error) { this.setData({ error: error.message }); }
    finally { this.setData({ pending: false }); }
  },
  onTextInput(event) { this.setData({ text: event.detail.value }); },
  onShareChange(event) { this.setData({ shared: event.detail.value }); },
  onAcknowledgeChange(event) { this.setData({ acknowledged: event.detail.value }); },
  async saveReflection() {
    const { record, text, shared } = this.data;
    if (!record.completion) return;
    if (shared && !text.trim()) { this.setData({ error: '愿意分享时，请先写下一句感受；也可以保持仅自己可见。' }); return; }
    this.setData({ pending: true, error: '' });
    try {
      await api.saveReflection(record.completion.id, text, shared ? 'shared' : 'private');
      await this.load();
      wx.showToast({ title: shared ? '已保存并允许分享' : '已保存，仅自己可见', icon: 'success' });
    } catch (error) { this.setData({ error: error.message }); }
    finally { this.setData({ pending: false }); }
  },
  deleteReflection() {
    wx.showModal({
      title: '删除这段正文？', content: '服务端文本和分享资格都会删除，完成声明仍然保留。', confirmText: '删除正文', confirmColor: '#a43e32',
      success: async (result) => {
        if (!result.confirm) return;
        try {
          await api.deleteReflection(this.data.record.completion.id);
          this.setData({ text: '', shared: false });
          await this.load();
        } catch (error) { this.setData({ error: error.message }); }
      },
    });
  },
  async requestReceipt() {
    if (!this.data.acknowledged) { this.setData({ error: '请先确认你理解凭证的公开与删除边界。' }); return; }
    this.setData({ pending: true, error: '' });
    try {
      const completionId = this.data.record.completion.id;
      await api.requestReceipt(completionId);
      for (let attempt = 0; attempt < 12 && this.active; attempt += 1) {
        const current = await api.receipt(completionId);
        if (current.status === 'confirmed' || current.status === 'failed') break;
        await new Promise((resolve) => { this.pollTimer = setTimeout(resolve, 350); });
      }
      await this.load();
    } catch (error) { this.setData({ error: error.message }); }
    finally { if (this.active) this.setData({ pending: false }); }
  },
  async loadEcho(activityId, excludeText) {
    this.setData({ echoLoading: true });
    try {
      const result = await api.echo(activityId, excludeText);
      if (this.active) {
        this.setData({
          echo: result.echo,
          echoTotal: result.totalAvailable || (result.echo ? 1 : 0),
          echoLoading: false,
        });
      }
    } catch { if (this.active) this.setData({ echo: null, echoTotal: 0, echoLoading: false }); }
  },
  nextEcho() {
    const { record, echo } = this.data;
    if (!record) return;
    this.loadEcho(record.activity.id, echo ? echo.text : undefined);
  },
});
