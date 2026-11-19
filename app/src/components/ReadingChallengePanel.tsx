import { useCallback, useEffect, useState } from 'react';
import {
  Award,
  BookOpenCheck,
  CheckCircle2,
  Coins,
  ExternalLink,
  FileKey2,
  LoaderCircle,
  LockKeyhole,
  ShieldAlert,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { SAMPLE_LITTLE_PRINCE_REVIEW, shortenHex } from '@/lib/reading-contracts';
import type { ReadingChallengeState, ReadingProgressPreset, ReadingRewardKind } from '@/types';

interface ReadingChallengePanelProps {
  participationId: string;
  completionId: string;
  reflectionText: string | null;
  reflectionDeletedAt: string | null;
  onRecordChanged: () => Promise<void>;
}

const PRESET_OPTIONS: Array<{ preset: ReadingProgressPreset; label: string }> = [
  { preset: 'baseline', label: '62% · 报名基线' },
  { preset: 'partial', label: '80% · 末章未完成' },
  { preset: 'complete', label: '88% · 末章已完成' },
];

export function ReadingChallengePanel({
  participationId,
  completionId,
  reflectionText,
  reflectionDeletedAt,
  onRecordChanged,
}: ReadingChallengePanelProps) {
  const [state, setState] = useState<ReadingChallengeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loadState = useCallback(async () => {
    setError('');
    try {
      const next = await api.readingChallenge(participationId);
      setState(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '《小王子》共读状态读取失败。');
    } finally {
      setLoading(false);
    }
  }, [participationId]);

  useEffect(() => {
    void loadState();
  }, [loadState, reflectionText, reflectionDeletedAt]);

  async function handleSyncProgress(preset: ReadingProgressPreset) {
    setBusyAction(`progress:${preset}`);
    setError('');
    try {
      const next = await api.syncReadingProgress(participationId, preset);
      setState(next);
      toast.success(
        preset === 'complete'
          ? '阅读进度已同步到 88%，正文末章已完成，已达到合约核验门槛。'
          : preset === 'partial'
            ? '阅读进度已同步到 80%，但正文末章尚未完成，触发合约门槛锁定演示。'
            : '阅读进度已重置为 62% 报名基线。',
      );
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : '同步阅读进度失败。';
      setError(msg);
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleFillSampleReview() {
    setBusyAction('fill-review');
    setError('');
    try {
      await api.saveReflection(completionId, SAMPLE_LITTLE_PRINCE_REVIEW, 'private');
      await onRecordChanged();
      await loadState();
      toast.success('已填入并保存《小王子》狐狸章节书评示例（默认仅自己可见）。');
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : '保存示例书评失败。';
      setError(msg);
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleClaim(kind: ReadingRewardKind) {
    setBusyAction(`claim:${kind}`);
    setError('');
    try {
      const next = await api.claimReadingReward(participationId, kind);
      setState(next);
      toast.success(
        kind === 'reading'
          ? `已签发阅读达标 EIP-712 凭证，获得 10 DSDEMO 与 ReadingBadge #${next.badgeTokenId}。`
          : '已签发书评奖励 EIP-712 凭证，叠加获得 2 DSDEMO。',
      );
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : '领取共读奖励失败。';
      setError(msg);
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  }

  if (loading) {
    return (
      <section className="reading-lab" aria-label="《小王子》共读核验实验室">
        <div className="reading-lab-loading">
          <LoaderCircle className="animate-spin" aria-hidden="true" />
          <span>正在加载《小王子》共读核验实验室与 EIP-712 报名签名…</span>
        </div>
      </section>
    );
  }

  if (!state) {
    return (
      <section className="reading-lab" aria-label="《小王子》共读核验实验室">
        <p className="form-error" role="alert">{error || '暂无法加载共读实验室状态。'}</p>
      </section>
    );
  }

  const activePreset: ReadingProgressPreset | null =
    state.coverageBps === 6200 && !state.lastChapterCompleted
      ? 'baseline'
      : state.coverageBps === 8000 && !state.lastChapterCompleted
        ? 'partial'
        : state.coverageBps >= 8800 && state.lastChapterCompleted
          ? 'complete'
          : null;

  const showThresholdLockNotice = !state.readingClaimed && !state.canClaimReading;

  return (
    <section className="reading-lab" aria-labelledby="reading-lab-title" data-testid="reading-challenge-panel">
      <div className="reading-lab-header">
        <div>
          <span className="eyebrow">
            <BookOpenCheck aria-hidden="true" />
            《小王子》共读核验实验室 · Campaign #{state.campaignId}
          </span>
          <h2 id="reading-lab-title">把自报阅读，接进 Monad 测试网 EIP-712 核验规则</h2>
          <p>
            当前为 <strong>{state.mode === 'simulation' ? '本地 EIP-712 实签模拟驱动' : 'Monad 测试网驱动'}</strong>：使用真实 `ethers.Wallet` 按当前演示账户隔离签发 `Enrollment` 与 `Achievement` 结构化摘要，不向公共测试网广播私钥或消费真币。
          </p>
        </div>
        <div className="reading-lab-earned" data-testid="reading-earned-dsdemo">
          <span>当前累计获得</span>
          <strong>{state.earnedDsdemo} DSDEMO</strong>
          <small>阅读 10 + 书评 2 · 最高 12 DSDEMO</small>
        </div>
      </div>

      {/* 区块 1：进度同步区 */}
      <div className="reading-lab-section">
        <div className="reading-lab-section-head">
          <div>
            <h3>1. 阅读进度同步与合约门槛核验</h3>
            <p>
              当前覆盖率 <strong>{state.coveragePercent}%</strong>（{state.coverageBps} bps） ·{' '}
              <strong>{state.lastChapterCompleted ? '正文末章已完成' : '正文末章未完成'}</strong>
            </p>
          </div>
          <span className={`reading-threshold-badge ${state.canClaimReading || state.readingClaimed ? 'is-ready' : 'is-locked'}`}>
            {state.readingClaimed
              ? '已通过核验并领奖'
              : state.canClaimReading
                ? '已满足 ≥80% 且末章完成'
                : '未达到合约领取门槛'}
          </span>
        </div>

        <div className="reading-progress-track" role="progressbar" aria-valuenow={state.coveragePercent} aria-valuemin={0} aria-valuemax={100}>
          <div className="reading-progress-fill" style={{ width: `${Math.min(100, state.coveragePercent)}%` }} />
        </div>

        <div className="reading-preset-group" role="group" aria-label="同步模拟阅读进度">
          {PRESET_OPTIONS.map(({ preset, label }) => {
            const isActive = activePreset === preset;
            const isBusy = busyAction === `progress:${preset}`;
            return (
              <Button
                key={preset}
                type="button"
                variant={isActive ? 'default' : 'outline'}
                size="sm"
                disabled={Boolean(busyAction) || state.readingClaimed}
                onClick={() => void handleSyncProgress(preset)}
                data-testid={`reading-preset-${preset}`}
              >
                {isBusy && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                {label}
              </Button>
            );
          })}
        </div>

        {showThresholdLockNotice && (
          <div className="reading-lock-notice" role="status" data-testid="reading-threshold-notice">
            <ShieldAlert aria-hidden="true" />
            <span>
              {state.coverageBps === 8000 && !state.lastChapterCompleted
                ? '合约门槛锁定：虽然阅读覆盖率已达到 80%，但正文末章尚未完成，ReadingChallenge 合约仍会拒绝领取阅读奖励。请同步到「88% · 末章已完成」后再领取。'
                : '合约门槛锁定：领取阅读奖励需同时满足阅读覆盖率 ≥80% 且完成正文末章。'}
            </span>
          </div>
        )}
      </div>

      {/* 区块 2：奖励与勋章领取区 */}
      <div className="reading-lab-rewards">
        <article className="reading-reward-card" data-testid="reading-reward-card">
          <div className="reading-reward-head">
            <span className="reading-reward-tag"><Award aria-hidden="true" />阅读达标奖 · 10 DSDEMO + Soulbound 勋章</span>
            {state.readingClaimed && <span className="reading-claimed-pill"><CheckCircle2 aria-hidden="true" />已领取</span>}
          </div>
          <h3>{state.bookTitle} 完整阅读核验</h3>
          <p>同时满足覆盖率 ≥ 80% 与正文末章完成，可签发 `Achievement(kind=0)` 凭证并铸造不可转让 `ReadingBadge`。</p>

          {state.readingClaimed ? (
            <div className="reading-proof-box" data-testid="reading-proof-box">
              <div>
                <span>ReadingBadge 编号</span>
                <strong data-testid="reading-badge-token-id">ReadingBadge #{state.badgeTokenId}</strong>
              </div>
              <div>
                <span>EIP-712 Proof Digest</span>
                <code title={state.readingProofDigest ?? ''}>{state.readingProofDigest}</code>
              </div>
            </div>
          ) : (
            <div className="reading-reward-actions">
              <Button
                type="button"
                disabled={!state.canClaimReading || Boolean(busyAction)}
                onClick={() => void handleClaim('reading')}
                data-testid="claim-reading-reward-btn"
              >
                {busyAction === 'claim:reading' ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
                领取阅读奖励（10 DSDEMO + 共读勋章）
              </Button>
            </div>
          )}
        </article>

        <article className="reading-reward-card" data-testid="review-reward-card">
          <div className="reading-reward-head">
            <span className="reading-reward-tag"><Coins aria-hidden="true" />书评感受奖 · 可叠加 2 DSDEMO</span>
            {state.reviewClaimed && <span className="reading-claimed-pill"><CheckCircle2 aria-hidden="true" />已领取</span>}
          </div>
          <h3>留下一句读书感受 / 书评</h3>
          <p>
            与下方感受编辑器联动。{state.hasReflection ? '已检测到你保存的读书感受正文，现在可领取 2 DSDEMO。' : '尚未检测到保存的正文，你可以下方手写，或一键填入示例书评。'}
          </p>

          {!state.hasReflection && !state.reviewClaimed && (
            <div className="reading-reward-actions">
              <Button
                type="button"
                variant="secondary"
                disabled={Boolean(busyAction)}
                onClick={() => void handleFillSampleReview()}
                data-testid="fill-sample-review-btn"
              >
                {busyAction === 'fill-review' && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                填入《小王子》狐狸章节书评示例并保存
              </Button>
            </div>
          )}

          {state.reviewClaimed ? (
            <div className="reading-proof-box" data-testid="review-proof-box">
              <div>
                <span>书评奖励</span>
                <strong>已发放 +{state.rewardReviewDsdemo} DSDEMO</strong>
              </div>
              <div>
                <span>EIP-712 Proof Digest</span>
                <code title={state.reviewProofDigest ?? ''}>{state.reviewProofDigest}</code>
              </div>
              <p className="reading-privacy-note">
                <LockKeyhole aria-hidden="true" />
                隐私边界：原文留在链下可随时撤回/删除，仅匿名摘要参与 EIP-712 签名。
              </p>
            </div>
          ) : (
            <div className="reading-reward-actions">
              <Button
                type="button"
                variant="outline"
                disabled={!state.canClaimReview || Boolean(busyAction)}
                onClick={() => void handleClaim('review')}
                data-testid="claim-review-reward-btn"
              >
                {busyAction === 'claim:review' ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <FileKey2 aria-hidden="true" />}
                领取书评奖励（2 DSDEMO）
              </Button>
              <p className="reading-privacy-note">
                <LockKeyhole aria-hidden="true" />
                原文留在链下可随时撤回/删除，仅匿名摘要参与 EIP-712 签名。
              </p>
            </div>
          )}
        </article>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      {/* 区块 3：链上账本摘要区 */}
      <div className="reading-ledger-summary" data-testid="reading-ledger-summary">
        <div className="reading-ledger-head">
          <span><Wallet aria-hidden="true" />会话隔离身份与 Monad 测试网合约摘要</span>
          <span>Chain ID {state.contracts.chainId}</span>
        </div>
        <dl className="reading-ledger-grid">
          <div>
            <dt>累计 DSDEMO</dt>
            <dd>{state.earnedDsdemo} DSDEMO</dd>
          </div>
          <div>
            <dt>演示读者钱包（按会话派生）</dt>
            <dd><code title={state.readerWallet}>{shortenHex(state.readerWallet, 10, 8)}</code></dd>
          </div>
          <div>
            <dt>活动内匿名 Subject</dt>
            <dd><code title={state.subjectHash}>{shortenHex(state.subjectHash, 10, 8)}</code></dd>
          </div>
          <div>
            <dt>Enrollment Digest</dt>
            <dd><code title={state.enrollmentDigest}>{shortenHex(state.enrollmentDigest, 10, 8)}</code></dd>
          </div>
        </dl>
        <div className="reading-contract-links">
          <a href={state.contracts.readingChallenge.explorerUrl} target="_blank" rel="noreferrer" className="reading-contract-chip">
            <span>ReadingChallenge</span>
            <code>{shortenHex(state.contracts.readingChallenge.address)}</code>
            <ExternalLink aria-hidden="true" />
          </a>
          <a href={state.contracts.readingBadge.explorerUrl} target="_blank" rel="noreferrer" className="reading-contract-chip">
            <span>ReadingBadge</span>
            <code>{shortenHex(state.contracts.readingBadge.address)}</code>
            <ExternalLink aria-hidden="true" />
          </a>
          <a href={state.contracts.rewardToken.explorerUrl} target="_blank" rel="noreferrer" className="reading-contract-chip">
            <span>DemoRewardToken</span>
            <code>{shortenHex(state.contracts.rewardToken.address)}</code>
            <ExternalLink aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
