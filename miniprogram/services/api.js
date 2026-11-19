const { apiBase } = require('./config');

function request(method, path, data) {
  return new Promise((resolve, reject) => {
    const cookie = wx.getStorageSync('do_something_cookie') || '';
    const requestBase = wx.getStorageSync('do_something_api_base') || apiBase;
    wx.request({
      url: `${requestBase}${path}`,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      success(response) {
        const setCookie = response.header['Set-Cookie'] || response.header['set-cookie'];
        if (setCookie) {
          const cookieValue = Array.isArray(setCookie) ? setCookie[0] : setCookie;
          wx.setStorageSync('do_something_cookie', cookieValue.split(';')[0]);
        }
        const body = response.data || {};
        if (response.statusCode >= 400) {
          reject(new Error(body.error || '请求没有成功，请稍后重试。'));
          return;
        }
        resolve(body);
      },
      fail() { reject(new Error('暂时无法连接本地服务端，请确认服务已启动。')); },
    });
  });
}

function ensureSession() {
  return request('GET', '/session').then((session) => {
    if (session.user) return session;
    return request('POST', '/session/demo', { account: 'a' });
  });
}

module.exports = {
  ensureSession,
  login: (account) => request('POST', '/session/demo', { account }),
  activities: () => request('GET', '/activities'),
  activity: (id) => request('GET', `/activities/${id}`),
  join: (activityId) => request('POST', '/participations', { activityId }),
  leave: (id) => request('POST', `/participations/${id}/leave`, {}),
  complete: (id, idempotencyKey) => request('POST', `/participations/${id}/complete`, { idempotencyKey }),
  saveReflection: (id, text, visibility) => request('PUT', `/completions/${id}/reflection`, { text, visibility }),
  deleteReflection: (id) => request('DELETE', `/completions/${id}/reflection`, {}),
  requestReceipt: (id) => request('POST', `/completions/${id}/receipt`, { acknowledged: true }),
  receipt: (id) => request('GET', `/completions/${id}/receipt`),
  echo: (activityId, excludeText) => request(
    'GET',
    excludeText
      ? `/echoes?activityId=${encodeURIComponent(activityId)}&excludeText=${encodeURIComponent(excludeText)}`
      : `/echoes?activityId=${encodeURIComponent(activityId)}`,
  ),
  records: () => request('GET', '/me/records'),
  deleteAccount: () => request('DELETE', '/account', {}),
  readingChallenge: (participationId) => request('GET', `/reading-challenge/${encodeURIComponent(participationId)}`),
  syncReadingProgress: (participationId, preset) => request(
    'POST',
    `/reading-challenge/${encodeURIComponent(participationId)}/progress`,
    { preset },
  ),
  claimReadingReward: (participationId, kind) => request(
    'POST',
    `/reading-challenge/${encodeURIComponent(participationId)}/claim`,
    { kind },
  ),
};
