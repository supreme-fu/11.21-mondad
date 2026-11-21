import { randomUUID } from 'node:crypto';
import { TypedDataEncoder, Wallet, id as keccakId, type TypedDataField } from 'ethers';
import { ReadingTestnet } from './reading-testnet.js';
import type { Store } from './db.js';
import type { ReceiptMode } from './types.js';

export type ReadingProgressPreset = 'baseline' | 'partial' | 'complete';
export type ReadingRewardKind = 'reading' | 'review';
export const TOTAL_BOOK_CHAPTERS = 27;

export interface ReadingHighlight {
  id: string;
  chapter: number;
  text: string;
  createdAt: string;
}

/** 来自 integrations/teammate-chain/scripts/reading-demo-network.json 的 Monad 公共测试网已确认部署记录 */
export const MONAD_READING_NETWORK = {
  chainId: 10143,
  sponsor: '0x076b535117754140Fd381858976143a05c029b04',
  attestor: '0x4Baa6B8C1e6E40c1692e1aEC4Dbc3c46D92C4cCc',
  contracts: {
    DemoRewardToken: {
      address: '0xAEc92f5A8D121b6e3FaFcB429dC4B7Cc24781353',
      transactionHash: '0x27485f76ce117ccfad83f581250144435bcf2a15c9c4b19fa868c41cbf015d29',
      symbol: 'DSDEMO',
    },
    ReadingChallenge: {
      address: '0x3ed53Ec76b80F4f387401C3e86C1be06b4682ed2',
      transactionHash: '0x4d584c9d1fa52ba47ea80fd8c15e5373a84e3c85c5fcb7cf7f166cb514caa164',
      verifiedMintTxHash: '0xe6865aab47b0cb2f0a3bd0a05fd2209c65e27b447c19222e4d479abfb0ba0b4d',
      verifiedMintBlockNumber: 81220667,
    },
    ReadingBadge: {
      address: '0xf584037417B6A4734656641904B009C0BAB4E720',
    },
  },
} as const;

export const DEFAULT_CAMPAIGN_ID = 1;
export const DEFAULT_BOOK_TITLE = '《小王子》';
export const DEFAULT_BOOK_HASH = keccakId('the-little-prince:do-something:v1');
export const DEFAULT_RULES_HASH = keccakId('coverage>=8000 AND lastChapter; eligible review; fixed rewards; v1');
export const REQUIRED_COVERAGE_BPS = 8000;

/** 与 integrations/teammate-chain/scripts/attestations.mjs 完全一致的 EIP-712 类型定义 */
export const enrollmentTypes: Record<string, TypedDataField[]> = {
  Enrollment: [
    { name: 'campaignId', type: 'uint256' },
    { name: 'reader', type: 'address' },
    { name: 'subject', type: 'bytes32' },
    { name: 'alreadyCompleted', type: 'bool' },
    { name: 'deadline', type: 'uint64' },
  ],
};

export const achievementTypes: Record<string, TypedDataField[]> = {
  Achievement: [
    { name: 'campaignId', type: 'uint256' },
    { name: 'reader', type: 'address' },
    { name: 'subject', type: 'bytes32' },
    { name: 'kind', type: 'uint8' },
    { name: 'coverageBps', type: 'uint16' },
    { name: 'lastChapterCompleted', type: 'bool' },
    { name: 'evidenceHash', type: 'bytes32' },
    { name: 'occurredAt', type: 'uint64' },
    { name: 'deadline', type: 'uint64' },
  ],
};

export function attestationDomain(
  chainId = MONAD_READING_NETWORK.chainId,
  verifyingContract: string = MONAD_READING_NETWORK.contracts.ReadingChallenge.address,
) {
  return { name: 'DoSomethingReading', version: '1', chainId, verifyingContract };
}

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

interface ReadingChallengeRow {
  participation_id: string;
  user_id: string;
  campaign_id: number;
  book_title: string;
  book_hash: string;
  rules_hash: string;
  reader_wallet: string;
  subject_hash: string;
  enrolled_at: string;
  enrollment_digest: string;
  enrollment_sig: string;
  already_completed: number;
  coverage_bps: number;
  last_chapter_completed: number;
  read_chapters_json: string;
  current_chapter: number;
  reading_seconds: number;
  highlights_json: string;
  reading_updated_at: string | null;
  review_submitted_at: string | null;
  reading_claimed_at: string | null;
  reading_proof_digest: string | null;
  reading_tx_hash: string | null;
  reading_block_number: number | null;
  review_claimed_at: string | null;
  review_proof_digest: string | null;
  review_tx_hash: string | null;
  badge_token_id: number | null;
  reward_reading_dsdemo: string;
  reward_review_dsdemo: string;
  mode: string;
}

export interface ReadingChallengeState {
  participationId: string;
  campaignId: number;
  bookTitle: string;
  bookHash: string;
  rulesHash: string;
  readerWallet: string;
  subjectHash: string;
  mode: string;
  enrolledAt: string;
  enrollmentDigest: string;
  enrollmentSig: string;
  alreadyCompleted: boolean;
  coverageBps: number;
  coveragePercent: number;
  lastChapterCompleted: boolean;
  readChapters: number[];
  totalChapters: number;
  currentChapter: number;
  readingSeconds: number;
  highlights: ReadingHighlight[];
  readingUpdatedAt: string | null;
  reviewSubmittedAt: string | null;
  hasReflection: boolean;
  canClaimReading: boolean;
  readingBlockedReason: string | null;
  canClaimReview: boolean;
  reviewBlockedReason: string | null;
  readingClaimed: boolean;
  readingClaimedAt: string | null;
  readingProofDigest: string | null;
  readingTxHash: string | null;
  readingBlockNumber: number | null;
  reviewClaimed: boolean;
  reviewClaimedAt: string | null;
  reviewProofDigest: string | null;
  reviewTxHash: string | null;
  badgeTokenId: number | null;
  rewardReadingDsdemo: string;
  rewardReviewDsdemo: string;
  earnedDsdemo: number;
  contracts: {
    chainId: number;
    explorerBaseUrl: string;
    sponsor: string;
    attestor: string;
    attestorSigner: string;
    readingChallenge: {
      address: string;
      txHash: string;
      explorerUrl: string;
    };
    readingBadge: {
      address: string;
      explorerUrl: string;
    };
    rewardToken: {
      address: string;
      txHash: string;
      explorerUrl: string;
      symbol: string;
    };
  };
}

const PROGRESS_PRESETS: Record<
  ReadingProgressPreset,
  { coverageBps: number; lastChapterCompleted: 0 | 1; readChapters: number[]; currentChapter: number }
> = {
  baseline: {
    coverageBps: 6200,
    lastChapterCompleted: 0,
    readChapters: Array.from({ length: 17 }, (_, i) => i + 1),
    currentChapter: 18,
  },
  partial: {
    coverageBps: 8000,
    lastChapterCompleted: 0,
    readChapters: Array.from({ length: 22 }, (_, i) => i + 1),
    currentChapter: 23,
  },
  complete: {
    coverageBps: 8800,
    lastChapterCompleted: 1,
    readChapters: [...Array.from({ length: 23 }, (_, i) => i + 1), 27],
    currentChapter: 27,
  },
};

function parseReadChapters(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 1 && n <= TOTAL_BOOK_CHAPTERS))]
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

function parseHighlights(raw: string | null | undefined): ReadingHighlight[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is ReadingHighlight =>
        Boolean(item) && typeof item.id === 'string' && typeof item.chapter === 'number' && typeof item.text === 'string',
    );
  } catch {
    return [];
  }
}

export class ReadingChallengeService {
  private readonly store: Store;
  private readonly mode: ReceiptMode;
  private readonly explorerBaseUrl: string;
  private readonly attestorWallet: Wallet;
  private readonly testnet?: ReadingTestnet;

  constructor(store: Store, mode: ReceiptMode = 'simulation') {
    this.store = store;
    this.mode = mode;
    this.explorerBaseUrl = (process.env.MONAD_EXPLORER_URL || 'https://testnet.monadvision.com').replace(/\/+$/, '');
    const configured = mode === 'monad-testnet' && process.env.FORK_READING_DEPLOYMENT;
    if (configured) {
      const key = process.env.MONAD_TESTNET_PRIVATE_KEY;
      if (!key) throw new Error('缺少共读测试网签名配置');
      this.attestorWallet = new Wallet(key);
      this.testnet = new ReadingTestnet(JSON.parse(configured), this.attestorWallet);
    } else {
      this.attestorWallet = this.resolveAttestorWallet();
    }
  }

  private resolveAttestorWallet(): Wallet {
    const configured = process.env.DEMO_ATTESTOR_PRIVATE_KEY?.trim();
    if (configured) {
      try {
        return new Wallet(configured);
      } catch {
        // 如果环境变量格式非法，回退到内置确定性演示签名私钥，避免离线或配置异常时崩溃
      }
    }
    return new Wallet(keccakId('do-something:demo-attestor-key:v1'));
  }

  /** 严格按主站会话 user.id 派生独立的确定性演示读者钱包与活动内匿名 subject */
  deriveIdentity(userId: string, campaignId = DEFAULT_CAMPAIGN_ID) {
    const readerWallet = this.testnet?.reader(userId).address
      ?? new Wallet(keccakId(`do-something:demo-reader-wallet:${userId}`)).address;
    const subjectHash = keccakId(`do-something:reading:${campaignId}:${userId}`);
    return { readerWallet, subjectHash };
  }

  private assertOwnedReadingParticipation(userId: string, participationId: string) {
    const participation = this.store.database.prepare(
      'SELECT id, user_id, activity_id FROM participations WHERE id = ? AND user_id = ?',
    ).get(participationId, userId) as { id: string; user_id: string; activity_id: string } | undefined;

    if (!participation) {
      throw httpError(404, '没有找到你的参与记录。');
    }
    if (participation.activity_id !== 'reading') {
      throw httpError(400, '当前参与记录不属于读书主题，无法进行共读核验。');
    }
    return participation;
  }

  private loadReflectionState(participationId: string) {
    const row = this.store.database.prepare(`
      SELECT c.id AS completionId, f.text AS reflectionText, f.deleted_at AS deletedAt
      FROM completions c
      LEFT JOIN reflections f ON f.completion_id = c.id
      WHERE c.participation_id = ?
    `).get(participationId) as {
      completionId: string;
      reflectionText: string | null;
      deletedAt: string | null;
    } | undefined;

    const trimmed = row?.deletedAt ? '' : (row?.reflectionText?.trim() ?? '');
    return {
      hasCompletion: Boolean(row?.completionId),
      hasReflection: trimmed.length > 0,
    };
  }

  private toState(row: ReadingChallengeRow, participationId: string): ReadingChallengeState {
    const { hasCompletion, hasReflection } = this.loadReflectionState(participationId);
    const readingClaimed = Boolean(row.reading_claimed_at);
    const reviewClaimed = Boolean(row.review_claimed_at);
    const lastChapterCompleted = row.last_chapter_completed === 1;
    const meetsReadingThreshold = row.coverage_bps >= REQUIRED_COVERAGE_BPS && lastChapterCompleted;

    let readingBlockedReason: string | null = null;
    if (readingClaimed) {
      readingBlockedReason = '阅读奖励与共读勋章已领取。';
    } else if (!meetsReadingThreshold) {
      readingBlockedReason = '阅读覆盖需至少达到 80% 且完成正文末章，当前暂不满足合约领取条件。';
    }

    let reviewBlockedReason: string | null = null;
    if (reviewClaimed) {
      reviewBlockedReason = '书评奖励已领取。';
    } else if (!hasCompletion) {
      reviewBlockedReason = '请先确认完成本次阅读，再写下读书感受并领取书评奖励。';
    } else if (!hasReflection) {
      reviewBlockedReason = '请先写下读书感受或一键填入示例书评并保存，再领取书评奖励。';
    }

    const earnedDsdemo =
      (readingClaimed ? Number(row.reward_reading_dsdemo) : 0) +
      (reviewClaimed ? Number(row.reward_review_dsdemo) : 0);

    return {
      participationId: row.participation_id,
      campaignId: row.campaign_id,
      bookTitle: row.book_title,
      bookHash: row.book_hash,
      rulesHash: row.rules_hash,
      readerWallet: row.reader_wallet,
      subjectHash: row.subject_hash,
      mode: this.testnet ? row.mode : 'simulation',
      enrolledAt: row.enrolled_at,
      enrollmentDigest: row.enrollment_digest,
      enrollmentSig: row.enrollment_sig,
      alreadyCompleted: row.already_completed === 1,
      coverageBps: row.coverage_bps,
      coveragePercent: Math.round(row.coverage_bps / 100),
      lastChapterCompleted,
      readChapters: parseReadChapters(row.read_chapters_json),
      totalChapters: TOTAL_BOOK_CHAPTERS,
      currentChapter: Math.min(TOTAL_BOOK_CHAPTERS, Math.max(1, row.current_chapter || 1)),
      readingSeconds: Math.max(0, row.reading_seconds || 0),
      highlights: parseHighlights(row.highlights_json),
      readingUpdatedAt: row.reading_updated_at,
      reviewSubmittedAt: row.review_submitted_at,
      hasReflection,
      canClaimReading: !readingClaimed && meetsReadingThreshold,
      readingBlockedReason,
      canClaimReview: !reviewClaimed && hasCompletion && hasReflection,
      reviewBlockedReason,
      readingClaimed,
      readingClaimedAt: row.reading_claimed_at,
      readingProofDigest: row.reading_proof_digest,
      readingTxHash: row.reading_tx_hash,
      readingBlockNumber: row.reading_block_number ?? null,
      reviewClaimed,
      reviewClaimedAt: row.review_claimed_at,
      reviewProofDigest: row.review_proof_digest,
      reviewTxHash: row.review_tx_hash,
      badgeTokenId: row.badge_token_id,
      rewardReadingDsdemo: row.reward_reading_dsdemo,
      rewardReviewDsdemo: row.reward_review_dsdemo,
      earnedDsdemo,
      contracts: {
        chainId: MONAD_READING_NETWORK.chainId,
        explorerBaseUrl: this.explorerBaseUrl,
        sponsor: this.testnet?.network.sponsor ?? MONAD_READING_NETWORK.sponsor,
        attestor: this.testnet?.network.attestor ?? MONAD_READING_NETWORK.attestor,
        attestorSigner: this.attestorWallet.address,
        readingChallenge: {
          address: this.testnet?.network.challenge ?? MONAD_READING_NETWORK.contracts.ReadingChallenge.address,
          txHash: this.testnet?.network.steps.challenge ?? MONAD_READING_NETWORK.contracts.ReadingChallenge.transactionHash,
          explorerUrl: `${this.explorerBaseUrl}/address/${this.testnet?.network.challenge ?? MONAD_READING_NETWORK.contracts.ReadingChallenge.address}`,
        },
        readingBadge: {
          address: this.testnet?.network.badge ?? MONAD_READING_NETWORK.contracts.ReadingBadge.address,
          explorerUrl: `${this.explorerBaseUrl}/address/${this.testnet?.network.badge ?? MONAD_READING_NETWORK.contracts.ReadingBadge.address}`,
        },
        rewardToken: {
          address: this.testnet?.network.token ?? MONAD_READING_NETWORK.contracts.DemoRewardToken.address,
          txHash: this.testnet?.network.steps.token ?? MONAD_READING_NETWORK.contracts.DemoRewardToken.transactionHash,
          explorerUrl: `${this.explorerBaseUrl}/address/${this.testnet?.network.token ?? MONAD_READING_NETWORK.contracts.DemoRewardToken.address}`,
          symbol: MONAD_READING_NETWORK.contracts.DemoRewardToken.symbol,
        },
      },
    };
  }

  private domain() {
    return attestationDomain(10143, this.testnet?.network.challenge);
  }

  private submitReward(userId: string, row: ReadingChallengeRow, achievement: Parameters<ReadingTestnet['claim']>[3]) {
    if (!this.testnet) throw new Error('共读测试网合约未配置');
    if (row.reader_wallet.toLowerCase() !== this.testnet.reader(userId).address.toLowerCase()) {
      throw new Error('该记录来自旧的演示环境，请重新发起共读活动');
    }
    const campaignId = BigInt(row.campaign_id);
    const enrollment = {
      campaignId,
      reader: row.reader_wallet,
      subject: row.subject_hash,
      alreadyCompleted: row.already_completed === 1,
      deadline: BigInt(Math.floor(Date.parse(row.enrolled_at) / 1000) + 30 * 24 * 60 * 60),
    };
    return this.testnet.claim(userId, enrollment, row.enrollment_sig, achievement, achievementTypes);
  }

  private getRow(participationId: string): ReadingChallengeRow | undefined {
    return this.store.database.prepare(
      'SELECT * FROM reading_challenges WHERE participation_id = ?',
    ).get(participationId) as ReadingChallengeRow | undefined;
  }

  private async ensureRow(userId: string, participationId: string): Promise<ReadingChallengeRow> {
    this.assertOwnedReadingParticipation(userId, participationId);
    const existing = this.getRow(participationId);
    if (existing) return existing;

    const campaignId = this.testnet?.network.campaignId ?? DEFAULT_CAMPAIGN_ID;
    const { readerWallet, subjectHash } = this.deriveIdentity(userId, campaignId);
    const enrolledAtMs = Date.now();
    const enrolledAt = new Date(enrolledAtMs).toISOString();
    const deadlineSec = Math.floor(enrolledAtMs / 1000) + 30 * 24 * 60 * 60;

    const domain = this.domain();
    const enrollment = {
      campaignId: BigInt(campaignId),
      reader: readerWallet,
      subject: subjectHash,
      alreadyCompleted: false,
      deadline: BigInt(deadlineSec),
    };

    const enrollmentDigest = TypedDataEncoder.hash(domain, enrollmentTypes, enrollment);
    const enrollmentSig = await this.attestorWallet.signTypedData(domain, enrollmentTypes, enrollment);

    const initialCoverageBps = this.store.isRichDemoMode ? 9630 : 6200;
    const initialChapters = this.store.isRichDemoMode
      ? JSON.stringify(Array.from({ length: 26 }, (_, i) => i + 1))
      : '[]';
    const initialCurrentChapter = this.store.isRichDemoMode ? 27 : 1;
    const initialHighlights = this.store.isRichDemoMode
      ? JSON.stringify([
        {
          id: 'hl-fox-1',
          chapter: 21,
          text: '“只有用心才能看得清。实质性的东西，用眼睛是看不见的。”',
          createdAt: enrolledAt,
        },
        {
          id: 'hl-fox-2',
          chapter: 21,
          text: '“正是你为你的玫瑰花费的时间，才使你的玫瑰变得如此重要。”',
          createdAt: enrolledAt,
        },
      ])
      : '[]';

    this.store.database.prepare(`
      INSERT OR IGNORE INTO reading_challenges (
        participation_id, user_id, campaign_id, book_title, book_hash, rules_hash,
        reader_wallet, subject_hash, enrolled_at, enrollment_digest, enrollment_sig,
        already_completed, coverage_bps, last_chapter_completed,
        read_chapters_json, current_chapter, highlights_json, mode
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?, ?)
    `).run(
      participationId,
      userId,
      campaignId,
      DEFAULT_BOOK_TITLE,
      DEFAULT_BOOK_HASH,
      DEFAULT_RULES_HASH,
      readerWallet,
      subjectHash,
      enrolledAt,
      enrollmentDigest,
      enrollmentSig,
      initialCoverageBps,
      initialChapters,
      initialCurrentChapter,
      initialHighlights,
      this.testnet ? this.mode : 'simulation',
    );

    const inserted = this.getRow(participationId);
    if (!inserted) {
      throw new Error('初始化《小王子》共读记录失败。');
    }
    return inserted;
  }

  async getOrInitState(userId: string, participationId: string): Promise<ReadingChallengeState> {
    const row = await this.ensureRow(userId, participationId);
    return this.toState(row, participationId);
  }

  async syncProgress(
    userId: string,
    participationId: string,
    preset: ReadingProgressPreset,
  ): Promise<ReadingChallengeState> {
    const row = await this.ensureRow(userId, participationId);
    if (row.reading_claimed_at) {
      throw httpError(409, '阅读奖励与共读勋章已领取，不能再回退或修改阅读进度。');
    }

    const next = PROGRESS_PRESETS[preset];
    const nowIso = new Date().toISOString();
    this.store.database.prepare(`
      UPDATE reading_challenges
      SET coverage_bps = ?, last_chapter_completed = ?, read_chapters_json = ?, current_chapter = ?, reading_updated_at = ?
      WHERE participation_id = ? AND user_id = ?
    `).run(
      next.coverageBps,
      next.lastChapterCompleted,
      JSON.stringify(next.readChapters),
      next.currentChapter,
      nowIso,
      participationId,
      userId,
    );

    const updated = this.getRow(participationId)!;
    return this.toState(updated, participationId);
  }

  async updateChapterProgress(
    userId: string,
    participationId: string,
    input: {
      action: 'complete' | 'uncomplete' | 'set_current' | 'complete_up_to';
      chapter: number;
      readingSecondsDelta?: number;
    },
  ): Promise<ReadingChallengeState> {
    const row = await this.ensureRow(userId, participationId);
    const chapter = Math.min(TOTAL_BOOK_CHAPTERS, Math.max(1, Math.trunc(input.chapter)));
    const delta = Math.max(0, Math.min(3600, Math.trunc(input.readingSecondsDelta ?? 0)));
    const currentSet = new Set(parseReadChapters(row.read_chapters_json));
    let nextCurrent = chapter;

    if (input.action === 'complete') {
      currentSet.add(chapter);
      nextCurrent = Math.min(TOTAL_BOOK_CHAPTERS, chapter + 1);
    } else if (input.action === 'uncomplete') {
      if (row.reading_claimed_at) {
        throw httpError(409, '阅读奖励与共读勋章已领取，不能再取消已读章节。');
      }
      currentSet.delete(chapter);
      nextCurrent = chapter;
    } else if (input.action === 'complete_up_to') {
      for (let idx = 1; idx <= chapter; idx += 1) currentSet.add(idx);
      nextCurrent = Math.min(TOTAL_BOOK_CHAPTERS, chapter + 1);
    }

    const sorted = [...currentSet].sort((a, b) => a - b);
    const computedCoverageBps = Math.round((sorted.length / TOTAL_BOOK_CHAPTERS) * 10000);
    const computedLastChapter = sorted.includes(TOTAL_BOOK_CHAPTERS) ? 1 : 0;

    // 已领奖后不再回退已达标的覆盖率与末章状态，但允许继续翻阅章节与累计时长
    const nextCoverageBps = row.reading_claimed_at
      ? Math.max(row.coverage_bps, computedCoverageBps)
      : computedCoverageBps;
    const nextLastChapter = row.reading_claimed_at
      ? Math.max(row.last_chapter_completed, computedLastChapter)
      : computedLastChapter;
    const nextSeconds = Math.max(0, (row.reading_seconds || 0) + delta);
    const nowIso = new Date().toISOString();

    this.store.database.prepare(`
      UPDATE reading_challenges
      SET coverage_bps = ?, last_chapter_completed = ?, read_chapters_json = ?,
          current_chapter = ?, reading_seconds = ?, reading_updated_at = ?
      WHERE participation_id = ? AND user_id = ?
    `).run(
      nextCoverageBps,
      nextLastChapter,
      JSON.stringify(sorted),
      nextCurrent,
      nextSeconds,
      nowIso,
      participationId,
      userId,
    );

    const updated = this.getRow(participationId)!;
    return this.toState(updated, participationId);
  }

  async addHighlight(
    userId: string,
    participationId: string,
    chapter: number,
    text: string,
  ): Promise<ReadingChallengeState> {
    const row = await this.ensureRow(userId, participationId);
    const cleaned = text.trim().slice(0, 320);
    if (!cleaned) throw httpError(400, '摘录内容不能为空。');

    const highlights = parseHighlights(row.highlights_json);
    const duplicate = highlights.find((item) => item.chapter === chapter && item.text === cleaned);
    if (!duplicate) {
      highlights.unshift({
        id: randomUUID().slice(0, 12),
        chapter: Math.min(TOTAL_BOOK_CHAPTERS, Math.max(1, Math.trunc(chapter))),
        text: cleaned,
        createdAt: new Date().toISOString(),
      });
    }

    this.store.database.prepare(`
      UPDATE reading_challenges
      SET highlights_json = ?, reading_updated_at = ?
      WHERE participation_id = ? AND user_id = ?
    `).run(JSON.stringify(highlights.slice(0, 30)), new Date().toISOString(), participationId, userId);

    return this.toState(this.getRow(participationId)!, participationId);
  }

  async removeHighlight(
    userId: string,
    participationId: string,
    highlightId: string,
  ): Promise<ReadingChallengeState> {
    const row = await this.ensureRow(userId, participationId);
    const next = parseHighlights(row.highlights_json).filter((item) => item.id !== highlightId);
    this.store.database.prepare(`
      UPDATE reading_challenges
      SET highlights_json = ?, reading_updated_at = ?
      WHERE participation_id = ? AND user_id = ?
    `).run(JSON.stringify(next), new Date().toISOString(), participationId, userId);
    return this.toState(this.getRow(participationId)!, participationId);
  }

  async claimReward(
    userId: string,
    participationId: string,
    kind: ReadingRewardKind,
  ): Promise<ReadingChallengeState> {
    const row = await this.ensureRow(userId, participationId);
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const occurredAtSec = Math.floor(nowMs / 1000);
    const deadlineSec = occurredAtSec + 14 * 24 * 60 * 60;
    const domain = this.domain();

    if (kind === 'reading') {
      if (row.reading_claimed_at) {
        throw httpError(409, '阅读奖励与共读勋章已经领取过了。');
      }
      if (row.coverage_bps < REQUIRED_COVERAGE_BPS || row.last_chapter_completed !== 1) {
        throw httpError(400, '阅读覆盖需至少达到 80% 且完成正文末章，当前暂不满足合约领取条件。');
      }

      // evidenceHash 仅包含匿名活动与达标状态元数据，绝不包含用户隐私正文
      const evidenceHash = keccakId(
        `do-something:reading:evidence:${row.campaign_id}:${row.subject_hash}:reading:${row.coverage_bps}:${row.last_chapter_completed}`,
      );
      const achievement = {
        campaignId: BigInt(row.campaign_id),
        reader: row.reader_wallet,
        subject: row.subject_hash,
        kind: 0,
        coverageBps: row.coverage_bps,
        lastChapterCompleted: true,
        evidenceHash,
        occurredAt: BigInt(occurredAtSec),
        deadline: BigInt(deadlineSec),
      };
      const proofDigest = TypedDataEncoder.hash(domain, achievementTypes, achievement);
      const chainResult = this.testnet ? await this.submitReward(userId, row, achievement) : null;
      if (!chainResult) await this.attestorWallet.signTypedData(domain, achievementTypes, achievement);

      const nextTokenRow = this.store.database.prepare(
        'SELECT COALESCE(MAX(badge_token_id), 0) + 1 AS nextId FROM reading_challenges',
      ).get() as { nextId: number };
      const badgeTokenId = chainResult?.tokenId ?? nextTokenRow.nextId;
      const readingTxHash = chainResult?.hash ?? null;
      const readingBlockNumber = chainResult?.block ?? null;

      const result = this.store.database.prepare(`
        UPDATE reading_challenges
        SET reading_claimed_at = ?, reading_proof_digest = ?, badge_token_id = ?,
            reading_tx_hash = ?, reading_block_number = ?
        WHERE participation_id = ? AND user_id = ? AND reading_claimed_at IS NULL
      `).run(nowIso, chainResult?.digest ?? proofDigest, badgeTokenId, readingTxHash, readingBlockNumber, participationId, userId);

      if (result.changes === 0) {
        throw httpError(409, '阅读奖励与共读勋章已经领取过了。');
      }
    } else {
      if (row.review_claimed_at) {
        throw httpError(409, '书评奖励已经领取过了。');
      }
      const { hasCompletion, hasReflection } = this.loadReflectionState(participationId);
      if (!hasCompletion || !hasReflection) {
        throw httpError(400, '请先写下读书感受或同步示例书评并保存，再领取 2 DSDEMO 书评奖励。');
      }

      // 隐私边界：evidenceHash 仅对匿名元数据计算哈希，绝不包含明文书评，后续撤回或删除正文不影响已签发凭证
      const evidenceHash = keccakId(
        `do-something:reading:evidence:${row.campaign_id}:${row.subject_hash}:review:v1`,
      );
      const achievement = {
        campaignId: BigInt(row.campaign_id),
        reader: row.reader_wallet,
        subject: row.subject_hash,
        kind: 1,
        coverageBps: row.coverage_bps,
        lastChapterCompleted: row.last_chapter_completed === 1,
        evidenceHash,
        occurredAt: BigInt(occurredAtSec),
        deadline: BigInt(deadlineSec),
      };
      const proofDigest = TypedDataEncoder.hash(domain, achievementTypes, achievement);
      const chainResult = this.testnet ? await this.submitReward(userId, row, achievement) : null;
      if (!chainResult) await this.attestorWallet.signTypedData(domain, achievementTypes, achievement);

      const result = this.store.database.prepare(`
        UPDATE reading_challenges
        SET review_submitted_at = COALESCE(review_submitted_at, ?),
            review_claimed_at = ?,
            review_proof_digest = ?,
            review_tx_hash = ?
        WHERE participation_id = ? AND user_id = ? AND review_claimed_at IS NULL
      `).run(nowIso, nowIso, chainResult?.digest ?? proofDigest, chainResult?.hash ?? null, participationId, userId);

      if (result.changes === 0) {
        throw httpError(409, '书评奖励已经领取过了。');
      }
    }

    const updated = this.getRow(participationId)!;
    return this.toState(updated, participationId);
  }
}
