import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownWideNarrow, ArrowRight, Bot, Boxes, Check, Clock3, Copy, Cpu, FileKey2, Globe2, Layers, LoaderCircle, LockKeyhole, ShieldAlert, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
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
  const [badgeSortMode, setBadgeSortMode] = useState<BadgeSortMode>('level');
  const [showAgentJson, setShowAgentJson] = useState(false);
  const [activeBadge, setActiveBadge] = useState<Badge | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
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

  const issuerVerifiedRecords = useMemo(
    () => completedRecords.filter((item) => item.activity.id === 'reading'),
    [completedRecords],
  );
  const selfAttestedRecords = useMemo(
    () => completedRecords.filter((item) => item.activity.id !== 'reading'),
    [completedRecords],
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
        domainCounts[id] = {
          title: item.activity.title,
          category: item.activity.category,
          count: 1,
          trustTier,
          latestAt: declaredAt,
        };
      } else {
        existing.count += 1;
        if (!existing.latestAt || new Date(declaredAt).getTime() > new Date(existing.latestAt).getTime()) {
          existing.latestAt = declaredAt;
        }
      }
    }

    const badgeInventory = badges.map((badge) => {
      const state = badgeStates[badge.id];
      return {
        badgeId: badge.id,
        name: badge.name,
        unlocked: state?.unlocked ?? false,
        tier: state?.tierCode ?? 'Tier A',
        level: state?.levelLabel ?? '',
        levelRank: state?.levelRank ?? 0,
        trustTier: state?.trustTier ?? 'self_attested',
        source: state?.sourceLabel ?? '',
        issuer: state?.issuerLabel ?? '',
        acquiredAt: state?.acquiredAt ?? null,
        completionCount: state?.count ?? 0,
      };
    });

    const unlockedBadges = badgeInventory.filter((b) => b.unlocked);

    return {
      schema: 'https://mojo.devnads.com/schemas/life-context-agent-identity/v1',
      positioning: '面向 Agent 时代的个人链上身份档案 (Onchain Personal Identity & Life Context Archive)',
      subject: {
        did: `did:monad:10143:user-${user?.demoKey ?? 'a'}`,
        displayName: user?.displayName ?? '阿黎',
        chainId: 10143,
        network: 'Monad Testnet',
        anchorContracts: {
          readingBadge: LITTLE_PRINCE_CONTRACTS.readingBadge.address,
          readingChallenge: LITTLE_PRINCE_CONTRACTS.readingChallenge.address,
        },
      },
      trustArchitecture: {
        philosophy: '分层来源标注：兼容三方机构 EIP-712 核销（购书/共读/景区门票二维码核销）与个人主权声明（留白信任），为个人 AI Agent 提供长期可分辨来源的身份上下文。',
        issuerVerifiedCount: issuerVerifiedRecords.length,
        selfAttestedCount: selfAttestedRecords.length,
        onchainReceiptsCount: confirmedReceiptsCount,
      },
      badgeWallSummary: {
        sortSupported: ['acquiredAt', 'levelRank'],
        unlockedCount: unlockedBadges.length,
        totalCatalog: badges.length || 10,
        unlockedBadges,
      },
      structuredBehavioralContext: {
        totalCompletedActions: completedRecords.length,
        sharedReflectionsCount,
        privateSilenceCount: Math.max(0, completedRecords.length - sharedReflectionsCount),
        activeDomains: Object.values(domainCounts),
      },
    };
  }, [badges, badgeStates, completedRecords, confirmedReceiptsCount, issuerVerifiedRecords.length, selfAttestedRecords.length, sharedReflectionsCount, user]);

  const handleCopyAgentContext = useCallback(() => {
    const text = JSON.stringify(structuredIdentityPayload, null, 2);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        toast.success('已复制结构化 Agent 可信上下文 JSON');
      }).catch(() => {
        toast.success('已生成结构化 Agent 上下文载荷');
      });
    }
  }, [structuredIdentityPayload]);

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
          <p className="eyebrow">面向 Agent 时代的个人链上身份档案 · {user?.displayName}</p>
          <h1>我做过的事，<br />不需要排成成绩。</h1>
        </div>
        <p>这里没有打卡监控与押金罚没。每一项活动执行都会沉淀为带签发方分层的结构化身份档案，为未来的个人 AI Agent 提供可验证的生活上下文。</p>
      </header>

      <section className="life-context-summary" aria-label="个人生活上下文摘要">
        <div className="life-context-copy">
          <span className="eyebrow"><Globe2 aria-hidden="true" />个人生活档案门户 · LIFE CONTEXT · AGENT IDENTITY</span>
          <h2>面向 Agent 时代的个人链上身份档案：分散在不同角落的真实行动，都在这里汇合。</h2>
          <p>
            我们的核心是构建<strong>个人链上身份档案与结构化上下文底座</strong>；本应用中的“读书（《小王子》共读）”、“做菜”、“相见”、“出行”均作为<strong>补充个人档案中“活动执行与凭证采集”部分的现场演示模块</strong>，兼容<strong>三方机构 EIP-712 核销（如共读/购书/景区门票核销）</strong>与<strong>个人主权声明（留白信任）</strong>两类来源。
          </p>
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
        <section className="records-badge-archive" aria-labelledby="records-archive-title" data-testid="badge-wall-section">
          <div className="records-archive-head">
            <div>
              <span className="eyebrow"><Sparkles aria-hidden="true" />个人链上徽章墙 · BADGE WALL</span>
              <h2 id="records-archive-title">三维器物徽章墙：支持按获得时间或等级排序，完整记录徽章来源与签发方</h2>
              <p className="records-archive-subtitle">
                每枚徽章均标注<strong>档案等级（Tier / Lv）</strong>、<strong>徽章来源（签发通道）</strong>与<strong>精确获得时间</strong>；点击任一徽章可旋转查看 3D 器物与链上合约溯源。
              </p>
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
                  按徽章等级排序
                </Button>
                <Button
                  type="button"
                  variant={badgeSortMode === 'time' ? 'default' : 'outline'}
                  size="sm"
                  data-testid="sort-badges-time"
                  onClick={() => setBadgeSortMode('time')}
                >
                  <Clock3 aria-hidden="true" />
                  按获得时间排序
                </Button>
                <Button
                  type="button"
                  variant={badgeSortMode === 'default' ? 'default' : 'outline'}
                  size="sm"
                  data-testid="sort-badges-default"
                  onClick={() => setBadgeSortMode('default')}
                >
                  <Layers aria-hidden="true" />
                  按图谱编号
                </Button>
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
          </div>
          <ul className="records-archive-grid">
            {visibleBadges.map((badge) => {
              const state = badgeStates[badge.id];
              const acquiredAtLabel = state?.unlocked && state.acquiredAt
                ? `${dateTimeFormat.format(new Date(state.acquiredAt))} 获得`
                : '尚未获得 · 待完成对应活动解锁';
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

      <section className="agent-structured-identity" aria-label="面向 Agent 的个人结构化档案与可信上下文" data-testid="agent-structured-identity">
        <div className="agent-identity-head">
          <div>
            <span className="eyebrow"><Bot aria-hidden="true" />STRUCTURED IDENTITY & AGENT CONTEXT · 结构化个人档案</span>
            <h2>为未来个人 AI Agent 提供带签发方分层与时间轴的可信上下文</h2>
            <p>
              信任是一个长期累积的过程。我们将<strong>第三方机构核销凭证（如共读组织、线上购书、景区门票二维码核销）</strong>与<strong>个人主权声明（如做饭、见想见的人的留白约定）</strong>在结构化字段中明确分层，让未来的个人 AI Agent 既能分辨哪些是经外部核验的客观事实，又能读懂主人长期的真实生活偏好。
            </p>
          </div>
          <div className="agent-identity-actions">
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="toggle-agent-json-btn"
              onClick={() => setShowAgentJson((prev) => !prev)}
            >
              <Cpu aria-hidden="true" />
              {showAgentJson ? '收起 Agent JSON 载荷' : '查看 Agent 结构化 JSON 载荷'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-testid="copy-agent-json-btn"
              onClick={handleCopyAgentContext}
            >
              <Copy aria-hidden="true" />
              复制 Agent 上下文
            </Button>
          </div>
        </div>

        <div className="agent-identity-grid">
          <article className="agent-identity-card">
            <div className="agent-card-title">
              <ShieldCheck aria-hidden="true" />
              <h3>1. 链上身份主体（Identity Subject）</h3>
            </div>
            <dl className="agent-struct-dl">
              <div>
                <dt>档案 DID 标识</dt>
                <dd><code>{structuredIdentityPayload.subject.did}</code></dd>
              </div>
              <div>
                <dt>锚定网络</dt>
                <dd>Monad Testnet · Chain ID <code>10143</code></dd>
              </div>
              <div>
                <dt>共读勋章合约</dt>
                <dd><code>{LITTLE_PRINCE_CONTRACTS.readingBadge.address.slice(0, 10)}…{LITTLE_PRINCE_CONTRACTS.readingBadge.address.slice(-6)}</code></dd>
              </div>
              <div>
                <dt>核验挑战合约</dt>
                <dd><code>{LITTLE_PRINCE_CONTRACTS.readingChallenge.address.slice(0, 10)}…{LITTLE_PRINCE_CONTRACTS.readingChallenge.address.slice(-6)}</code></dd>
              </div>
            </dl>
          </article>

          <article className="agent-identity-card">
            <div className="agent-card-title">
              <Layers aria-hidden="true" />
              <h3>2. 凭证信任分层（Provenance Tiers）</h3>
            </div>
            <dl className="agent-struct-dl">
              <div>
                <dt>机构 / 三方核销层</dt>
                <dd><strong>{issuerVerifiedRecords.length} 条</strong>（EIP-712 签发 · 共读/购书/门票核销）</dd>
              </div>
              <div>
                <dt>个人主权声明层</dt>
                <dd><strong>{selfAttestedRecords.length} 条</strong>（Self-Attested · 尊重私人空间留白）</dd>
              </div>
              <div>
                <dt>链上匿名凭证锚点</dt>
                <dd><strong>{confirmedReceiptsCount} 枚</strong>（32 字节 CompletionReceipt）</dd>
              </div>
              <div>
                <dt>企业/三方接入协议</dt>
                <dd>支持通过 <code>ActivityHub</code> 接入出版社与文旅核销</dd>
              </div>
            </dl>
          </article>

          <article className="agent-identity-card">
            <div className="agent-card-title">
              <Bot aria-hidden="true" />
              <h3>3. 结构化行为画像（Agent Context）</h3>
            </div>
            <dl className="agent-struct-dl">
              <div>
                <dt>已激活生活维度</dt>
                <dd>
                  {structuredIdentityPayload.structuredBehavioralContext.activeDomains.length > 0
                    ? structuredIdentityPayload.structuredBehavioralContext.activeDomains
                      .map((d) => `${d.category}(${d.count}次)`)
                      .join(' · ')
                    : '待通过活动演示模块采集'}
                </dd>
              </div>
              <div>
                <dt>表达与留白比例</dt>
                <dd>公开共鸣 {sharedReflectionsCount} 次 / 私密留白 {Math.max(0, completedRecords.length - sharedReflectionsCount)} 次</dd>
              </div>
              <div>
                <dt>已获徽章资产</dt>
                <dd>已解锁 {unlockedCount} 枚（含来源、等级与时间戳）</dd>
              </div>
              <div>
                <dt>隐私保护边界</dt>
                <dd>500 字感悟留存链下可随时撤回，链上仅存结构化锚点</dd>
              </div>
            </dl>
          </article>
        </div>

        {showAgentJson && (
          <div className="agent-json-panel" data-testid="agent-json-panel">
            <div className="agent-json-header">
              <span>Agent Context Payload (JSON-LD / MCP Ready)</span>
              <span>实时由当前用户的链上档案、徽章墙与活动执行记录生成</span>
            </div>
            <pre className="agent-json-pre">
              <code>{JSON.stringify(structuredIdentityPayload, null, 2)}</code>
            </pre>
          </div>
        )}
      </section>

      <section className="records-timeline" aria-label="行动时间轴">
        <div className="records-timeline-head">
          <div>
            <h2>档案活动执行记录（行动时间轴）</h2>
            <p className="records-timeline-note">以下记录由本应用的活动执行演示模块（读书、做菜、相见、出行）产生，实时补充进上方的个人链上身份档案与徽章墙。</p>
          </div>
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
              const isIssuerVerified = record.activity.id === 'reading';
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
                      <span className="badge record-provenance-badge">
                        {isIssuerVerified
                          ? '来源：机构 EIP-712 核验 · 共读主理方/购书节点'
                          : '来源：个人主权声明 · 本人约定锚点'}
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
