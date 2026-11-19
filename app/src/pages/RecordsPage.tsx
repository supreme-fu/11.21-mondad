import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Boxes, Check, FileKey2, Globe2, LoaderCircle, LockKeyhole, ShieldAlert, Sparkles, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { ActivityGlyph } from '@/components/ActivityGlyph';
import { BadgeViewerDialog } from '@/components/BadgeViewerDialog';
import { HoloBadgeCard } from '@/components/HoloBadgeCard';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import { computeBadgeStates, loadBadges, type Badge } from '@/lib/badges';

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
        <DialogHeader><DialogTitle>注销后，哪些会被删除？</DialogTitle><DialogDescription>这个操作会立即执行，不能通过重新登录恢复当前账户。</DialogDescription></DialogHeader>
        <div className="delete-boundaries">
          <p><Check /><span><strong>服务端会删除</strong>：登录会话、参与与完成关联、私密及已分享正文、凭证与账户的链下映射。</span></p>
          <p><ShieldAlert /><span><strong>平台无法抹除</strong>：真实测试网已经广播或确认的公开记录、交易时间与相关地址。未广播的排队任务会取消；已经广播的交易仍可能确认。</span></p>
          <p><LockKeyhole /><span>本地模拟记录会随链下数据删除，不涉及真实链历史。他人此前截图或复制的内容也无法由平台收回。</span></p>
        </div>
        <label htmlFor="delete-confirmation">输入“注销”确认</label>
        <input id="delete-confirmation" className="form-field" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
        {error && <p className="form-error" role="alert">{error}</p>}
        <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>保留账户</Button><Button variant="destructive" onClick={() => void remove()} disabled={pending || confirmation !== '注销'}>{pending ? <LoaderCircle className="animate-spin" /> : <Trash2 />}永久注销当前账户</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function RecordsPage() {
  const { records, user } = useApp();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [showAllBadges, setShowAllBadges] = useState(false);
  const [activeBadge, setActiveBadge] = useState<Badge | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dateFormat = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' });

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
  const visibleBadges = useMemo(() => {
    if (showAllBadges) return badges;
    return badges.filter((badge) => badge.series === 'task' || badge.series === 'chain');
  }, [badges, showAllBadges]);

  // 为多次完成的同主题记录计算每条的次序号（按完成时间正序从第 1 次起算）
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
      <header className="records-header">
        <div>
          <p className="eyebrow">只属于 {user?.displayName} 的行动档案</p>
          <h1>我做过的事，<br />不需要排成成绩。</h1>
        </div>
        <p>这里没有连续天数和完成率。每一份记录都可以保留、撤回分享或删除正文。</p>
      </header>

      <section className="life-context-summary" aria-label="个人生活上下文摘要">
        <div className="life-context-copy">
          <span className="eyebrow"><Globe2 aria-hidden="true" />个人生活档案门户 · LIFE CONTEXT</span>
          <h2>分散在不同角落的真实行动，都在这里汇合。</h2>
          <p>这是一份跨场景的个人生活档案，未来可通过链上凭证串联你在不同应用中的行动，作为 AI 时代属于你自己的全面上下文。</p>
        </div>
        <dl className="life-context-metrics">
          <div>
            <dt>累计完成次数</dt>
            <dd>{completedRecords.length} 次</dd>
          </div>
          <div>
            <dt>已点亮器物</dt>
            <dd>{unlockedCount} / {badges.length || 10}</dd>
          </div>
          <div>
            <dt>已登记凭证</dt>
            <dd>{confirmedReceiptsCount} 枚</dd>
          </div>
        </dl>
      </section>

      {badges.length > 0 && (
        <section className="records-badge-archive" aria-labelledby="records-archive-title">
          <div className="records-archive-head">
            <div>
              <span className="eyebrow"><Sparkles aria-hidden="true" />三维器物档案架</span>
              <h2 id="records-archive-title">点亮你的纪念器物，点击查看 3D 造型与行动溯源</h2>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAllBadges((prev) => !prev)}
            >
              <Boxes aria-hidden="true" />
              {showAllBadges ? '仅看核心 5 枚器物' : `展开全部 ${badges.length} 枚器物`}
            </Button>
          </div>
          <ul className="records-archive-grid">
            {visibleBadges.map((badge) => {
              const state = badgeStates[badge.id];
              return (
                <li key={badge.id}>
                  <HoloBadgeCard
                    badge={badge}
                    onSelect={handleSelectBadge}
                    unlocked={state?.unlocked ?? false}
                    count={state?.count ?? 0}
                    target={state?.target}
                    dormantLabel="待点亮"
                  />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="records-timeline" aria-label="行动时间轴">
        <div className="records-timeline-head">
          <h2>行动时间轴</h2>
          <span>共 {records.length} 条参与记录 · 按时间倒序排列</span>
        </div>
        {records.length === 0 ? (
          <div className="empty-state">
            <h2>这里还很安静</h2>
            <p>从一件真正想做的事开始。你可以只完成，不留下任何故事。</p>
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
                      {nth && <span>第 {nth} 次回应</span>}
                    </div>
                    <h2>{record.activity.title}</h2>
                    <div className="record-badges">
                      <span className="badge">
                        {completion ? <><Check />自报完成</> : record.participationStatus === 'left' ? '已暂时离开' : '约定进行中'}
                      </span>
                      {completion && (
                        <span className="badge">
                          {completion.reflection.visibility === 'shared' ? '感受已分享' : '感受仅自己可见'}
                        </span>
                      )}
                      {receipt && receipt.status !== 'not_requested' && (
                        <span className="badge">
                          <FileKey2 />
                          {receipt.mode === 'simulation' ? '模拟凭证' : '测试网凭证'} · {receipt.status === 'confirmed' ? '已登记' : receipt.status === 'failed' ? '登记失败' : '处理中'}
                        </span>
                      )}
                    </div>
                    {completion?.reflection.text ? (
                      <p className="record-reflection">“{completion.reflection.text}”</p>
                    ) : (
                      <p className="record-no-reflection">
                        {completion ? '没有留下公开正文，也同样是一次完整的行动。' : '按自己的节奏去做，没有倒计时。'}
                      </p>
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

      <section className="records-badges-entry">
        <div>
          <p className="eyebrow">徽章预览</p>
          <h2>只作纪念的器物，不作攀比的奖章。</h2>
          <p>徽章只是设计侧的系列预览：点开一枚看三维造型，不代表获得，也不对应 NFT 或任何奖励。</p>
        </div>
        <Link className="primary-link" to="/badges">去看徽章预览<ArrowRight /></Link>
      </section>

      <section className="account-danger" id="account">
        <div>
          <p className="eyebrow">账户与删除</p>
          <h2>离开，也应该是一件清楚的事。</h2>
          <p>注销当前演示账户会删除链下内容与会话。真实链上历史无法由平台单方面抹除，正文从未写入链上。</p>
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
