import { useCallback, useEffect, useRef, type CSSProperties, type PointerEvent } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { Badge } from '@/lib/badges';

interface HoloBadgeCardProps {
  badge: Badge;
  onSelect: (badge: Badge, trigger: HTMLButtonElement) => void;
  unlocked?: boolean;
  count?: number;
  target?: number;
  dormantLabel?: string;
  tierCode?: string;
  levelLabel?: string;
  sourceLabel?: string;
  acquiredAtLabel?: string;
}

function ChamberFiligree({ series }: { series: Badge['series'] }) {
  if (series === 'task') {
    return (
      <svg className="holo-chamber-filigree" viewBox="0 0 200 200" aria-hidden="true">
        <circle cx="100" cy="100" r="78" className="filigree-ring" />
        <circle cx="100" cy="100" r="62" className="filigree-ring-dashed" />
        <path d="M26 142 C 66 130, 88 94, 126 78 C 150 68, 166 72, 178 56" className="filigree-arc" />
        <path d="M24 62 C 60 54, 84 88, 114 108 C 142 126, 158 134, 176 138" className="filigree-arc-dashed" />
        <circle cx="100" cy="100" r="2.6" className="filigree-node" />
      </svg>
    );
  }

  return (
    <svg className="holo-chamber-filigree" viewBox="0 0 200 200" aria-hidden="true">
      <polygon points="100,20 169,60 169,140 100,180 31,140 31,60" transform="rotate(30 100 100)" className="filigree-ring" />
      <polygon points="100,36 155,68 155,132 100,164 45,132 45,68" transform="rotate(30 100 100)" className="filigree-ring-dashed" />
      <circle cx="100" cy="100" r="54" className="filigree-ring-dashed" />
      <line x1="22" y1="100" x2="40" y2="100" className="filigree-arc" />
      <line x1="160" y1="100" x2="178" y2="100" className="filigree-arc" />
    </svg>
  );
}

/**
 * 藏品级闪卡按钮：复刻 holo-card-studio 的多层视差（背景暗纹、悬空器物、扫光虹彩、双线边框）
 * 与“光随手动”交互，但完全由 CSS 变量与指针坐标驱动，首屏零 WebGL、零 three.js。
 */
export function HoloBadgeCard({
  badge,
  onSelect,
  unlocked,
  count = 0,
  target,
  dormantLabel,
  tierCode,
  levelLabel,
  sourceLabel,
  acquiredAtLabel,
}: HoloBadgeCardProps) {
  const cardRef = useRef<HTMLButtonElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  const applyTilt = useCallback((nx: number, ny: number, active: boolean) => {
    const node = cardRef.current;
    if (!node) return;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      node.style.setProperty('--mx', `${(nx * 100).toFixed(1)}%`);
      node.style.setProperty('--my', `${(ny * 100).toFixed(1)}%`);
      const dx = nx - 0.5;
      const dy = ny - 0.5;
      node.style.setProperty('--rx', `${(-dy * 9.5).toFixed(2)}deg`);
      node.style.setProperty('--ry', `${(dx * 11).toFixed(2)}deg`);
      node.style.setProperty('--px', `${dx.toFixed(3)}`);
      node.style.setProperty('--py', `${dy.toFixed(3)}`);
      node.style.setProperty('--foil-active', active ? '1' : '0');
    });
  }, []);

  const handlePointerMove = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'touch') return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nx = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const ny = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    applyTilt(nx, ny, true);
  }, [applyTilt]);

  const handlePointerLeave = useCallback(() => {
    applyTilt(0.5, 0.38, false);
  }, [applyTilt]);

  const cardStyle = {
    '--badge-glow': badge.glowRgb,
    '--badge-accent': badge.accentHex,
  } as CSSProperties;

  const cardClasses = [
    'badge-card',
    'holo-card',
    unlocked === true ? 'holo-card-unlocked' : '',
    unlocked === false ? 'holo-card-dormant' : '',
  ].filter(Boolean).join(' ');

  const statusText = unlocked === true
    ? (target ? `已点亮 · ${count}/${target}` : `已点亮 · ${count} 次`)
    : unlocked === false
      ? (target ? `${dormantLabel ?? '待点亮'} · ${count}/${target}` : (dormantLabel ?? '待点亮'))
      : null;

  return (
    <button
      ref={cardRef}
      type="button"
      className={cardClasses}
      style={cardStyle}
      onClick={(event) => onSelect(badge, event.currentTarget)}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      data-testid={`badge-card-${badge.id}`}
      data-series={badge.series}
      data-unlocked={unlocked === undefined ? undefined : String(unlocked)}
      aria-label={`查看${badge.name}的三维预览`}
    >
      <span className="holo-card-shell">
        <span className="holo-card-head">
          <span className="holo-card-edition">NO.{badge.edition.split(' / ')[0]}</span>
          <span className="holo-card-en">{badge.englishTitle}</span>
        </span>

        <span className="holo-card-chamber">
          <span className="holo-chamber-bg" aria-hidden="true">
            <ChamberFiligree series={badge.series} />
          </span>
          <span className="holo-chamber-specimen">
            <img
              className="badge-thumb"
              src={badge.thumbUrl}
              alt={`${badge.name}缩略图`}
              width={256}
              height={256}
              loading="lazy"
              decoding="async"
            />
          </span>
          <span className="holo-chamber-foil" aria-hidden="true" />
          <span className="holo-chamber-glint" aria-hidden="true" />
        </span>

        <span className="holo-card-plate">
          {(statusText || tierCode) && (
            <span className="holo-pill-row">
              {statusText && (
                <span className={`holo-status-pill ${unlocked ? 'is-unlocked' : 'is-dormant'}`}>
                  {statusText}
                </span>
              )}
              {tierCode && (
                <span className={`holo-tier-pill ${unlocked ? 'is-unlocked' : 'is-dormant'}`}>
                  {tierCode}
                </span>
              )}
            </span>
          )}
          <span className="badge-card-title">{badge.name}</span>
          <span className="badge-card-material">{badge.material}</span>
          {(levelLabel || sourceLabel || acquiredAtLabel) && (
            <span className="holo-wall-meta" data-testid={`badge-wall-meta-${badge.id}`}>
              {levelLabel && (
                <span className="holo-wall-meta-row">
                  <strong>等级</strong>
                  <span>{levelLabel}</span>
                </span>
              )}
              {sourceLabel && (
                <span className="holo-wall-meta-row">
                  <strong>来源</strong>
                  <span>{sourceLabel}</span>
                </span>
              )}
              {acquiredAtLabel && (
                <span className="holo-wall-meta-row">
                  <strong>获得</strong>
                  <span>{acquiredAtLabel}</span>
                </span>
              )}
            </span>
          )}
          <span className="holo-card-foot">
            <span className="badge-card-series">{badge.seriesLabel}</span>
            <span className="holo-card-cta" aria-hidden="true">
              赏鉴
              <ArrowUpRight />
            </span>
          </span>
        </span>
      </span>
    </button>
  );
}
