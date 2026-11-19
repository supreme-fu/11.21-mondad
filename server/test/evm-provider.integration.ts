import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';
import type { HDNodeWallet, InterfaceAbi } from 'ethers';
import { Contract, ContractFactory, JsonRpcProvider, Wallet, ethers } from 'ethers';
import { MonadReceiptProvider } from '../src/receipts.js';
import { createApp } from '../src/app.js';
import type { ReceiptRow } from '../src/types.js';

const ABI = [
  'function registerReceipt(bytes32 receiptId)',
  'function exists(bytes32 receiptId) view returns (bool)',
  'function submitter() view returns (address)',
];

/** 本地 Hardhat EVM 的链 ID；真实 Monad 测试网是 10143，由 provider 显式校验。 */
const CHAIN_ID = 31337;
const EXPLORER = 'http://local-evm';
/** ReceiptRegistered(bytes32) 的主题哈希。 */
const RECEIPT_REGISTERED_TOPIC = ethers.id('ReceiptRegistered(bytes32)');

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(check: () => boolean, message = '等待条件超时', timeoutMs = 30_000, stepMs = 50) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await wait(stepMs);
  }
  throw new Error(message);
}

interface Fixture {
  submitter: HDNodeWallet;
  contractAddress: string;
}

describe('ReceiptProvider 本地 EVM 联调', () => {
  const created: string[] = [];
  let rpcUrl: string;
  let provider: JsonRpcProvider;
  let artifact: { abi: InterfaceAbi; bytecode: string };

  function tempDatabasePath() {
    const directory = mkdtempSync(join(tmpdir(), 'do-something-evm-'));
    created.push(directory);
    return join(directory, 'evm.db');
  }

  function adapter(privateKey: string, expectedChainId = CHAIN_ID, address: string) {
    return new MonadReceiptProvider(rpcUrl, privateKey, address, expectedChainId, EXPLORER);
  }

  function receiptRow(databasePath: string, completionId: string) {
    const database = new DatabaseSync(databasePath);
    try {
      return database.prepare('SELECT * FROM receipts WHERE completion_id = ?').get(completionId) as {
        receipt_id: string;
        tx_hash: string | null;
        status: string;
        mode: string;
        chain_id: number;
        contract_address: string;
        error: string | null;
      } | undefined;
    } finally {
      database.close();
    }
  }

  function row(overrides: Partial<ReceiptRow> & { receipt_id: string }): ReceiptRow {
    return {
      completion_id: 'local-evm-completion',
      chain_id: CHAIN_ID,
      contract_address: '',
      tx_hash: null,
      status: 'queued',
      mode: 'monad-testnet',
      error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    };
  }

  /** 交易回执必须来自目标合约、状态成功，并且真的登记了指定编号；顺带返回交易 nonce。 */
  async function assertRegistration(txHash: string, receiptId: string, contractAddress: string) {
    const chainReceipt = await provider.getTransactionReceipt(txHash);
    assert.ok(chainReceipt, `应读到交易 ${txHash} 的回执`);
    assert.equal(chainReceipt.status, 1, '交易必须成功');
    const transaction = await provider.getTransaction(txHash);
    assert.ok(transaction, `应读到交易 ${txHash} 本身`);
    assert.equal(
      chainReceipt.to?.toLowerCase(),
      contractAddress.toLowerCase(),
      '交易必须发往目标合约',
    );
    const registered = chainReceipt.logs.some((log) =>
      log.address.toLowerCase() === contractAddress.toLowerCase()
      && log.topics[0]?.toLowerCase() === RECEIPT_REGISTERED_TOPIC
      && log.topics[1]?.toLowerCase() === receiptId.toLowerCase());
    assert.ok(registered, `交易 ${txHash} 必须登记编号 ${receiptId}`);
    return { nonce: transaction.nonce };
  }

  async function completedFlow(app: ReturnType<typeof createApp>['app'], account: 'a' | 'b' = 'a', activityId = 'cooking') {
    const agent = request.agent(app);
    await agent.post('/api/session/demo').send({ account }).expect(200);
    const joined = await agent.post('/api/participations').send({ activityId });
    assert.ok([200, 201].includes(joined.status), `参与应返回 200/201，实际 ${joined.status}`);
    const completed = await agent.post(`/api/participations/${joined.body.id}/complete`)
      .send({ idempotencyKey: `evm-key-${randomBytes(8).toString('hex')}` }).expect(201);
    return { agent, completionId: completed.body.id as string };
  }

  /** 每个场景一套独立的提交账户与合约，避免相互干扰；nonce 由 provider 自己管理，不靠 sleep。 */
  async function freshFixture(): Promise<Fixture> {
    const funder = await provider.getSigner(0);
    const funderAddress = await funder.getAddress();
    const submitter = Wallet.createRandom().connect(provider);
    await (await funder.sendTransaction({ to: submitter.address, value: ethers.parseEther('20') })).wait();
    const factory = new ContractFactory(artifact.abi, artifact.bytecode, submitter);
    const contract = await factory.deploy(submitter.address);
    await contract.waitForDeployment();
    return { submitter, contractAddress: await contract.getAddress() };
  }

  before(async () => {
    const configuredRpcUrl = process.env.LOCAL_EVM_RPC_URL;
    assert.ok(configuredRpcUrl, '需要 LOCAL_EVM_RPC_URL（由 scripts/test-evm-provider.mjs 注入）');
    rpcUrl = configuredRpcUrl;
    // 关掉 ethers 默认的 250ms 响应缓存：否则同一 provider 上连发的两笔交易会拿到同一个旧 nonce。
    provider = new JsonRpcProvider(rpcUrl, undefined, { cacheTimeout: -1 });
    artifact = JSON.parse(readFileSync(
      new URL('../../contracts/artifacts/contracts/CompletionReceipt.sol/CompletionReceipt.json', import.meta.url),
      'utf8',
    ));
  });

  after(() => {
    for (const directory of created) rmSync(directory, { recursive: true, force: true });
  });

  it('真实部署合约、提交交易、确认并按既有哈希恢复', async () => {
    const { submitter, contractAddress } = await freshFixture();
    const contract = new Contract(contractAddress, ABI, submitter);
    const receiptId = `0x${randomBytes(32).toString('hex')}`;

    let submittedHash = '';
    const result = await adapter(submitter.privateKey, CHAIN_ID, contractAddress)
      .register(row({ receipt_id: receiptId, contract_address: contractAddress }), async ({ txHash }) => {
        submittedHash = txHash;
      });
    assert.match(result.txHash, /^0x[0-9a-f]{64}$/);
    assert.equal(result.txHash, submittedHash);
    assert.equal(result.chainId, CHAIN_ID);
    assert.equal(result.contractAddress, contractAddress);
    assert.equal(result.explorerUrl, `${EXPLORER}/tx/${result.txHash}`);
    await assertRegistration(result.txHash, receiptId, contractAddress);
    assert.equal(await contract.exists(receiptId), true);

    let duplicateSubmission = false;
    const recovered = await adapter(submitter.privateKey, CHAIN_ID, contractAddress)
      .register(
        row({ receipt_id: receiptId, contract_address: contractAddress, tx_hash: result.txHash, status: 'submitted' }),
        async () => { duplicateSubmission = true; },
      );
    assert.equal(recovered.txHash, result.txHash);
    assert.equal(recovered.explorerUrl, `${EXPLORER}/tx/${result.txHash}`);
    assert.equal(duplicateSubmission, false);
  });

  it('本地哈希被污染时按事件找回真实交易，不制造假浏览器链接', async () => {
    const { submitter, contractAddress } = await freshFixture();
    const contract = new Contract(contractAddress, ABI, submitter);
    const receiptId = `0x${randomBytes(32).toString('hex')}`;
    const realTx = await (await contract.registerReceipt(receiptId)).wait();

    // 一个格式合法、但登记的是另一个编号的哈希：不能被当成这个凭证的链接。
    const otherId = `0x${randomBytes(32).toString('hex')}`;
    const otherTx = await (await contract.registerReceipt(otherId)).wait();
    assert.ok(realTx && otherTx);
    const nonceBefore = await provider.getTransactionCount(submitter.address);

    let broadcasts = 0;
    const recovered = await adapter(submitter.privateKey, CHAIN_ID, contractAddress).register(
      row({ receipt_id: receiptId, contract_address: contractAddress, tx_hash: otherTx.hash, status: 'submitted' }),
      async () => { broadcasts += 1; },
    );

    assert.equal(broadcasts, 0, '不得重复广播');
    assert.equal(recovered.txHash, realTx.hash, '必须按事件找回真实交易');
    assert.notEqual(recovered.txHash, otherTx.hash, '不得把无关哈希当成这个凭证的链接');
    assert.equal(recovered.explorerUrl, `${EXPLORER}/tx/${realTx.hash}`);
    assert.equal(
      await provider.getTransactionCount(submitter.address),
      nonceBefore,
      '不得重复广播交易',
    );
  });

  it('RPC 无法检索日志时，返回无链接的已存在状态，不编造哈希', async () => {
    const { submitter, contractAddress } = await freshFixture();
    const contract = new Contract(contractAddress, ABI, submitter);
    const receiptId = `0x${randomBytes(32).toString('hex')}`;
    await (await contract.registerReceipt(receiptId)).wait();
    const nonceBefore = await provider.getTransactionCount(submitter.address);

    const providerUnderTest = adapter(submitter.privateKey, CHAIN_ID, contractAddress);
    // 模拟只能回答 exists、检索不了日志的 RPC。
    const inner = (providerUnderTest as unknown as { provider: JsonRpcProvider }).provider;
    inner.getLogs = async () => { throw new Error('query exceeds block range'); };

    let broadcasts = 0;
    const recovered = await providerUnderTest.register(
      row({ receipt_id: receiptId, contract_address: contractAddress }),
      async () => { broadcasts += 1; },
    );

    assert.equal(broadcasts, 0, '不得重复广播');
    assert.equal(recovered.txHash, '', '检索不到真实交易时必须返回空哈希');
    assert.equal(recovered.explorerUrl, null, '不得给出任何浏览器链接');
    assert.equal(await provider.getTransactionCount(submitter.address), nonceBefore, '不得重复广播交易');
  });

  it('错误链、非授权提交者、无字节码地址与缺失私钥都不发送交易', async () => {
    const { submitter, contractAddress } = await freshFixture();
    const receiptId = `0x${randomBytes(32).toString('hex')}`;
    const contract = new Contract(contractAddress, ABI, submitter);
    const nonceBefore = await provider.getTransactionCount(submitter.address);

    // 远端链 ID 与期望不符：直接拒绝，不发送（凭证行与 provider 期望一致，才能测到远端核对）。
    await assert.rejects(
      () => adapter(submitter.privateKey, 10143, contractAddress)
        .register(row({ receipt_id: receiptId, contract_address: contractAddress, chain_id: 10143 }), async () => {}),
      /链 ID 不匹配/,
    );
    // 非授权钱包：提交者校验失败，不发送。
    const stranger = Wallet.createRandom();
    await assert.rejects(
      () => adapter(stranger.privateKey, CHAIN_ID, contractAddress)
        .register(row({ receipt_id: receiptId, contract_address: contractAddress }), async () => {}),
      /不是合约授权提交者/,
    );
    // 合约地址在该链上没有字节码。
    const emptyAddress = Wallet.createRandom().address;
    await assert.rejects(
      () => adapter(submitter.privateKey, CHAIN_ID, emptyAddress)
        .register(row({ receipt_id: receiptId, contract_address: emptyAddress }), async () => {}),
      /没有字节码/,
    );
    // 地址格式错误在构造时就能发现。
    assert.throws(() => adapter(submitter.privateKey, CHAIN_ID, 'not-an-address'), /合约地址格式不正确/);
    // 缺少私钥时不发送，并给出可读原因。
    await assert.rejects(
      () => adapter('', CHAIN_ID, contractAddress)
        .register(row({ receipt_id: receiptId, contract_address: contractAddress }), async () => {}),
      /MONAD_TESTNET_PRIVATE_KEY/,
    );
    // 凭证行指向别的合约：严格拒绝，不发送，也不改写字段。
    const { contractAddress: otherContract } = await freshFixture();
    await assert.rejects(
      () => adapter(submitter.privateKey, CHAIN_ID, contractAddress)
        .register(row({ receipt_id: receiptId, contract_address: otherContract }), async () => {}),
      /未发送任何交易/,
    );
    // 凭证行指向别的链：同样严格拒绝。
    await assert.rejects(
      () => adapter(submitter.privateKey, CHAIN_ID, contractAddress)
        .register(row({ receipt_id: receiptId, contract_address: contractAddress, chain_id: 9999 }), async () => {}),
      /未发送任何交易/,
    );

    assert.equal(await provider.getTransactionCount(submitter.address), nonceBefore, '负例一律不得广播交易');
    assert.equal(await contract.exists(receiptId), false);
  });

  it('同一 provider 连续提交两个不同凭证，都确认且 nonce 连续', async () => {
    const { submitter, contractAddress } = await freshFixture();
    const providerUnderTest = adapter(submitter.privateKey, CHAIN_ID, contractAddress);
    const contract = new Contract(contractAddress, ABI, submitter);
    const firstId = `0x${randomBytes(32).toString('hex')}`;
    const secondId = `0x${randomBytes(32).toString('hex')}`;

    const first = await providerUnderTest.register(
      row({ receipt_id: firstId, contract_address: contractAddress }),
      async () => {},
    );
    const second = await providerUnderTest.register(
      row({ receipt_id: secondId, contract_address: contractAddress }),
      async () => {},
    );

    assert.notEqual(first.txHash, second.txHash);
    const firstTx = await assertRegistration(first.txHash, firstId, contractAddress);
    const secondTx = await assertRegistration(second.txHash, secondId, contractAddress);
    assert.equal(secondTx.nonce, firstTx.nonce + 1, '同一 provider 的 nonce 必须连续');
    assert.equal(await contract.exists(firstId), true);
    assert.equal(await contract.exists(secondId), true);

    // 同一 provider 再恢复第一条：不得重复广播，沿用第一条哈希。
    const nonceBefore = await provider.getTransactionCount(submitter.address);
    const again = await providerUnderTest.register(
      row({ receipt_id: firstId, contract_address: contractAddress, tx_hash: first.txHash, status: 'submitted' }),
      async () => { throw new Error('不应再次提交'); },
    );
    assert.equal(again.txHash, first.txHash);
    assert.equal(await provider.getTransactionCount(submitter.address), nonceBefore, '不得重复广播');
  });

  it('两个并发申请最终都正确确认，哈希与编号不错配', async () => {
    const { submitter, contractAddress } = await freshFixture();
    const databasePath = tempDatabasePath();
    const first = createApp({
      databasePath,
      receiptMode: 'monad-testnet',
      receiptProvider: adapter(submitter.privateKey, CHAIN_ID, contractAddress),
    });
    const flowA = await completedFlow(first.app, 'a', 'cooking');
    const flowB = await completedFlow(first.app, 'b', 'meeting');

    await Promise.all([
      flowA.agent.post(`/api/completions/${flowA.completionId}/receipt`)
        .send({ acknowledged: true }).expect(201),
      flowB.agent.post(`/api/completions/${flowB.completionId}/receipt`)
        .send({ acknowledged: true }).expect(201),
    ]);

    await waitFor(() => {
      const a = receiptRow(databasePath, flowA.completionId);
      const b = receiptRow(databasePath, flowB.completionId);
      return a?.status === 'confirmed' && b?.status === 'confirmed';
    });

    const rowA = receiptRow(databasePath, flowA.completionId)!;
    const rowB = receiptRow(databasePath, flowB.completionId)!;
    assert.notEqual(rowA.tx_hash, rowB.tx_hash, '两条凭证必须各有自己的交易');
    await assertRegistration(rowA.tx_hash!, rowA.receipt_id, contractAddress);
    await assertRegistration(rowB.tx_hash!, rowB.receipt_id, contractAddress);
    assert.equal(rowA.chain_id, CHAIN_ID);
    assert.equal(rowA.contract_address, contractAddress);
    assert.equal(rowB.contract_address, contractAddress);
    assert.equal(rowA.error, null);
    assert.equal(rowB.error, null);
    first.store.close();
  });

  it('钱包在别处先广播过交易，provider 仍以正确 nonce 提交', async () => {
    const { submitter, contractAddress } = await freshFixture();
    const contract = new Contract(contractAddress, ABI, submitter);
    // 别处（例如运维脚本）先用同一把钥匙广播了一笔交易。
    const externalId = `0x${randomBytes(32).toString('hex')}`;
    const externalSubmission = await contract.registerReceipt(externalId);
    const externalReceipt = await externalSubmission.wait();
    assert.ok(externalReceipt && externalReceipt.status === 1, '别处那笔交易应先确认');

    const providerUnderTest = adapter(submitter.privateKey, CHAIN_ID, contractAddress);
    const receiptId = `0x${randomBytes(32).toString('hex')}`;
    const result = await providerUnderTest.register(
      row({ receipt_id: receiptId, contract_address: contractAddress }),
      async () => {},
    );

    const submitted = await assertRegistration(result.txHash, receiptId, contractAddress);
    assert.equal(
      submitted.nonce,
      externalSubmission.nonce + 1,
      '必须在别处那笔交易之后使用下一个 nonce',
    );
    assert.equal(await contract.exists(receiptId), true);
  });

  it('真实发送管线中账户被注销：广播前的同步检查生效，一笔都不广播', async () => {
    const { submitter, contractAddress } = await freshFixture();
    const databasePath = tempDatabasePath();
    const providerUnderTest = adapter(submitter.privateKey, CHAIN_ID, contractAddress);
    const app = createApp({
      databasePath,
      receiptMode: 'monad-testnet',
      receiptProvider: providerUnderTest,
    });
    const flow = await completedFlow(app.app);
    // 夹具部署合约已经用掉一个 nonce，这里只记录基线。
    const nonceBefore = await provider.getTransactionCount(submitter.address);
    assert.ok(nonceBefore >= 1, '部署合约应已消耗一个 nonce');

    // 在真实发送管线的网络等待（估 gas）上加闸门，并统计真正的广播次数。
    const inner = (providerUnderTest as unknown as { provider: JsonRpcProvider }).provider;
    let broadcasts = 0;
    const realBroadcast = inner.broadcastTransaction.bind(inner);
    inner.broadcastTransaction = async (signedTransaction: string) => {
      broadcasts += 1;
      return realBroadcast(signedTransaction);
    };
    let gateEntered = false;
    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
    const realEstimateGas = inner.estimateGas.bind(inner);
    inner.estimateGas = async (transaction: Parameters<typeof realEstimateGas>[0]) => {
      gateEntered = true;
      await gate;
      return realEstimateGas(transaction);
    };

    await flow.agent.post(`/api/completions/${flow.completionId}/receipt`)
      .send({ acknowledged: true }).expect(201);
    await waitFor(() => gateEntered, 'provider 应进入真实发送管线并卡在估 gas');
    const cancelled = receiptRow(databasePath, flow.completionId)!;
    assert.equal(cancelled.status, 'queued');
    assert.equal(cancelled.tx_hash, null);

    // 任务在途时注销账户：取消信号必须在广播前生效。
    const deleted = await flow.agent.delete('/api/account').expect(200);
    assert.equal(deleted.body.deleted, true);
    releaseGate();
    // 闸门放开后管线只剩本地签名与一次同步检查：给它足够时间走完，仍然不得广播。
    await wait(600);
    assert.equal(broadcasts, 0, '闸门放开后不得补播');

    // provider 必须仍然可用：另一个账户的凭证正常确认，说明发送队列没有被拖死。
    const other = await completedFlow(app.app, 'b', 'meeting');
    await other.agent.post(`/api/completions/${other.completionId}/receipt`)
      .send({ acknowledged: true }).expect(201);
    await waitFor(() => receiptRow(databasePath, other.completionId)?.status === 'confirmed');

    assert.equal(broadcasts, 1, '只有第二个账户的那一笔；注销掉的那笔一次都没广播');
    assert.equal(
      await provider.getTransactionCount(submitter.address),
      nonceBefore + 1,
      '被注销的任务不得消耗任何 nonce',
    );
    assert.equal(
      await new Contract(contractAddress, ABI, submitter).exists(cancelled.receipt_id),
      false,
      '被注销的凭证编号不得出现在链上',
    );
    const confirmed = receiptRow(databasePath, other.completionId)!;
    await assertRegistration(confirmed.tx_hash!, confirmed.receipt_id, contractAddress);
    app.store.close();
  });

  it('nonce 被别处占用而拒收，且链上已有该编号：沿用真实交易，不盲目重发', async () => {
    const { submitter, contractAddress } = await freshFixture();
    const contract = new Contract(contractAddress, ABI, submitter);
    const receiptId = `0x${randomBytes(32).toString('hex')}`;
    const providerUnderTest = adapter(submitter.privateKey, CHAIN_ID, contractAddress);
    const inner = (providerUnderTest as unknown as { provider: JsonRpcProvider }).provider;

    // 闸门卡在“估 gas 之后、签名广播之前”：这期间别处用同一把钥匙登记了同一个编号。
    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
    let gateEntered = false;
    const realGetFeeData = inner.getFeeData.bind(inner);
    inner.getFeeData = async () => {
      if (!gateEntered) {
        gateEntered = true;
        await gate;
      }
      return realGetFeeData();
    };

    const pending = providerUnderTest.register(
      row({ receipt_id: receiptId, contract_address: contractAddress }),
      async () => { throw new Error('这一笔不该被当成新提交'); },
    );
    await waitFor(() => gateEntered, 'provider 应卡在估 gas 之后');
    const external = await (await contract.registerReceipt(receiptId)).wait();
    assert.ok(external && external.status === 1);
    const nonceBefore = await provider.getTransactionCount(submitter.address);
    releaseGate();

    const result = await pending;
    assert.equal(result.txHash, external.hash, '必须沿用别处那笔真实交易，而不是重发');
    assert.equal(result.explorerUrl, `${EXPLORER}/tx/${external.hash}`);
    assert.equal(
      await provider.getTransactionCount(submitter.address),
      nonceBefore,
      '不得产生第二笔交易',
    );
    assert.equal(await contract.exists(receiptId), true);
  });

  it('nonce 被别处占用而拒收：重置本地计数后重发，nonce 与编号都正确', async () => {
    const { submitter, contractAddress } = await freshFixture();
    const contract = new Contract(contractAddress, ABI, submitter);
    const receiptId = `0x${randomBytes(32).toString('hex')}`;
    const otherId = `0x${randomBytes(32).toString('hex')}`;
    const providerUnderTest = adapter(submitter.privateKey, CHAIN_ID, contractAddress);
    const inner = (providerUnderTest as unknown as { provider: JsonRpcProvider }).provider;
    let submissions = 0;

    // 同一个闸门位置，但别处登记的是另一个编号：nonce 被占、本编号仍未登记。
    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
    let gateEntered = false;
    const realGetFeeData = inner.getFeeData.bind(inner);
    inner.getFeeData = async () => {
      if (!gateEntered) {
        gateEntered = true;
        await gate;
      }
      return realGetFeeData();
    };

    const pending = providerUnderTest.register(
      row({ receipt_id: receiptId, contract_address: contractAddress }),
      async () => { submissions += 1; },
    );
    await waitFor(() => gateEntered, 'provider 应卡在估 gas 之后');
    const external = await (await contract.registerReceipt(otherId)).wait();
    assert.ok(external && external.status === 1);
    const externalNonce = await provider.getTransaction(external.hash).then((tx) => tx!.nonce);
    releaseGate();

    const result = await pending;
    assert.equal(submissions, 1, '重发只应产生一次提交回调');
    const submitted = await assertRegistration(result.txHash, receiptId, contractAddress);
    assert.notEqual(result.txHash, external.hash, '必须是本 provider 自己那笔交易');
    assert.equal(submitted.nonce, externalNonce + 1, '重发必须使用被占用的下一个 nonce');
    assert.equal(await contract.exists(receiptId), true);
    assert.equal(await contract.exists(otherId), true);
  });

  it('同一 provider：明确未广播的失败不占用 nonce，恢复后同编号提交成功', async () => {
    const { submitter, contractAddress } = await freshFixture();
    const contract = new Contract(contractAddress, ABI, submitter);
    const receiptId = `0x${randomBytes(32).toString('hex')}`;
    const providerUnderTest = adapter(submitter.privateKey, CHAIN_ID, contractAddress);
    // 夹具部署合约已经消耗一个 nonce，作为基线。
    const nonceBefore = await provider.getTransactionCount(submitter.address);

    // 余额清零：估 gas / 广播都会以“明确没有广播”的原因失败。
    await provider.send('hardhat_setBalance', [submitter.address, '0x0']);
    const failure = await providerUnderTest.register(
      row({ receipt_id: receiptId, contract_address: contractAddress }),
      async () => { throw new Error('失败的尝试不应产生提交'); },
    ).then(() => null, (error: unknown) => error);
    assert.ok(failure, '余额为零时必须失败');
    // 失败必须来自明确的“没有广播”原因（节点拒收：余额不足），而不是 nonce 冲突。
    assert.match(String((failure as Error).message), /doesn't have enough funds|insufficient funds/i);
    assert.doesNotMatch(String((failure as Error).message), /nonce/i);
    assert.doesNotMatch(
      String((failure as Error).message),
      /nonce/i,
      '失败原因必须是未广播类，而不是 nonce 冲突',
    );
    assert.equal(
      await provider.getTransactionCount(submitter.address),
      nonceBefore,
      '未广播的失败不得消耗链上 nonce',
    );
    assert.equal(await contract.exists(receiptId), false);

    // 恢复余额，用同一个 provider 实例再提交：nonce 必须接着基线走，不能跳。
    await provider.send('hardhat_setBalance', [submitter.address, `0x${ethers.parseEther('20').toString(16)}`]);
    const result = await providerUnderTest.register(
      row({ receipt_id: receiptId, contract_address: contractAddress }),
      async () => {},
    );
    const submitted = await assertRegistration(result.txHash, receiptId, contractAddress);
    assert.equal(submitted.nonce, nonceBefore, '未广播的失败不得让本地 nonce 前进');
    assert.equal(await contract.exists(receiptId), true);
  });

  it('API 全流程：完成、申请、确认，重启后按既有哈希恢复', async () => {
    const { submitter, contractAddress } = await freshFixture();
    const databasePath = tempDatabasePath();
    const first = createApp({
      databasePath,
      receiptMode: 'monad-testnet',
      receiptProvider: adapter(submitter.privateKey, CHAIN_ID, contractAddress),
    });
    const flow = await completedFlow(first.app);
    const requested = await flow.agent.post(`/api/completions/${flow.completionId}/receipt`)
      .send({ acknowledged: true }).expect(201);
    assert.equal(requested.body.mode, 'monad-testnet');
    assert.equal(requested.body.status, 'queued');

    await waitFor(() => receiptRow(databasePath, flow.completionId)?.status === 'confirmed');
    const confirmed = receiptRow(databasePath, flow.completionId)!;
    assert.match(confirmed.tx_hash!, /^0x[0-9a-f]{64}$/);
    assert.equal(confirmed.chain_id, CHAIN_ID);
    assert.equal(confirmed.contract_address, contractAddress);
    assert.equal(await new Contract(contractAddress, ABI, submitter).exists(confirmed.receipt_id), true);

    const shown = await flow.agent.get(`/api/completions/${flow.completionId}/receipt`).expect(200);
    assert.equal(shown.body.status, 'confirmed');
    assert.equal(shown.body.tx_hash, confirmed.tx_hash);

    // 手动广播一笔交易，制造“已提交未确认”的行，用于验证重启恢复。
    const pendingReceiptId = `0x${randomBytes(32).toString('hex')}`;
    const pendingFlow = await completedFlow(first.app, 'b', 'meeting');
    const pendingTx = await new Contract(contractAddress, ABI, submitter).registerReceipt(pendingReceiptId);
    await pendingTx.wait();
    const timestamp = new Date().toISOString();
    first.store.database.prepare(`
      INSERT INTO receipts
      (completion_id, receipt_id, chain_id, contract_address, tx_hash, status, mode, error, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'submitted', 'monad-testnet', NULL, ?, ?)
    `).run(
      pendingFlow.completionId,
      pendingReceiptId,
      CHAIN_ID,
      contractAddress,
      pendingTx.hash,
      timestamp,
      timestamp,
    );
    const nonceBeforeRecovery = await provider.getTransactionCount(submitter.address);
    first.store.close();

    const restarted = createApp({
      databasePath,
      receiptMode: 'monad-testnet',
      receiptProvider: adapter(submitter.privateKey, CHAIN_ID, contractAddress),
    });
    restarted.receipts.resume();
    await waitFor(() => receiptRow(databasePath, pendingFlow.completionId)?.status === 'confirmed');
    assert.equal(
      await provider.getTransactionCount(submitter.address),
      nonceBeforeRecovery,
      '恢复必须复用既有哈希，不得重复广播',
    );
    const recoveredRow = receiptRow(databasePath, pendingFlow.completionId)!;
    assert.equal(recoveredRow.receipt_id, pendingReceiptId);
    assert.equal(recoveredRow.tx_hash, pendingTx.hash, '恢复必须沿用既有交易哈希');
    // 已确认的行在重启后保持不变，不会被重新登记。
    assert.equal(receiptRow(databasePath, flow.completionId)!.status, 'confirmed');
    assert.equal(receiptRow(databasePath, flow.completionId)!.tx_hash, confirmed.tx_hash);
    restarted.store.close();
  });

  it('两个合约：旧合约的已确认凭证不会被投到新合约', async () => {
    const oldChain = await freshFixture();
    const newChain = await freshFixture();
    const databasePath = tempDatabasePath();
    const first = createApp({
      databasePath,
      receiptMode: 'monad-testnet',
      receiptProvider: adapter(oldChain.submitter.privateKey, CHAIN_ID, oldChain.contractAddress),
    });
    const flow = await completedFlow(first.app);
    await flow.agent.post(`/api/completions/${flow.completionId}/receipt`)
      .send({ acknowledged: true }).expect(201);
    await waitFor(() => receiptRow(databasePath, flow.completionId)?.status === 'confirmed');
    const confirmed = receiptRow(databasePath, flow.completionId)!;
    await assertRegistration(confirmed.tx_hash!, confirmed.receipt_id, oldChain.contractAddress);
    first.store.close();

    // 同一数据库、同一模式，provider 指向另一个合约。
    const second = createApp({
      databasePath,
      receiptMode: 'monad-testnet',
      receiptProvider: adapter(newChain.submitter.privateKey, CHAIN_ID, newChain.contractAddress),
    });
    second.receipts.resume();
    second.receipts.request(flow.completionId);
    await wait(600);

    assert.equal(
      await new Contract(newChain.contractAddress, ABI, newChain.submitter).exists(confirmed.receipt_id),
      false,
      '旧凭证不得登记到新合约',
    );
    const row = receiptRow(databasePath, flow.completionId)!;
    assert.equal(row.status, 'confirmed', '已确认行不受换合约影响');
    assert.equal(row.tx_hash, confirmed.tx_hash, '不得改写交易哈希');
    assert.equal(row.contract_address, oldChain.contractAddress, '不得改写合约地址');
    assert.equal(row.chain_id, CHAIN_ID, '不得改写链 ID');
    second.store.close();
  });

  it('模式隔离：模拟凭证不会在真链模式下被登记', async () => {
    const { submitter, contractAddress } = await freshFixture();
    const databasePath = tempDatabasePath();
    const simulation = createApp({ databasePath, receiptMode: 'simulation' });
    const flow = await completedFlow(simulation.app);
    const simulated = simulation.receipts.request(flow.completionId);
    assert.equal(simulated.mode, 'simulation');
    await waitFor(() => receiptRow(databasePath, flow.completionId)?.status === 'confirmed');
    simulation.store.close();

    const chainMode = createApp({
      databasePath,
      receiptMode: 'monad-testnet',
      receiptProvider: adapter(submitter.privateKey, CHAIN_ID, contractAddress),
    });
    const returned = chainMode.receipts.request(flow.completionId);
    assert.equal(returned.mode, 'simulation');
    assert.equal(returned.receipt_id, simulated.receipt_id);
    chainMode.receipts.resume();
    await wait(500);
    const row = receiptRow(databasePath, flow.completionId)!;
    assert.equal(row.mode, 'simulation');
    assert.equal(row.status, 'confirmed');
    assert.match(row.tx_hash!, /^simulation-/);
    assert.equal(await new Contract(contractAddress, ABI, submitter).exists(row.receipt_id), false);
    chainMode.store.close();
  });
});
