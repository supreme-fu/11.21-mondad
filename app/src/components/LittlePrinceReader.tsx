import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  BookOpenCheck,
  Bookmark,
  BookmarkPlus,
  Boxes,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Coins,
  ExternalLink,
  List,
  LoaderCircle,
  LockKeyhole,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  BadgeViewerDialog,
  type BadgeOnchainInscription,
  type CeremonyBadgeItem,
} from '@/components/BadgeViewerDialog';
import { EchoDialog } from '@/components/EchoPanel';
import { ReflectionShareDialog } from '@/components/ReflectionShareDialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import { loadBadges, type Badge } from '@/lib/badges';
import { shortenHex } from '@/lib/reading-contracts';
import type { BookData, Completion, ReadingChallengeState } from '@/types';

interface LittlePrinceReaderProps {
  participationId: string;
  completion: Completion | null;
  onRecordChanged: () => Promise<void>;
}

let cachedBookPromise: Promise<BookData> | null = null;
function fetchLittlePrinceBook(): Promise<BookData> {
  if (!cachedBookPromise) {
    cachedBookPromise = fetch('/books/little-prince.json').then((res) => {
      if (!res.ok) throw new Error('《小王子》书稿加载失败');
      return res.json() as Promise<BookData>;
    });
  }
  return cachedBookPromise;
}

export function LittlePrinceReader({
  participationId,
  completion,
  onRecordChanged,
}: LittlePrinceReaderProps) {
  const { user, records, refreshSession } = useApp();
  const [book, setBook] = useState<BookData | null>(null);
  const [state, setState] = useState<ReadingChallengeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeChapter, setActiveChapter] = useState(27);
  const [fontSize, setFontSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [showTocMobile, setShowTocMobile] = useState(false);
  const [selectedParagraphIdx, setSelectedParagraphIdx] = useState<number | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // 3D badge ceremony & post-completion share flow
  const [allBadges, setAllBadges] = useState<Badge[]>([]);
  const [readingBadgeAsset, setReadingBadgeAsset] = useState<Badge | null>(null);
  const [showBadgeDialog, setShowBadgeDialog] = useState(false);
  const [justMintedSpotlight, setJustMintedSpotlight] = useState(false);
  const [ceremonyBadges, setCeremonyBadges] = useState<CeremonyBadgeItem[] | null>(null);
  const [pointsSummary, setPointsSummary] = useState<string | null>(null);
  const [showOnchainConfirm, setShowOnchainConfirm] = useState(false);

  // Share dialog -> EchoDialog popup sequence
  const [shareCompletionId, setShareCompletionId] = useState<string | null>(null);
  const [pendingShareAfterCeremony, setPendingShareAfterCeremony] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showEchoDialog, setShowEchoDialog] = useState(false);

  const badgeBtnRef = useRef<HTMLButtonElement | null>(null);
  const chapterStartRef = useRef<number>(Date.now());
  const contentTopRef = useRef<HTMLDivElement | null>(null);
  const completionKeyRef = useRef(crypto.randomUUID());

  const loadAll = useCallback(async () => {
    setError('');
    try {
      const [bookData, challengeState, loadedBadges] = await Promise.all([
        fetchLittlePrinceBook(),
        api.readingChallenge(participationId),
        loadBadges().catch(() => [] as Badge[]),
      ]);
      setBook(bookData);
      setState(challengeState);
      setActiveChapter(challengeState.currentChapter || 27);
      setAllBadges(loadedBadges);
      const rb = loadedBadges.find((b) => b.id === 'reading') ?? null;
      setReadingBadgeAsset(rb);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '加载共读数据失败。');
    } finally {
      setLoading(false);
    }
  }, [participationId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const readSet = useMemo(() => new Set(state?.readChapters ?? []), [state?.readChapters]);
  const chapterObj = useMemo(
    () => book?.chapters.find((c) => c.index === activeChapter) ?? book?.chapters[0] ?? null,
    [book, activeChapter],
  );

  function consumeElapsedSeconds(): number {
    const elapsed = Math.round((Date.now() - chapterStartRef.current) / 1000);
    chapterStartRef.current = Date.now();
    return Math.min(600, Math.max(5, elapsed));
  }

  async function jumpToChapter(chapterNum: number) {
    setActiveChapter(chapterNum);
    setSelectedParagraphIdx(null);
    setShowTocMobile(false);
    chapterStartRef.current = Date.now();
    contentTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const next = await api.updateReadingChapter(participationId, {
        action: 'set_current',
        chapter: chapterNum,
      });
      setState(next);
    } catch {
      // silent navigation sync
    }
  }

  async function ensureCompleted(): Promise<string> {
    if (completion?.id) return completion.id;
    const res = await api.complete(participationId, completionKeyRef.current);
    await onRecordChanged();
    return res.id;
  }

  async function handleFinishChapter() {
    if (!chapterObj) return;
    // 第 27/27 章点击「确认读完」时，弹出是否上链确认框（提示扣除 1 点数）
    if (chapterObj.index === 27 && !state?.readingClaimed) {
      setShowOnchainConfirm(true);
      return;
    }
    setBusyAction('finish-chapter');
    setError('');
    try {
      const delta = consumeElapsedSeconds();
      const next = await api.updateReadingChapter(participationId, {
        action: 'complete',
        chapter: chapterObj.index,
        readingSecondsDelta: delta,
      });
      setState(next);

      if (chapterObj.index === 27) {
        const compId = await ensureCompleted();
        await onRecordChanged();
        const refreshed = await api.readingChallenge(participationId);
        setState(refreshed);
        setShareCompletionId(compId);
        setShowShareDialog(true);
      } else {
        const nextIdx = Math.min(27, chapterObj.index + 1);
        setActiveChapter(nextIdx);
        setSelectedParagraphIdx(null);
        contentTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        await onRecordChanged();
        toast.success(`第 ${chapterObj.index} 章已标记读完（总进度 ${next.readChapters.length}/27 · ${next.coveragePercent}%）`);
      }
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : '更新章节进度失败。';
      setError(msg);
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleFinishLocalOnly() {
    setBusyAction('finish-local');
    setError('');
    try {
      const delta = consumeElapsedSeconds();
      await api.updateReadingChapter(participationId, {
        action: 'complete',
        chapter: 27,
        readingSecondsDelta: delta,
      });
      const compId = await ensureCompleted();
      await onRecordChanged();
      const refreshed = await api.readingChallenge(participationId);
      setState(refreshed);
      setShowOnchainConfirm(false);
      // 暂不上链：完成确认后立刻弹出「是否分享感受/评论」弹窗
      setShareCompletionId(compId);
      setShowShareDialog(true);
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : '保存完成状态失败。';
      setError(msg);
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleConfirmOnchainMint() {
    setBusyAction('onchain-mint');
    setError('');
    try {
      const result = await api.onchainMintReading(participationId);
      setState(result.state);
      await Promise.all([onRecordChanged(), refreshSession()]);
      setShowOnchainConfirm(false);

      const loaded = allBadges.length > 0 ? allBadges : await loadBadges().catch(() => [] as Badge[]);
      if (allBadges.length === 0) setAllBadges(loaded);
      const readingAsset = loaded.find((b) => b.id === 'reading') ?? readingBadgeAsset;
      const milestoneAsset = result.milestoneBadgeId
        ? loaded.find((b) => b.id === result.milestoneBadgeId) ?? null
        : null;

      const baseInscription: BadgeOnchainInscription | null =
        result.state.mode === 'monad-testnet'
        && result.state.badgeTokenId != null
        && result.state.readingTxHash
        && result.state.readingBlockNumber != null
          ? {
            tokenId: result.state.badgeTokenId,
            txHash: result.state.readingTxHash,
            blockNumber: result.state.readingBlockNumber,
            holderAddress: result.state.readerWallet,
            proofDigest: result.state.readingProofDigest,
            claimedAt: result.state.readingClaimedAt,
            rewardSummary: 'Soulbound 勋章',
            contractAddress: result.state.contracts.readingBadge.address,
            explorerBaseUrl: result.state.contracts.explorerBaseUrl,
            justMinted: true,
          }
          : null;

      const ceremonyList: CeremonyBadgeItem[] = [];
      if (readingAsset) {
        ceremonyList.push({
          badge: readingAsset,
          roleLabel: '勋章 1 · 对应主题勋章',
          subtitle: baseInscription ? `ReadingBadge #${baseInscription.tokenId} · Soulbound` : '本地模拟共读勋章',
          inscription: baseInscription,
        });
      }
      if (milestoneAsset) {
        ceremonyList.push({
          badge: milestoneAsset,
          roleLabel: '勋章 2 · 里程碑勋章',
          subtitle: `累计达成 ${result.totalCompleted} 次行动里程碑`,
        });
      }

      setPointsSummary(
        result.deductedPoints > 0
          ? `已扣除 ${result.deductedPoints} 点数 · 剩余 ${result.remainingPoints} 点`
          : `剩余 ${result.remainingPoints} 点`,
      );
      setCeremonyBadges(ceremonyList.length > 0 ? ceremonyList : null);
      if (readingAsset) setReadingBadgeAsset(readingAsset);
      setShareCompletionId(result.completionId);
      setPendingShareAfterCeremony(true);
      setJustMintedSpotlight(true);
      setShowBadgeDialog(true);

      toast.success(
        milestoneAsset
          ? `上链成功！已扣除 ${result.deductedPoints} 点数，同步颁发「${readingAsset?.name ?? '一页之间'}」与「${milestoneAsset.name}」两枚勋章！`
          : `上链成功！已扣除 ${result.deductedPoints} 点数，铸造「${readingAsset?.name ?? '一页之间'}」勋章！`,
      );
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : '上链铸造失败，请稍后重试。';
      setError(msg);
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleToggleChapterUnread(chapterNum: number) {
    setBusyAction(`unread:${chapterNum}`);
    try {
      const next = await api.updateReadingChapter(participationId, {
        action: 'uncomplete',
        chapter: chapterNum,
      });
      setState(next);
      await onRecordChanged();
      toast.success(`已取消第 ${chapterNum} 章已读标记`);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : '操作失败');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleAddHighlight(text: string) {
    if (!chapterObj) return;
    setBusyAction('highlight');
    try {
      const next = await api.addReadingHighlight(participationId, chapterObj.index, text);
      setState(next);
      setSelectedParagraphIdx(null);
      toast.success('已收藏金句到本书摘录');
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : '收藏失败');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRemoveHighlight(highlightId: string) {
    try {
      const next = await api.removeReadingHighlight(participationId, highlightId);
      setState(next);
    } catch {
      toast.error('删除摘录失败');
    }
  }

  if (loading) {
    return (
      <div className="reader-loading">
        <LoaderCircle className="animate-spin" />
        <span>正在打开《小王子》全本与共读进度…</span>
      </div>
    );
  }

  if (!book || !state || !chapterObj) {
    return <p className="form-error" role="alert">{error || '无法加载《小王子》阅读器。'}</p>;
  }

  const isCurrentRead = readSet.has(chapterObj.index);
  const coverageOk = state.coverageBps >= 8000;
  const totalCompletedSoFar = records.filter((r) => r.completion !== null).length;
  const nextTotalCompleted = totalCompletedSoFar + (completion ? 0 : 1);

  return (
    <div className="lp-reader-shell" data-testid="little-prince-reader">
      {/* 顶部紧凑工具栏 */}
      <div className="lp-topbar">
        <div className="lp-topbar-left">
          <button
            type="button"
            className="lp-toc-toggle"
            onClick={() => setShowTocMobile((v) => !v)}
          >
            <List size={16} />
            目录（{state.readChapters.length}/27）
          </button>
          <div className="lp-book-title-group">
            <strong>{book.title}</strong>
            <span>{book.author} · 全 {book.totalChapters} 章</span>
          </div>
        </div>

        <div className="lp-topbar-metrics">
          <span className={`lp-pill ${activeChapter === 27 ? 'is-ok' : ''}`} data-testid="reader-chapter-ratio">
            第 {activeChapter} / {book.totalChapters} 章
          </span>
          <span className={`lp-pill ${coverageOk ? 'is-ok' : ''}`}>
            覆盖率 {state.coveragePercent}%
          </span>
          <span className="lp-pill is-reward" data-testid="reader-user-points">
            <Coins size={13} />
            当前点数：{user?.points ?? 100} 点
          </span>
        </div>
      </div>

      <div className="lp-workspace-grid">
        {/* 左栏：27 章真实目录 */}
        <aside className={`lp-toc-panel ${showTocMobile ? 'is-open' : ''}`} aria-label="章节目录">
          <div className="lp-toc-head">
            <div className="lp-progress-bar">
              <div className="lp-progress-fill" style={{ width: `${Math.min(100, state.coveragePercent)}%` }} />
            </div>
            <div className="lp-toc-quick">
              {!state.lastChapterCompleted && (
                <button
                  type="button"
                  className="lp-quick-btn is-accent"
                  onClick={() => void jumpToChapter(27)}
                  data-testid="jump-last-chapter-btn"
                >
                  直达第 27 章（末章）
                </button>
              )}
              {state.readChapters.length < 27 && (
                <button
                  type="button"
                  className="lp-quick-btn"
                  onClick={() => {
                    const firstUnread = book.chapters.find((c) => !readSet.has(c.index))?.index ?? 1;
                    void jumpToChapter(firstUnread);
                  }}
                >
                  继续未读章节
                </button>
              )}
            </div>
          </div>

          <ul className="lp-toc-list">
            {book.chapters.map((ch) => {
              const isRead = readSet.has(ch.index);
              const isActive = ch.index === chapterObj.index;
              return (
                <li key={ch.index}>
                  <button
                    type="button"
                    className={`lp-toc-item ${isActive ? 'is-active' : ''} ${isRead ? 'is-read' : ''}`}
                    onClick={() => void jumpToChapter(ch.index)}
                    data-testid={`toc-chapter-${ch.index}`}
                  >
                    <span className="lp-toc-status" aria-hidden="true">
                      {isRead ? <Check size={13} /> : ch.index}
                    </span>
                    <span className="lp-toc-label">
                      <strong>{ch.title}{ch.index === 27 ? ' · 末章' : ''}</strong>
                      <small>{ch.subtitle}</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* 中栏：真实全本电子书阅读区 */}
        <article className={`lp-book-stage font-${fontSize}`} ref={contentTopRef}>
          <header className="lp-chapter-header">
            <div>
              <span className="lp-chapter-kicker">
                CHAPTER {chapterObj.roman} · {chapterObj.charCount} 字
                {chapterObj.index === 27 && ' · 第 27 / 27 章'}
              </span>
              <h2>{chapterObj.title} · {chapterObj.subtitle}</h2>
            </div>
            <div className="lp-font-controls" role="group" aria-label="字号调节">
              {(['sm', 'md', 'lg'] as const).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  className={fontSize === sz ? 'is-active' : ''}
                  onClick={() => setFontSize(sz)}
                >
                  {sz === 'sm' ? '小' : sz === 'md' ? '中' : '大'}
                </button>
              ))}
            </div>
          </header>

          {chapterObj.index === 1 && book.dedication.length > 0 && (
            <div className="lp-dedication">
              {book.dedication.map((line, idx) => (
                <p key={idx}>{line}</p>
              ))}
            </div>
          )}

          <div className="lp-paragraphs">
            {chapterObj.paragraphs.map((para, idx) => {
              const isSelected = selectedParagraphIdx === idx;
              return (
                <div
                  key={idx}
                  className={`lp-para-wrap ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => setSelectedParagraphIdx(isSelected ? null : idx)}
                >
                  <p>{para}</p>
                  {isSelected && (
                    <div className="lp-para-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => void handleAddHighlight(para)}
                        disabled={Boolean(busyAction)}
                      >
                        <BookmarkPlus size={13} />
                        收藏金句
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <footer className="lp-chapter-footer">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={chapterObj.index <= 1 || Boolean(busyAction)}
              onClick={() => void jumpToChapter(chapterObj.index - 1)}
            >
              <ChevronLeft size={16} />
              上一章
            </Button>

            <div className="lp-chapter-finish-group">
              {isCurrentRead ? (
                <>
                  <span className="lp-chapter-done-badge">
                    <CheckCircle2 size={15} />
                    本章已读
                  </span>
                  {!state.readingClaimed && (
                    <button
                      type="button"
                      className="lp-text-action"
                      onClick={() => void handleToggleChapterUnread(chapterObj.index)}
                      disabled={Boolean(busyAction)}
                    >
                      取消标记
                    </button>
                  )}
                </>
              ) : (
                <Button
                  type="button"
                  size="default"
                  disabled={Boolean(busyAction)}
                  onClick={() => void handleFinishChapter()}
                  data-testid="complete-chapter-btn"
                >
                  {busyAction === 'finish-chapter' ? (
                    <LoaderCircle className="animate-spin" size={16} />
                  ) : (
                    <BookOpenCheck size={16} />
                  )}
                  {chapterObj.index === 27 ? '确认读完（27/27）' : '标记本章已读并下一章'}
                </Button>
              )}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={chapterObj.index >= 27 || Boolean(busyAction)}
              onClick={() => void jumpToChapter(chapterObj.index + 1)}
            >
              下一章
              <ChevronRight size={16} />
            </Button>
          </footer>
        </article>

        {/* 右栏：纯净勋章核验与金句摘录（已移除 DSDEMO 与书评奖励） */}
        <aside className="lp-console-panel" aria-label="阅读核验与勋章铸造">
          <section className="lp-card" data-testid="reading-reward-card">
            <div className="lp-card-head">
              <span><Award size={15} /> 阅读勋章核验</span>
              <strong className="lp-reward-num">Soulbound 勋章</strong>
            </div>

            <ul className="lp-criteria-list">
              <li className={coverageOk ? 'is-pass' : 'is-wait'}>
                {coverageOk ? <CheckCircle2 size={14} /> : <LockKeyhole size={14} />}
                <span>阅读覆盖 ≥ 80%（当前 {state.coveragePercent}% · {state.readChapters.length}/27 章）</span>
              </li>
              <li className={state.lastChapterCompleted ? 'is-pass' : 'is-wait'}>
                {state.lastChapterCompleted ? <CheckCircle2 size={14} /> : <LockKeyhole size={14} />}
                <span>读完第 27 章末章（{state.lastChapterCompleted ? '已达标' : '当前第 27/27 章'}）</span>
              </li>
            </ul>

            {state.readingClaimed ? (
              <div className="lp-claimed-box" data-testid="reading-proof-box">
                <div className="lp-claimed-row">
                  <span>Soulbound 勋章</span>
                  <strong data-testid="reading-badge-token-id">ReadingBadge #{state.badgeTokenId}</strong>
                </div>
                {state.readingBlockNumber && (
                  <div className="lp-claimed-row">
                    <span>区块号</span>
                    <strong>#{state.readingBlockNumber.toLocaleString('en-US')}</strong>
                  </div>
                )}
                {state.readingTxHash && (
                  <div className="lp-claimed-row">
                    <span>交易哈希</span>
                    <a
                      href={`${state.contracts.explorerBaseUrl}/tx/${state.readingTxHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="badge-inscription-link"
                    >
                      <code title={state.readingTxHash}>{shortenHex(state.readingTxHash, 8, 6)}</code>
                      <ExternalLink size={11} />
                    </a>
                  </div>
                )}
                <div className="lp-claimed-row">
                  <span>持有人</span>
                  <code title={state.readerWallet}>{shortenHex(state.readerWallet, 8, 6)}</code>
                </div>
                {readingBadgeAsset && (
                  <Button
                    ref={badgeBtnRef}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full mt-2"
                    onClick={() => {
                      setJustMintedSpotlight(true);
                      setShowBadgeDialog(true);
                    }}
                  >
                    <Boxes size={15} />
                    360° 赏鉴高光 3D 器物与链上铭牌
                  </Button>
                )}
              </div>
            ) : (
              <Button
                type="button"
                className="w-full"
                disabled={Boolean(busyAction)}
                onClick={() => setShowOnchainConfirm(true)}
                data-testid="claim-reading-reward-btn"
              >
                {busyAction === 'onchain-mint' ? (
                  <LoaderCircle className="animate-spin" size={16} />
                ) : (
                  <Sparkles size={16} />
                )}
                确认读完并上链（-1 点数）
              </Button>
            )}
          </section>

          <section className="lp-card">
            <div className="lp-card-head">
              <span><Bookmark size={15} /> 我的金句摘录</span>
              <small>{state.highlights.length} 条</small>
            </div>
            {state.highlights.length === 0 ? (
              <p className="lp-empty-hint">点击左侧书中任意段落即可收藏金句。</p>
            ) : (
              <ul className="lp-highlight-list">
                {state.highlights.map((item) => (
                  <li key={item.id}>
                    <p>{item.text}</p>
                    <div className="lp-highlight-foot">
                      <button type="button" onClick={() => void jumpToChapter(item.chapter)}>
                        第 {item.chapter} 章
                      </button>
                      <button type="button" onClick={() => void handleRemoveHighlight(item.id)} aria-label="删除摘录">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="lp-card lp-chain-mini">
            <div className="lp-card-head">
              <span>Monad Testnet · Chain {state.contracts.chainId}</span>
              <code>{shortenHex(state.readerWallet, 6, 4)}</code>
            </div>
            <div className="lp-contract-chips">
              <a href={state.contracts.readingChallenge.explorerUrl} target="_blank" rel="noreferrer">
                ReadingChallenge <ExternalLink size={11} />
              </a>
              <a href={state.contracts.readingBadge.explorerUrl} target="_blank" rel="noreferrer">
                ReadingBadge <ExternalLink size={11} />
              </a>
            </div>
          </section>

          {error && <p className="form-error" role="alert">{error}</p>}
        </aside>
      </div>

      {/* 1) 是否上链确认弹窗（扣除 1 点数，预告双勋章） */}
      <Dialog open={showOnchainConfirm} onOpenChange={setShowOnchainConfirm}>
        <DialogContent className="onchain-confirm-dialog" data-testid="onchain-confirm-dialog">
          <DialogHeader>
            <DialogTitle>已读完《小王子》（27 / 27），是否上链铸造勋章？</DialogTitle>
            <DialogDescription>
              上链将写入 Monad Testnet 合约并永久镌刻本次阅读档案，本次操作会扣除 <strong>1 点数</strong>。
            </DialogDescription>
          </DialogHeader>

          <div className="onchain-points-box" data-testid="onchain-points-preview">
            <div>
              <span>当前剩余点数</span>
              <strong>{user?.points ?? 100} 点</strong>
            </div>
            <div>
              <span>本次上链消耗</span>
              <strong className="is-cost">-1 点</strong>
            </div>
            <div>
              <span>上链后剩余</span>
              <strong>{Math.max(0, (user?.points ?? 100) - 1)} 点</strong>
            </div>
          </div>

          <div className="onchain-badges-preview">
            <p className="onchain-badges-preview-title">确认上链后，将同步铸造并点亮以下两枚 3D 勋章：</p>
            <div className="onchain-badges-preview-grid">
              <div className="onchain-badge-preview-item">
                <span className="lp-pill is-reward">对应主题勋章</span>
                <strong>一页之间</strong>
                <small>Soulbound ReadingBadge 不可转让勋章</small>
              </div>
              <div className="onchain-badge-preview-item">
                <span className="lp-pill is-ok">里程碑勋章</span>
                <strong>10 次 · 铜色起步</strong>
                <small>累计完成 {nextTotalCompleted} / 10 次行动解锁</small>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(busyAction)}
              onClick={() => void handleFinishLocalOnly()}
              data-testid="skip-onchain-btn"
            >
              {busyAction === 'finish-local' ? <LoaderCircle className="animate-spin" size={14} /> : '暂不上链（仅本地完成）'}
            </Button>
            <Button
              type="button"
              disabled={Boolean(busyAction) || (user?.points ?? 100) < 1}
              onClick={() => void handleConfirmOnchainMint()}
              data-testid="confirm-onchain-mint-btn"
            >
              {busyAction === 'onchain-mint' ? (
                <LoaderCircle className="animate-spin" size={15} />
              ) : (
                <Sparkles size={15} />
              )}
              确认上链（扣除 1 点数）
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2) 上链确认瞬间的双勋章高光 3D 铸造仪式弹窗 */}
      {showBadgeDialog && readingBadgeAsset && (
        <BadgeViewerDialog
          badge={readingBadgeAsset}
          ceremonyBadges={ceremonyBadges}
          pointsSummary={pointsSummary}
          onClose={() => {
            setShowBadgeDialog(false);
            setJustMintedSpotlight(false);
            setCeremonyBadges(null);
            // 关闭高光铸造仪式后，自动弹出「分享感受/评论」选择弹窗
            if (pendingShareAfterCeremony) {
              setPendingShareAfterCeremony(false);
              setShowShareDialog(true);
            }
          }}
          restoreFocusTo={() => badgeBtnRef.current?.focus()}
          onchainInscription={
            state.mode === 'monad-testnet'
            && state.readingClaimed
            && state.badgeTokenId != null
            && state.readingTxHash
            && state.readingBlockNumber != null
              ? ({
                tokenId: state.badgeTokenId,
                txHash: state.readingTxHash,
                blockNumber: state.readingBlockNumber,
                holderAddress: state.readerWallet,
                proofDigest: state.readingProofDigest,
                claimedAt: state.readingClaimedAt,
                rewardSummary: 'Soulbound 勋章',
                contractAddress: state.contracts.readingBadge.address,
                explorerBaseUrl: state.contracts.explorerBaseUrl,
                justMinted: justMintedSpotlight,
              } satisfies BadgeOnchainInscription)
              : null
          }
        />
      )}

      {/* 3) 确认完成后（无论是否上链）统一弹出：是否分享感受/评论 */}
      <ReflectionShareDialog
        open={showShareDialog}
        completionId={shareCompletionId ?? completion?.id ?? null}
        activityTitle="读完一本想读的短书 · 《小王子》"
        onCompleteChoice={async () => {
          setShowShareDialog(false);
          await onRecordChanged();
          setShowEchoDialog(true);
        }}
      />

      {/* 4) 选择是否分享结束后，直接弹窗展示别人公开的字条 */}
      <EchoDialog
        open={showEchoDialog}
        activityId="reading"
        onClose={() => setShowEchoDialog(false)}
      />
    </div>
  );
}
