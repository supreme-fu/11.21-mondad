/**
 * 跨进程恢复验证用的辅助进程，由 receipts.test.ts 启动，不参与默认测试发现。
 *
 * 用法：tsx test/helpers/resume-child.ts <phase> <databasePath> [completionId]
 *   phase=queue  建立一条排队中的凭证后立刻退出（provider 挂在广播之前，哈希不落库）
 *   phase=resume 打开同一个数据库，只调用 resume()，等到确认后把结果打印成一行 JSON
 *
 * 两个阶段是完全独立的进程，用来证明“排队后退出 -> 重启无需再次申请即自动确认”。
 */
import request from 'supertest';
import { createApp } from '../../src/app.js';
import type { ProviderResult, ProviderSubmission, ReceiptProvider, ReceiptRow } from '../../src/types.js';

const [, , phase, databasePath, completionId] = process.argv;
if (!phase || !databasePath) {
  throw new Error('用法：resume-child.ts <queue|resume> <databasePath> [completionId]');
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const print = (payload: Record<string, unknown>) => {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
};

/** queue 阶段：进入 register 后一直挂着，模拟进程在广播前被杀掉。 */
class HangingProvider implements ReceiptProvider {
  calls: string[] = [];

  describe() {
    return { chainId: 0, contractAddress: 'local-simulation' };
  }

  async register(receipt: ReceiptRow): Promise<ProviderResult> {
    this.calls.push(receipt.receipt_id);
    await new Promise<void>(() => {});
    throw new Error('挂起的 provider 不应返回');
  }
}

/** resume 阶段：正常完成，并记录每次提交用到的哈希。 */
class WorkingProvider implements ReceiptProvider {
  calls: string[] = [];
  submitted: Array<{ receiptId: string; txHash: string }> = [];

  describe() {
    return { chainId: 0, contractAddress: 'local-simulation' };
  }

  async register(
    receipt: ReceiptRow,
    onSubmitted: (submission: ProviderSubmission) => void | Promise<void>,
  ) {
    this.calls.push(receipt.receipt_id);
    if (receipt.tx_hash) {
      return { txHash: receipt.tx_hash, ...this.describe(), explorerUrl: null };
    }
    await wait(30);
    const submission = {
      txHash: `simulation-${receipt.receipt_id.slice(2, 34)}`,
      ...this.describe(),
    };
    await onSubmitted(submission);
    this.submitted.push({ receiptId: receipt.receipt_id, txHash: submission.txHash });
    await wait(30);
    return { ...submission, explorerUrl: null };
  }
}

const provider = phase === 'queue' ? new HangingProvider() : new WorkingProvider();
const context = createApp({ databasePath, receiptMode: 'simulation', receiptProvider: provider });

if (phase === 'queue') {
  const agent = request.agent(context.app);
  await agent.post('/api/session/demo').send({ account: 'a' }).expect(200);
  const joined = await agent.post('/api/participations').send({ activityId: 'cooking' });
  assertStatus(joined.status, [200, 201]);
  const completed = await agent
    .post(`/api/participations/${joined.body.id}/complete`)
    .send({ idempotencyKey: `resume-child-${Date.now()}` })
    .expect(201);
  const id = completed.body.id as string;
  const queued = context.receipts.request(id);
  // 等 provider 真正进入 register，确保行已落库且任务确实在途。
  for (let attempt = 0; attempt < 100 && provider.calls.length === 0; attempt += 1) await wait(20);
  await context.receipts.dispose(150);
  const row = context.receipts.get(id);
  print({
    phase,
    completionId: id,
    receiptId: queued.receipt_id,
    status: row?.status ?? null,
    txHash: row?.tx_hash ?? null,
    enteredRegister: provider.calls.length,
  });
  context.store.close();
  process.exit(0);
}

if (phase === 'resume') {
  if (!completionId) throw new Error('resume 阶段需要 completionId');
  // 关键：不再调用 request()，只依赖 resume() 的自动恢复。
  context.receipts.resume();
  let row = context.receipts.get(completionId);
  for (let attempt = 0; attempt < 500 && row?.status !== 'confirmed'; attempt += 1) {
    await wait(20);
    row = context.receipts.get(completionId);
  }
  print({
    phase,
    completionId,
    receiptId: row?.receipt_id ?? null,
    status: row?.status ?? null,
    txHash: row?.tx_hash ?? null,
    registerCalls: provider.calls.length,
    submitted: (provider as WorkingProvider).submitted,
  });
  context.store.close();
  process.exit(row?.status === 'confirmed' ? 0 : 2);
}

throw new Error(`未知阶段：${phase}`);

function assertStatus(actual: number, allowed: number[]) {
  if (!allowed.includes(actual)) throw new Error(`HTTP 状态应为 ${allowed.join('/')}，实际 ${actual}`);
}
