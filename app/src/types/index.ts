export type ReceiptMode = 'simulation' | 'monad-testnet';
export type ReceiptStatus = 'not_requested' | 'queued' | 'submitted' | 'confirmed' | 'failed';

export interface User {
  id: string;
  displayName: string;
  demoKey: 'a' | 'b';
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

export interface RecordItem {
  participationId: string;
  participationStatus: 'joined' | 'completed' | 'left';
  joinedAt: string;
  activity: Activity;
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
