export type ReceiptMode = 'simulation' | 'monad-testnet';
export type ReceiptStatus = 'not_requested' | 'queued' | 'submitted' | 'confirmed' | 'failed';

export interface User {
  id: string;
  displayName: string;
  demoKey: 'a' | 'b';
  bio?: string | null;
  goal?: string | null;
  points?: number;
}

export interface Activity {
  id: string;
  title: string;
  invitation: string;
  description: string;
  category: string;
  duration: string;
  completionHint: string;
  ruleVersion: number;
}

export interface Participation {
  id: string;
  status: 'joined' | 'completed' | 'left';
  ruleVersion: number;
  completionId: string | null;
}

export interface ActivityHistoryItem {
  participationId: string;
  completionId: string;
  declaredAt: string;
  reflectionText: string | null;
  visibility: 'private' | 'shared';
  receiptStatus: ReceiptStatus;
}

export interface ActivityDetail extends Activity {
  participation: Participation | null;
  activeParticipation?: Participation | null;
  completionCount?: number;
  history?: ActivityHistoryItem[];
}

export interface Reflection {
  text: string | null;
  visibility: 'private' | 'shared';
  deletedAt: string | null;
}

export interface Receipt {
  receiptId: string | null;
  chainId: number | null;
  contractAddress: string | null;
  txHash: string | null;
  status: ReceiptStatus;
  mode: ReceiptMode;
  error: string | null;
}

export interface Completion {
  id: string;
  declaredAt: string;
  verificationType: 'self_report';
  reflection: Reflection;
  receipt: Receipt;
}

export interface SceneDataRecord {
  payload: Record<string, unknown>;
  verifiedChannel: string | null;
  verifiedCode: string | null;
  verifiedDigest: string | null;
}

export interface ReadingSummaryRecord {
  readChaptersCount: number;
  totalChapters: number;
  currentChapter: number;
  coveragePercent: number;
  lastChapterCompleted: boolean;
  readingClaimed: boolean;
  reviewClaimed: boolean;
  badgeTokenId: number | null;
  readingTxHash?: string | null;
  readingBlockNumber?: number | null;
  readerWallet?: string | null;
  readingProofDigest?: string | null;
  readingClaimedAt?: string | null;
  earnedDsdemo: number;
}

export interface RecordItem {
  participationId: string;
  participationStatus: 'joined' | 'completed' | 'left';
  joinedAt: string;
  activity: Activity;
  sceneData?: SceneDataRecord | null;
  readingSummary?: ReadingSummaryRecord | null;
  completion: Completion | null;
}

export interface Echo {
  text: string;
  displayName: string;
  isExample: boolean;
}

export type ReadingProgressPreset = 'baseline' | 'partial' | 'complete';
export type ReadingRewardKind = 'reading' | 'review';

export interface ReadingChallengeContracts {
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
}

export interface ReadingHighlight {
  id: string;
  chapter: number;
  text: string;
  createdAt: string;
}

export interface BookChapter {
  index: number;
  roman: string;
  title: string;
  subtitle: string;
  charCount: number;
  paragraphs: string[];
}

export interface BookData {
  id: string;
  title: string;
  author: string;
  year: number;
  totalChapters: number;
  totalChars: number;
  dedication: string[];
  chapters: BookChapter[];
}

export interface ScenePayloadResponse {
  participationId: string;
  activityId: string;
  payload: Record<string, unknown>;
  verifiedChannel: string | null;
  verifiedCode: string | null;
  verifiedDigest: string | null;
  updatedAt: string | null;
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
  readingBlockNumber?: number | null;
  reviewClaimed: boolean;
  reviewClaimedAt: string | null;
  reviewProofDigest: string | null;
  reviewTxHash: string | null;
  badgeTokenId: number | null;
  rewardReadingDsdemo: string;
  rewardReviewDsdemo: string;
  earnedDsdemo: number;
  contracts: ReadingChallengeContracts;
}
