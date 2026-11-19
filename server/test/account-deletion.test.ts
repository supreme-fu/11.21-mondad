import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import type { Store } from '../src/db.js';

const created: string[] = [];

function tempDatabasePath() {
  const directory = mkdtempSync(join(tmpdir(), 'do-something-deletion-'));
  created.push(directory);
  return join(directory, 'account.db');
}

after(() => {
  for (const directory of created) rmSync(directory, { recursive: true, force: true });
});

function open(path: string) {
  return createApp({ databasePath: path, receiptMode: 'simulation' });
}

function close(store: Store) {
  store.close();
}

async function loginAs(app: ReturnType<typeof createApp>['app'], account: 'a' | 'b') {
  const agent = request.agent(app);
  await agent.post('/api/session/demo').send({ account }).expect(200);
  return agent;
}

async function joinAndComplete(agent: ReturnType<typeof request.agent>) {
  const joined = await agent.post('/api/participations').send({ activityId: 'cooking' }).expect(201);
  const completed = await agent.post(`/api/participations/${joined.body.id}/complete`)
    .send({ idempotencyKey: 'deletion-regression-key-1' }).expect(201);
  return { participationId: joined.body.id as string, completionId: completed.body.id as string };
}

describe('演示账户注销后的永久性', () => {
  it('注销后同进程与重启都无法重登，个人数据不恢复', async () => {
    const databasePath = tempDatabasePath();
    const first = open(databasePath);
    const a = await loginAs(first.app, 'a');
    const flow = await joinAndComplete(a);
    const secret = '一段应当随注销消失的个人正文';
    await a.put(`/api/completions/${flow.completionId}/reflection`)
      .send({ text: secret, visibility: 'shared' }).expect(200);
    await a.post(`/api/completions/${flow.completionId}/receipt`).send({ acknowledged: true }).expect(201);

    const deleted = await a.delete('/api/account').expect(200);
    assert.equal(deleted.body.deleted, true);
    assert.equal(deleted.body.offChainDataDeleted, true);

    // 同进程：会话失效，固定演示账号不能再登录。
    await a.get('/api/me/records').expect(401);
    await request(first.app).post('/api/session/demo').send({ account: 'a' }).expect(403);
    // 另一账户不受影响。
    const b = await loginAs(first.app, 'b');
    await b.get('/api/me/records').expect(200);
    close(first.store);

    // 重启：数据库重新打开，注销必须依然生效。
    const restarted = open(databasePath);
    await request(restarted.app).post('/api/session/demo').send({ account: 'a' }).expect(403);
    await request(restarted.app).post('/api/session/demo').send({ account: 'b' }).expect(200);
    assert.equal(
      restarted.store.database.prepare('SELECT id FROM users WHERE id = ?').get('user-a'),
      undefined,
    );
    assert.equal(
      restarted.store.database.prepare('SELECT text FROM reflections WHERE text = ?').get(secret),
      undefined,
    );
    assert.equal(
      restarted.store.database.prepare('SELECT id FROM participations WHERE id = ?').get(flow.participationId),
      undefined,
    );
    assert.equal(
      restarted.store.database.prepare('SELECT receipt_id FROM receipts WHERE completion_id = ?').get(flow.completionId),
      undefined,
    );
    // 静态主题目录仍然可用。
    const activities = await request(restarted.app).get('/api/activities').expect(200);
    assert.equal(activities.body.length, 4);
    close(restarted.store);
  });

  it('兼容旧库：已缺失的演示账号不会被重新播种，主题目录仍补齐', async () => {
    const databasePath = tempDatabasePath();
    const first = open(databasePath);
    const a = await loginAs(first.app, 'a');
    await a.delete('/api/account').expect(200);
    close(first.store);

    // 模拟本修复之前创建的数据库：没有 demo_seed_v1 元数据标记。
    const legacy = new (await import('node:sqlite')).DatabaseSync(databasePath);
    legacy.prepare('DELETE FROM meta WHERE key = ?').run('demo_seed_v1');
    legacy.close();

    const reopened = open(databasePath);
    assert.equal(
      reopened.store.database.prepare('SELECT id FROM users WHERE demo_key = ?').get('a'),
      undefined,
    );
    assert.equal(
      reopened.store.database.prepare('SELECT id FROM users WHERE demo_key = ?').get('b') !== undefined,
      true,
    );
    assert.equal(
      (reopened.store.database.prepare('SELECT COUNT(*) AS count FROM activities').get() as { count: number }).count,
      4,
    );
    await request(reopened.app).post('/api/session/demo').send({ account: 'a' }).expect(403);
    await request(reopened.app).post('/api/session/demo').send({ account: 'b' }).expect(200);
    close(reopened.store);
  });

  it('全新库仍然初始化两个演示账户与示例经历', async () => {
    const databasePath = tempDatabasePath();
    const fresh = open(databasePath);
    const a = await loginAs(fresh.app, 'a');
    await a.get('/api/me/records').expect(200);
    assert.equal(
      (fresh.store.database.prepare('SELECT display_name FROM users WHERE demo_key = ?').get('a') as { display_name: string }).display_name,
      '阿黎',
    );
    const example = fresh.store.database
      .prepare("SELECT text FROM reflections WHERE completion_id = 'completion-example'")
      .get() as { text: string } | undefined;
    assert.ok(example, '示例经历应存在');
    assert.equal(example.text.length > 0, true);
    close(fresh.store);
  });
});
