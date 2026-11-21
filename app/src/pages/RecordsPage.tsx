import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownWideNarrow, ArrowRight, Boxes, Check, Clock3, Coins, Copy, Cpu, FileKey2, Layers, LoaderCircle, LockKeyhole, ShieldAlert, Sparkles, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ActivityGlyph } from '@/components/ActivityGlyph';
import { BadgeViewerDialog } from '@/components/BadgeViewerDialog';
import { HoloBadgeCard } from '@/components/HoloBadgeCard';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import { computeBadgeStates, loadBadges, type Badge } from '@/lib/badges';
import { LITTLE_PRINCE_CONTRACTS } from '@/lib/reading-contracts';

type BadgeSortMode = 'time' | 'level' | 'default';

function DeleteAccountDialog() {
  const { clearUser } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function remove() {
    if (confirmation !== '注销') { setError('请输入“注销”以确认。'); return; }
    setPending(true); setError('');
    try {
      await api.deleteAccount();
      setOpen(false);
      clearUser();
      navigate('/');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '注销暂时失败。'); }
    finally { setPending(false); }
  }
  return (
    <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) { setConfirmation(''); setError(''); } }}>
      <DialogTrigger asChild><Button variant="outline"><Trash2 />注销当前演示账户</Button></DialogTrigger>
      <DialogContent className="delete-dialog">
        <DialogHeader><DialogTitle>确认注销当前账户？</DialogTitle><DialogDescription>操作会立即删除当前账户的链下记录与会话，无法恢复。</DialogDescription></DialogHeader>
        <div className="delete-boundaries">
          <p><Check /><span><strong>将删除</strong>：登录会话、参与与完成记录、感受正文及链下映射。</span></p>
          <p><ShieldAlert /><span><strong>不可撤回</strong>：已确认的公开测试网链上记录无法由平台抹除。</span></p>
          <p><LockKeyhole /><span>本地模拟记录会随账户一同删除。</span></p>
        </div>
        <label htmlFor="delete-confirmation">输入“注销”确认</label>
        <input id="delete-confirmation" className="form-field" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
        {error && <p className="form-error" role="alert">{error}</p>}
        <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>取消</Button><Button variant="destructive" onClick={() => void remove()} disabled={pending || confirmation !== '注销'}>{pending ? <LoaderCircle className="animate-spin" /> : <Trash2 />}永久注销</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function RecordsPage() {
  const { records, user, refreshSession } = useApp();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [showAllBadges, setShowAllBadges] = useState(false);
  const [badgeSortMode, setBadgeSortMode] = useState<BadgeSortMode>('level');
  const [showAgentJson, setShowAgentJson] = useState(false);
  const [refilledFilmRolls, setRefilledFilmRolls] = useState(0);
  const [refilling, setRefilling] = useState(false);
  const [activeBadge, setActiveBadge] = useState<Badge | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const currentPoints = user?.points ?? 100;
  const dateFormat = useMemo(() => new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }), []);
  const dateTimeFormat = useMemo(
    () => new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    [],
  );

  useEffect(() => {
    let active = true;
    loadBadges().then((loaded) => { if (active) setBadges(loaded); }).catch(() => {});
    return () => { active = false; };
  }, []);

  const badgeStates = useMemo(() => computeBadgeStates(badges, records), [badges, records]);
  const completedRecords = useMemo(() => records.filter((item) => item.completion !== null), [records]);
  const confirmedReceiptsCount = useMemo(
    () => completedRecords.filter((item) => item.completion?.receipt.status === 'confirmed').length,
    [completedRecords],
  );
  const unlockedCount = useMemo(
    () => Object.values(badgeStates).filter((state) => state.unlocked).length,
    [badgeStates],
  );
  const sharedReflectionsCount = useMemo(
    () => completedRecords.filter((item) => item.completion?.reflection.visibility === 'shared' && item.completion?.reflection.text).length,
    [completedRecords],
  );

  const visibleBadges = useMemo(() => {
    const base = showAllBadges
      ? [...badges]
      : badges.filter((badge) => badge.series === 'task' || badge.series === 'chain');

    if (badgeSortMode === 'time') {
      return base.sort((a, b) => {
        const stateA = badgeStates[a.id];
        const stateB = badgeStates[b.id];
        const unlockedA = stateA?.unlocked ? 1 : 0;
        const unlockedB = stateB?.unlocked ? 1 : 0;
        if (unlockedA !== unlockedB) return unlockedB - unlockedA;
        const timeA = stateA?.acquiredAt ? new Date(stateA.acquiredAt).getTime() : 0;
        const timeB = stateB?.acquiredAt ? new Date(stateB.acquiredAt).getTime() : 0;
        if (timeA !== timeB) return timeB - timeA;
        return (stateB?.levelRank ?? 0) - (stateA?.levelRank ?? 0);
      });
    }

    if (badgeSortMode === 'level') {
      return base.sort((a, b) => {
        const stateA = badgeStates[a.id];
        const stateB = badgeStates[b.id];
        const unlockedA = stateA?.unlocked ? 1 : 0;
        const unlockedB = stateB?.unlocked ? 1 : 0;
        if (unlockedA !== unlockedB) return unlockedB - unlockedA;
        const rankDiff = (stateB?.levelRank ?? 0) - (stateA?.levelRank ?? 0);
        if (rankDiff !== 0) return rankDiff;
        const timeA = stateA?.acquiredAt ? new Date(stateA.acquiredAt).getTime() : 0;
        const timeB = stateB?.acquiredAt ? new Date(stateB.acquiredAt).getTime() : 0;
        return timeB - timeA;
      });
    }

    return base;
  }, [badges, showAllBadges, badgeSortMode, badgeStates]);

  const structuredIdentityPayload = useMemo(() => {
    const domainCounts: Record<string, { title: string; category: string; count: number; trustTier: string; latestAt: string | null }> = {};
    for (const item of completedRecords) {
      const id = item.activity.id;
      const declaredAt = item.completion!.declaredAt;
      const existing = domainCounts[id];
      const trustTier = id === 'reading' ? 'ISSUER_VERIFIED_EIP712' : 'SELF_ATTESTED_RECEIPT';
      if (!existing) {
        domainCounts[id] = { title: item.activity.title, category: item.activity.category, count: 1, trustTier, latestAt: declaredAt };
      } else {
        existing.count += 1;
        if (!existing.latestAt || new Date(declaredAt).getTime() > new Date(existing.latestAt).getTime()) {
          existing.latestAt = declaredAt;
        }
      }
    }
    const unlockedBadges = badges
      .map((badge) => {
        const state = badgeStates[badge.id];
        return {
          badgeId: badge.id,
          name: badge.name,
          unlocked: state?.unlocked ?? false,
          tier: state?.tierCode ?? 'Tier A',
          level: state?.levelLabel ?? '',
          source: state?.sourceLabel ?? '',
          acquiredAt: state?.acquiredAt ?? null,
          completionCount: state?.count ?? 0,
        };
      })
      .filter((b) => b.unlocked);

    return {
      schema: 'https://mojo.devnads.com/schemas/life-context-agent-identity/v1',
      subject: {
        did: `did:monad:10143:user-${user?.demoKey ?? 'a'}`,
        displayName: user?.displayName ?? '阿黎',
        chainId: 10143,
        pointsBalance: currentPoints,
        anchorContracts: {
          readingBadge: LITTLE_PRINCE_CONTRACTS.readingBadge.address,
          readingChallenge: LITTLE_PRINCE_CONTRACTS.readingChallenge.address,
        },
      },
      summary: {
        totalCompletedActions: completedRecords.length,
        unlockedBadgesCount: unlockedBadges.length,
        confirmedReceiptsCount,
        sharedReflectionsCount,
      },
      unlockedBadges,
      activeDomains: Object.values(domainCounts),
    };
  }, [badges, badgeStates, completedRecords, confirmedReceiptsCount, currentPoints, sharedReflectionsCount, user]);

  const handleRefillFilmRoll = useCallback(async () => {
    if (refilling) return;
    setRefilling(true);
    try {
      const result = await api.refillPoints();
      setRefilledFilmRolls((prev) => prev + 1);
      await refreshSession();
      toast.success(`已装填 1 卷「生活胶卷（$6 / +${result.addedPoints} 次无感刻痕）」，当前可用余额 ${result.points} 点。`);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : '模拟充值暂时失败，请稍后重试。');
    } finally {
      setRefilling(false);
    }
  }, [refilling, refreshSession]);

  const handleCopyAgentContext = useCallback(() => {
    const text = JSON.stringify(structuredIdentityPayload, null, 2);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        toast.success('已复制个人档案 JSON');
      }).catch(() => {
        toast.success('已生成个人档案 JSON');
      });
    }
  }, [structuredIdentityPayload]);

  const ordinalByParticipation = useMemo(() => {
    const map = new Map<string, number>();
    const byActivity = new Map<string, typeof completedRecords>();
    for (const item of completedRecords) {
      const list = byActivity.get(item.activity.id) ?? [];
      list.push(item);
      byActivity.set(item.activity.id, list);
    }
    for (const list of byActivity.values()) {
      const sorted = [...list].sort(
        (a, b) => new Date(a.completion!.declaredAt).getTime() - new Date(b.completion!.declaredAt).getTime(),
      );
      sorted.forEach((item, index) => {
        map.set(item.participationId, index + 1);
      });
    }
    return map;
  }, [completedRecords]);

  const handleSelectBadge = useCallback((badge: Badge, trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setActiveBadge(badge);
  }, []);

  return (
    <div className="records-page page-container">
      <header className="records-compact-header">
        <div>
          <p className="eyebrow">个人档案 · {user?.displayName}</p>
          <h1>我的记录与徽章墙</h1>
        </div>
        <div className="records-header-right">
          <dl className="records-mini-metrics">
            <div>
              <dt>累计完成</dt>
              <dd>{completedRecords.length} 次</dd>
            </div>
            <div>
              <dt>已点亮器物</dt>
              <dd>{unlockedCount} / {badges.length || 10}</dd>
            </div>
            <div>
              <dt>链上凭证</dt>
              <dd>{confirmedReceiptsCount} 枚</dd>
            </div>
          </dl>
          <div className="records-export-actions">
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="toggle-agent-json-btn"
              onClick={() => setShowAgentJson((prev) => !prev)}
            >
              <Cpu size={14} aria-hidden="true" />
              {showAgentJson ? '收起 JSON' : '查看档案 JSON'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-testid="copy-agent-json-btn"
              onClick={handleCopyAgentContext}
            >
              <Copy size={14} aria-hidden="true" />
              复制 JSON
            </Button>
          </div>
        </div>
      </header>

      {showAgentJson && (
        <div className="agent-json-panel" data-testid="agent-json-panel">
          <div className="agent-json-header">
            <span>Agent Context Payload (JSON-LD / MCP Ready)</span>
            <span>实时由当前档案与徽章生成</span>
          </div>
          <pre className="agent-json-pre">
            <code>{JSON.stringify(structuredIdentityPayload, null, 2)}</code>
          </pre>
        </div>
      )}

      <section className="points-wallet-card" aria-label="上链点数余额与生活胶卷充值" data-testid="points-wallet-card">
        <div className="points-wallet-main">
          <div className="points-wallet-copy">
            <span className="eyebrow"><Coins aria-hidden="true" />点数与生活胶卷余额</span>
            <div className="points-wallet-balance-row">
              <strong className="points-wallet-amount" data-testid="wallet-points-balance">{currentPoints}</strong>
              <span className="points-wallet-unit">点（次可用上链额度）</span>
              <span className="badge">每次上链扣 1 点</span>
              {refilledFilmRolls > 0 && (
                <span className="badge">本次已装填 +{refilledFilmRolls} 卷</span>
              )}
            </div>
            <p className="points-wallet-desc">
              完成约定后选择上链铸造 3D 勋章与凭证时消耗 1 点数，可随时装填生活胶卷补充额度。
            </p>
          </div>
          <div className="points-wallet-actions">
            <Button
              type="button"
              variant="default"
              size="lg"
              className="points-refill-btn"
              disabled={refilling}
              data-testid="refill-film-roll-btn"
              onClick={() => void handleRefillFilmRoll()}
            >
              {refilling ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
              模拟装填 1 卷生活胶卷（$6 / +60 次无感刻痕）
            </Button>
          </div>
        </div>
      </section>

      {badges.length > 0 && (
        <section className="records-badge-archive" aria-labelledby="records-archive-title" data-testid="badge-wall-section">
          <div className="records-archive-head">
            <div>
              <span className="eyebrow"><Sparkles aria-hidden="true" />BADGE WALL</span>
              <h2 id="records-archive-title">三维徽章墙</h2>
            </div>
            <div className="badge-wall-controls" role="group" aria-label="徽章墙排序与展开控制">
              <div className="badge-sort-group" data-testid="badge-sort-controls">
                <Button
                  type="button"
                  variant={badgeSortMode === 'level' ? 'default' : 'outline'}
                  size="sm"
                  data-testid="sort-badges-level"
                  onClick={() => setBadgeSortMode('level')}
                >
                  <ArrowDownWideNarrow aria-hidden="true" />
                  按等级
                </Button>
                <Button
                  type="button"
                  variant={badgeSortMode === 'time' ? 'default' : 'outline'}
                  size="sm"
                  data-testid="sort-badges-time"
                  onClick={() => setBadgeSortMode('time')}
                >
                  <Clock3 aria-hidden="true" />
                  按时间
                </Button>
                <Button
                  type="button"
                  variant={badgeSortMode === 'default' ? 'default' : 'outline'}
                  size="sm"
                  data-testid="sort-badges-default"
                  onClick={() => setBadgeSortMode('default')}
                >
                  <Layers aria-hidden="true" />
                  按编号
                </Button>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAllBadges((prev) => !prev)}
              >
                <Boxes aria-hidden="true" />
                {showAllBadges ? '仅看核心 5 枚' : `展开全部 ${badges.length} 枚`}
              </Button>
            </div>
          </div>
          <ul className="records-archive-grid">
            {visibleBadges.map((badge) => {
              const state = badgeStates[badge.id];
              const acquiredAtLabel = state?.unlocked && state.acquiredAt
                ? `${dateTimeFormat.format(new Date(state.acquiredAt))} 获得`
                : '待完成解锁';
              return (
                <li key={badge.id}>
                  <HoloBadgeCard
                    badge={badge}
                    onSelect={handleSelectBadge}
                    unlocked={state?.unlocked ?? false}
                    count={state?.count ?? 0}
                    target={state?.target}
                    dormantLabel="待点亮"
                    tierCode={state?.tierCode}
                    levelLabel={state?.levelLabel}
                    sourceLabel={state?.sourceLabel}
                    acquiredAtLabel={acquiredAtLabel}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="records-timeline" aria-label="行动时间轴">
        <div className="records-timeline-head">
          <div>
            <h2>行动时间轴</h2>
          </div>
          <span>共 {records.length} 条记录</span>
        </div>
        {records.length === 0 ? (
          <div className="empty-state">
            <h2>还没有记录</h2>
            <Link className="primary-link" to="/">去发现主题<ArrowRight /></Link>
          </div>
        ) : (
          <div className="record-list">
            {records.map((record) => {
              const completion = record.completion;
              const receipt = completion?.receipt;
              const nth = completion ? ordinalByParticipation.get(record.participationId) : undefined;
              return (
                <article className="record-item" key={record.participationId}>
                  <ActivityGlyph activityId={record.activity.id} />
                  <div className="record-main">
                    <div className="activity-meta">
                      <span>{record.activity.category}</span>
                      <span>
                        {completion
                          ? `完成于 ${dateFormat.format(new Date(completion.declaredAt))}`
                          : `约定于 ${dateFormat.format(new Date(record.joinedAt))}`}
                      </span>
                      {nth && <span>第 {nth} 次</span>}
                    </div>
                    <h2>{record.activity.title}</h2>
                    <div className="record-badges">
                      <span className="badge">
                        {completion ? <><Check />已完成</> : record.participationStatus === 'left' ? '已暂时离开' : '进行中'}
                      </span>
                      {completion && (
                        <span className="badge">
                          {completion.reflection.visibility === 'shared' ? '已分享' : '仅自己可见'}
                        </span>
                      )}
                      {receipt && receipt.status !== 'not_requested' && (
                        <span className="badge">
                          <FileKey2 />
                          {receipt.mode === 'simulation' ? '模拟凭证' : '测试网凭证'} · {receipt.status === 'confirmed' ? '已登记' : receipt.status === 'failed' ? '失败' : '处理中'}
                        </span>
                      )}
                    </div>
                    {completion?.reflection.text && (
                      <p className="record-reflection">“{completion.reflection.text}”</p>
                    )}
                  </div>
                  <Link
                    className="record-action"
                    to={record.participationStatus === 'left' ? `/activities/${record.activity.id}` : `/complete/${record.participationId}`}
                    aria-label={`${completion ? '查看' : '继续'}${record.activity.title}`}
                  >
                    <ArrowRight />
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="account-danger" id="account">
        <div>
          <p className="eyebrow">账户管理</p>
          <h2>注销当前演示账户</h2>
        </div>
        <DeleteAccountDialog />
      </section>

      <BadgeViewerDialog
        badge={activeBadge}
        onClose={() => setActiveBadge(null)}
        restoreFocusTo={() => triggerRef.current?.focus()}
      />
    </div>
  );
}
