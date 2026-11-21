import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Clock3, History, LoaderCircle } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { ActivityGlyph } from '@/components/ActivityGlyph';
import { LittlePrinceReader } from '@/components/LittlePrinceReader';
import { Button } from '@/components/ui/button';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import type { ActivityDetail } from '@/types';

export default function ActivityPage() {
  const { id = '' } = useParams();
  const { records, refreshRecords } = useApp();
  const [activity, setActivity] = useState<ActivityDetail | null>(null);
  const [sessionReadingId, setSessionReadingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try { setActivity(await api.activity(id)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '主题加载失败。'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => {
    setSessionReadingId(null);
    void load();
  }, [load]);

  async function join() {
    setPending(true);
    try {
      const created = await api.join(id);
      if (id === 'reading') {
        setSessionReadingId(created.id);
      }
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
      toast.success('已暂时离开。');
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
    ? (activeParticipation?.id ?? sessionReadingId)
    : null;
  const readingRecord = readingParticipationId
    ? records.find((item) => item.participationId === readingParticipationId) ?? null
    : null;

  return (
    <div className="activity-page page-container">
      <Link to="/" className="back-link"><ArrowLeft />返回所有主题</Link>
      <section className="activity-hero">
        <div>
          <ActivityGlyph activityId={activity.id} size="large" />
          <div className="activity-meta"><span>{activity.category}</span><span><Clock3 />{activity.duration}</span></div>
          <h1>{activity.title}</h1>
          <p>{activity.invitation}</p>
        </div>
        <aside className="promise-panel">
          <span className="eyebrow">一个轻轻的约定</span>
          <h2>{activeParticipation ? '约定进行中' : completionCount > 0 ? `已完成 ${completionCount} 次` : '准备好时，再开始'}</h2>
          <p>{activity.completionHint}</p>
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
                  查看最近一次完成记录<ArrowRight />
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
              <span className="eyebrow">往期记录</span>
              <h2 id="activity-history-title">已回应 {history.length} 次</h2>
            </div>
            <Link to="/records" className="text-link">前往我的记录<ArrowRight /></Link>
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
                  <span className="activity-history-link">查看详情<ArrowRight aria-hidden="true" /></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
