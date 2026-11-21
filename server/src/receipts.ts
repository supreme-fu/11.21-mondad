import { randomBytes } from 'node:crypto';
import type { SQLInputValue } from 'node:sqlite';
import type { Log } from 'ethers';
import { Contract, FetchRequest, JsonRpcProvider, NonceManager, Wallet, ethers } from 'ethers';
import type { Store } from './db.js';
import type {
  ProviderDescriptor,
  ProviderResult,
  ProviderSubmission,
  ReceiptMode,
  ReceiptProvider,
  ReceiptRow,
} from './types.js';

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/** 单次 RPC 调用的超时，避免退出或失败时无限等待。 */
const RPC_TIMEOUT_MS = 30_000;
/** 交易广播后等待确认的上限；超时只标记失败，交易哈希已先落库。 */
const CONFIRM_TIMEOUT_MS = 60_000;
/** 退出时等待在途任务落地的总期限；进程级强制退出必须大于它。 */
export const DISPOSE_TIMEOUT_MS = 4_000;
/** 排队到执行的延迟，用于合并同一时间片的重复申请。 */
const SCHEDULE_DELAY_MS = 120;

const RECEIPT_ABI = [
  'function registerReceipt(bytes32 receiptId)',
  'function exists(bytes32 receiptId) view returns (bool)',
  'function submitter() view returns (address)',
];

/** ReceiptRegistered(bytes32) 的主题哈希，用于核对交易到底登记了哪个编号。 */
const RECEIPT_REGISTERED_TOPIC = ethers.id('ReceiptRegistered(bytes32)');

const isBytes32 = (value: string) => /^0x[0-9a-fA-F]{64}$/.test(value);

/** 链与合约目标必须严格一致（地址大小写不敏感），否则旧凭证不得交给当前 provider 处理。 */
export function sameChainTarget(chainId: number, contractAddress: string, descriptor: ProviderDescriptor) {
  return chainId === descriptor.chainId
    && contractAddress.toLowerCase() === descriptor.contractAddress.toLowerCase();
}

/** 交易回执里必须真的有“这个编号”的登记事件，且来自目标合约，哈希才算数。 */
function receiptEventMatches(logs: readonly Log[], receiptId: string, contractAddress: string) {
  const idTopic = receiptId.toLowerCase();
  return logs.some((log) =>
    log.address.toLowerCase() === contractAddress.toLowerCase()
    && log.topics[0]?.toLowerCase() === RECEIPT_REGISTERED_TOPIC
    && log.topics[1]?.toLowerCase() === idTopic);
}

/**
 * 节点因 nonce 相关原因拒收：交易没有进入内存池（余额不足、gas 过低等不属于此类），
 * 重置本地计数后重发一次是安全的。
 */
function isNonceRejection(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /nonce|replacement transaction underpriced/i.test(message);
}

export class SimulationReceiptProvider implements ReceiptProvider {
  describe(): ProviderDescriptor {
    return { chainId: 0, contractAddress: 'local-simulation' };
  }

  async register(
    receipt: ReceiptRow,
    onSubmitted: (submission: ProviderSubmission) => void | Promise<void>,
    control?: AbortSignal,
  ): Promise<ProviderResult> {
    await wait(60);
    if (control?.aborted) throw new Error('凭证登记已取消；未生成记录。');
    const submission = {
      txHash: `simulation-${receipt.receipt_id.slice(2, 34)}`,
      ...this.describe(),
    };
    await onSubmitted(submission);
    await wait(60);
    return { ...submission, explorerUrl: null };
  }
}

export class MonadReceiptProvider implements ReceiptProvider {
  private readonly provider: JsonRpcProvider;
  /** NonceManager 包装的签名器：本地推进 nonce；只有广播成功才 increment，未广播的失败一律 reset。 */
  private readonly signer: NonceManager | null;
  /** 只读合约：编码调用数据、查 exists/submitter；发送走签名器 + 原生广播。 */
  private readonly contract: Contract;
  private readonly walletAddress: string;
  private readonly contractAddress: string;
  private readonly chainId: number;
  private readonly explorerBaseUrl: string;
  /** 同一钱包的广播必须串行：一笔一发，避免并发请求互相踩 nonce。 */
  private sendQueue: Promise<unknown> = Promise.resolve();

  constructor(
    rpcUrl: string,
    privateKey: string,
    contractAddress: string,
    expectedChainId = 10143,
    explorerBaseUrl = 'https://testnet.monadvision.com',
  ) {
    if (!ethers.isAddress(contractAddress)) {
      throw new Error(`合约地址格式不正确：${contractAddress}`);
    }
    this.chainId = expectedChainId;
    this.explorerBaseUrl = explorerBaseUrl.replace(/\/$/, '');
    this.contractAddress = ethers.getAddress(contractAddress);
    const request = new FetchRequest(rpcUrl);
    request.timeout = RPC_TIMEOUT_MS;
    // ethers 默认缓存 250ms 的相同 RPC 响应，getTransactionCount 会在缓存里拿到旧 nonce；
    // 这里关掉响应缓存，nonce、链 ID、字节码都以远端实时结果为准。
    this.provider = new JsonRpcProvider(request, undefined, { cacheTimeout: -1 });
    let wallet: Wallet | null = null;
    try {
      if (privateKey) wallet = new Wallet(privateKey, this.provider);
    } catch {
      wallet = null;
    }
    this.signer = wallet ? new NonceManager(wallet) : null;
    this.walletAddress = wallet ? wallet.address : '';
    this.contract = new Contract(this.contractAddress, RECEIPT_ABI, this.provider);
  }

  describe(): ProviderDescriptor {
    return { chainId: this.chainId, contractAddress: this.contractAddress };
  }

  destroy() {
    this.provider.destroy();
  }

  /** 发送任何交易之前必须全部通过：远端链 ID、地址格式、合约字节码、授权提交者。 */
  private async assertReady(): Promise<void> {
    if (!this.signer || !this.walletAddress) {
      throw new Error('缺少有效的 MONAD_TESTNET_PRIVATE_KEY；未发送任何交易。');
    }
    if (!ethers.isAddress(this.contractAddress)) {
      throw new Error(`合约地址格式不正确：${this.contractAddress}`);
    }
    const remoteChainId = Number(BigInt(await this.provider.send('eth_chainId', [])));
    if (remoteChainId !== this.chainId) {
      throw new Error(`链 ID 不匹配：期望 ${this.chainId}，远端返回 ${remoteChainId}；未发送任何交易。`);
    }
    const code = await this.provider.getCode(this.contractAddress);
    if (!code || code === '0x') {
      throw new Error('合约地址在目标链上没有字节码；未发送任何交易。');
    }
    const onchainSubmitter = String(await this.contract.submitter());
    if (onchainSubmitter.toLowerCase() !== this.walletAddress.toLowerCase()) {
      throw new Error(`钱包 ${this.walletAddress} 不是合约授权提交者 ${onchainSubmitter}；未发送任何交易。`);
    }
  }

  private ensureNotCancelled(control?: AbortSignal) {
    if (control?.aborted) {
      throw new Error('凭证登记已取消（账户注销或服务退出）；未发送任何交易。');
    }
  }

  /** 本地哈希是否真的登记了这一编号：去向、状态、事件三者缺一不可。 */
  private async inspectHash(receiptId: string, txHash: string): Promise<'registered' | 'pending' | 'rejected' | 'foreign'> {
    const chainReceipt = await this.provider.getTransactionReceipt(txHash).catch(() => null);
    if (!chainReceipt) return 'pending';
    if (chainReceipt.status !== 1) return 'rejected';
    if (!chainReceipt.to || chainReceipt.to.toLowerCase() !== this.contractAddress.toLowerCase()) return 'foreign';
    if (!receiptEventMatches(chainReceipt.logs, receiptId, this.contractAddress)) return 'foreign';
    return 'registered';
  }

  /** 用事件检索真实的登记交易：本地哈希丢失或被污染时唯一可信的来源。 */
  private async findRegistrationTx(receiptId: string): Promise<string | null> {
    let latest: number;
    try {
      latest = await this.provider.getBlockNumber();
    } catch {
      return null;
    }
    // 先查全历史；RPC 限制范围时退回一个近窗口，仍查不到就返回 null。
    const windows: Array<{ fromBlock: number; toBlock: number | 'latest' }> = [
      { fromBlock: 0, toBlock: 'latest' },
      { fromBlock: Math.max(0, latest - 200_000), toBlock: 'latest' },
    ];
    for (const window of windows) {
      try {
        const logs = await this.provider.getLogs({
          address: this.contractAddress,
          topics: [RECEIPT_REGISTERED_TOPIC, receiptId.toLowerCase()],
          fromBlock: window.fromBlock,
          toBlock: window.toBlock,
        });
        if (logs.length > 0) return logs[logs.length - 1].transactionHash;
      } catch {
        // RPC 可能限制查询范围，换窗口再试。
      }
    }
    return null;
  }

  /** 链上已存在该编号时，尽量找回可验证的哈希；找不到就返回空哈希，绝不编造浏览器链接。 */
  private async recoverHash(receipt: ReceiptRow): Promise<string> {
    if (receipt.tx_hash && (await this.inspectHash(receipt.receipt_id, receipt.tx_hash)) === 'registered') {
      return receipt.tx_hash;
    }
    return (await this.findRegistrationTx(receipt.receipt_id)) ?? '';
  }

  private recovered(receipt: ReceiptRow, txHash: string): ProviderResult {
    return {
      txHash,
      chainId: this.chainId,
      contractAddress: this.contractAddress,
      explorerUrl: txHash ? `${this.explorerBaseUrl}/tx/${txHash}` : null,
    };
  }

  /** 串行广播 + 本地 nonce：同一钱包一笔一发，nonce 只在广播成功后前进。 */
  private sendRegistration(receipt: ReceiptRow, control?: AbortSignal): Promise<ProviderSubmission> {
    const attempt = this.sendQueue.then(() => {
      // 注销可能发生在排队期间：队列真正开始执行时再检查一次。
      this.ensureNotCancelled(control);
      return this.sendRegistrationOnce(receipt, control);
    });
    this.sendQueue = attempt.then(
      () => undefined,
      () => undefined,
    );
    return attempt;
  }

  /**
   * 单次发送：读 nonce / 估 gas（有网络等待）→ 本地签名（无网络）→ 同步检查取消 → 广播。
   * NonceManager 的 increment 只在广播成功之后调用：估 gas 失败、余额不足这类“明确没有广播”
   * 的失败也一律 reset 本地计数，否则后续交易会带着被跳过的 nonce 一直卡在 pending。
   */
  private async sendRegistrationOnce(receipt: ReceiptRow, control?: AbortSignal): Promise<ProviderSubmission> {
    const signer = this.signer;
    if (!signer) throw new Error('缺少有效的 MONAD_TESTNET_PRIVATE_KEY；未发送任何交易。');
    const data = this.contract.interface.encodeFunctionData('registerReceipt', [receipt.receipt_id]);
    let signed: string;
    try {
      const populated = await signer.populateTransaction({ to: this.contractAddress, data });
      signed = await signer.signTransaction(populated);
    } catch (error) {
      // 取 nonce、估 gas、签名阶段失败：交易从未离开本机，本地 nonce 作废。
      signer.reset();
      throw error;
    }
    // 签名已完毕，只剩一次网络广播：取消信号的最后一个同步检查点。
    this.ensureNotCancelled(control);
    let txHash: string;
    try {
      txHash = (await this.provider.broadcastTransaction(signed)).hash;
    } catch (error) {
      // 节点拒收（nonce 冲突、余额不足、gas 过低等）：本地 nonce 作废，绝不盲目重发。
      signer.reset();
      throw error;
    }
    // 只有真正广播成功才推进本地 nonce。
    signer.increment();
    return { txHash, chainId: this.chainId, contractAddress: this.contractAddress };
  }

  async register(
    receipt: ReceiptRow,
    onSubmitted: (submission: ProviderSubmission) => void | Promise<void>,
    control?: AbortSignal,
  ): Promise<ProviderResult> {
    if (!isBytes32(receipt.receipt_id)) {
      throw new Error('凭证编号不是 32 字节十六进制字符串。');
    }
    if (!sameChainTarget(receipt.chain_id, receipt.contract_address, this.describe())) {
      throw new Error(
        `凭证属于链 ${receipt.chain_id} 合约 ${receipt.contract_address}，当前 provider 为链 ${this.chainId} 合约 ${this.contractAddress}；未发送任何交易。`,
      );
    }
    await this.assertReady();
    this.ensureNotCancelled(control);

    if (await this.contract.exists(receipt.receipt_id)) {
      // 链上已有该编号：沿用可验证的哈希，检索不到就返回无链接的已存在状态。
      return this.recovered(receipt, await this.recoverHash(receipt));
    }

    if (receipt.tx_hash) {
      const verdict = await this.inspectHash(receipt.receipt_id, receipt.tx_hash);
      if (verdict === 'registered') return this.recovered(receipt, receipt.tx_hash);
      if (verdict === 'pending') {
        const waited = await this.provider
          .waitForTransaction(receipt.tx_hash, 1, CONFIRM_TIMEOUT_MS)
          .catch(() => null);
        if (waited && waited.status === 1 && receiptEventMatches(waited.logs, receipt.receipt_id, this.contractAddress)) {
          return this.recovered(receipt, receipt.tx_hash);
        }
        if (!waited) {
          // 哈希存在但既没确认也没被拒：保留哈希继续等，不换 nonce 重发。
          throw new Error('既有交易仍在等待确认；哈希已保留，请稍后重试，不会重复广播。');
        }
      }
      // rejected / foreign：本地哈希不可信，重新提交，凭证编号保持不变。
    }

    // 最后一次 await 之后、真正广播之前，同步确认任务没有被注销或退出夺走。
    this.ensureNotCancelled(control);
    let submission: ProviderSubmission;
    try {
      submission = await this.sendRegistration(receipt, control);
    } catch (error) {
      if (!isNonceRejection(error)) throw error;
      this.ensureNotCancelled(control);
      // nonce 被占用：先确认链上不是我们自己的交易已经登记过，再决定是否重发。
      if (await this.contract.exists(receipt.receipt_id)) {
        return this.recovered(receipt, await this.recoverHash(receipt));
      }
      submission = await this.sendRegistration(receipt, control);
    }
    await onSubmitted(submission);
    const txHash = submission.txHash;

    const chainReceipt = await this.provider.waitForTransaction(txHash, 1, CONFIRM_TIMEOUT_MS);
    if (!chainReceipt || chainReceipt.status !== 1) {
      throw new Error('测试网交易尚未确认；交易哈希已保存，可重试沿用同一凭证编号。');
    }
    if (!receiptEventMatches(chainReceipt.logs, receipt.receipt_id, this.contractAddress)) {
      throw new Error('交易已确认但未登记该凭证编号；哈希已保存，请重试。');
    }
    return this.recovered(receipt, txHash);
  }
}

export class ReceiptManager {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly inflight = new Map<string, Promise<void>>();
  /** 每条完成记录一个中止控制器：注销或关闭时触发，provider 在广播前必须检查。 */
  private readonly aborts = new Map<string, AbortController>();
  private queue: Promise<void> = Promise.resolve();
  /** 退出中：拒绝新排程、取消未开始的定时器；在途任务继续 drain，允许哈希落库。 */
  private stopping = false;
  /** drain 结束（完成或超时）：禁止任何回调再写数据库。 */
  private closed = false;

  constructor(
    private readonly store: Store,
    readonly mode: ReceiptMode,
    private readonly provider: ReceiptProvider,
  ) {}

  request(completionId: string): ReceiptRow {
    const existing = this.get(completionId);
    if (existing) {
      if (existing.status === 'confirmed') return existing;
      if (existing.mode !== this.mode) {
        // 模式隔离：模拟凭证不会转成真链交易，真链凭证也不会被模拟 provider 处理。
        console.warn(`凭证 ${completionId} 属于 ${existing.mode} 模式，当前为 ${this.mode} 模式，不重复登记。`);
        return existing;
      }
      if (existing.status === 'queued' || existing.status === 'submitted') {
        // 排队中的行按同一凭证编号继续推进，不生成新编号。
        this.schedule(completionId);
        return existing;
      }
      this.write(
        'UPDATE receipts SET status = ?, error = NULL, updated_at = ? WHERE completion_id = ?',
        'queued',
        new Date().toISOString(),
        completionId,
      );
      this.schedule(completionId);
      return this.get(completionId)!;
    }

    const descriptor = this.provider.describe();
    const timestamp = new Date().toISOString();
    const receiptId = `0x${randomBytes(32).toString('hex')}`;
    // 链与合约一律取自 provider 已校验的配置，不读环境变量快照。
    this.write(
      `INSERT INTO receipts
      (completion_id, receipt_id, chain_id, contract_address, tx_hash, status, mode, error, created_at, updated_at)
      VALUES (?, ?, ?, ?, NULL, 'queued', ?, NULL, ?, ?)`,
      completionId,
      receiptId,
      descriptor.chainId,
      descriptor.contractAddress,
      this.mode,
      timestamp,
      timestamp,
    );
    this.schedule(completionId);
    return this.get(completionId)!;
  }

  get(completionId: string): ReceiptRow | undefined {
    return this.store.database.prepare('SELECT * FROM receipts WHERE completion_id = ?')
      .get(completionId) as ReceiptRow | undefined;
  }

  cancelQueuedForUser(userId: string) {
    const rows = this.store.database.prepare(`
      SELECT r.completion_id FROM receipts r
      JOIN completions c ON c.id = r.completion_id
      JOIN participations p ON p.id = c.participation_id
      WHERE p.user_id = ? AND r.status IN ('queued', 'submitted')
    `).all(userId) as Array<{ completion_id: string }>;
    for (const row of rows) {
      // 取消未开始的定时器；已在途的任务通过中止信号阻止广播，不能只从 inflight 里删掉。
      const timer = this.timers.get(row.completion_id);
      if (timer) clearTimeout(timer);
      this.timers.delete(row.completion_id);
      this.aborts.get(row.completion_id)?.abort();
    }
  }

  /** 重启恢复：两种模式都自动恢复，只恢复 mode 与链/合约都与当前 provider 匹配的行。 */
  resume() {
    if (this.closed) return;
    const descriptor = this.provider.describe();
    const rows = this.store.database.prepare(
      "SELECT completion_id, chain_id, contract_address FROM receipts WHERE status IN ('queued', 'submitted') AND mode = ?",
    ).all(this.mode) as Array<{ completion_id: string; chain_id: number; contract_address: string }>;
    for (const row of rows) {
      if (!sameChainTarget(row.chain_id, row.contract_address, descriptor)) {
        console.warn(
          `凭证 ${row.completion_id} 属于链 ${row.chain_id} 合约 ${row.contract_address}，当前 provider 为链 ${descriptor.chainId} 合约 ${descriptor.contractAddress}，跳过恢复。`,
        );
        continue;
      }
      this.schedule(row.completion_id);
    }
  }

  /** 退出：停掉定时器、等待在途任务落地、断开 provider，避免数据库关闭后回调报错。 */
  async dispose(timeoutMs = DISPOSE_TIMEOUT_MS) {
    if (this.closed) return;
    this.stopping = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    const pending = [...this.inflight.values()];
    if (pending.length > 0) {
      // drain 期间 closed 仍为 false：在途回调可以把交易哈希写进数据库。
      await Promise.race([Promise.allSettled(pending), wait(timeoutMs)]);
    }
    // 总期限到了：此后任何晚到回调都不得再访问数据库，同时中止仍在途的广播尝试。
    this.closed = true;
    for (const controller of this.aborts.values()) controller.abort();
    this.aborts.clear();
    this.inflight.clear();
    this.provider.destroy?.();
  }

  private schedule(completionId: string) {
    if (this.stopping || this.closed) return;
    if (this.timers.has(completionId) || this.inflight.has(completionId)) return;
    if (!this.aborts.has(completionId)) this.aborts.set(completionId, new AbortController());
    const timer = setTimeout(() => {
      this.timers.delete(completionId);
      this.enqueue(completionId);
    }, SCHEDULE_DELAY_MS);
    this.timers.set(completionId, timer);
  }

  /** 同一完成记录同时只允许一次在途执行；全局串行避免同一钱包并发发包撞 nonce。 */
  private enqueue(completionId: string) {
    if (this.stopping || this.closed || this.inflight.has(completionId)) return;
    if (!this.aborts.has(completionId)) this.aborts.set(completionId, new AbortController());
    const task = this.queue.then(() => this.process(completionId));
    const tracked = task.finally(() => {
      this.inflight.delete(completionId);
      this.aborts.delete(completionId);
    });
    this.inflight.set(completionId, tracked);
    this.queue = tracked.then(
      () => undefined,
      () => undefined,
    );
  }

  /** 关闭或数据库异常时静默跳过写入，绝不把异常抛进已退出的进程。 */
  private write(sql: string, ...params: SQLInputValue[]) {
    if (this.closed) return;
    try {
      this.store.database.prepare(sql).run(...params);
    } catch (error) {
      if (this.closed) return;
      console.error('凭证状态写入失败：', error instanceof Error ? error.message : error);
    }
  }

  private async process(completionId: string) {
    if (this.closed) return;
    const receipt = this.get(completionId);
    if (!receipt || receipt.mode !== this.mode) return;

    // 链与合约必须与当前 provider 严格匹配：不把旧凭证投到新合约，也不改写既有字段。
    const descriptor = this.provider.describe();
    if (!sameChainTarget(receipt.chain_id, receipt.contract_address, descriptor)) {
      const reason = `凭证属于链 ${receipt.chain_id} 合约 ${receipt.contract_address}，当前为链 ${descriptor.chainId} 合约 ${descriptor.contractAddress}`;
      if (receipt.tx_hash) {
        // 已有哈希却无法在当前配置下核验：原样保留，等匹配的配置再恢复。
        console.warn(`${reason}；保留既有哈希，不广播、不改写。`);
      } else {
        this.write(
          'UPDATE receipts SET status = ?, error = ?, updated_at = ? WHERE completion_id = ?',
          'failed',
          `${reason}；未发送任何交易。`,
          new Date().toISOString(),
          completionId,
        );
      }
      return;
    }

    const owner = this.store.database.prepare(`
      SELECT u.status FROM completions c
      JOIN participations p ON p.id = c.participation_id
      JOIN users u ON u.id = p.user_id
      WHERE c.id = ?
    `).get(completionId) as { status: string } | undefined;
    if (owner?.status !== 'active') return;

    const controller = this.aborts.get(completionId);
    try {
      const result = await this.provider.register(receipt, async (submission) => {
        this.write(
          `UPDATE receipts SET status = 'submitted', tx_hash = ?, chain_id = ?, contract_address = ?, updated_at = ?
          WHERE completion_id = ?`,
          submission.txHash,
          submission.chainId,
          submission.contractAddress,
          new Date().toISOString(),
          completionId,
        );
      }, controller?.signal);
      this.write(
        `UPDATE receipts SET status = 'confirmed', tx_hash = ?, chain_id = ?, contract_address = ?, error = NULL, updated_at = ?
        WHERE completion_id = ?`,
        result.txHash || null,
        result.chainId,
        result.contractAddress,
        new Date().toISOString(),
        completionId,
      );
    } catch (error) {
      // 已取消或已关闭：保持原状交给下次匹配配置恢复，不写失败、不访问数据库。
      if (controller?.signal.aborted || this.closed) return;
      const message = error instanceof Error ? error.message.slice(0, 180) : '凭证登记暂时失败。';
      this.write(
        'UPDATE receipts SET status = ?, error = ?, updated_at = ? WHERE completion_id = ?',
        'failed',
        message,
        new Date().toISOString(),
        completionId,
      );
    }
  }
}
