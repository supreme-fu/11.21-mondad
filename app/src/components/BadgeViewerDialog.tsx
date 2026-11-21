import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, Award, Boxes, Camera, CheckCircle2, Copy, ExternalLink, Globe2, LoaderCircle, RefreshCw, RotateCcw, ShieldCheck, SlidersHorizontal, Sparkles, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useApp } from '@/context/AppContext';
import { createBadgeViewer, type BadgeViewer, type BadgeViewerStatus } from '@/lib/badge-viewer';
import { computeBadgeStates, type Badge } from '@/lib/badges';
import { LITTLE_PRINCE_CONTRACTS, shortenHex } from '@/lib/reading-contracts';

export interface BadgeOnchainInscription {
  tokenId: number;
  txHash: string;
  blockNumber?: number | null;
  holderAddress: string;
  proofDigest?: string | null;
  claimedAt?: string | null;
  rewardSummary?: string;
  contractAddress?: string;
  explorerBaseUrl?: string;
  justMinted?: boolean;
}

export interface CeremonyBadgeItem {
  badge: Badge;
  roleLabel: string;
  subtitle?: string;
  inscription?: BadgeOnchainInscription | null;
}

interface BadgeViewerDialogProps {
  badge: Badge | null;
  onClose: () => void;
  /** 关闭时把焦点交回打开弹窗的那张卡片。 */
  restoreFocusTo?: () => void;
  /** 可选：铸造确认瞬间或已铸造器物的链上镌刻铭牌数据 */
  onchainInscription?: BadgeOnchainInscription | null;
  /** 可选：双勋章高光铸造仪式（例如主题勋章 + 里程碑勋章同时颁发） */
  ceremonyBadges?: CeremonyBadgeItem[] | null;
  /** 可选：上链扣点提示（如“已扣除 1 点数 · 剩余 99 点”） */
  pointsSummary?: string | null;
}

const MONAD_TESTNET_EXPLORER = 'https://testnet.monadvision.com';
const DEFAULT_FOIL = 0.45;
const DEFAULT_LIGHT_ANGLE = 28;
const DEFAULT_ENV = 1.05;
const SPOTLIGHT_FOIL = 0.78;
const SPOTLIGHT_LIGHT_ANGLE = 36;
const SPOTLIGHT_ENV = 1.32;

export function BadgeViewerDialog({
  badge: propBadge,
  onClose,
  restoreFocusTo,
  onchainInscription,
  ceremonyBadges,
  pointsSummary,
}: BadgeViewerDialogProps) {
  const { records } = useApp();
  const [ceremonyIndex, setCeremonyIndex] = useState(0);
  const ceremonyList = ceremonyBadges && ceremonyBadges.length > 0 ? ceremonyBadges : null;
  const ceremonyResetKey = `${propBadge?.id ?? ''}:${ceremonyList?.length ?? 0}`;
  const [prevCeremonyKey, setPrevCeremonyKey] = useState(ceremonyResetKey);
  if (ceremonyResetKey !== prevCeremonyKey) {
    setPrevCeremonyKey(ceremonyResetKey);
    setCeremonyIndex(0);
  }
  const activeCeremonyItem = ceremonyList ? (ceremonyList[ceremonyIndex] ?? ceremonyList[0]) : null;
  const badge = activeCeremonyItem?.badge ?? propBadge;

  const badgeState = useMemo(() => {
    if (!badge) return null;
    return computeBadgeStates([badge], records)[badge.id] ?? null;
  }, [badge, records]);

  // 若未显式传入铭牌数据，但当前查看的是已铸造的阅读徽章，则自动从 records 中提取链上铭牌
  const resolvedInscription = useMemo<BadgeOnchainInscription | null>(() => {
    if (activeCeremonyItem) return activeCeremonyItem.inscription ?? null;
    if (onchainInscription) return onchainInscription;
    if (badge?.id !== 'reading') return null;
    const claimed = records.find((r) => r.activity.id === 'reading' && r.readingSummary?.readingClaimed && r.readingSummary.badgeTokenId != null);
    const rs = claimed?.readingSummary;
    if (!rs || rs.badgeTokenId == null || !rs.readingTxHash || rs.readingBlockNumber == null || !rs.readerWallet) return null;
    return {
      tokenId: rs.badgeTokenId,
      txHash: rs.readingTxHash,
      blockNumber: rs.readingBlockNumber,
      holderAddress: rs.readerWallet,
      proofDigest: rs.readingProofDigest ?? null,
      claimedAt: rs.readingClaimedAt ?? null,
      rewardSummary: 'Soulbound 勋章',
      contractAddress: LITTLE_PRINCE_CONTRACTS.readingBadge.address,
      explorerBaseUrl: MONAD_TESTNET_EXPLORER,
      justMinted: false,
    };
  }, [activeCeremonyItem, badge, onchainInscription, records]);

  const isSpotlight = Boolean(resolvedInscription?.justMinted || ceremonyList);
  const initFoil = isSpotlight ? SPOTLIGHT_FOIL : DEFAULT_FOIL;
  const initAngle = isSpotlight ? SPOTLIGHT_LIGHT_ANGLE : DEFAULT_LIGHT_ANGLE;
  const initEnv = isSpotlight ? SPOTLIGHT_ENV : DEFAULT_ENV;

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }),
    [],
  );
  // 用 callback ref 而不是 useRef：Radix Dialog 的内容渲染在 Portal 里，挂载时点晚于本组件的
  // useEffect，用 ref 读到的会是 null，查看器就永远不会被创建。
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const viewerRef = useRef<BadgeViewer | null>(null);
  const [status, setStatus] = useState<BadgeViewerStatus>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const [openedKey, setOpenedKey] = useState<string | null>(null);
  const [isBack, setIsBack] = useState(false);
  const [foil, setFoil] = useState(initFoil);
  const [lightAngle, setLightAngle] = useState(initAngle);
  const [envIntensity, setEnvIntensity] = useState(initEnv);
  /** 查看器根本没建起来（例如没有 WebGL）时，重试要靠它把整个创建流程再跑一遍。 */
  const [attempt, setAttempt] = useState(0);

  const currentKey = badge ? `${badge.id}:${isSpotlight ? 'mint' : 'view'}` : null;
  if (badge && currentKey !== openedKey) {
    setOpenedKey(currentKey);
    setStatus('loading');
    setMessage(null);
    setIsBack(false);
    setFoil(initFoil);
    setLightAngle(initAngle);
    setEnvIntensity(initEnv);
  }

  useEffect(() => {
    if (!badge || !stage) return;

    let cancelled = false;
    void (async () => {
      try {
        const viewer = await createBadgeViewer({
          container: stage,
          badge,
          initialFoil: initFoil,
          initialLightAngle: initAngle,
          initialEnvIntensity: initEnv,
          onStatusChange: (nextStatus, nextMessage) => {
            if (cancelled) return;
            setStatus(nextStatus);
            setMessage(nextMessage);
          },
          onSideChange: (back) => {
            if (!cancelled) setIsBack(back);
          },
        });
        // 异步创建期间被关闭：立刻交还资源，不在 DOM 里留 canvas。
        if (cancelled) { viewer?.dispose(); return; }
        viewerRef.current = viewer;
      } catch (reason) {
        if (cancelled) return;
        setStatus('error');
        setMessage(reason instanceof Error ? reason.message : '三维查看器初始化失败，可以重试。');
      }
    })();

    return () => {
      cancelled = true;
      viewerRef.current?.dispose();
      viewerRef.current = null;
    };
  }, [badge, stage, attempt, initFoil, initAngle, initEnv]);

  const copyText = useCallback((label: string, value: string) => {
    navigator.clipboard?.writeText(value).then(
      () => toast.success(`已复制${label}`),
      () => toast.success(`${label}：${value}`),
    );
  }, []);

  const handleReset = useCallback(() => {
    viewerRef.current?.reset();
    setFoil(DEFAULT_FOIL);
    setLightAngle(DEFAULT_LIGHT_ANGLE);
    setEnvIntensity(DEFAULT_ENV);
    viewerRef.current?.setFoil(DEFAULT_FOIL);
    viewerRef.current?.setLightAngle(DEFAULT_LIGHT_ANGLE);
    viewerRef.current?.setEnvIntensity(DEFAULT_ENV);
  }, []);

  const handleFlip = useCallback(() => {
    viewerRef.current?.flip(!isBack);
  }, [isBack]);

  const handleCapture = useCallback(() => {
    if (!badge) return;
    const url = viewerRef.current?.capturePng();
    if (!url) {
      toast.error('模型还在准备中，暂时无法保存画面。');
      return;
    }
    const anchor = document.createElement('a');
    anchor.download = `${badge.id}-atelier.png`;
    anchor.href = url;
    anchor.click();
    toast.success('已定格此刻的器物画面。');
  }, [badge]);

  useEffect(() => {
    if (!badge || status !== 'ready') return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'f') {
        event.preventDefault();
        handleFlip();
      } else if (key === 'r') {
        event.preventDefault();
        handleReset();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [badge, status, handleFlip, handleReset]);

  function retry() {
    setStatus('loading');
    setMessage(null);
    // 查看器还在（只是这一枚模型加载失败）时直接重拉；查看器没建成时重建整个查看器。
    if (viewerRef.current) { viewerRef.current.retry(); return; }
    setAttempt((value) => value + 1);
  }

  const stageStyle = badge
    ? ({ '--badge-glow': badge.glowRgb, '--badge-accent': badge.accentHex } as CSSProperties)
    : undefined;

  const explorerBase = (resolvedInscription?.explorerBaseUrl || MONAD_TESTNET_EXPLORER).replace(/\/+$/, '');

  return (
    <Dialog open={badge !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className={`badge-dialog ${isSpotlight ? 'badge-dialog-spotlight' : ''} ${resolvedInscription ? 'badge-dialog-inscribed' : ''}`}
        data-testid="badge-dialog"
        style={stageStyle}
        onCloseAutoFocus={(event) => {
          // 不用 DialogTrigger，Radix 没有可交还的触发点，这里显式把焦点还给卡片。
          if (!restoreFocusTo) return;
          event.preventDefault();
          restoreFocusTo();
        }}
      >
        {isSpotlight && (
          <div className="badge-mint-banner" data-testid="badge-mint-spotlight-banner">
            <span className="badge-mint-banner-left">
              <Sparkles size={16} aria-hidden="true" />
              <strong>
                {ceremonyList && ceremonyList.length > 1
                  ? `${resolvedInscription ? '上链铸造确认' : '高光铸造仪式'} · 同步获得 ${ceremonyList.length} 枚 3D 纪念勋章`
                  : resolvedInscription
                    ? `铸造确认 · Soulbound #${resolvedInscription.tokenId} 已镌刻上链`
                    : `高光铸造仪式 · 「${badge?.name ?? '纪念勋章'}」已点亮`}
              </strong>
            </span>
            <span className="badge-mint-banner-pill">
              <Award size={14} aria-hidden="true" />
              {pointsSummary ? `${pointsSummary}` : ''}
              {resolvedInscription?.rewardSummary ? `${pointsSummary ? ' · ' : ''}${resolvedInscription.rewardSummary}` : ''}
              {resolvedInscription?.blockNumber != null
                ? ` · Block #${resolvedInscription.blockNumber.toLocaleString('en-US')}`
                : resolvedInscription
                  ? ' · Monad Testnet'
                  : ''}
            </span>
          </div>
        )}

        {ceremonyList && ceremonyList.length > 1 && (
          <div className="badge-ceremony-switcher" role="tablist" aria-label="本次同步获得的两枚勋章" data-testid="ceremony-badge-switcher">
            {ceremonyList.map((item, idx) => (
              <button
                key={item.badge.id}
                type="button"
                role="tab"
                aria-selected={idx === ceremonyIndex}
                className={`badge-ceremony-tab ${idx === ceremonyIndex ? 'is-active' : ''}`}
                onClick={() => setCeremonyIndex(idx)}
                data-testid={`ceremony-tab-${item.badge.id}`}
              >
                <span className="badge-ceremony-role">{item.roleLabel}</span>
                <strong>{item.badge.name}</strong>
                {item.subtitle && <small>{item.subtitle}</small>}
              </button>
            ))}
          </div>
        )}

        <div className="badge-dialog-grid">
          <div className="badge-stage-column">
            <div className={`badge-stage-frame ${resolvedInscription ? 'is-minted-stage' : ''}`}>
              <div className="badge-stage-topbar" aria-hidden="true">
                <span className="badge-view-pill">
                  {resolvedInscription
                    ? (isBack ? `BACK · #${resolvedInscription.tokenId} 背面微雕` : `SOULBOUND MINTED · #${resolvedInscription.tokenId}`)
                    : (isBack ? 'BACK · 背面微雕' : 'FRONT · 正面')}
                </span>
                <span className="badge-edition-code">
                  {resolvedInscription?.blockNumber != null
                    ? `MONAD #${resolvedInscription.blockNumber.toLocaleString('en-US')}`
                    : resolvedInscription
                      ? 'MONAD TESTNET'
                      : (badge?.edition ?? '01 / 10')}
                </span>
              </div>
              <span className="badge-stage-vertical" aria-hidden="true">
                {resolvedInscription ? `READINGBADGE #${resolvedInscription.tokenId} · MONAD` : 'A MOMENT IN THE LIGHT'}
              </span>

              <div className="badge-stage" ref={setStage} data-status={status} data-testid="badge-stage">
                {status === 'loading' && (
                  <div className="badge-stage-overlay" role="status">
                    <LoaderCircle className="animate-spin" aria-hidden="true" />
                    <p>正在加载这一枚的三维模型…</p>
                    <small>只下载当前选中的这一枚，不加载其他徽章。</small>
                  </div>
                )}
                {status === 'error' && (
                  <div className="badge-stage-overlay badge-stage-error" role="alert">
                    <TriangleAlert aria-hidden="true" />
                    <p>{message ?? '模型加载失败。'}</p>
                    <Button variant="outline" onClick={retry}>重试加载</Button>
                  </div>
                )}
              </div>

              {resolvedInscription && (
                <div className="badge-stage-engraving" data-testid="badge-stage-engraving">
                  <span>TOKEN #{resolvedInscription.tokenId}</span>
                  <span>
                    {resolvedInscription.blockNumber != null
                      ? `BLK #${resolvedInscription.blockNumber.toLocaleString('en-US')}`
                      : 'MONAD 10143'}
                  </span>
                  <code>{shortenHex(resolvedInscription.holderAddress, 6, 4)}</code>
                </div>
              )}

              <p className="badge-stage-caption">拖拽旋转可观背面 · 滚轮或双指缩放 · F 翻面 · R 复位</p>
            </div>
          </div>

          <div className="badge-atelier-column">
            <DialogHeader className="badge-atelier-header">
              <p className="badge-atelier-eyebrow">
                <span className="atelier-diamond" aria-hidden="true" />
                <span>{resolvedInscription ? `SOULBOUND ERC-721 · TOKEN #${resolvedInscription.tokenId}` : (badge?.englishTitle ?? 'ARTIFACT')}</span>
              </p>
              <DialogTitle className="badge-dialog-title">{badge?.name ?? '徽章'}</DialogTitle>
              <DialogDescription className="badge-dialog-meta">
                <span className="badge-dialog-series">
                  {resolvedInscription ? '已铸造 · Soulbound 器物' : badge?.seriesLabel}
                </span>
                <span>{badge?.craftNote ?? badge?.material}</span>
              </DialogDescription>
            </DialogHeader>

            {resolvedInscription && (
              <section className="badge-inscription-plaque" aria-label="链上铸造镌刻铭牌" data-testid="badge-onchain-inscription">
                <div className="badge-inscription-head">
                  <span><ShieldCheck size={14} aria-hidden="true" /> 链上铸造铭牌 · ONCHAIN INSCRIPTION</span>
                  <span className="badge-inscription-chain">Monad Testnet · 10143</span>
                </div>
                <dl className="badge-inscription-grid">
                  <div>
                    <dt>Token ID</dt>
                    <dd>
                      <strong data-testid="inscribed-token-id">ReadingBadge #{resolvedInscription.tokenId}</strong>
                      <span className="badge-soulbound-chip">不可转让</span>
                    </dd>
                  </div>
                  <div>
                    <dt>区块号 (Block)</dt>
                    <dd>
                      <strong data-testid="inscribed-block-number">
                        {resolvedInscription.blockNumber != null
                          ? `#${resolvedInscription.blockNumber.toLocaleString('en-US')}`
                          : 'Monad 已确认'}
                      </strong>
                    </dd>
                  </div>
                  <div className="is-full">
                    <dt>交易哈希 (Tx Hash)</dt>
                    <dd>
                      <a
                        href={`${explorerBase}/tx/${resolvedInscription.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="badge-inscription-link"
                        data-testid="inscribed-tx-hash"
                      >
                        <code title={resolvedInscription.txHash}>{shortenHex(resolvedInscription.txHash, 14, 10)}</code>
                        <ExternalLink size={12} aria-hidden="true" />
                      </a>
                      <button
                        type="button"
                        className="badge-copy-mini"
                        onClick={() => copyText('交易哈希', resolvedInscription.txHash)}
                        aria-label="复制交易哈希"
                      >
                        <Copy size={12} />
                      </button>
                    </dd>
                  </div>
                  <div className="is-full">
                    <dt>持有人地址 (Holder)</dt>
                    <dd>
                      <a
                        href={`${explorerBase}/address/${resolvedInscription.holderAddress}`}
                        target="_blank"
                        rel="noreferrer"
                        className="badge-inscription-link"
                        data-testid="inscribed-holder-address"
                      >
                        <code title={resolvedInscription.holderAddress}>{shortenHex(resolvedInscription.holderAddress, 14, 10)}</code>
                        <ExternalLink size={12} aria-hidden="true" />
                      </a>
                      <button
                        type="button"
                        className="badge-copy-mini"
                        onClick={() => copyText('持有人地址', resolvedInscription.holderAddress)}
                        aria-label="复制持有人地址"
                      >
                        <Copy size={12} />
                      </button>
                    </dd>
                  </div>
                  {resolvedInscription.proofDigest && (
                    <div className="is-full">
                      <dt>EIP-712 核验摘要</dt>
                      <dd>
                        <code title={resolvedInscription.proofDigest}>{shortenHex(resolvedInscription.proofDigest, 14, 10)}</code>
                        <button
                          type="button"
                          className="badge-copy-mini"
                          onClick={() => copyText('EIP-712 摘要', resolvedInscription.proofDigest!)}
                          aria-label="复制 EIP-712 摘要"
                        >
                          <Copy size={12} />
                        </button>
                      </dd>
                    </div>
                  )}
                </dl>
              </section>
            )}

            {badge?.poeticNote && (
              <p className="badge-poetic-note">{badge.poeticNote}</p>
            )}

            <div className="badge-action-bar">
              <Button
                type="button"
                variant="secondary"
                className="badge-action-btn"
                onClick={handleFlip}
                disabled={status !== 'ready'}
              >
                <RefreshCw />
                {isBack ? '回到正面' : '翻看背面'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="badge-reset badge-action-btn"
                onClick={handleReset}
                disabled={status !== 'ready'}
              >
                <RotateCcw />
                复位视角
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="badge-action-btn"
                onClick={handleCapture}
                disabled={status !== 'ready'}
              >
                <Camera />
                定格此刻
              </Button>
            </div>

            <div className="badge-light-studio" aria-label="光影调校">
              <div className="badge-light-heading">
                <SlidersHorizontal aria-hidden="true" />
                <span>光影调校 · MAKE IT YOURS</span>
              </div>
              <div className="badge-sliders">
                <div className="badge-slider-item">
                  <div className="badge-slider-head">
                    <label htmlFor="badge-foil-slider">虹彩镀层</label>
                    <output htmlFor="badge-foil-slider">{Math.round(foil * 100)}%</output>
                  </div>
                  <input
                    id="badge-foil-slider"
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={foil}
                    disabled={status !== 'ready'}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      setFoil(next);
                      viewerRef.current?.setFoil(next);
                    }}
                  />
                </div>
                <div className="badge-slider-item">
                  <div className="badge-slider-head">
                    <label htmlFor="badge-light-slider">主光方位</label>
                    <output htmlFor="badge-light-slider">{lightAngle > 0 ? `+${lightAngle}°` : `${lightAngle}°`}</output>
                  </div>
                  <input
                    id="badge-light-slider"
                    type="range"
                    min={-180}
                    max={180}
                    step={1}
                    value={lightAngle}
                    disabled={status !== 'ready'}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      setLightAngle(next);
                      viewerRef.current?.setLightAngle(next);
                    }}
                  />
                </div>
                <div className="badge-slider-item">
                  <div className="badge-slider-head">
                    <label htmlFor="badge-env-slider">环境反射</label>
                    <output htmlFor="badge-env-slider">{Math.round(envIntensity * 100)}%</output>
                  </div>
                  <input
                    id="badge-env-slider"
                    type="range"
                    min={0.4}
                    max={1.6}
                    step={0.05}
                    value={envIntensity}
                    disabled={status !== 'ready'}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      setEnvIntensity(next);
                      viewerRef.current?.setEnvIntensity(next);
                    }}
                  />
                </div>
              </div>
            </div>

            {badgeState && (
              <section className="badge-provenance" aria-label="档案溯源与跨应用门户">
                <div className="badge-provenance-block">
                  <div className="badge-provenance-head">
                    <span className="badge-provenance-title">
                      <CheckCircle2 aria-hidden="true" />
                      本平台真实记录
                    </span>
                    <span className={`badge-provenance-pill ${badgeState.unlocked ? 'is-unlocked' : ''}`}>
                      {badgeState.unlocked
                        ? (badgeState.target
                          ? `已点亮 · ${badgeState.count}/${badgeState.target}`
                          : `已点亮 · ${badgeState.count} 次`)
                        : '尚未点亮'}
                    </span>
                  </div>
                  <div className="badge-provenance-specs">
                    <div>
                      <span>档案等级</span>
                      <strong>{badgeState.levelLabel}</strong>
                    </div>
                    <div>
                      <span>徽章来源</span>
                      <strong>{badgeState.sourceLabel}</strong>
                    </div>
                    <div>
                      <span>签发/核验方</span>
                      <strong>{badgeState.issuerLabel}</strong>
                    </div>
                    <div>
                      <span>获得时间</span>
                      <strong>
                        {badgeState.acquiredAt
                          ? `${dateFormat.format(new Date(badgeState.acquiredAt))} 获得`
                          : '待达成解锁条件'}
                      </strong>
                    </div>
                  </div>
                  {badgeState.matchedRecords.length > 0 ? (
                    <ul className="badge-provenance-list">
                      {badgeState.matchedRecords.slice(0, 4).map((record) => {
                        const completion = record.completion!;
                        const receiptId = completion.receipt.receiptId;
                        const shortReceipt = receiptId
                          ? `#${receiptId.slice(0, 6)}…${receiptId.slice(-4)}`
                          : '尚未申请凭证';
                        return (
                          <li key={record.participationId}>
                            <Link
                              to={`/complete/${record.participationId}`}
                              className="badge-provenance-record"
                              onClick={onClose}
                            >
                              <div className="badge-provenance-meta">
                                <span>{dateFormat.format(new Date(completion.declaredAt))} · Do Something 自报完成</span>
                                <code>{shortReceipt}</code>
                              </div>
                              <p className="badge-provenance-record-title">{record.activity.title}</p>
                              {completion.reflection.text && (
                                <p className="badge-provenance-quote">“{completion.reflection.text}”</p>
                              )}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="badge-provenance-empty">
                      <p>当前账户尚未在本平台完成此项约定。</p>
                      {badgeState.activityId ? (
                        <Link
                          to={`/activities/${badgeState.activityId}`}
                          className="badge-provenance-link"
                          onClick={onClose}
                        >
                          前往主题约定<ArrowRight aria-hidden="true" />
                        </Link>
                      ) : badge?.id === 'contract' ? (
                        <Link to="/records" className="badge-provenance-link" onClick={onClose}>
                          去完成记录申请凭证<ArrowRight aria-hidden="true" />
                        </Link>
                      ) : null}
                    </div>
                  )}
                </div>

                <div className="badge-provenance-block badge-portal-concept">
                  <div className="badge-provenance-head">
                    <span className="badge-provenance-title">
                      <Globe2 aria-hidden="true" />
                      跨应用门户汇聚
                    </span>
                    <span className="badge-concept-tag">
                      <Sparkles aria-hidden="true" />
                      跨平台门户概念介绍 · 非真实外部接入
                    </span>
                  </div>
                  <div className="badge-portal-platforms">
                    {badgeState.portalSource.platforms.map((platform) => (
                      <span key={platform} className="badge-portal-chip">{platform}</span>
                    ))}
                  </div>
                  <p className="badge-portal-summary">{badgeState.portalSource.summary}</p>
                  <p className="badge-portal-role">AI 上下文视角：{badgeState.portalSource.contextRole}</p>
                  {badgeState.portalSource.contractAnchors && badgeState.portalSource.contractAnchors.length > 0 && (
                    <div className="badge-contract-anchors" data-testid="badge-contract-anchors">
                      {badgeState.portalSource.contractAnchors.map((anchor) => (
                        <a
                          key={anchor.address}
                          href={anchor.explorerUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="badge-contract-anchor"
                        >
                          <div className="badge-contract-anchor-head">
                            <strong>{anchor.label}</strong>
                            <span>{anchor.note}</span>
                          </div>
                          <div className="badge-contract-anchor-addr">
                            <code>{anchor.address}</code>
                            <ExternalLink aria-hidden="true" />
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}

            <div className="badge-dialog-footer">
              <p className="badge-disclaimer">
                <Boxes />
                {resolvedInscription
                  ? `Soulbound ERC-721 · ReadingBadge #${resolvedInscription.tokenId} 已绑定当前读者档案（不可转让，可在 MonadVision 独立核验）。`
                  : '系列预览，只用于查看造型；不代表已获得，也不是 NFT、积分或任何奖励。'}
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
