import { randomBytes, randomUUID } from 'node:crypto';
import { id as keccakId } from 'ethers';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { z } from 'zod';
import { Store } from './db.js';
import { ReadingChallengeService } from './reading-challenge.js';
import { MonadReceiptProvider, ReceiptManager, SimulationReceiptProvider } from './receipts.js';
import type { ReceiptMode, ReceiptProvider, UserRow } from './types.js';

interface AppOptions {
  databasePath: string;
  receiptMode?: ReceiptMode;
  receiptProvider?: ReceiptProvider;
  seedRichProfile?: boolean;
}

interface AuthedRequest extends Request {
  user: UserRow;
}

const timestamp = () => new Date().toISOString();
const userOf = (request: Request) => (request as AuthedRequest).user;

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';').filter(Boolean).map((part) => {
      const index = part.indexOf('=');
      return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
    }),
  );
}

function publicUser(user: UserRow) {
  return {
    id: user.id,
    displayName: user.display_name,
    demoKey: user.demo_key,
    bio: user.bio ?? null,
    goal: user.goal ?? null,
    points: typeof user.points === 'number' ? user.points : 100,
  };
}

/** Monad 测试网链 ID 固定 10143；本地 EVM 联调由测试直接注入 provider，不走这里。 */
const MONAD_TESTNET_CHAIN_ID = 10143;

/**
 * 真链模式的 provider 只从环境变量取一次配置，之后一律以 provider 自己校验过的
 * 链 ID 与合约地址为准；凭证行不再读 process.env。
 */
function monadProviderFromEnv(): ReceiptProvider {
  const configuredChainId = process.env.MONAD_CHAIN_ID?.trim();
  if (configuredChainId && Number(configuredChainId) !== MONAD_TESTNET_CHAIN_ID) {
    throw new Error(
      `MONAD_CHAIN_ID 只能是 ${MONAD_TESTNET_CHAIN_ID}（Monad 测试网）；本地 EVM 联调请在测试中直接注入 provider。`,
    );
  }
  return new MonadReceiptProvider(
    process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz',
    process.env.MONAD_TESTNET_PRIVATE_KEY || '',
    process.env.MONAD_CONTRACT_ADDRESS || '',
    MONAD_TESTNET_CHAIN_ID,
    process.env.MONAD_EXPLORER_URL || 'https://testnet.monadvision.com',
  );
}

export function createApp(options: AppOptions) {
  const store = new Store(options.databasePath, { seedRichProfile: options.seedRichProfile });
  const mode = options.receiptMode || 'simulation';
  const provider = options.receiptProvider || (mode === 'simulation'
    ? new SimulationReceiptProvider()
    : monadProviderFromEnv());
  const receipts = new ReceiptManager(store, mode, provider);
  const readingChallenge = new ReadingChallengeService(store, mode);
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '16kb' }));

  function sessionCookie(value: string, maxAge: number) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    return `do_something_session=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
  }

  function sessionUser(request: Request) {
    const token = parseCookies(request.headers.cookie).do_something_session;
    if (!token) return undefined;
    return store.database.prepare(`
      SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > ? AND u.status = 'active'
    `).get(token, timestamp()) as UserRow | undefined;
  }

  function requireAuth(request: Request, _response: Response, next: NextFunction) {
    const user = sessionUser(request);
    if (!user) return next(httpError(401, '会话已失效，请重新选择账户。'));
    (request as AuthedRequest).user = user;
    next();
  }

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true, receiptMode: mode, database: 'sqlite' });
  });

  app.post('/api/session/demo', (request, response, next) => {
    try {
      const { account } = z.object({ account: z.enum(['a', 'b']) }).parse(request.body);
      const user = store.database.prepare(
        "SELECT * FROM users WHERE demo_key = ? AND status = 'active'",
      ).get(account) as UserRow | undefined;
      if (!user) throw httpError(403, '这个账户已注销，不能重新登录。');
      const previousToken = parseCookies(request.headers.cookie).do_something_session;
      if (previousToken) store.database.prepare('DELETE FROM sessions WHERE id = ?').run(previousToken);
      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      store.database.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
        .run(token, user.id, expiresAt, timestamp());
      response.setHeader('Set-Cookie', sessionCookie(token, 604800));
      response.json({ user: publicUser(user), receiptMode: mode });
    } catch (error) { next(error); }
  });

  app.get('/api/session', (request, response) => {
    const user = sessionUser(request);
    response.json({ user: user ? publicUser(user) : null, receiptMode: mode });
  });

  app.post('/api/session/logout', (request, response) => {
    const token = parseCookies(request.headers.cookie).do_something_session;
    if (token) store.database.prepare('DELETE FROM sessions WHERE id = ?').run(token);
    response.setHeader('Set-Cookie', sessionCookie('', 0));
    response.status(204).end();
  });

  app.get('/api/activities', (_request, response) => {
    const rows = store.database.prepare(
      "SELECT * FROM activities WHERE status = 'active' ORDER BY rowid",
    ).all() as Array<Record<string, unknown>>;
    response.json(rows.map((row) => ({
      id: row.id,
      title: row.title,
      invitation: row.invitation,
      description: row.description,
      category: row.category,
      duration: row.duration,
      completionHint: row.completion_hint,
      ruleVersion: row.rule_version,
    })));
  });

  app.get('/api/activities/:id', requireAuth, (request, response) => {
    const activityId = String(request.params.id);
    const activity = store.database.prepare('SELECT * FROM activities WHERE id = ? AND status = ?')
      .get(activityId, 'active') as Record<string, unknown> | undefined;
    if (!activity) throw httpError(404, '没有找到这个主题。');

    const rows = store.database.prepare(`
      SELECT p.id, p.status, p.rule_version AS ruleVersion, c.id AS completionId,
        c.declared_at AS declaredAt, f.text AS reflectionText, f.visibility,
        r.status AS receiptStatus
      FROM participations p
      LEFT JOIN completions c ON c.participation_id = p.id
      LEFT JOIN reflections f ON f.completion_id = c.id
      LEFT JOIN receipts r ON r.completion_id = c.id
      WHERE p.user_id = ? AND p.activity_id = ?
      ORDER BY p.created_at DESC, p.rowid DESC
    `).all(userOf(request).id, activityId) as Array<{
      id: string;
      status: 'joined' | 'completed' | 'left';
      ruleVersion: number;
      completionId: string | null;
      declaredAt: string | null;
      reflectionText: string | null;
      visibility: 'private' | 'shared' | null;
      receiptStatus: string | null;
    }>;

    const joinedActive = rows.find((row) => !row.completionId && row.status === 'joined') || null;
    const leftPending = rows.find((row) => !row.completionId && row.status === 'left') || null;
    const completedRows = rows.filter((row) => row.completionId !== null);
    const preferred = joinedActive || leftPending || completedRows[0] || null;

    response.json({
      id: activity.id,
      title: activity.title,
      invitation: activity.invitation,
      description: activity.description,
      category: activity.category,
      duration: activity.duration,
      completionHint: activity.completion_hint,
      ruleVersion: activity.rule_version,
      participation: preferred ? {
        id: preferred.id,
        status: preferred.status,
        ruleVersion: preferred.ruleVersion,
        completionId: preferred.completionId,
      } : null,
      activeParticipation: joinedActive ? {
        id: joinedActive.id,
        status: joinedActive.status,
        ruleVersion: joinedActive.ruleVersion,
        completionId: null,
      } : null,
      completionCount: completedRows.length,
      history: completedRows.map((row) => ({
        participationId: row.id,
        completionId: row.completionId as string,
        declaredAt: row.declaredAt as string,
        reflectionText: row.reflectionText,
        visibility: row.visibility || 'private',
        receiptStatus: row.receiptStatus || 'not_requested',
      })),
    });
  });

  app.post('/api/participations', requireAuth, (request, response, next) => {
    try {
      const { activityId } = z.object({ activityId: z.string().min(1).max(80) }).parse(request.body);
      const activity = store.database.prepare('SELECT rule_version FROM activities WHERE id = ? AND status = ?')
        .get(activityId, 'active') as { rule_version: number } | undefined;
      if (!activity) throw httpError(404, '这个主题当前不可参与。');
      const existing = store.database.prepare(`
        SELECT p.id, p.status
        FROM participations p
        LEFT JOIN completions c ON c.participation_id = p.id
        WHERE p.user_id = ? AND p.activity_id = ? AND c.id IS NULL AND p.status IN ('joined', 'left')
        ORDER BY p.rowid DESC LIMIT 1
      `).get(userOf(request).id, activityId) as { id: string; status: string } | undefined;
      if (existing) {
        if (existing.status === 'left') {
          store.database.prepare("UPDATE participations SET status = 'joined' WHERE id = ?").run(existing.id);
        }
        return response.json({ id: existing.id, status: 'joined' });
      }
      const id = randomUUID();
      store.database.prepare(`
        INSERT INTO participations (id, user_id, activity_id, rule_version, status, created_at)
        VALUES (?, ?, ?, ?, 'joined', ?)
      `).run(id, userOf(request).id, activityId, activity.rule_version, timestamp());
      response.status(201).json({ id, status: 'joined' });
    } catch (error) { next(error); }
  });

  app.post('/api/participations/:id/leave', requireAuth, (request, response) => {
    const participation = store.database.prepare(
      'SELECT id FROM participations WHERE id = ? AND user_id = ?',
    ).get(String(request.params.id), userOf(request).id);
    if (!participation) throw httpError(404, '没有找到你的参与记录。');
    const completion = store.database.prepare('SELECT id FROM completions WHERE participation_id = ?')
      .get(String(request.params.id));
    if (completion) throw httpError(409, '完成声明会保留；你可以改为删除感受正文。');
    store.database.prepare("UPDATE participations SET status = 'left' WHERE id = ?").run(String(request.params.id));
    response.json({ ok: true });
  });

  app.post('/api/participations/:id/complete', requireAuth, (request, response, next) => {
    try {
      const { idempotencyKey } = z.object({ idempotencyKey: z.string().min(8).max(100) }).parse(request.body);
      const participation = store.database.prepare(
        'SELECT id FROM participations WHERE id = ? AND user_id = ?',
      ).get(String(request.params.id), userOf(request).id);
      if (!participation) throw httpError(404, '没有找到你的参与记录。');
      const existing = store.database.prepare(
        'SELECT id, declared_at AS declaredAt, verification_type AS verificationType FROM completions WHERE participation_id = ?',
      ).get(String(request.params.id));
      if (existing) return response.json(existing);

      const id = randomUUID();
      store.database.exec('BEGIN IMMEDIATE');
      try {
        store.database.prepare(`
          INSERT INTO completions (id, participation_id, declared_at, verification_type, idempotency_key)
          VALUES (?, ?, ?, 'self_report', ?)
        `).run(id, String(request.params.id), timestamp(), idempotencyKey);
        store.database.prepare(
          "INSERT INTO reflections (completion_id, text, visibility, shared_at, deleted_at) VALUES (?, NULL, 'private', NULL, NULL)",
        ).run(id);
        store.database.prepare("UPDATE participations SET status = 'completed' WHERE id = ?").run(String(request.params.id));
        store.database.exec('COMMIT');
      } catch (error) {
        store.database.exec('ROLLBACK');
        throw error;
      }
      response.status(201).json({ id, declaredAt: timestamp(), verificationType: 'self_report' });
    } catch (error) { next(error); }
  });

  app.post('/api/participations/:id/onchain-complete', requireAuth, (request, response, next) => {
    try {
      const { idempotencyKey } = z.object({ idempotencyKey: z.string().min(8).max(100) }).parse(request.body);
      const userId = userOf(request).id;
      const participationId = String(request.params.id);
      const COST_POINTS = 1;

      const participation = store.database.prepare(
        'SELECT id, activity_id AS activityId FROM participations WHERE id = ? AND user_id = ?',
      ).get(participationId, userId) as { id: string; activityId: string } | undefined;
      if (!participation) throw httpError(404, '没有找到你的参与记录。');

      const userRow = store.database.prepare('SELECT points FROM users WHERE id = ?').get(userId) as { points: number } | undefined;
      const currentPoints = typeof userRow?.points === 'number' ? userRow.points : 100;

      let existingComp = store.database.prepare(
        'SELECT id FROM completions WHERE participation_id = ?',
      ).get(participationId) as { id: string } | undefined;
      const existingReceiptBefore = existingComp ? receipts.get(existingComp.id) : undefined;

      if (!existingReceiptBefore && currentPoints < COST_POINTS) {
        throw httpError(400, `当前剩余点数不足（需要 ${COST_POINTS} 点，当前仅剩 ${currentPoints} 点）。`);
      }

      if (!existingComp) {
        const compId = randomUUID();
        store.database.exec('BEGIN IMMEDIATE');
        try {
          store.database.prepare(`
            INSERT INTO completions (id, participation_id, declared_at, verification_type, idempotency_key)
            VALUES (?, ?, ?, 'self_report', ?)
          `).run(compId, participationId, timestamp(), idempotencyKey);
          store.database.prepare(
            "INSERT OR IGNORE INTO reflections (completion_id, text, visibility, shared_at, deleted_at) VALUES (?, NULL, 'private', NULL, NULL)",
          ).run(compId);
          store.database.prepare("UPDATE participations SET status = 'completed' WHERE id = ?").run(participationId);
          store.database.exec('COMMIT');
          existingComp = { id: compId };
        } catch (err) {
          store.database.exec('ROLLBACK');
          throw err;
        }
      }

      let deducted = 0;
      let receipt = receipts.get(existingComp.id);
      if (!receipt) {
        receipt = receipts.request(existingComp.id);
        store.database.prepare('UPDATE users SET points = MAX(0, points - ?) WHERE id = ?').run(COST_POINTS, userId);
        deducted = COST_POINTS;
      }

      const updatedUser = store.database.prepare('SELECT points FROM users WHERE id = ?').get(userId) as { points: number };
      const totalCompletedRow = store.database.prepare(`
        SELECT COUNT(*) AS count FROM completions c
        JOIN participations p ON p.id = c.participation_id
        WHERE p.user_id = ?
      `).get(userId) as { count: number };
      const totalCompleted = totalCompletedRow.count;
      const milestoneBadgeId = totalCompleted >= 100
        ? 'gold100'
        : totalCompleted >= 50
          ? 'silver50'
          : totalCompleted >= 10
            ? 'bronze10'
            : null;
      const { readerWallet } = readingChallenge.deriveIdentity(userId);

      response.status(201).json({
        completionId: existingComp.id,
        activityId: participation.activityId,
        receipt,
        deductedPoints: deducted,
        remainingPoints: updatedUser.points,
        totalCompleted,
        milestoneBadgeId,
        holderAddress: readerWallet,
      });
    } catch (error) { next(error); }
  });

  function ownedCompletion(request: Request, completionId: string) {
    const completion = store.database.prepare(`
      SELECT c.id, p.activity_id AS activityId FROM completions c
      JOIN participations p ON p.id = c.participation_id
      WHERE c.id = ? AND p.user_id = ?
    `).get(completionId, userOf(request).id);
    if (!completion) throw httpError(404, '没有找到你的完成记录。');
    return completion;
  }

  app.put('/api/completions/:id/reflection', requireAuth, (request, response, next) => {
    try {
      ownedCompletion(request, String(request.params.id));
      const input = z.object({
        text: z.string().max(500),
        visibility: z.enum(['private', 'shared']),
      }).parse(request.body);
      const text = input.text.trim();
      if (input.visibility === 'shared' && !text) {
        throw httpError(400, '愿意分享时，请先写下一句感受；也可以保持仅自己可见。');
      }
      store.database.prepare(`
        UPDATE reflections SET text = ?, visibility = ?, shared_at = ?, deleted_at = NULL WHERE completion_id = ?
      `).run(text || null, input.visibility, input.visibility === 'shared' ? timestamp() : null, String(request.params.id));
      response.json({ text: text || null, visibility: input.visibility });
    } catch (error) { next(error); }
  });

  app.delete('/api/completions/:id/reflection', requireAuth, (request, response) => {
    ownedCompletion(request, String(request.params.id));
    store.database.prepare(`
      UPDATE reflections SET text = NULL, visibility = 'private', shared_at = NULL, deleted_at = ? WHERE completion_id = ?
    `).run(timestamp(), String(request.params.id));
    response.status(204).end();
  });

  app.post('/api/completions/:id/receipt', requireAuth, (request, response, next) => {
    try {
      ownedCompletion(request, String(request.params.id));
      z.object({ acknowledged: z.literal(true) }).parse(request.body);
      const receipt = receipts.request(String(request.params.id));
      response.status(201).json(receipt);
    } catch (error) { next(error); }
  });

  app.get('/api/completions/:id/receipt', requireAuth, (request, response) => {
    ownedCompletion(request, String(request.params.id));
    response.json(receipts.get(String(request.params.id)) || { status: 'not_requested', mode });
  });

  app.get('/api/reading-challenge/:participationId', requireAuth, async (request, response, next) => {
    try {
      const state = await readingChallenge.getOrInitState(userOf(request).id, String(request.params.participationId));
      response.json(state);
    } catch (error) { next(error); }
  });

  app.post('/api/reading-challenge/:participationId/progress', requireAuth, async (request, response, next) => {
    try {
      const { preset } = z.object({ preset: z.enum(['baseline', 'partial', 'complete']) }).parse(request.body);
      const state = await readingChallenge.syncProgress(userOf(request).id, String(request.params.participationId), preset);
      response.json(state);
    } catch (error) { next(error); }
  });

  app.post('/api/reading-challenge/:participationId/claim', requireAuth, async (request, response, next) => {
    try {
      const { kind } = z.object({ kind: z.enum(['reading', 'review']) }).parse(request.body);
      const state = await readingChallenge.claimReward(userOf(request).id, String(request.params.participationId), kind);
      response.json(state);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error) console.error('Reading claim provider error:', error.code);
      next(error);
    }
  });

  app.post('/api/reading-challenge/:participationId/onchain-mint', requireAuth, async (request, response, next) => {
    try {
      const userId = userOf(request).id;
      const participationId = String(request.params.participationId);
      const COST_POINTS = 1;

      const userRow = store.database.prepare('SELECT points FROM users WHERE id = ?').get(userId) as { points: number } | undefined;
      const currentPoints = typeof userRow?.points === 'number' ? userRow.points : 100;
      if (currentPoints < COST_POINTS) {
        throw httpError(400, `当前剩余点数不足（需要 ${COST_POINTS} 点，当前仅剩 ${currentPoints} 点）。`);
      }

      // 1) 确保第 27 章已标记完成
      await readingChallenge.updateChapterProgress(userId, participationId, {
        action: 'complete',
        chapter: 27,
        readingSecondsDelta: 15,
      });

      // 2) 确保本次阅读完成记录已建立
      let completionRow = store.database.prepare(
        'SELECT id FROM completions WHERE participation_id = ?',
      ).get(participationId) as { id: string } | undefined;
      if (!completionRow) {
        const compId = randomUUID();
        store.database.exec('BEGIN IMMEDIATE');
        try {
          store.database.prepare(`
            INSERT INTO completions (id, participation_id, declared_at, verification_type, idempotency_key)
            VALUES (?, ?, ?, 'self_report', ?)
          `).run(compId, participationId, timestamp(), `onchain-mint-${participationId}`);
          store.database.prepare(
            "INSERT OR IGNORE INTO reflections (completion_id, text, visibility, shared_at, deleted_at) VALUES (?, NULL, 'private', NULL, NULL)",
          ).run(compId);
          store.database.prepare("UPDATE participations SET status = 'completed' WHERE id = ?").run(participationId);
          store.database.exec('COMMIT');
          completionRow = { id: compId };
        } catch (err) {
          store.database.exec('ROLLBACK');
          throw err;
        }
      }

      // 3) 领取阅读达标奖励并铸造 ReadingBadge（若尚未领取）
      let state = await readingChallenge.getOrInitState(userId, participationId);
      let deducted = 0;
      if (!state.readingClaimed) {
        state = await readingChallenge.claimReward(userId, participationId, 'reading');
        store.database.prepare('UPDATE users SET points = MAX(0, points - ?) WHERE id = ?').run(COST_POINTS, userId);
        deducted = COST_POINTS;
      }

      // 4) 同步触发完成凭证登记（若尚未申请）
      const existingReceipt = receipts.get(completionRow.id);
      if (!existingReceipt) {
        receipts.request(completionRow.id);
      }

      const updatedUser = store.database.prepare('SELECT points FROM users WHERE id = ?').get(userId) as { points: number };
      const totalCompletedRow = store.database.prepare(`
        SELECT COUNT(*) AS count FROM completions c
        JOIN participations p ON p.id = c.participation_id
        WHERE p.user_id = ?
      `).get(userId) as { count: number };

      const totalCompleted = totalCompletedRow.count;
      const milestoneBadgeId = totalCompleted >= 100
        ? 'gold100'
        : totalCompleted >= 50
          ? 'silver50'
          : totalCompleted >= 10
            ? 'bronze10'
            : null;

      response.json({
        completionId: completionRow.id,
        state,
        deductedPoints: deducted,
        remainingPoints: updatedUser.points,
        totalCompleted,
        mintedBadgeIds: milestoneBadgeId ? ['reading', milestoneBadgeId] : ['reading'],
        milestoneBadgeId,
      });
    } catch (error) { next(error); }
  });

  app.post('/api/reading-challenge/:participationId/chapters', requireAuth, async (request, response, next) => {
    try {
      const input = z.object({
        action: z.enum(['complete', 'uncomplete', 'set_current', 'complete_up_to']),
        chapter: z.number().int().min(1).max(27),
        readingSecondsDelta: z.number().int().min(0).max(3600).optional(),
      }).parse(request.body);
      const state = await readingChallenge.updateChapterProgress(
        userOf(request).id,
        String(request.params.participationId),
        input,
      );
      response.json(state);
    } catch (error) { next(error); }
  });

  app.post('/api/reading-challenge/:participationId/highlights', requireAuth, async (request, response, next) => {
    try {
      const input = z.object({
        chapter: z.number().int().min(1).max(27),
        text: z.string().min(1).max(320),
      }).parse(request.body);
      const state = await readingChallenge.addHighlight(
        userOf(request).id,
        String(request.params.participationId),
        input.chapter,
        input.text,
      );
      response.json(state);
    } catch (error) { next(error); }
  });

  app.delete('/api/reading-challenge/:participationId/highlights/:highlightId', requireAuth, async (request, response, next) => {
    try {
      const state = await readingChallenge.removeHighlight(
        userOf(request).id,
        String(request.params.participationId),
        String(request.params.highlightId),
      );
      response.json(state);
    } catch (error) { next(error); }
  });

  app.get('/api/participations/:id/scene', requireAuth, (request, response) => {
    const participationId = String(request.params.id);
    const owned = store.database.prepare(
      'SELECT id, activity_id AS activityId FROM participations WHERE id = ? AND user_id = ?',
    ).get(participationId, userOf(request).id) as { id: string; activityId: string } | undefined;
    if (!owned) throw httpError(404, '没有找到你的参与记录。');
    const row = store.database.prepare(
      'SELECT payload_json, verified_channel, verified_code, verified_digest, updated_at FROM activity_logs WHERE participation_id = ?',
    ).get(participationId) as {
      payload_json: string;
      verified_channel: string | null;
      verified_code: string | null;
      verified_digest: string | null;
      updated_at: string;
    } | undefined;
    let payload: Record<string, unknown> = {};
    if (row?.payload_json) {
      try { payload = JSON.parse(row.payload_json) as Record<string, unknown>; } catch { payload = {}; }
    }
    response.json({
      participationId,
      activityId: owned.activityId,
      payload,
      verifiedChannel: row?.verified_channel ?? null,
      verifiedCode: row?.verified_code ?? null,
      verifiedDigest: row?.verified_digest ?? null,
      updatedAt: row?.updated_at ?? null,
    });
  });

  app.put('/api/participations/:id/scene', requireAuth, (request, response, next) => {
    try {
      const participationId = String(request.params.id);
      const owned = store.database.prepare(
        'SELECT id, activity_id AS activityId FROM participations WHERE id = ? AND user_id = ?',
      ).get(participationId, userOf(request).id) as { id: string; activityId: string } | undefined;
      if (!owned) throw httpError(404, '没有找到你的参与记录。');

      const input = z.object({
        payload: z.record(z.string(), z.unknown()),
        ticketCode: z.string().max(80).optional(),
        verifyChannel: z.string().max(120).optional(),
      }).parse(request.body);

      const ticketCode = input.ticketCode?.trim() || (typeof input.payload.ticketCode === 'string' ? input.payload.ticketCode.trim() : '');
      const hasTicket = owned.activityId === 'outing' && ticketCode.length >= 4;
      const verifiedChannel = hasTicket
        ? (input.verifyChannel?.trim() || '广州文旅门票核销节点 (ActivityHub EIP-712)')
        : null;
      const verifiedCode = hasTicket ? ticketCode : null;
      const verifiedDigest = hasTicket
        ? keccakId(`do-something:outing:ticket:${userOf(request).id}:${participationId}:${ticketCode}`)
        : null;
      const updatedAt = timestamp();

      store.database.prepare(`
        INSERT INTO activity_logs (participation_id, activity_id, payload_json, verified_channel, verified_code, verified_digest, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(participation_id) DO UPDATE SET
          payload_json = excluded.payload_json,
          verified_channel = excluded.verified_channel,
          verified_code = excluded.verified_code,
          verified_digest = excluded.verified_digest,
          updated_at = excluded.updated_at
      `).run(
        participationId,
        owned.activityId,
        JSON.stringify(input.payload),
        verifiedChannel,
        verifiedCode,
        verifiedDigest,
        updatedAt,
      );

      response.json({
        participationId,
        activityId: owned.activityId,
        payload: input.payload,
        verifiedChannel,
        verifiedCode,
        verifiedDigest,
        updatedAt,
      });
    } catch (error) { next(error); }
  });

  app.patch('/api/me/profile', requireAuth, (request, response, next) => {
    try {
      const input = z.object({
        displayName: z.string().trim().min(1).max(24).optional(),
        bio: z.string().trim().max(160).optional(),
        goal: z.string().trim().max(160).optional(),
      }).parse(request.body);
      const current = userOf(request);
      const nextName = input.displayName ?? current.display_name;
      const nextBio = input.bio !== undefined ? input.bio : current.bio;
      const nextGoal = input.goal !== undefined ? input.goal : current.goal;
      store.database.prepare('UPDATE users SET display_name = ?, bio = ?, goal = ? WHERE id = ?')
        .run(nextName, nextBio, nextGoal, current.id);
      const updated = store.database.prepare('SELECT * FROM users WHERE id = ?').get(current.id) as unknown as UserRow;
      response.json({ user: publicUser(updated) });
    } catch (error) { next(error); }
  });

  app.post('/api/demo/reset-profile', requireAuth, (_request, response) => {
    store.seedRichDemoProfile(true);
    response.json({ ok: true });
  });

  app.get('/api/echoes', requireAuth, (request, response, next) => {
    try {
      const activityId = z.string().min(1).max(80).parse(request.query.activityId);
      const excludeTextRaw = typeof request.query.excludeText === 'string'
        ? z.string().max(500).parse(request.query.excludeText)
        : undefined;
      const excludeText = excludeTextRaw?.trim() ? excludeTextRaw : undefined;

      const completed = store.database.prepare(`
        SELECT 1 FROM participations p JOIN completions c ON c.participation_id = p.id
        WHERE p.user_id = ? AND p.activity_id = ?
      `).get(userOf(request).id, activityId);
      if (!completed) return response.json({ echo: null, totalAvailable: 0 });

      const baseQuery = `
        SELECT r.text, u.display_name AS displayName, u.demo_key AS demoKey
        FROM reflections r
        JOIN completions c ON c.id = r.completion_id
        JOIN participations p ON p.id = c.participation_id
        JOIN users u ON u.id = p.user_id
        WHERE p.activity_id = ? AND p.user_id != ? AND r.visibility = 'shared'
          AND r.deleted_at IS NULL AND r.text IS NOT NULL AND u.status = 'active'
      `;
      const realEchoes = store.database.prepare(`${baseQuery} AND u.demo_key IS NOT NULL`)
        .all(activityId, userOf(request).id) as Array<{ text: string; displayName: string; demoKey: string | null }>;
      const exampleEchoes = store.database.prepare(`${baseQuery} AND u.demo_key IS NULL`)
        .all(activityId, userOf(request).id) as Array<{ text: string; displayName: string; demoKey: string | null }>;
      const totalAvailable = realEchoes.length + exampleEchoes.length;

      const pickRandom = <T,>(items: T[]): T | undefined => (
        items.length > 0 ? items[Math.floor(Math.random() * items.length)] : undefined
      );

      let chosen: { text: string; displayName: string; demoKey: string | null } | undefined;
      if (excludeText) {
        const otherReal = realEchoes.filter((item) => item.text !== excludeText);
        const otherExample = exampleEchoes.filter((item) => item.text !== excludeText);
        chosen = pickRandom(otherReal) || pickRandom(otherExample) || pickRandom(realEchoes) || pickRandom(exampleEchoes);
      } else {
        chosen = pickRandom(realEchoes) || pickRandom(exampleEchoes);
      }

      response.json({
        echo: chosen ? {
          text: chosen.text,
          displayName: chosen.displayName,
          isExample: chosen.demoKey === null,
        } : null,
        totalAvailable,
      });
    } catch (error) { next(error); }
  });

  app.post('/api/me/points/refill', requireAuth, (request, response) => {
    const userId = userOf(request).id;
    const ADD_POINTS = 60;
    store.database.exec('BEGIN IMMEDIATE');
    let nextPoints = 100 + ADD_POINTS;
    try {
      store.database.prepare('UPDATE users SET points = COALESCE(points, 100) + ? WHERE id = ?').run(ADD_POINTS, userId);
      const updated = store.database.prepare('SELECT points FROM users WHERE id = ?').get(userId) as { points: number } | undefined;
      nextPoints = typeof updated?.points === 'number' ? updated.points : 100 + ADD_POINTS;
      store.database.exec('COMMIT');
    } catch (error) {
      store.database.exec('ROLLBACK');
      throw error;
    }
    response.json({
      addedPoints: ADD_POINTS,
      points: nextPoints,
      packLabel: '1 卷生活胶卷（$6 / +60 次无感刻痕）',
    });
  });

  app.get('/api/me/records', requireAuth, (request, response) => {
    const rows = store.database.prepare(`
      SELECT p.id AS participationId, p.status AS participationStatus, p.created_at AS joinedAt,
        a.id AS activityId, a.title AS activityTitle, a.category, a.duration, a.rule_version AS ruleVersion,
        c.id AS completionId, c.declared_at AS declaredAt, c.verification_type AS verificationType,
        f.text AS reflectionText, f.visibility, f.deleted_at AS reflectionDeletedAt,
        r.receipt_id AS receiptId, r.chain_id AS chainId, r.contract_address AS contractAddress,
        r.tx_hash AS txHash, r.status AS receiptStatus, r.mode AS receiptMode, r.error AS receiptError,
        l.payload_json AS scenePayloadJson, l.verified_channel AS sceneVerifiedChannel,
        l.verified_code AS sceneVerifiedCode, l.verified_digest AS sceneVerifiedDigest,
        rc.coverage_bps AS rcCoverageBps, rc.last_chapter_completed AS rcLastChapter,
        rc.read_chapters_json AS rcReadChaptersJson, rc.current_chapter AS rcCurrentChapter,
        rc.reading_claimed_at AS rcReadingClaimedAt, rc.review_claimed_at AS rcReviewClaimedAt,
        rc.badge_token_id AS rcBadgeTokenId, rc.reward_reading_dsdemo AS rcRewardReading,
        rc.reward_review_dsdemo AS rcRewardReview, rc.reading_tx_hash AS rcReadingTxHash,
        rc.reading_block_number AS rcReadingBlockNumber, rc.reader_wallet AS rcReaderWallet,
        rc.reading_proof_digest AS rcReadingProofDigest
      FROM participations p
      JOIN activities a ON a.id = p.activity_id
      LEFT JOIN completions c ON c.participation_id = p.id
      LEFT JOIN reflections f ON f.completion_id = c.id
      LEFT JOIN receipts r ON r.completion_id = c.id
      LEFT JOIN activity_logs l ON l.participation_id = p.id
      LEFT JOIN reading_challenges rc ON rc.participation_id = p.id
      WHERE p.user_id = ? ORDER BY p.created_at DESC, p.rowid DESC
    `).all(userOf(request).id) as Array<Record<string, unknown>>;
    response.json(rows.map((row) => {
      let scenePayload: Record<string, unknown> | null = null;
      if (typeof row.scenePayloadJson === 'string') {
        try { scenePayload = JSON.parse(row.scenePayloadJson) as Record<string, unknown>; } catch { scenePayload = null; }
      }
      let readChaptersCount = 0;
      if (typeof row.rcReadChaptersJson === 'string') {
        try {
          const parsed = JSON.parse(row.rcReadChaptersJson);
          if (Array.isArray(parsed)) readChaptersCount = parsed.length;
        } catch { readChaptersCount = 0; }
      }
      const hasRc = typeof row.rcCoverageBps === 'number';
      const readingClaimed = Boolean(row.rcReadingClaimedAt);
      const reviewClaimed = Boolean(row.rcReviewClaimedAt);
      const earnedDsdemo =
        (readingClaimed ? Number(row.rcRewardReading ?? 10) : 0) +
        (reviewClaimed ? Number(row.rcRewardReview ?? 2) : 0);

      return {
        participationId: row.participationId,
        participationStatus: row.participationStatus,
        joinedAt: row.joinedAt,
        activity: { id: row.activityId, title: row.activityTitle, category: row.category, duration: row.duration, ruleVersion: row.ruleVersion },
        sceneData: scenePayload ? {
          payload: scenePayload,
          verifiedChannel: row.sceneVerifiedChannel ?? null,
          verifiedCode: row.sceneVerifiedCode ?? null,
          verifiedDigest: row.sceneVerifiedDigest ?? null,
        } : null,
        readingSummary: hasRc ? {
          readChaptersCount,
          totalChapters: 27,
          currentChapter: Number(row.rcCurrentChapter ?? 1),
          coveragePercent: Math.round(Number(row.rcCoverageBps) / 100),
          lastChapterCompleted: Number(row.rcLastChapter) === 1,
          readingClaimed,
          reviewClaimed,
          badgeTokenId: row.rcBadgeTokenId ?? null,
          readingTxHash: row.rcReadingTxHash ?? null,
          readingBlockNumber: row.rcReadingBlockNumber ?? null,
          readerWallet: row.rcReaderWallet ?? null,
          readingProofDigest: row.rcReadingProofDigest ?? null,
          readingClaimedAt: row.rcReadingClaimedAt ?? null,
          earnedDsdemo,
        } : null,
        completion: row.completionId ? {
          id: row.completionId,
          declaredAt: row.declaredAt,
          verificationType: row.verificationType,
          reflection: {
            text: row.reflectionText,
            visibility: row.visibility,
            deletedAt: row.reflectionDeletedAt,
          },
          receipt: {
            receiptId: row.receiptId,
            chainId: row.chainId,
            contractAddress: row.contractAddress,
            txHash: row.txHash,
            status: row.receiptStatus || 'not_requested',
            mode: row.receiptMode || mode,
            error: row.receiptError,
          },
        } : null,
      };
    }));
  });

  app.delete('/api/account', requireAuth, (request, response) => {
    const userId = userOf(request).id;
    const publicReceipts = store.database.prepare(`
      SELECT COUNT(*) AS count FROM receipts r JOIN completions c ON c.id = r.completion_id
      JOIN participations p ON p.id = c.participation_id
      WHERE p.user_id = ? AND r.status IN ('submitted', 'confirmed') AND r.mode != 'simulation'
    `).get(userId) as { count: number };
    receipts.cancelQueuedForUser(userId);
    store.database.exec('BEGIN IMMEDIATE');
    try {
      store.database.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
      store.database.prepare('DELETE FROM users WHERE id = ?').run(userId);
      store.database.exec('COMMIT');
    } catch (error) {
      store.database.exec('ROLLBACK');
      throw error;
    }
    response.setHeader('Set-Cookie', sessionCookie('', 0));
    response.json({
      deleted: true,
      offChainDataDeleted: true,
      publicReceiptsRemaining: publicReceipts.count,
    });
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError) {
      return response.status(400).json({ error: '提交的内容格式不正确，请检查后重试。' });
    }
    const status = typeof error === 'object' && error && 'status' in error && typeof error.status === 'number'
      ? error.status : 500;
    const message = error instanceof Error ? error.message : '服务器暂时无法处理请求。';
    response.status(status).json({ error: status === 500 ? '服务器暂时无法处理请求，请稍后重试。' : message });
  });

  return { app, store, receipts };
}
