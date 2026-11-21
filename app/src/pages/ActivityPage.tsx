import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpenCheck, Check, Clock3, ExternalLink, FileKey2, HeartHandshake, History, LoaderCircle, ShieldCheck, Sparkles } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { ActivityGlyph } from '@/components/ActivityGlyph';
import { LittlePrinceReader } from '@/components/LittlePrinceReader';
import { Button } from '@/components/ui/button';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import { LITTLE_PRINCE_CONTRACTS, shortenHex } from '@/lib/reading-contracts';
import type { ActivityDetail } from '@/types';

export default function ActivityPage() {
  const { id = '' } = useParams();
  const { records, refreshRecords } = useApp();
  const [activity, setActivity] = useState<ActivityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try { setActivity(await api.activity(id)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '主题加载失败。'); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function join() {
    setPending(true);
    try {
      await api.join(id);
      await Promise.all([load(), refreshRecords()]);
      toast.success('约定已收下。按自己的节奏去做就好。');
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : '暂时无法加入。'); }
    finally { setPending(false); }
  }

  async function leave() {
    const activeId = activity?.activeParticipation?.id ?? activity?.participation?.id;
    if (!activeId) return;
    setPending(true);
    try {
      await api.leave(activeId);
      await Promise.all([load(), refreshRecords()]);
      toast.success('已暂时离开，没有产生任何公开评价。');
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : '暂时无法离开。'); }
    finally { setPending(false); }
  }

  if (loading) return <div className="page-loading page-container"><LoaderCircle className="animate-spin" />正在打开这个约定…</div>;
  if (error || !activity) return <div className="empty-state page-container"><h1>这个主题暂时打不开</h1><p>{error}</p><Link className="primary-link" to="/">返回主题列表</Link></div>;

  const participation = activity.participation;
  const activeParticipation = activity.activeParticipation
    ?? (participation && !participation.completionId && participation.status === 'joined' ? participation : null);
  const completionCount = activity.completionCount ?? (participation?.completionId ? 1 : 0);
  const history = activity.history ?? [];
  const latestCompletedId = history[0]?.participationId ?? (participation?.completionId ? participation.id : null);
  const dateFormat = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' });
  const readingParticipationId = activity.id === 'reading'
    ? (activeParticipation?.id ?? latestCompletedId ?? participation?.id ?? null)
    : null;
  const readingRecord = readingParticipationId
    ? records.find((item) => item.participationId === readingParticipationId) ?? null
    : null;

  return (
    <div className="activity-page page-container">
      <Link to="/" className="back-link"><ArrowLeft />返回所有主题</Link>
      <section className="activity-hero">
        <div><ActivityGlyph activityId={activity.id} size="large" /><div className="activity-meta"><span>{activity.category}</span><span><Clock3 />{activity.duration}</span></div><h1>{activity.title}</h1><p>{activity.invitation}</p></div>
        <aside className="promise-panel">
          <span className="eyebrow">一个轻轻的约定</span>
          <h2>{activeParticipation ? '约定在这里，不催你。' : completionCount > 0 ? '这件事已经算数。' : '准备好时，再开始。'}</h2>
          <p>
            {activeParticipation
              ? (completionCount > 0
                ? `你已回应过这个约定 ${completionCount} 次，这是新的一次出发。`
                : '接受不代表必须完成，也不会产生倒计时、公开排名或失败记录。')
              : completionCount > 0
                ? `你已回应过这个约定 ${completionCount} 次。每一次行动都算数。`
                : '接受不代表必须完成，也不会产生倒计时、公开排名或失败记录。'}
          </p>
          {activeParticipation ? (
            <>
              <Button size="lg" asChild><Link to={`/complete/${activeParticipation.id}`}>我完成了<ArrowRight /></Link></Button>
              <button className="leave-button" onClick={() => void leave()} disabled={pending}>暂时离开这个约定</button>
            </>
          ) : (
            <>
              <Button size="lg" onClick={() => void join()} disabled={pending}>
                {pending ? <LoaderCircle className="animate-spin" /> : <>{completionCount > 0 ? '再次接受这个约定' : '接受这个约定'}<ArrowRight /></>}
              </Button>
              {latestCompletedId && (
                <Link to={`/complete/${latestCompletedId}`} className="text-link activity-latest-link">
                  查看最近一次完成与回响<ArrowRight />
                </Link>
              )}
            </>
          )}
        </aside>
      </section>

      {activity.id === 'reading' && readingParticipationId && (
        <section className="my-6" aria-label="《小王子》全本共读工作台">
          <LittlePrinceReader
            key={readingParticipationId}
            participationId={readingParticipationId}
            completion={readingRecord?.completion ?? null}
            onRecordChanged={async () => {
              await Promise.all([refreshRecords(), load()]);
            }}
          />
        </section>
      )}

      {history.length > 0 && (
        <section className="activity-history" aria-labelledby="activity-history-title">
          <div className="activity-history-head">
            <div>
              <span className="eyebrow">往期行动印记</span>
              <h2 id="activity-history-title">在这个主题下，你已回应过 {history.length} 次</h2>
            </div>
            <Link to="/records" className="text-link">前往个人档案室<ArrowRight /></Link>
          </div>
          <ul className="activity-history-list">
            {history.map((item, index) => (
              <li key={item.participationId}>
                <Link to={`/complete/${item.participationId}`} className="activity-history-item">
                  <div className="activity-history-meta">
                    <span className="badge"><History aria-hidden="true" />第 {history.length - index} 次完成</span>
                    <span>{dateFormat.format(new Date(item.declaredAt))}</span>
                    <span>{item.visibility === 'shared' ? '已允许分享' : '仅自己可见'}</span>
                  </div>
                  <p>{item.reflectionText ? `“${item.reflectionText}”` : '没有留下感受正文，同样是一次完整的回应。'}</p>
                  <span className="activity-history-link">查看这次完成与回响<ArrowRight aria-hidden="true" /></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="activity-rules">
        <article><span>怎样算完成</span><h2>由你向自己确认，无需向他人自证。</h2><p>{activity.completionHint}</p><div className="rule-note"><Check />首版只需要自报完成，不上传照片、定位或第三方证明。</div></article>
        <article><span>关于这个主题</span><h2>允许按自己的生活替换答案。</h2><p>{activity.description}</p><div className="rule-note"><HeartHandshake />没有标准关系、健康目标或完成方式需要被证明。</div></article>
      </section>

      {activity.id === 'reading' && (
        <section className="reading-preview-card" aria-labelledby="reading-preview-title" data-testid="reading-preview-card">
          <div className="reading-preview-head">
            <div>
              <span className="eyebrow">
                <BookOpenCheck aria-hidden="true" />
                本期共读实验 · 《小王子》× Monad 链上核验
              </span>
              <h2 id="reading-preview-title">可选叠加链上 EIP-712 核验，不影响你的自报完成</h2>
              <p>
                完成自报声明后，可在完成页进入《小王子》共读核验实验室：将阅读进度同步至合约核验门限，或留下一句感受并分别领取可叠加的激励凭证与 Soulbound 共读勋章。
              </p>
            </div>
            <span className="reading-chain-pill">Monad Testnet · Chain ID {LITTLE_PRINCE_CONTRACTS.chainId}</span>
          </div>

          <div className="reading-preview-rules">
            <article className="reading-preview-rule">
              <div className="reading-preview-rule-title">
                <Sparkles aria-hidden="true" />
                <strong>阅读达标奖励 · 10 DSDEMO + Soulbound 共读勋章</strong>
              </div>
              <p>≥80% 覆盖率 + 读完正文末章 → 10 DSDEMO + Soulbound 共读勋章（ReadingBadge，不可转让）。</p>
            </article>
            <article className="reading-preview-rule">
              <div className="reading-preview-rule-title">
                <FileKey2 aria-hidden="true" />
                <strong>读书感受激励 · 2 DSDEMO（最高共 12 DSDEMO）</strong>
              </div>
              <p>留下读书感受/书评 → 可叠加 2 DSDEMO。书评原文仅留在链下且随时可删，EIP-712 凭证只对匿名摘要计算哈希。</p>
            </article>
          </div>

          <div className="reading-contract-links">
            <a href={LITTLE_PRINCE_CONTRACTS.readingChallenge.explorerUrl} target="_blank" rel="noreferrer" className="reading-contract-chip">
              <span>ReadingChallenge</span>
              <code>{shortenHex(LITTLE_PRINCE_CONTRACTS.readingChallenge.address)}</code>
              <ExternalLink aria-hidden="true" />
            </a>
            <a href={LITTLE_PRINCE_CONTRACTS.readingBadge.explorerUrl} target="_blank" rel="noreferrer" className="reading-contract-chip">
              <span>ReadingBadge</span>
              <code>{shortenHex(LITTLE_PRINCE_CONTRACTS.readingBadge.address)}</code>
              <ExternalLink aria-hidden="true" />
            </a>
            <a href={LITTLE_PRINCE_CONTRACTS.rewardToken.explorerUrl} target="_blank" rel="noreferrer" className="reading-contract-chip">
              <span>DemoRewardToken (DSDEMO)</span>
              <code>{shortenHex(LITTLE_PRINCE_CONTRACTS.rewardToken.address)}</code>
              <ExternalLink aria-hidden="true" />
            </a>
          </div>
        </section>
      )}

      <section className="data-preview">
        <div><p className="eyebrow">开始之前，知道会留下什么</p><h2 className="section-title">生活内容与凭证，分开处理。</h2></div>
        <div className="data-preview-list">
          <article><ShieldCheck /><div><h3>完成声明</h3><p>记录保存在服务端，只代表你向自己守了一次约，不苛求任何外部证明。</p></div></article>
          <article><FileKey2 /><div><h3>可选完成凭证</h3><p>只有知情申请后才登记随机编号。当前默认是明确标注的本地模拟。</p></div></article>
        </div>
        <Link to="/about" className="text-link">查看完整的数据与删除边界<ArrowRight /></Link>
      </section>
    </div>
  );
}
