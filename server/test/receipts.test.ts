import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { after, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { sameChainTarget } from '../src/receipts.js';
import type { Store } from '../src/db.js';
import type {
  ProviderDescriptor,
  ProviderSubmission,
  ReceiptMode,
  ReceiptProvider,
  ReceiptRow,
} from '../src/types.js';

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const created: string[] = [];

function tempDatabasePath() {
  const directory = mkdtempSync(join(tmpdir(), 'do-something-receipts-'));
  created.push(directory);
  return join(directory, 'receipts.db');
}

after(() => {
  for (const directory of created) rmSync(directory, { recursive: true, force: true });
});

async function waitFor(check: () => boolean, timeoutMs = 4000, stepMs = 20, message = '等待条件超时') {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await wait(stepMs);
  }
  throw new Error(message);
}

/** 记录调用、并发度与生命周期的假 provider，用来观察 ReceiptManager 的真实行为。 */
class RecordingProvider implements ReceiptProvider {
  calls: string[] = [];
  submitted: Array<{ receiptId: string; txHash: string }> = [];
  concurrent = 0;
  maxConcurrent = 0;
  destroyed = false;
  failRemaining = 0;
  hangMode: 'none' | 'before-submit' | 'after-submit' = 'none';
  delayMs = 20;
  private readonly descriptor: ProviderDescriptor;

  constructor(descriptor: ProviderDescriptor = { chainId: 0, contractAddress: 'local-simulation' }) {
    this.descriptor = descriptor;
  }

  describe() {
    return this.descriptor;
  }

  destroy() {
    this.destroyed = true;
  }

  async register(
    receipt: ReceiptRow,
    onSubmitted: (submission: ProviderSubmission) => void | Promise<void>,
    control?: AbortSignal,
  ) {
    // calls 记录的是凭证编号（receipt_id），断言时必须与 receipt_id 比较。
    this.calls.push(receipt.receipt_id);
    this.concurrent += 1;
    this.maxConcurrent = Math.max(this.maxConcurrent, this.concurrent);
    try {
      // 与真实 Monad provider 一致：已有交易哈希就沿用，不重复提交。
      if (receipt.tx_hash) {
        return { txHash: receipt.tx_hash, ...this.descriptor, explorerUrl: null };
      }
      if (this.hangMode === 'before-submit') await new Promise<void>(() => {});
      await wait(this.delayMs);
      if (control?.aborted) throw new Error('广播前发现任务已取消；未发送任何交易。');
      const submission = {
        txHash: `fake-tx-${this.calls.length}-${receipt.receipt_id.slice(2, 10)}`,
        ...this.descriptor,
      };
      await onSubmitted(submission);
      // submitted 是哈希的唯一来源，断言一律从这里取，避免现场重算对不上。
      this.submitted.push({ receiptId: receipt.receipt_id, txHash: submission.txHash });
      if (this.hangMode === 'after-submit') await new Promise<void>(() => {});
      await wait(this.delayMs);
      if (this.failRemaining > 0) {
        this.failRemaining -= 1;
        throw new Error('provider 故意失败');
      }
      return { ...submission, explorerUrl: null };
    } finally {
      this.concurrent -= 1;
    }
  }
}

function createGate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

/** 门闩 provider：把广播前后都停在测试可控的位置，用来观察取消与退出的真实行为。 */
class GatedProvider implements ReceiptProvider {
  calls: string[] = [];
  broadcasts = 0;
  submitted: Array<{ receiptId: string; txHash: string }> = [];
  destroyed = false;
  entered = 0;
  holdAfterSubmit = false;
  capturedOnSubmitted: ((submission: ProviderSubmission) => void | Promise<void>) | null = null;
  private readonly enterGate = createGate();
  private readonly afterGate = createGate();

  describe() {
    return { chainId: 10143, contractAddress: '0x0000000000000000000000000000000000000abc' };
  }

  async register(
    receipt: ReceiptRow,
    onSubmitted: (submission: ProviderSubmission) => void | Promise<void>,
    control?: AbortSignal,
  ) {
    this.calls.push(receipt.receipt_id);
    this.entered += 1;
    await this.enterGate.promise;
    // 最后一次 await 之后、真正广播之前，同步检查任务是否已被注销/退出夺走。
    if (control?.aborted) throw new Error('广播前发现任务已取消；未发送任何交易。');
    this.broadcasts += 1;
    const submission = {
      txHash: `gated-tx-${this.broadcasts}-${receipt.receipt_id.slice(2, 10)}`,
      ...this.describe(),
    };
    this.capturedOnSubmitted = onSubmitted;
    await onSubmitted(submission);
    this.submitted.push({ receiptId: receipt.receipt_id, txHash: submission.txHash });
    if (this.holdAfterSubmit) await this.afterGate.promise;
    return { ...submission, explorerUrl: null };
  }

  releaseEnter() {
    this.enterGate.release();
  }

  destroy() {
    this.destroyed = true;
  }
}

type Context = ReturnType<typeof createApp>;

function open(databasePath: string, mode: ReceiptMode, provider: ReceiptProvider): Context {
  return createApp({ databasePath, receiptMode: mode, receiptProvider: provider });
}

function close(context: Context) {
  context.store.close();
}

async function completedFlow(app: Context['app'], account: 'a' | 'b' = 'a', activityId = 'cooking') {
  const agent = request.agent(app);
  await agent.post('/api/session/demo').send({ account }).expect(200);
  const joined = await agent.post('/api/participations').send({ activityId });
  assert.ok([200, 201].includes(joined.status), `参与应返回 200/201，实际 ${joined.status}`);
  const completed = await agent.post(`/api/participations/${joined.body.id}/complete`)
    .send({ idempotencyKey: `receipts-key-${randomUUID()}` }).expect(201);
  return { agent, completionId: completed.body.id as string };
}

async function loginAs(app: Context['app'], account: 'a' | 'b') {
  const agent = request.agent(app);
  await agent.post('/api/session/demo').send({ account }).expect(200);
  return agent;
}

function receiptRow(store: Store, completionId: string) {
  return store.database.prepare('SELECT * FROM receipts WHERE completion_id = ?').get(completionId) as {
    receipt_id: string;
    tx_hash: string | null;
    status: string;
    mode: string;
    chain_id: number;
    contract_address: string;
    error: string | null;
  } | undefined;
}

function submittedHashOf(provider: RecordingProvider | GatedProvider, receiptId: string) {
  const found = provider.submitted.find((entry) => entry.receiptId === receiptId);
  assert.ok(found, `provider 应记录凭证 ${receiptId} 的提交哈希`);
  return found.txHash;
}

/** 启动独立子进程，用显式 PID 管理生命周期，超时即杀掉，绝不依赖 pkill。 */
function runChild(args: string[], timeoutMs = 60_000) {
  const tsx = fileURLToPath(new URL('../node_modules/.bin/tsx', import.meta.url));
  return new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(tsx, args, {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`子进程超时：${args.join(' ')}`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? -1, stdout, stderr });
    });
  });
}

function lastJsonLine(stdout: string) {
  const line = stdout.split('\n').filter((entry) => entry.trim().startsWith('{')).pop();
  assert.ok(line, `子进程应打印一行 JSON，实际输出：${stdout}`);
  return JSON.parse(line) as Record<string, unknown>;
}

describe('ReceiptManager 队列、重启与模式隔离', () => {
  it('跨进程恢复：排队后退出，重启无需再次申请即自动确认（模拟模式）', async () => {
    const databasePath = tempDatabasePath();
    const childScript = fileURLToPath(new URL('./helpers/resume-child.ts', import.meta.url));

    const queuedRun = await runChild([childScript, 'queue', databasePath]);
    assert.equal(queuedRun.exitCode, 0, `queue 子进程失败：${queuedRun.stderr}`);
    const queued = lastJsonLine(queuedRun.stdout);
    assert.equal(queued.enteredRegister, 1, 'provider 必须已进入 register，任务确实在途');
    assert.equal(queued.status, 'queued');
    assert.equal(queued.txHash, null);

    const resumedRun = await runChild([childScript, 'resume', databasePath, String(queued.completionId)]);
    assert.equal(resumedRun.exitCode, 0, `resume 子进程失败：${resumedRun.stderr}`);
    const resumed = lastJsonLine(resumedRun.stdout);
    assert.equal(resumed.status, 'confirmed', '重启后必须自动确认，而不是留在排队');
    assert.equal(resumed.receiptId, queued.receiptId, '重启后沿用同一凭证编号');
    assert.equal(resumed.registerCalls, 1, '只恢复这一条，没有重复执行');
    assert.match(String(resumed.txHash), /^simulation-/);
  });

  it('模拟模式重启自动恢复排队行，沿用同一编号确认', async () => {
    const databasePath = tempDatabasePath();
    const hanging = new RecordingProvider();
    hanging.hangMode = 'before-submit';
    const first = open(databasePath, 'simulation', hanging);
    const flow = await completedFlow(first.app);
    const queued = first.receipts.request(flow.completionId);
    assert.equal(queued.status, 'queued');
    await waitFor(() => hanging.calls.length === 1);
    await first.receipts.dispose(150);
    close(first);

    const restartedProvider = new RecordingProvider();
    const restarted = open(databasePath, 'simulation', restartedProvider);
    // 不再次 request()，只依赖 resume()。
    restarted.receipts.resume();
    await waitFor(() => receiptRow(restarted.store, flow.completionId)?.status === 'confirmed');
    const row = receiptRow(restarted.store, flow.completionId)!;
    assert.equal(row.receipt_id, queued.receipt_id);
    assert.equal(row.mode, 'simulation');
    assert.equal(restartedProvider.calls.length, 1);
    assert.equal(row.tx_hash, submittedHashOf(restartedProvider, row.receipt_id));
    close(restarted);
  });

  it('真链模式重启恢复排队与已提交行，并复用既有交易哈希', async () => {
    const databasePath = tempDatabasePath();
    const hanging = new RecordingProvider();
    hanging.hangMode = 'before-submit';
    const first = open(databasePath, 'monad-testnet', hanging);
    const flow = await completedFlow(first.app);
    const queued = first.receipts.request(flow.completionId);
    await waitFor(() => receiptRow(first.store, flow.completionId)?.status === 'queued');
    await first.receipts.dispose(150);
    close(first);

    // 第二个完成记录：交易已广播、哈希已落库，但还没有确认。
    const hangingAfterSubmit = new RecordingProvider();
    hangingAfterSubmit.hangMode = 'after-submit';
    const second = open(databasePath, 'monad-testnet', hangingAfterSubmit);
    const flowB = await completedFlow(second.app, 'b');
    second.receipts.request(flowB.completionId);
    await waitFor(() => receiptRow(second.store, flowB.completionId)?.status === 'submitted');
    const submittedHash = receiptRow(second.store, flowB.completionId)!.tx_hash;
    assert.ok(submittedHash, '交易哈希必须先落库，退出或超时都不能丢失');
    await second.receipts.dispose(150);
    close(second);

    const restartedProvider = new RecordingProvider();
    const restarted = open(databasePath, 'monad-testnet', restartedProvider);
    restarted.receipts.resume();
    await waitFor(() => {
      const queuedRow = receiptRow(restarted.store, flow.completionId);
      const submittedRow = receiptRow(restarted.store, flowB.completionId);
      return queuedRow?.status === 'confirmed' && submittedRow?.status === 'confirmed';
    });
    assert.equal(receiptRow(restarted.store, flow.completionId)!.receipt_id, queued.receipt_id);
    assert.equal(
      receiptRow(restarted.store, flowB.completionId)!.tx_hash,
      submittedHash,
      '恢复必须沿用既有哈希',
    );
    assert.deepEqual(
      [...restartedProvider.calls].sort(),
      [
        receiptRow(restarted.store, flow.completionId)!.receipt_id,
        receiptRow(restarted.store, flowB.completionId)!.receipt_id,
      ].sort(),
    );
    close(restarted);
  });

  it('模式隔离：模拟凭证不会被真链模式处理，真链凭证也不会被模拟模式处理', async () => {
    const databasePath = tempDatabasePath();
    const hanging = new RecordingProvider();
    hanging.hangMode = 'before-submit';
    const simulation = open(databasePath, 'simulation', hanging);
    const flow = await completedFlow(simulation.app);
    const simulationReceiptId = simulation.receipts.request(flow.completionId).receipt_id;
    await waitFor(() => hanging.calls.length === 1);
    await simulation.receipts.dispose(150);
    close(simulation);

    const chainProvider = new RecordingProvider();
    const chainMode = open(databasePath, 'monad-testnet', chainProvider);
    const chainAgent = await loginAs(chainMode.app, 'a');
    chainMode.receipts.resume();
    const returned = chainMode.receipts.request(flow.completionId);
    assert.equal(returned.mode, 'simulation');
    assert.equal(returned.receipt_id, simulationReceiptId);
    await wait(400);
    assert.equal(chainProvider.calls.length, 0, '模拟凭证不得转成真链交易');
    const stillQueued = await chainAgent.get(`/api/completions/${flow.completionId}/receipt`).expect(200);
    assert.equal(stillQueued.body.mode, 'simulation');
    assert.equal(stillQueued.body.status, 'queued');
    close(chainMode);

    // 反向：真链模式的排队行，在模拟模式下同样不被处理（独立数据库，避免上一段遗留行干扰）。
    const reverseDatabase = tempDatabasePath();
    const chainHanging = new RecordingProvider();
    chainHanging.hangMode = 'before-submit';
    const chainFirst = open(reverseDatabase, 'monad-testnet', chainHanging);
    const chainFlow = await completedFlow(chainFirst.app, 'b');
    chainFirst.receipts.request(chainFlow.completionId);
    await waitFor(() => receiptRow(chainFirst.store, chainFlow.completionId)?.status === 'queued');
    await chainFirst.receipts.dispose(150);
    close(chainFirst);

    const simulationProvider = new RecordingProvider();
    const simulationAgain = open(reverseDatabase, 'simulation', simulationProvider);
    simulationAgain.receipts.resume();
    simulationAgain.receipts.request(chainFlow.completionId);
    await wait(400);
    assert.equal(simulationProvider.calls.length, 0, '模拟 provider 不得处理真链凭证');
    assert.equal(receiptRow(simulationAgain.store, chainFlow.completionId)!.mode, 'monad-testnet');
    assert.equal(receiptRow(simulationAgain.store, chainFlow.completionId)!.status, 'queued');
    close(simulationAgain);
  });

  it('并发申请只产生一个在途执行，重复申请保持同一编号', async () => {
    const databasePath = tempDatabasePath();
    const provider = new RecordingProvider();
    provider.delayMs = 40;
    const context = open(databasePath, 'simulation', provider);

    const flows: Array<Awaited<ReturnType<typeof completedFlow>>> = [];
    const activities = ['cooking', 'meeting', 'reading', 'outing'];
    for (const [index, account] of (['a', 'b', 'a', 'b'] as const).entries()) {
      flows.push(await completedFlow(context.app, account, activities[index]));
    }
    assert.equal(flows.length, 4);

    const results = await Promise.all(
      flows.map((flow) => flow.agent.post(`/api/completions/${flow.completionId}/receipt`)
        .send({ acknowledged: true }).expect(201)),
    );
    assert.equal(new Set(results.map((response) => response.body.receipt_id)).size, 4);

    // 同一记录重复申请，不得生成第二个编号或第二次执行。
    const repeat = await flows[0].agent.post(`/api/completions/${flows[0].completionId}/receipt`)
      .send({ acknowledged: true }).expect(201);
    assert.equal(repeat.body.receipt_id, results[0].body.receipt_id);

    await waitFor(() =>
      flows.every((flow) => receiptRow(context.store, flow.completionId)?.status === 'confirmed'));
    assert.equal(provider.calls.length, 4, '每条完成记录只执行一次');
    assert.equal(provider.maxConcurrent, 1, '同一时刻只允许一个在途执行');

    const afterConfirmed = await flows[0].agent.post(`/api/completions/${flows[0].completionId}/receipt`)
      .send({ acknowledged: true }).expect(201);
    assert.equal(afterConfirmed.body.receipt_id, results[0].body.receipt_id);
    assert.equal(provider.calls.length, 4, '已确认后不再调用 provider');
    close(context);
  });

  it('失败后可在同模式重试，凭证编号不变', async () => {
    const databasePath = tempDatabasePath();
    const provider = new RecordingProvider();
    provider.failRemaining = 1;
    const context = open(databasePath, 'simulation', provider);
    const flow = await completedFlow(context.app);

    const first = context.receipts.request(flow.completionId);
    await waitFor(() => receiptRow(context.store, flow.completionId)?.status === 'failed');
    assert.match(receiptRow(context.store, flow.completionId)!.error!, /provider 故意失败/);

    const retried = context.receipts.request(flow.completionId);
    assert.equal(retried.receipt_id, first.receipt_id);
    assert.equal(retried.status, 'queued');
    await waitFor(() => receiptRow(context.store, flow.completionId)?.status === 'confirmed');
    assert.equal(receiptRow(context.store, flow.completionId)!.receipt_id, first.receipt_id);
    assert.equal(receiptRow(context.store, flow.completionId)!.error, null);
    assert.equal(provider.calls.length, 2);
    close(context);
  });

  it('退出 drain 期间在途哈希落库；drain 超时后晚到回调不再访问数据库', async () => {
    const databasePath = tempDatabasePath();
    const provider = new GatedProvider();
    provider.holdAfterSubmit = true;
    const context = open(databasePath, 'monad-testnet', provider);
    const flow = await completedFlow(context.app);

    context.receipts.request(flow.completionId);
    await waitFor(() => provider.entered === 1, 4000, 20, 'provider 应已进入 register');

    const failures: unknown[] = [];
    const onUnhandled = (reason: unknown) => failures.push(reason);
    process.on('unhandledRejection', onUnhandled);
    process.on('uncaughtException', onUnhandled);

    // dispose 先进入 drain（stopping=true, closed=false），再放行广播与哈希落库。
    const disposing = context.receipts.dispose(300);
    await wait(80);
    provider.releaseEnter();
    await disposing;

    const row = receiptRow(context.store, flow.completionId)!;
    assert.equal(provider.broadcasts, 1);
    assert.equal(row.status, 'submitted', 'drain 期间在途哈希必须落库');
    assert.equal(row.tx_hash, submittedHashOf(provider, row.receipt_id));
    assert.equal(row.chain_id, 10143);
    assert.equal(row.contract_address, provider.describe().contractAddress);
    assert.equal(provider.destroyed, true, '退出必须断开 provider');

    // drain 总期限已过：closed 之后任何晚到回调都不得再访问数据库。
    const logged: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => { logged.push(args.map(String).join(' ')); };
    try {
      context.store.close();
      assert.throws(() => context.store.database.prepare('SELECT 1').get(), '数据库此时应已关闭');
      assert.ok(provider.capturedOnSubmitted, 'provider 应捕获到在途回调');
      await provider.capturedOnSubmitted({
        txHash: 'late-hash',
        chainId: 10143,
        contractAddress: provider.describe().contractAddress,
      });
      await wait(120);
      assert.equal(logged.length, 0, `关闭后不应再写库：${logged.join(' | ')}`);
      assert.equal(failures.length, 0, `关闭后出现未捕获错误：${String(failures[0])}`);
    } finally {
      console.error = originalError;
      process.off('unhandledRejection', onUnhandled);
      process.off('uncaughtException', onUnhandled);
    }
  });

  it('退出时清理定时器与 provider，关闭数据库后没有回调报错', async () => {
    const databasePath = tempDatabasePath();
    const provider = new RecordingProvider();
    provider.hangMode = 'after-submit';
    const context = open(databasePath, 'monad-testnet', provider);
    const flow = await completedFlow(context.app);

    const failures: unknown[] = [];
    const onUnhandled = (reason: unknown) => failures.push(reason);
    process.on('unhandledRejection', onUnhandled);
    process.on('uncaughtException', onUnhandled);

    try {
      context.receipts.request(flow.completionId);
      await waitFor(() => receiptRow(context.store, flow.completionId)?.status === 'submitted');
      const hashAtExit = receiptRow(context.store, flow.completionId)!.tx_hash;
      assert.ok(hashAtExit, '退出前交易哈希必须已经落库');

      await context.receipts.dispose(300);
      assert.equal(provider.destroyed, true, '退出必须断开 provider');
      context.receipts.resume();
      await wait(300);
      assert.equal(provider.calls.length, 1, '退出后的管理器不得再排程');
      assert.equal(receiptRow(context.store, flow.completionId)!.status, 'submitted', '哈希保留，可下次恢复');

      context.store.close();
      await wait(400);
      assert.equal(failures.length, 0, `关闭数据库后出现回调错误：${String(failures[0])}`);
    } finally {
      process.off('unhandledRejection', onUnhandled);
      process.off('uncaughtException', onUnhandled);
    }
  });

  it('注销发生在等待广播期间：广播计数为 0，已排队任务不会继续发包', async () => {
    const databasePath = tempDatabasePath();
    const provider = new GatedProvider();
    const context = open(databasePath, 'monad-testnet', provider);
    const flow = await completedFlow(context.app);

    await flow.agent.post(`/api/completions/${flow.completionId}/receipt`)
      .send({ acknowledged: true }).expect(201);
    await waitFor(() => provider.entered === 1, 4000, 20, 'provider 应已进入 register 并停在广播前');

    // 注销先取消在途任务，再删除链下数据。
    const deleted = await flow.agent.delete('/api/account').expect(200);
    assert.equal(deleted.body.offChainDataDeleted, true);
    assert.equal(deleted.body.publicReceiptsRemaining, 0);

    provider.releaseEnter();
    await wait(250);

    assert.equal(provider.broadcasts, 0, '注销后不得广播任何交易');
    assert.equal(provider.submitted.length, 0, '注销后不得写入任何提交哈希');
    assert.equal(receiptRow(context.store, flow.completionId), undefined, '凭证行应随账户一并删除');
    close(context);
  });

  it('同模式换合约：旧凭证不投到新合约，也不改写既有字段', async () => {
    const databasePath = tempDatabasePath();
    const contractA = '0x00000000000000000000000000000000000000a1';
    const contractB = '0x00000000000000000000000000000000000000b2';

    const hanging = new RecordingProvider({ chainId: 31337, contractAddress: contractA });
    hanging.hangMode = 'before-submit';
    const first = open(databasePath, 'monad-testnet', hanging);
    const flow = await completedFlow(first.app);
    const queued = first.receipts.request(flow.completionId);
    await waitFor(() => hanging.calls.length === 1);
    await first.receipts.dispose(150);
    close(first);

    const second = new RecordingProvider({ chainId: 31337, contractAddress: contractB });
    const restarted = open(databasePath, 'monad-testnet', second);
    restarted.receipts.resume();
    restarted.receipts.request(flow.completionId);

    await waitFor(() => receiptRow(restarted.store, flow.completionId)?.status === 'failed');
    const row = receiptRow(restarted.store, flow.completionId)!;
    assert.equal(second.calls.length, 0, '不得向新合约广播旧凭证');
    assert.equal(row.receipt_id, queued.receipt_id, '凭证编号保持不变');
    assert.equal(row.chain_id, 31337, '不得改写链 ID');
    assert.equal(row.contract_address, contractA, '不得改写合约地址');
    assert.equal(row.tx_hash, null, '不得凭空写入哈希');
    assert.match(row.error!, /未发送任何交易/);
    close(restarted);
  });

  it('换合约后已广播的旧凭证被原样保留，等匹配配置再恢复', async () => {
    const databasePath = tempDatabasePath();
    const contractA = '0x00000000000000000000000000000000000000a1';
    const contractB = '0x00000000000000000000000000000000000000b2';

    const first = new RecordingProvider({ chainId: 31337, contractAddress: contractA });
    const confirmed = open(databasePath, 'monad-testnet', first);
    const flow = await completedFlow(confirmed.app);
    confirmed.receipts.request(flow.completionId);
    await waitFor(() => receiptRow(confirmed.store, flow.completionId)?.status === 'confirmed');
    const before = receiptRow(confirmed.store, flow.completionId)!;
    close(confirmed);

    const second = new RecordingProvider({ chainId: 31337, contractAddress: contractB });
    const other = open(databasePath, 'monad-testnet', second);
    other.receipts.resume();
    other.receipts.request(flow.completionId);
    await wait(400);

    assert.equal(second.calls.length, 0, '旧合约凭证不得交给新合约 provider');
    const after = receiptRow(other.store, flow.completionId)!;
    assert.equal(after.status, 'confirmed', '已确认行不受换合约影响');
    assert.equal(after.tx_hash, before.tx_hash, '不得改写交易哈希');
    assert.equal(after.contract_address, contractA, '不得改写合约地址');
    assert.equal(after.chain_id, before.chain_id, '不得改写链 ID');
    assert.equal(after.error, null, '不得给已确认行写入错误');
    close(other);
  });

  it('未登录不能申请或查看凭证', async () => {
    const databasePath = tempDatabasePath();
    const context = open(databasePath, 'simulation', new RecordingProvider());
    const flow = await completedFlow(context.app);
    await request(context.app).get(`/api/completions/${flow.completionId}/receipt`).expect(401);
    await request(context.app).post(`/api/completions/${flow.completionId}/receipt`)
      .send({ acknowledged: true }).expect(401);
    assert.equal(receiptRow(context.store, flow.completionId), undefined, '未登录不得创建凭证行');
    close(context);
  });

  it('链与合约目标比较：大小写不敏感，数值与地址都必须一致', () => {
    const descriptor = { chainId: 10143, contractAddress: '0xAbCdEf0000000000000000000000000000000000' };
    assert.equal(sameChainTarget(10143, '0xabcdef0000000000000000000000000000000000', descriptor), true);
    assert.equal(sameChainTarget(10143, descriptor.contractAddress, descriptor), true);
    assert.equal(sameChainTarget(31337, descriptor.contractAddress, descriptor), false);
    assert.equal(
      sameChainTarget(10143, '0x0000000000000000000000000000000000000001', descriptor),
      false,
    );
  });
});
