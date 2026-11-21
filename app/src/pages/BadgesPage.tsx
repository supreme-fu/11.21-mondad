import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LoaderCircle, Sparkles } from 'lucide-react';
import { BadgeViewerDialog } from '@/components/BadgeViewerDialog';
import { HoloBadgeCard } from '@/components/HoloBadgeCard';
import { useApp } from '@/context/AppContext';
import { computeBadgeStates, loadBadges, type Badge } from '@/lib/badges';

const SERIES_META: Record<Badge['series'], { indexLabel: string }> = {
  task: { indexLabel: 'SERIES I · 01 — 04' },
  chain: { indexLabel: 'SERIES II · 05' },
  milestone: { indexLabel: 'SERIES III · 06 — 10' },
};

export default function BadgesPage() {
  const { records } = useApp();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<Badge | null>(null);
  const [attempt, setAttempt] = useState(0);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const badgeStates = useMemo(() => computeBadgeStates(badges, records), [badges, records]);

  const retry = useCallback(() => { setLoading(true); setAttempt((value) => value + 1); }, []);
  const handleSelect = useCallback((badge: Badge, trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setActive(badge);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await loadBadges();
        if (cancelled) return;
        setBadges(loaded);
        setError(null);
      } catch (reason) {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : '徽章目录暂时读取失败。');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [attempt]);

  const groups: Array<{ series: Badge['series']; title: string; items: Badge[] }> = [
    { series: 'task' as const, title: '主题徽章', items: badges.filter((badge) => badge.series === 'task') },
    { series: 'chain' as const, title: '链上完成', items: badges.filter((badge) => badge.series === 'chain') },
    { series: 'milestone' as const, title: '10 / 50 / 100 里程碑', items: badges.filter((badge) => badge.series === 'milestone') },
  ].filter((group) => group.items.length > 0);

  return (
    <div className="badges-page page-container">
      <header className="badges-compact-header badges-editorial-header">
        <div>
          <p className="eyebrow"><span className="atelier-diamond" aria-hidden="true" />COLLECTION 01 · 十枚三维器物</p>
          <h1>徽章只是造型，<br />不是成绩单。</h1>
          <div className="badges-atelier-bar" aria-label="陈列室说明">
            <span>光随手动 · 分层闪卡陈列</span>
          </div>
        </div>
        <p className="badges-header-hint">
          <Sparkles aria-hidden="true" />
          <span>轻移光标感受卡面虹彩与视差；点击任意一枚，进入 360° 三维器物赏鉴台。</span>
        </p>
      </header>

      {loading && (
        <div className="empty-state">
          <p><LoaderCircle className="animate-spin" />正在读取徽章目录…</p>
        </div>
      )}

      {!loading && error && (
        <div className="empty-state" role="alert">
          <h2>目录暂时读不到</h2>
          <p>{error}</p>
          <button className="badge-retry" onClick={retry}>重新加载目录</button>
        </div>
      )}

      {!loading && !error && groups.map((group) => (
        <section className={`badge-group badge-group-${group.series}`} key={group.series}>
          <div className="badge-group-head">
            <div>
              <span className="badge-group-index">{SERIES_META[group.series].indexLabel}</span>
              <h2>{group.title}</h2>
            </div>
          </div>
          <ul className={`badge-grid badge-grid-${group.series}`}>
            {group.items.map((badge) => {
              const state = badgeStates[badge.id];
              return (
                <li key={badge.id}>
                  <HoloBadgeCard
                    badge={badge}
                    onSelect={handleSelect}
                    unlocked={state?.unlocked}
                    count={state?.count}
                    target={state?.target}
                    dormantLabel="待解锁"
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <BadgeViewerDialog badge={active} onClose={() => setActive(null)} restoreFocusTo={() => triggerRef.current?.focus()} />
    </div>
  );
}
