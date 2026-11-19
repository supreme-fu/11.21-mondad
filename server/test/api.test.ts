import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, afterEach, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';

const tempDirs: string[] = [];
after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

let context: ReturnType<typeof createApp>;

beforeEach(() => {
  context = createApp({ databasePath: ':memory:', receiptMode: 'simulation' });
});
afterEach(() => context.store.close());

async function agentFor(account: 'a' | 'b') {
  const agent = request.agent(context.app);
  await agent.post('/api/session/demo').send({ account }).expect(200);
  return agent;
}

async function joinAndComplete(agent: ReturnType<typeof request.agent>, activityId = 'cooking') {
  const joined = await agent.post('/api/participations').send({ activityId }).expect(201);
  const completed = await agent.post(`/api/participations/${joined.body.id}/complete`)
    .send({ idempotencyKey: 'test-idempotency-key-001' }).expect(201);
  return { participationId: joined.body.id as string, completionId: completed.body.id as string };
}

describe('Do Something API', () => {
  it('提供四个主题并用服务端会话隔离两个账户', async () => {
    const activities = await request(context.app).get('/api/activities').expect(200);
    assert.equal(activities.body.length, 4);
    const a = await agentFor('a');
    const b = await agentFor('b');
    await a.post('/api/participations').send({ activityId: 'cooking' }).expect(201);
    const aRecords = await a.get('/api/me/records').expect(200);
    const bRecords = await b.get('/api/me/records').expect(200);
    assert.equal(aRecords.body.length, 1);
    assert.equal(bRecords.body.length, 0);
    await request(context.app).get('/api/me/records').expect(401);
  });

  it('完成操作幂等，且默认正文私密', async () => {
    const a = await agentFor('a');
    const joined = await a.post('/api/participations').send({ activityId: 'cooking' }).expect(201);
    const first = await a.post(`/api/participations/${joined.body.id}/complete`)
      .send({ idempotencyKey: 'repeat-request-0001' }).expect(201);
    const second = await a.post(`/api/participations/${joined.body.id}/complete`)
      .send({ idempotencyKey: 'repeat-request-0001' }).expect(200);
    assert.equal(first.body.id, second.body.id);
    const records = await a.get('/api/me/records').expect(200);
    assert.equal(records.body[0].completion.reflection.visibility, 'private');
    assert.equal(records.body[0].completion.reflection.text, null);
  });

  it('只向完成同主题的他人返回主动分享的文本', async () => {
    const a = await agentFor('a');
    const b = await agentFor('b');
    const aFlow = await joinAndComplete(a);
    await joinAndComplete(b);
    const secret = '这是阿黎没有授权分享的私密感受';
    await a.put(`/api/completions/${aFlow.completionId}/reflection`)
      .send({ text: secret, visibility: 'private' }).expect(200);
    const privateEcho = await b.get('/api/echoes?activityId=cooking').expect(200);
    assert.notEqual(privateEcho.body.echo?.text, secret);
    assert.equal(privateEcho.body.echo?.isExample, true);

    await a.put(`/api/completions/${aFlow.completionId}/reflection`)
      .send({ text: secret, visibility: 'shared' }).expect(200);
    const sharedEcho = await b.get('/api/echoes?activityId=cooking').expect(200);
    assert.equal(sharedEcho.body.echo.text, secret);
    assert.equal(sharedEcho.body.echo.isExample, false);
  });

  it('他人不能修改或删除我的正文', async () => {
    const a = await agentFor('a');
    const b = await agentFor('b');
    const flow = await joinAndComplete(a);
    await b.put(`/api/completions/${flow.completionId}/reflection`)
      .send({ text: '越权修改', visibility: 'shared' }).expect(404);
    await b.delete(`/api/completions/${flow.completionId}/reflection`).expect(404);
    await b.post(`/api/completions/${flow.completionId}/receipt`).send({ acknowledged: true }).expect(404);
  });

  it('撤回分享和删除正文后立即退出相似经历结果', async () => {
    const a = await agentFor('a');
    const b = await agentFor('b');
    const flow = await joinAndComplete(a);
    await joinAndComplete(b);
    const text = '一段只应在授权期间出现的经历';
    await a.put(`/api/completions/${flow.completionId}/reflection`)
      .send({ text, visibility: 'shared' }).expect(200);
    await a.put(`/api/completions/${flow.completionId}/reflection`)
      .send({ text, visibility: 'private' }).expect(200);
    let echo = await b.get('/api/echoes?activityId=cooking').expect(200);
    assert.notEqual(echo.body.echo?.text, text);
    await a.put(`/api/completions/${flow.completionId}/reflection`)
      .send({ text, visibility: 'shared' }).expect(200);
    await a.delete(`/api/completions/${flow.completionId}/reflection`).expect(204);
    echo = await b.get('/api/echoes?activityId=cooking').expect(200);
    assert.notEqual(echo.body.echo?.text, text);
    const stored = context.store.database.prepare('SELECT text, visibility FROM reflections WHERE completion_id = ?')
      .get(flow.completionId);
    assert.equal(stored?.text, null);
    assert.equal(stored?.visibility, 'private');
  });

  it('模拟凭证明确非链上，重复申请保持同一编号', async () => {
    const a = await agentFor('a');
    const flow = await joinAndComplete(a);
    const first = await a.post(`/api/completions/${flow.completionId}/receipt`)
      .send({ acknowledged: true }).expect(201);
    const second = await a.post(`/api/completions/${flow.completionId}/receipt`)
      .send({ acknowledged: true }).expect(201);
    assert.equal(first.body.receipt_id, second.body.receipt_id);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const receipt = await a.get(`/api/completions/${flow.completionId}/receipt`).expect(200);
    assert.equal(receipt.body.status, 'confirmed');
    assert.equal(receipt.body.mode, 'simulation');
    assert.equal(receipt.body.chain_id, 0);
    assert.match(receipt.body.tx_hash, /^simulation-/);
  });

  it('注销删除链下关联、撤销会话且不影响另一账户', async () => {
    const a = await agentFor('a');
    const b = await agentFor('b');
    const flow = await joinAndComplete(a);
    await a.post(`/api/completions/${flow.completionId}/receipt`).send({ acknowledged: true }).expect(201);
    const deleted = await a.delete('/api/account').expect(200);
    assert.equal(deleted.body.offChainDataDeleted, true);
    assert.equal(deleted.body.publicReceiptsRemaining, 0);
    await a.get('/api/me/records').expect(401);
    await b.get('/api/me/records').expect(200);
    assert.equal(context.store.database.prepare('SELECT * FROM users WHERE id = ?').get('user-a'), undefined);
    assert.equal(context.store.database.prepare('SELECT * FROM completions WHERE id = ?').get(flow.completionId), undefined);
    await a.post('/api/session/demo').send({ account: 'a' }).expect(403);
  });

  it('拒绝空分享、超长正文和缺少知情确认的登记', async () => {
    const a = await agentFor('a');
    const flow = await joinAndComplete(a);
    await a.put(`/api/completions/${flow.completionId}/reflection`)
      .send({ text: '   ', visibility: 'shared' }).expect(400);
    await a.put(`/api/completions/${flow.completionId}/reflection`)
      .send({ text: '字'.repeat(501), visibility: 'private' }).expect(400);
    await a.post(`/api/completions/${flow.completionId}/receipt`).send({ acknowledged: false }).expect(400);
  });

  it('支持同一主题多次参与和多次完成，未完成前幂等返回进行中记录', async () => {
    const a = await agentFor('a');
    const firstJoin = await a.post('/api/participations').send({ activityId: 'reading' }).expect(201);
    const repeatJoin = await a.post('/api/participations').send({ activityId: 'reading' }).expect(200);
    assert.equal(repeatJoin.body.id, firstJoin.body.id);

    const firstComplete = await a.post(`/api/participations/${firstJoin.body.id}/complete`)
      .send({ idempotencyKey: 'multi-complete-key-001' }).expect(201);
    await a.put(`/api/completions/${firstComplete.body.id}/reflection`)
      .send({ text: '第一次读完一本小书。', visibility: 'private' }).expect(200);

    // 第一次完成后，再次加入同一主题应创建全新的参与记录（201）
    const secondJoin = await a.post('/api/participations').send({ activityId: 'reading' }).expect(201);
    assert.notEqual(secondJoin.body.id, firstJoin.body.id);

    const midDetail = await a.get('/api/activities/reading').expect(200);
    assert.equal(midDetail.body.completionCount, 1);
    assert.equal(midDetail.body.activeParticipation.id, secondJoin.body.id);
    assert.equal(midDetail.body.participation.id, secondJoin.body.id);

    const secondComplete = await a.post(`/api/participations/${secondJoin.body.id}/complete`)
      .send({ idempotencyKey: 'multi-complete-key-002' }).expect(201);
    assert.notEqual(secondComplete.body.id, firstComplete.body.id);

    const afterDetail = await a.get('/api/activities/reading').expect(200);
    assert.equal(afterDetail.body.completionCount, 2);
    assert.equal(afterDetail.body.activeParticipation, null);
    assert.equal(afterDetail.body.history.length, 2);

    const records = await a.get('/api/me/records').expect(200);
    assert.equal(records.body.length, 2);
    assert.equal(records.body[0].participationId, secondJoin.body.id);
    assert.equal(records.body[1].participationId, firstJoin.body.id);
  });

  it('兼容旧库迁移：安全移除 participations 的 UNIQUE(user_id, activity_id) 并保留数据', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'do-something-migrate-'));
    tempDirs.push(dir);
    const dbPath = join(dir, 'legacy.db');

    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        demo_key TEXT UNIQUE,
        display_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL
      );
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE activities (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        invitation TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        duration TEXT NOT NULL,
        completion_hint TEXT NOT NULL,
        rule_version INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'active'
      );
      CREATE TABLE participations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        activity_id TEXT NOT NULL REFERENCES activities(id),
        rule_version INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'joined',
        created_at TEXT NOT NULL,
        UNIQUE(user_id, activity_id)
      );
      CREATE TABLE completions (
        id TEXT PRIMARY KEY,
        participation_id TEXT NOT NULL UNIQUE REFERENCES participations(id) ON DELETE CASCADE,
        declared_at TEXT NOT NULL,
        verification_type TEXT NOT NULL DEFAULT 'self_report',
        idempotency_key TEXT NOT NULL
      );
      CREATE TABLE reflections (
        completion_id TEXT PRIMARY KEY REFERENCES completions(id) ON DELETE CASCADE,
        text TEXT,
        visibility TEXT NOT NULL DEFAULT 'private',
        shared_at TEXT,
        deleted_at TEXT
      );
      CREATE TABLE receipts (
        completion_id TEXT PRIMARY KEY REFERENCES completions(id) ON DELETE CASCADE,
        receipt_id TEXT NOT NULL UNIQUE,
        chain_id INTEGER NOT NULL,
        contract_address TEXT NOT NULL,
        tx_hash TEXT,
        status TEXT NOT NULL,
        mode TEXT NOT NULL,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO users VALUES ('user-a', 'a', '阿黎', 'active', '2026-01-01T00:00:00.000Z');
      INSERT INTO users VALUES ('user-b', 'b', '小舟', 'active', '2026-01-01T00:00:00.000Z');
      INSERT INTO activities VALUES ('cooking', '做菜', 'inv', 'desc', 'cat', '45m', 'hint', 1, 'active');
      INSERT INTO participations VALUES ('p-legacy-1', 'user-a', 'cooking', 1, 'completed', '2026-01-01T00:00:00.000Z');
      INSERT INTO completions VALUES ('c-legacy-1', 'p-legacy-1', '2026-01-01T01:00:00.000Z', 'self_report', 'k-1');
      INSERT INTO reflections VALUES ('c-legacy-1', '旧库里的一条完成记录', 'private', NULL, NULL);
      INSERT INTO meta VALUES ('demo_seed_v1', '2026-01-01T00:00:00.000Z');
    `);
    legacy.close();

    const migrated = createApp({ databasePath: dbPath, receiptMode: 'simulation' });
    try {
      const schemaRow = migrated.store.database.prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'participations'",
      ).get() as { sql: string };
      assert.equal(/UNIQUE\s*\(\s*user_id\s*,\s*activity_id\s*\)/i.test(schemaRow.sql), false);

      const agent = request.agent(migrated.app);
      await agent.post('/api/session/demo').send({ account: 'a' }).expect(200);
      const secondJoin = await agent.post('/api/participations').send({ activityId: 'cooking' }).expect(201);
      await agent.post(`/api/participations/${secondJoin.body.id}/complete`)
        .send({ idempotencyKey: 'migrated-second-key-1' }).expect(201);

      const records = await agent.get('/api/me/records').expect(200);
      assert.equal(records.body.length, 2);
      assert.equal(records.body.some((item: { participationId: string }) => item.participationId === 'p-legacy-1'), true);
    } finally {
      migrated.store.close();
    }
  });

  it('全部四个主题都有至少两条种子回响，且支持 excludeText 轮换字条', async () => {
    const a = await agentFor('a');
    for (const activityId of ['cooking', 'meeting', 'reading', 'outing']) {
      await joinAndComplete(a, activityId);
      const first = await a.get(`/api/echoes?activityId=${activityId}`).expect(200);
      assert.ok(first.body.echo, `${activityId} 应有种子回响`);
      assert.equal(first.body.echo.isExample, true);
      assert.ok(first.body.totalAvailable >= 2, `${activityId} 至少应有 2 条种子回响`);

      const second = await a.get(
        `/api/echoes?activityId=${activityId}&excludeText=${encodeURIComponent(first.body.echo.text)}`,
      ).expect(200);
      assert.ok(second.body.echo);
      assert.notEqual(second.body.echo.text, first.body.echo.text);
    }
  });

  it('读书主题支持《小王子》共读门槛拦截、双奖叠加领取与隐私删除独立', async () => {
    const a = await agentFor('a');
    const flow = await joinAndComplete(a, 'reading');

    // 首次读取自动以 62% 基线签发 Enrollment
    const initial = await a.get(`/api/reading-challenge/${flow.participationId}`).expect(200);
    assert.equal(initial.body.coverageBps, 6200);
    assert.equal(initial.body.coveragePercent, 62);
    assert.equal(initial.body.lastChapterCompleted, false);
    assert.equal(initial.body.earnedDsdemo, 0);
    assert.match(initial.body.enrollmentDigest, /^0x[0-9a-f]{64}$/i);
    assert.match(initial.body.enrollmentSig, /^0x[0-9a-f]+$/i);
    assert.equal(initial.body.contracts.chainId, 10143);
    assert.equal(initial.body.contracts.readingChallenge.address, '0x3ed53Ec76b80F4f387401C3e86C1be06b4682ed2');
    assert.equal(initial.body.contracts.readingBadge.address, '0xf584037417B6A4734656641904B009C0BAB4E720');
    assert.equal(initial.body.contracts.rewardToken.address, '0xAEc92f5A8D121b6e3FaFcB429dC4B7Cc24781353');

    // 62% 基线领阅读奖被拦截
    await a.post(`/api/reading-challenge/${flow.participationId}/claim`).send({ kind: 'reading' }).expect(400);

    // 同步到 80% 但末章未完成，依然被合约门槛拦截
    const partial = await a.post(`/api/reading-challenge/${flow.participationId}/progress`)
      .send({ preset: 'partial' }).expect(200);
    assert.equal(partial.body.coverageBps, 8000);
    assert.equal(partial.body.lastChapterCompleted, false);
    assert.equal(partial.body.canClaimReading, false);
    await a.post(`/api/reading-challenge/${flow.participationId}/claim`).send({ kind: 'reading' }).expect(400);

    // 尚未写感受时领书评奖被拦截
    await a.post(`/api/reading-challenge/${flow.participationId}/claim`).send({ kind: 'review' }).expect(400);

    // 同步到 88% 且末章已完成，领取 10 DSDEMO + ReadingBadge
    const completeProgress = await a.post(`/api/reading-challenge/${flow.participationId}/progress`)
      .send({ preset: 'complete' }).expect(200);
    assert.equal(completeProgress.body.coverageBps, 8800);
    assert.equal(completeProgress.body.lastChapterCompleted, true);
    assert.equal(completeProgress.body.canClaimReading, true);

    const readingClaimed = await a.post(`/api/reading-challenge/${flow.participationId}/claim`)
      .send({ kind: 'reading' }).expect(200);
    assert.equal(readingClaimed.body.readingClaimed, true);
    assert.equal(readingClaimed.body.earnedDsdemo, 10);
    assert.equal(readingClaimed.body.badgeTokenId, 1);
    assert.match(readingClaimed.body.readingProofDigest, /^0x[0-9a-f]{64}$/i);

    // 重复领阅读奖（409）与领奖后回退进度（409）均被拒绝
    await a.post(`/api/reading-challenge/${flow.participationId}/claim`).send({ kind: 'reading' }).expect(409);
    await a.post(`/api/reading-challenge/${flow.participationId}/progress`).send({ preset: 'baseline' }).expect(409);

    // 保存读书感受后领取 2 DSDEMO 书评奖，双奖叠加共 12 DSDEMO
    const secretReview = '这是阿黎写下的私密书评：狐狸说驯养就是建立联系。';
    await a.put(`/api/completions/${flow.completionId}/reflection`)
      .send({ text: secretReview, visibility: 'private' }).expect(200);

    const reviewClaimed = await a.post(`/api/reading-challenge/${flow.participationId}/claim`)
      .send({ kind: 'review' }).expect(200);
    assert.equal(reviewClaimed.body.reviewClaimed, true);
    assert.equal(reviewClaimed.body.earnedDsdemo, 12);
    assert.match(reviewClaimed.body.reviewProofDigest, /^0x[0-9a-f]{64}$/i);

    // 重复领书评奖返回 409
    await a.post(`/api/reading-challenge/${flow.participationId}/claim`).send({ kind: 'review' }).expect(409);

    // 删除感受正文后，不影响已签发的书评 EIP-712 凭证与累计 12 DSDEMO
    await a.delete(`/api/completions/${flow.completionId}/reflection`).expect(204);
    const afterDelete = await a.get(`/api/reading-challenge/${flow.participationId}`).expect(200);
    assert.equal(afterDelete.body.hasReflection, false);
    assert.equal(afterDelete.body.reviewClaimed, true);
    assert.equal(afterDelete.body.reviewProofDigest, reviewClaimed.body.reviewProofDigest);
    assert.equal(afterDelete.body.earnedDsdemo, 12);
  });

  it('读书共读服务严格隔离双账户身份与越权访问，并在注销时级联清理', async () => {
    const a = await agentFor('a');
    const b = await agentFor('b');
    const aReading = await joinAndComplete(a, 'reading');
    const bReading = await joinAndComplete(b, 'reading');
    const aCooking = await joinAndComplete(a, 'cooking');

    // 非 reading 主题返回 400
    await a.get(`/api/reading-challenge/${aCooking.participationId}`).expect(400);

    const aState = await a.get(`/api/reading-challenge/${aReading.participationId}`).expect(200);
    const bState = await b.get(`/api/reading-challenge/${bReading.participationId}`).expect(200);
    assert.notEqual(aState.body.readerWallet, bState.body.readerWallet);
    assert.notEqual(aState.body.subjectHash, bState.body.subjectHash);

    // 跨账户越权访问返回 404
    await b.get(`/api/reading-challenge/${aReading.participationId}`).expect(404);
    await b.post(`/api/reading-challenge/${aReading.participationId}/progress`).send({ preset: 'complete' }).expect(404);
    await b.post(`/api/reading-challenge/${aReading.participationId}/claim`).send({ kind: 'reading' }).expect(404);

    // 注销账户 a 后，reading_challenges 记录自动级联删除，且不影响账户 b
    await a.delete('/api/account').expect(200);
    assert.equal(
      context.store.database.prepare('SELECT * FROM reading_challenges WHERE participation_id = ?').get(aReading.participationId),
      undefined,
    );
    const bAfter = await b.get(`/api/reading-challenge/${bReading.participationId}`).expect(200);
    assert.equal(bAfter.body.participationId, bReading.participationId);
  });
});
