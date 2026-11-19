import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Boxes, LoaderCircle, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import { BadgeViewerDialog } from '@/components/BadgeViewerDialog';
import { HoloBadgeCard } from '@/components/HoloBadgeCard';
import { useApp } from '@/context/AppContext';
import { computeBadgeStates, loadBadges, type Badge } from '@/lib/badges';

const SERIES_META: Record<Badge['series'], { note: string; indexLabel: string }> = {
  task: {
    indexLabel: 'SERIES I · 01 — 04',
    note: '四枚生活主题的圆章造型预览，先看看珐琅、赤铜与青钛之间的温润质感。',
  },
  chain: {
    indexLabel: 'SERIES II · 05',
    note: '链上完成场景的六角器物预览，只刻随机演示编号，与积分或奖励系统无关。',
  },
  milestone: {
    indexLabel: 'SERIES III · 06 — 10',
    note: '10 / 50 / 100 里程碑的五阶色阶预览，从暖铜到晶体，只记时间不计胜负。',
  },
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
      <header className="badges-header">
        <div>
          <p className="eyebrow">
            <span className="atelier-diamond" aria-hidden="true" />
            系列预览 · 不构成任何奖励
          </p>
          <h1>徽章只是造型，<br />不是成绩单。</h1>
          <div className="badges-atelier-bar" aria-label="陈列室说明">
            <span>COLLECTION 01</span>
            <i aria-hidden="true" />
            <span>光随手动 · 分层闪卡陈列</span>
          </div>
        </div>
        <div className="badges-header-aside">
          <p>下面是同一批徽章的造型预览。列表只加载缩略图，点开某一枚才下载它自己的模型。这里没有“获得”、没有等级，也没有新增任何奖励系统。</p>
          <p className="badges-header-hint">
            <Sparkles aria-hidden="true" />
            <span>轻移光标感受卡面虹彩与视差；点击任意一枚，进入三维器物赏鉴台。</span>
          </p>
        </div>
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
            <p>{SERIES_META[group.series].note}</p>
          </div>
          <div className={group.series === 'chain' ? 'badge-chain-layout' : undefined}>
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
                      dormantLabel="系列预览"
                    />
                  </li>
                );
              })}
            </ul>
            {group.series === 'chain' && (
              <aside className="badge-chain-placard" aria-label="链上完成器物说明">
                <span className="badge-chain-placard-tag">ARCHIVAL NOTE · 最小隐私印记</span>
                <h3>一面铭牌，只放得下八个随机字符。</h3>
                <p>在 Do Something 的方案 A 凭证里，链上只记录随机生成的 32 字节编号与存在状态——不写你的姓名、不做过往成绩汇总，也不给任何正文上链。</p>
                <dl className="badge-chain-specs">
                  <div><dt>正面符号</dt><dd>双环印记 · 独立行动后交汇</dd></div>
                  <div><dt>背面微雕</dt><dd>双轨交汇印记（可翻转查看）</dd></div>
                  <div><dt>材质语义</dt><dd>拉丝钛金属与低反光烤漆铭牌</dd></div>
                </dl>
              </aside>
            )}
          </div>
        </section>
      ))}

      <section className="badges-note">
        <p className="eyebrow">关于这些徽章</p>
        <h2>真正的纪念，留在你做完那件事的时刻。</h2>
        <p>徽章造型来自设计侧的轻量导出，用来预览质感。是否完成一次行动、是否分享感受，仍然只由你自己决定；展示徽章不等于获得徽章，也不对应 NFT、积分或链上资产。</p>
        <Link className="primary-link" to="/records">去我的记录看看<ArrowRight /></Link>
      </section>

      <p className="badges-source"><Boxes />全系列共十枚三维器物预览 · 首屏零模型预载，按需独立呈现。</p>

      <BadgeViewerDialog badge={active} onClose={() => setActive(null)} restoreFocusTo={() => triggerRef.current?.focus()} />
    </div>
  );
}
