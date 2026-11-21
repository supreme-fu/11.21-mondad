import { createHmac } from 'node:crypto';
import {
  Contract, FetchRequest, JsonRpcProvider, NonceManager, TypedDataEncoder, Wallet, ZeroHash, parseEther,
  type TypedDataField,
} from 'ethers';

/** Monad Testnet 公共 RPC 对 eth_getLogs 限制单次最多 100 个区块。 */
const MAX_LOG_BLOCK_SPAN = 100;
const LOG_QUERY_BATCH_SIZE = 5;
const RPC_TIMEOUT_MS = 30_000;

interface Network {
  chainId: number;
  sponsor: string;
  attestor: string;
  campaignId: number;
  startsAt: number;
  endsAt: number;
  block: number;
  challenge: string;
  token: string;
  badge: string;
  steps: { challenge: string; token: string };
}

const challengeAbi = [
  'function attestor() view returns (address)',
  'function participants(uint256,address) view returns (bytes32 subject,uint64 joinedAt,bool alreadyCompleted)',
  'function claimed(uint256,address,uint8) view returns (bool)',
  'function join((uint256 campaignId,address reader,bytes32 subject,bool alreadyCompleted,uint64 deadline),bytes)',
  'function claim((uint256 campaignId,address reader,bytes32 subject,uint8 kind,uint16 coverageBps,bool lastChapterCompleted,bytes32 evidenceHash,uint64 occurredAt,uint64 deadline),bytes)',
  'event BadgeIssued(uint256 indexed campaignId,address indexed reader,uint256 indexed tokenId)',
  'event RewardClaimed(uint256 indexed campaignId,address indexed reader,uint8 indexed kind,uint256 amount,bytes32 evidenceHash)',
];

type Enrollment = {
  campaignId: bigint; reader: string; subject: string; alreadyCompleted: boolean; deadline: bigint;
};
type Achievement = {
  campaignId: bigint; reader: string; subject: string; kind: number; coverageBps: number;
  lastChapterCompleted: boolean; evidenceHash: string; occurredAt: bigint; deadline: bigint;
};

export class ReadingTestnet {
  private readonly rpc: JsonRpcProvider;
  private readonly sponsor: Wallet;
  private readonly chain: Contract;

  constructor(readonly network: Network, private readonly attestor: Wallet) {
    const signerLower = attestor.address.toLowerCase();
    if (
      network.chainId !== 10143
      || network.attestor.toLowerCase() !== signerLower
      || network.sponsor.toLowerCase() !== signerLower
    ) {
      throw new Error('共读测试网部署与本机签名账户不匹配');
    }
    const request = new FetchRequest(process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz');
    request.timeout = RPC_TIMEOUT_MS;
    this.rpc = new JsonRpcProvider(request, undefined, { cacheTimeout: -1 });
    this.sponsor = attestor.connect(this.rpc);
    this.chain = new Contract(network.challenge, challengeAbi, this.rpc);
  }

  reader(userId: string) {
    const key = createHmac('sha256', Buffer.from(this.attestor.privateKey.slice(2), 'hex'))
      .update('fork-reading:' + this.network.challenge + ':' + userId).digest('hex');
    return new Wallet('0x' + key, this.rpc);
  }

  async claim(
    userId: string, enrollment: Enrollment, enrollmentSig: string, achievement: Achievement,
    types: Record<string, TypedDataField[]>,
  ) {
    const { network } = this;
    const onchainAttestor = String(await this.chain.attestor());
    if ((await this.rpc.getNetwork()).chainId !== 10143n || onchainAttestor.toLowerCase() !== this.attestor.address.toLowerCase()) {
      throw new Error('共读链 ID 或核验签名地址不匹配');
    }
    const reader = this.reader(userId);
    if (reader.address.toLowerCase() !== enrollment.reader.toLowerCase()) throw new Error('读者钱包和报名记录不匹配');
    const contract = new Contract(network.challenge, challengeAbi, new NonceManager(reader));
    const domain = { name: 'DoSomethingReading', version: '1', chainId: 10143, verifyingContract: network.challenge };
    if (!(await contract.claimed(enrollment.campaignId, reader.address, achievement.kind))) {
      const block = await this.rpc.getBlock('latest');
      if (!block || block.timestamp < network.startsAt || block.timestamp > network.endsAt) {
        throw new Error('共读测试活动尚未开始或已经结束');
      }
      const balance = await this.rpc.getBalance(reader.address);
      const minimum = parseEther('0.15');
      if (balance < parseEther('0.04')) {
        const funding = await this.sponsor.sendTransaction({ to: reader.address, value: minimum - balance });
        if ((await funding.wait(1, 60000))?.status !== 1) throw new Error('读者测试 Gas 充值失败');
      }
      let participation = await contract.participants(enrollment.campaignId, reader.address);
      if (participation.subject === ZeroHash) {
        const tx = await contract.join(enrollment, enrollmentSig);
        if ((await tx.wait(1, 60000))?.status !== 1) throw new Error('共读链上报名失败');
        participation = await contract.participants(enrollment.campaignId, reader.address);
      }
      if (participation.subject !== enrollment.subject) throw new Error('链上报名主体不匹配');
      const current = await this.rpc.getBlock('latest');
      if (!current) throw new Error('无法读取链上时间');
      achievement.occurredAt = BigInt(current.timestamp);
      achievement.deadline = BigInt(current.timestamp + 3600);
      const signature = await this.attestor.signTypedData(domain, types, achievement);
      const tx = await contract.claim(achievement, signature);
      const receipt = await tx.wait(1, 60000);
      if (receipt?.status !== 1) throw new Error('共读领奖交易失败');
      const challengeLower = network.challenge.toLowerCase();
      const events = receipt.logs
        .filter((log: { address: string }) => log.address.toLowerCase() === challengeLower)
        .map((log: { topics: string[]; data: string }) => contract.interface.parseLog(log));
      const reward = events.find((event: { name: string } | null) => event?.name === 'RewardClaimed');
      const badge = events.find((event: { name: string } | null) => event?.name === 'BadgeIssued');
      if (!reward || (achievement.kind === 0 && !badge)) throw new Error('链上领奖事件不完整');
      return {
        hash: receipt.hash as string,
        block: receipt.blockNumber as number,
        tokenId: badge ? Number(badge.args.tokenId) : null,
        digest: TypedDataEncoder.hash(domain, types, achievement),
      };
    }

    // 已领取过时按 100 区块窗口（Monad RPC 上限）倒序分批检索链上事件，实现幂等恢复
    const head = await this.rpc.getBlockNumber();
    const rewardFilter = contract.filters.RewardClaimed(enrollment.campaignId, reader.address, achievement.kind);
    const windows: Array<{ from: number; to: number }> = [];
    for (let to = head; to >= network.block; to -= MAX_LOG_BLOCK_SPAN) {
      windows.push({ from: Math.max(network.block, to - (MAX_LOG_BLOCK_SPAN - 1)), to });
    }

    for (let i = 0; i < windows.length; i += LOG_QUERY_BATCH_SIZE) {
      const batch = windows.slice(i, i + LOG_QUERY_BATCH_SIZE);
      const results = await Promise.all(
        batch.map((w) => contract.queryFilter(rewardFilter, w.from, w.to)),
      );
      for (const rewards of results) {
        const reward = rewards.at(-1);
        if (!reward) continue;
        const minted = achievement.kind === 0
          ? await contract.queryFilter(contract.filters.BadgeIssued(enrollment.campaignId, reader.address), reward.blockNumber, reward.blockNumber)
          : [];
        const badge = minted.find((log) => log.transactionHash === reward.transactionHash);
        if (achievement.kind === 0 && (!badge || !('args' in badge))) throw new Error('已领奖但查不到徽章事件');
        const transaction = await this.rpc.getTransaction(reward.transactionHash);
        const input = transaction && contract.interface.parseTransaction({ data: transaction.data });
        if (input?.name !== 'claim') throw new Error('无法核对已领奖的链上签名数据');
        const actual = input.args[0];
        const digest = TypedDataEncoder.hash(domain, types, {
          campaignId: actual.campaignId, reader: actual.reader, subject: actual.subject, kind: actual.kind,
          coverageBps: actual.coverageBps, lastChapterCompleted: actual.lastChapterCompleted,
          evidenceHash: actual.evidenceHash, occurredAt: actual.occurredAt, deadline: actual.deadline,
        });
        return {
          hash: reward.transactionHash,
          block: reward.blockNumber,
          digest,
          tokenId: badge && 'args' in badge ? Number(badge.args.tokenId) : null,
        };
      }
    }
    throw new Error('已领取奖励，但找不到链上交易事件');
  }
}
