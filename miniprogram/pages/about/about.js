const api = require('../../services/api');

Page({
  data: { receiptMode: 'simulation' },
  onShow() {
    api.ensureSession().then((session) => {
      getApp().globalData.receiptMode = session.receiptMode;
      this.setData({ receiptMode: session.receiptMode });
    }).catch(() => {});
  },
});
