import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../server/src/app.js';

const require = createRequire(import.meta.url);
const storage = new Map<string, string>();
let context: ReturnType<typeof createApp>;
let server: ReturnType<ReturnType<typeof createApp>['app']['listen']>;
let miniApi: any;

before(async () => {
  context = createApp({ databasePath: ':memory:', receiptMode: 'simulation' });
  server = context.app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const port = (server.address() as AddressInfo).port;
  assert.ok(port > 0);
  storage.set('do_something_api_base', `http://127.0.0.1:${port}/api`);

  (globalThis as any).wx = {
    getStorageSync: (key: string) => storage.get(key) || '',
    setStorageSync: (key: string, value: string) => storage.set(key, value),
    request(options: any) {
      fetch(options.url, {
        method: options.method,
        headers: { ...options.header, 'Content-Type': 'application/json' },
        body: ['GET', 'HEAD'].includes(options.method) ? undefined : JSON.stringify(options.data || {}),
      }).then(async (response) => {
        const body = await response.json().catch(() => ({}));
        options.success({
          statusCode: response.status,
          data: body,
          header: { 'Set-Cookie': response.headers.get('set-cookie') || '' },
        });
      }).catch(options.fail);
    },
  };
  miniApi = require('../../miniprogram/services/api.js');
});

after(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  context.store.close();
  delete (globalThis as any).wx;
});

describe('微信小程序 API 服务层', () => {
  it('使用 wx.request 与真实服务端完成双账户相遇和模拟凭证', async () => {
    const sessionA = await miniApi.ensureSession();
    assert.equal(sessionA.user.displayName, '阿黎');
    const activities = await miniApi.activities();
    assert.equal(activities.length, 4);

    const joinedA = await miniApi.join('cooking');
    const completedA = await miniApi.complete(joinedA.id, 'mini-a-idempotency-001');
    const sharedText = '小程序里留下的一段番茄炖牛腩经历';
    await miniApi.saveReflection(completedA.id, sharedText, 'shared');
    await miniApi.requestReceipt(completedA.id);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const receipt = await miniApi.receipt(completedA.id);
    assert.equal(receipt.status, 'confirmed');
    assert.equal(receipt.mode, 'simulation');
    assert.match(receipt.tx_hash, /^simulation-/);

    await miniApi.login('b');
    const joinedB = await miniApi.join('cooking');
    await miniApi.complete(joinedB.id, 'mini-b-idempotency-001');
    const echo = await miniApi.echo('cooking');
    assert.equal(echo.echo.text, sharedText);
    assert.equal(echo.echo.isExample, false);
    const recordsB = await miniApi.records();
    assert.equal(recordsB.length, 1);
    assert.notEqual(recordsB[0].completion.id, completedA.id);
  });

  it('小程序端调用读书共读接口：门槛拦截、88% 领 10 DSDEMO 勋章与书评 2 DSDEMO 叠加', async () => {
    await miniApi.login('a');
    const joinedReading = await miniApi.join('reading');
    const completedReading = await miniApi.complete(joinedReading.id, 'mini-reading-idempotency-001');

    const initial = await miniApi.readingChallenge(joinedReading.id);
    assert.equal(initial.coveragePercent, 62);
    assert.equal(initial.earnedDsdemo, 0);

    // 80% 末章未完成时领奖应失败
    const partial = await miniApi.syncReadingProgress(joinedReading.id, 'partial');
    assert.equal(partial.coveragePercent, 80);
    assert.equal(partial.lastChapterCompleted, false);
    assert.equal(partial.canClaimReading, false);
    await assert.rejects(() => miniApi.claimReadingReward(joinedReading.id, 'reading'));

    // 同步至 88% 且末章完成并领取阅读奖
    const completeState = await miniApi.syncReadingProgress(joinedReading.id, 'complete');
    assert.equal(completeState.coveragePercent, 88);
    assert.equal(completeState.lastChapterCompleted, true);
    const readingClaimed = await miniApi.claimReadingReward(joinedReading.id, 'reading');
    assert.equal(readingClaimed.readingClaimed, true);
    assert.equal(readingClaimed.earnedDsdemo, 10);
    assert.ok(readingClaimed.badgeTokenId >= 1);

    // 保存感受并领取 2 DSDEMO 书评奖
    await miniApi.saveReflection(completedReading.id, '小王子教我重新看懂玫瑰。', 'private');
    const reviewClaimed = await miniApi.claimReadingReward(joinedReading.id, 'review');
    assert.equal(reviewClaimed.reviewClaimed, true);
    assert.equal(reviewClaimed.earnedDsdemo, 12);
    assert.match(reviewClaimed.reviewProofDigest, /^0x[0-9a-f]{64}$/i);
  });
});
