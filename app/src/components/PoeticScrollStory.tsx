import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, Check } from 'lucide-react';
import { useNavigate } from 'react-router';

interface StoryCardDef {
  id: string;
  title: string;
  subtitle: string;
  tag: string;
  thumb: string;
  tint: string;
  accent: string;
  route: string;
}

const STORY_CARDS: StoryCardDef[] = [
  { id: 'c0', title: '一页之间', subtitle: '《小王子》全本共读', tag: '阅读', thumb: '/badges/thumbs/reading.webp', tint: 'linear-gradient(155deg, #e7efe8 0%, #c8dccd 52%, #9eb9a6 100%)', accent: '#2f523e', route: '/activities/reading' },
  { id: 'c1', title: '烟火日常', subtitle: '给在乎的人做一道菜', tag: '饮食', thumb: '/badges/thumbs/cooking.webp', tint: 'linear-gradient(155deg, #f6ebe1 0%, #ead0bb 55%, #d6aa8a 100%)', accent: '#7c4b2d', route: '/activities/cooking' },
  { id: 'c2', title: '环环相扣', subtitle: '去见一个一直想见的人', tag: '相逢', thumb: '/badges/thumbs/meeting.webp', tint: 'linear-gradient(155deg, #e7f0f4 0%, #c6dce6 55%, #9cbccb 100%)', accent: '#2c5364', route: '/activities/meeting' },
  { id: 'c3', title: '去有风的地方', subtitle: '去一个一直想去的小地方', tag: '出发', thumb: '/badges/thumbs/travel.webp', tint: 'linear-gradient(155deg, #eceaf6 0%, #d2cee7 55%, #b1aad0 100%)', accent: '#48406b', route: '/activities/outing' },
  { id: 'c4', title: '完成声明', subtitle: 'Monad 极简链上印记', tag: '凭证', thumb: '/badges/thumbs/contract.webp', tint: 'linear-gradient(155deg, #e6ecea 0%, #c5d2ce 55%, #98ada6 100%)', accent: '#29423a', route: '/records' },
  { id: 'c5', title: '铜色起步', subtitle: '10 次行动里程碑', tag: '10 次', thumb: '/badges/thumbs/bronze10.webp', tint: 'linear-gradient(155deg, #f4eae2 0%, #e1c6b0 55%, #c59b7d 100%)', accent: '#6b452a', route: '/badges' },
  { id: 'c6', title: '银色渐熟', subtitle: '50 次行动里程碑', tag: '50 次', thumb: '/badges/thumbs/silver50.webp', tint: 'linear-gradient(155deg, #eef1f3 0%, #d4dce0 55%, #aebac2 100%)', accent: '#3d4c55', route: '/badges' },
  { id: 'c7', title: '暖金沉淀', subtitle: '100 次行动里程碑', tag: '100 次', thumb: '/badges/thumbs/gold100.webp', tint: 'linear-gradient(155deg, #f7f0df 0%, #e6d2a4 55%, #ccb071 100%)', accent: '#6f5621', route: '/badges' },
  { id: 'c8', title: '铂金留白', subtitle: '安静守约的时间质感', tag: '留白', thumb: '/badges/thumbs/platinum100.webp', tint: 'linear-gradient(155deg, #f1f3f2 0%, #d8dedc 55%, #b6c0bc 100%)', accent: '#384641', route: '/badges' },
  { id: 'c9', title: '晶体恒常', subtitle: '属于自己的生活档案', tag: '档案', thumb: '/badges/thumbs/diamond100.webp', tint: 'linear-gradient(155deg, #e8f2f5 0%, #c4dce5 55%, #97bdcc 100%)', accent: '#294c5b', route: '/records' },
  { id: 'c10', title: '第 27 章', subtitle: '星空仍在轻声作响', tag: '共读', thumb: '/badges/thumbs/reading.webp', tint: 'linear-gradient(155deg, #e9efe6 0%, #cddbc8 55%, #a8bfa1 100%)', accent: '#2c4a35', route: '/activities/reading' },
  { id: 'c11', title: '同路人字条', subtitle: '不必寒暄，看见即重逢', tag: '偶遇', thumb: '/badges/thumbs/meeting.webp', tint: 'linear-gradient(155deg, #f5ebe8 0%, #e4ccc4 55%, #cca89d 100%)', accent: '#6b3f35', route: '/activities/cooking' },
];

const HERO_CHARS = Array.from('今天，轻轻开始。');

/** 7 枚 9×9 Do Something 诗意生活像素图标 */
const PIXEL_PALETTE: Record<string, string> = {
  k: '#1D3226',
  g: '#5E836D',
  w: '#F9FBF8',
  p: '#D47958',
};

const PIXEL_ICONS: string[][] = [
  // 0. 纸飞机
  ['........k', '......kkp', '....kkwkp', '..kkwwkp.', 'kkwwwkpp.', '..kkkpp..', '....kp...', '....k....', '.........'],
  // 1. 翻开的书《小王子》
  ['.........', '.kkk.kkk.', 'kwwwkwwwk', 'kwgwkwwgk', 'kwwwkwwwk', 'kwgwkwwgk', 'kwwwkwwwk', '.kkk.kkk.', '.........'],
  // 2. 暖意炖锅
  ['...p.p...', '.........', '..kkkkk..', '.kpppppk.', 'kkgggggkk', '.kgggggk.', '.kgggggk.', '..kkkkk..', '.........'],
  // 3. 双环相逢
  ['.........', '..kk.kk..', '.kggkppk.', 'kgwkpkpwk', 'kgwkpkpwk', '.kggkppk.', '..kk.kk..', '.........', '.........'],
  // 4. 山风出发
  ['....k....', '...kgk...', '..kgggk..', '.kgwwwgk.', 'kgggggggk', 'kgggggggk', 'ppppppppp', 'kkkkkkkkk', '.........'],
  // 5. 三维徽章
  ['...kkk...', '..kpppk..', '.kpwwwpk.', '.kpwgwpk.', '.kpwwwpk.', '..kpppk..', '...kkk...', '...k.k...', '..k...k..'],
  // 6. 温柔星光
  ['....p....', '.p..k..p.', '...kpk...', '..kpppk..', 'pkpppppkp', '..kpppk..', '...kpk...', '.p..k..p.', '....p....'],
];

const PLANE_WAYPOINTS: Array<[number, number, number]> = [
  [0.18, -3, 68],
  [0.32, 6, 66],
  [0.48, 16, 60],
  [0.60, 26, 50],
  [0.72, 34, 41],
  [0.80, 35.5, 45],
  [0.88, 29, 46],
  [0.96, 24.5, 43],
  [1.04, 26, 48],
  [1.14, 31, 47],
];

const HERO_CARD_ORDER = [5, 2, 0, 1, 3, 4];
const HERO_CARD_DELAYS = [0.35, 0.42, 0.46, 0.52, 0.60, 0.66];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const eOutCubic = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;
const eInOut = (t: number) => {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - ((-2 * x + 2) ** 3) / 2;
};
const eBackOut = (t: number, s = 1.15) => {
  const x = clamp(t, 0, 1) - 1;
  return 1 + (s + 1) * x * x * x + s * x * x;
};
const eGlide = (t: number) => {
  const x = clamp(t, 0, 1);
  return 1 - (1 - x) ** 2.4;
};

function sampleCatmullRom(pts: Array<[number, number, number]>, t: number): [number, number] {
  if (t <= pts[0][0]) return [pts[0][1], pts[0][2]];
  const last = pts[pts.length - 1];
  if (t >= last[0]) return [last[1], last[2]];
  let i = 0;
  while (i < pts.length - 2 && pts[i + 1][0] < t) i += 1;
  const p0 = pts[Math.max(0, i - 1)];
  const p1 = pts[i];
  const p2 = pts[i + 1];
  const p3 = pts[Math.min(pts.length - 1, i + 2)];
  const u = clamp((t - p1[0]) / Math.max(0.001, p2[0] - p1[0]), 0, 1);
  const u2 = u * u;
  const u3 = u2 * u;
  const x = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3);
  const y = 0.5 * ((2 * p1[2]) + (-p0[2] + p2[2]) * u + (2 * p0[2] - 5 * p1[2] + 4 * p2[2] - p3[2]) * u2 + (-p0[2] + 3 * p1[2] - 3 * p2[2] + p3[2]) * u3);
  return [x, y];
}

function PixelIconSvg({ grid }: { grid: string[] }) {
  return (
    <svg viewBox="0 0 9 9" shapeRendering="crispEdges" aria-hidden="true">
      {grid.map((row, y) =>
        Array.from(row).map((ch, x) => {
          const fill = PIXEL_PALETTE[ch];
          if (!fill) return null;
          return <rect key={`${x}-${y}`} x={x} y={y} width={1.04} height={1.04} fill={fill} />;
        }),
      )}
    </svg>
  );
}

interface CardPose {
  x: number;
  y: number;
  r: number;
  s: number;
  o: number;
}

export function PoeticScrollStory({ onJumpToThemes }: { onJumpToThemes: () => void }) {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const storyRef = useRef<HTMLElement | null>(null);
  const manifestoRef = useRef<HTMLElement | null>(null);
  const heroHeadlineRef = useRef<HTMLDivElement | null>(null);
  const heroMetaRef = useRef<HTMLDivElement | null>(null);
  const planeRef = useRef<HTMLDivElement | null>(null);
  const wordGroupRef = useRef<HTMLDivElement | null>(null);
  const charRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const iconRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const processRef = useRef<HTMLDivElement | null>(null);
  const skyPanelRef = useRef<HTMLDivElement | null>(null);
  const skyBackdropRef = useRef<HTMLDivElement | null>(null);
  const medallionRef = useRef<HTMLDivElement | null>(null);
  const blackoutRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const [processRevealed, setProcessRevealed] = useState(false);
  const [skyWordsRevealed, setSkyWordsRevealed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const applyMq = () => setReducedMotion(mq.matches);
    applyMq();
    mq.addEventListener('change', applyMq);
    return () => mq.removeEventListener('change', applyMq);
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      document.body.classList.remove('dark-nav');
      return;
    }

    const root = rootRef.current;
    const storyEl = storyRef.current;
    const manifestoEl = manifestoRef.current;
    if (!root || !storyEl || !manifestoEl) return;

    let W = window.innerWidth;
    let H = window.innerHeight;
    let isMobile = W < 820 && W < H * 1.1;
    let cw = 180;
    let hfs = 88;
    let ic = 54;
    let nUnit = 1;

    const computeMetrics = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      isMobile = W < 820 && W < H * 1.1;
      const u = Math.min(W / 1440, H / 800);
      nUnit = isMobile ? Math.min(1, W / 560) : clamp(W / 1440, 0.62, 1.25);
      hfs = isMobile ? Math.min(W * 0.11, H * 0.078) : Math.min(W * 0.068, H * 0.125);
      ic = hfs * 0.62;
      const pfs = isMobile ? Math.min(W * 0.078, 34) : Math.min(W * 0.034, H * 0.062);
      const sfs = isMobile ? Math.min(W * 0.082, 38) : Math.min(W * 0.042, H * 0.076);
      const mfs = isMobile ? Math.min(W * 0.105, H * 0.068) : Math.min(W * 0.048, H * 0.095);
      const camw = isMobile ? Math.min(W * 0.56, H * 0.30) : Math.min(W * 0.21, H * 0.36);
      cw = isMobile ? Math.min(W * 0.29, H * 0.185) : Math.min(W / 1440, H / 780) * 204;

      root.style.setProperty('--u', `${u}px`);
      root.style.setProperty('--n', `${nUnit}`);
      root.style.setProperty('--hfs', `${hfs}px`);
      root.style.setProperty('--ic', `${ic}px`);
      root.style.setProperty('--pfs', `${pfs}px`);
      root.style.setProperty('--sfs', `${sfs}px`);
      root.style.setProperty('--mfs', `${mfs}px`);
      root.style.setProperty('--camw', `${camw}px`);
      root.style.setProperty('--cw', `${cw}`);
    };
    computeMetrics();

    const stepAngle = (R: number) => 2 * Math.asin(Math.min(0.95, (1.05 * cw) / (2 * R))) * (180 / Math.PI);

    const fanPose = (i: number): CardPose => {
      if (i >= 6) return { x: W * 0.5, y: H * 1.38, r: 0, s: 0.9, o: 0 };
      const R = isMobile ? W * 1.35 : (1250 * W) / 1440;
      const deg = (i - 2.5) * stepAngle(R);
      const rad = (deg * Math.PI) / 180;
      const cx = isMobile ? W * 0.5 : W * 0.52;
      const cy = (isMobile ? H * 0.81 : H * 0.86) + R;
      return {
        x: cx + R * Math.sin(rad) - (isMobile ? 0 : W * 0.015),
        y: cy - R * Math.cos(rad) + (isMobile ? cw * 0.06 : 0),
        r: deg,
        s: 1,
        o: 1,
      };
    };

    const scatterPose = (i: number): CardPose => {
      if (i >= 6) return { x: W * 0.5, y: H * 1.35, r: 0, s: 0.85, o: 0 };
      const desk: Array<[number, number, number]> = [
        [0.09, 0.44, -18],
        [0.20, 0.84, -11],
        [0.80, 0.82, 13],
        [0.37, 0.99, -7],
        [0.91, 0.42, 15],
        [0.63, 0.99, 8],
      ];
      const mob: Array<[number, number, number]> = [
        [0.08, 0.60, -18],
        [0.46, 0.69, 10],
        [0.92, 0.60, 15],
        [0.22, 0.91, -12],
        [0.75, 0.92, 9],
        [0.50, 1.24, 0],
      ];
      const [fx, fy, r] = (isMobile ? mob : desk)[i];
      return { x: W * fx, y: H * fy, r, s: 1, o: 1 };
    };

    const pilePose = (i: number): CardPose => ({
      x: W * 0.5 + ((i % 3) - 1) * cw * 0.08,
      y: H * 0.63 + (((i * 7) % 5) - 2) * cw * 0.04,
      r: (i % 2 === 0 ? 1 : -1) * (4 + i * 1.25),
      s: 0.95,
      o: 1,
    });

    const wheelPose = (i: number, rot: number): CardPose => {
      const slot = (((i + rot) % 12) + 12) % 12 - 5.5;
      const R = isMobile ? W * 1.18 : (900 * W) / 1440;
      const deg = slot * stepAngle(R);
      const rad = (deg * Math.PI) / 180;
      const cx = W * 0.5;
      const cy = (isMobile ? H * 0.77 : H * 0.82) + R;
      const visible = Math.abs(deg) < 62;
      return {
        x: cx + R * Math.sin(rad),
        y: cy - R * Math.cos(rad),
        r: deg,
        s: 1,
        o: visible ? 1 : 0,
      };
    };

    const currentPoses: CardPose[] = STORY_CARDS.map((_, i) => fanPose(i));
    let displayedSky = 0;
    let processFlag = false;
    let skyFlag = false;
    const startTime = performance.now();
    let prevTime = startTime;
    let rafId = 0;

    // 预先缓存所有 manifesto 子元素的 reveal 状态
    const revealedManifesto = new Set<Element>();

    const onResize = () => {
      computeMetrics();
    };
    window.addEventListener('resize', onResize);

    const frame = (now: number) => {
      const dt = Math.min(50, now - prevTime);
      prevTime = now;
      const t = (now - startTime) / 1000;
      const sy = window.scrollY;

      const storyTop = storyEl.offsetTop;
      const storyScrollable = Math.max(1, storyEl.offsetHeight - H);
      const p = clamp((sy - storyTop) / storyScrollable, 0, 1);

      // 1) Hero 入场动画（纸飞机 Catmull-Rom + 7 像素图标变字）
      const planeEl = planeRef.current;
      const heroHeadline = heroHeadlineRef.current;
      const heroMeta = heroMetaRef.current;

      // 标题离场淡出：避免碰到导航栏
      if (heroHeadline) {
        const rect = heroHeadline.getBoundingClientRect();
        const navH = 74;
        const fadeStart = navH + hfs * 1.6;
        const fadeEnd = navH + hfs * 0.45;
        const heroOp = clamp((rect.top - fadeEnd) / Math.max(1, fadeStart - fadeEnd), 0, 1);
        heroHeadline.style.opacity = String(heroOp);
        if (heroMeta) heroMeta.style.opacity = String(heroOp * eOutCubic((t - 0.55) / 0.5));
      }

      // 纸飞机飞行与落地
      if (planeEl) {
        if (t < 0.18 || t > 1.24) {
          planeEl.style.opacity = '0';
        } else if (t <= 1.14) {
          const [px, py] = sampleCatmullRom(PLANE_WAYPOINTS, t);
          const [px2, py2] = sampleCatmullRom(PLANE_WAYPOINTS, Math.min(1.14, t + 0.02));
          const angle = (Math.atan2((py2 - py) * H, (px2 - px) * W) * 180) / Math.PI + 18;
          const fadeIn = eOutCubic((t - 0.18) / 0.12);
          planeEl.style.opacity = String(fadeIn);
          planeEl.style.transform = `translate3d(${(px / 100) * W}px, ${(py / 100) * H}px, 0) translate(-50%, -50%) rotate(${angle}deg)`;
        } else {
          // 1.14 -> 1.24 落到首个像素图标位置并缩淡
          const u = clamp((t - 1.14) / 0.10, 0, 1);
          const targetIcon = iconRefs.current[0]?.getBoundingClientRect();
          const tx = targetIcon ? targetIcon.left + targetIcon.width * 0.5 : W * 0.35;
          const ty = targetIcon ? targetIcon.top + targetIcon.height * 0.5 : H * 0.41;
          planeEl.style.opacity = String(1 - u);
          planeEl.style.transform = `translate3d(${tx}px, ${ty}px, 0) translate(-50%, -50%) scale(${lerp(1, 0.55, u)}) rotate(12deg)`;
        }
      }

      // 7 个像素图标弹出 -> 逐字压扁变成「今天，轻轻开始。」
      const morphStart = 1.65;
      const stepDur = 0.21;
      const totalChars = HERO_CHARS.length;
      const morphSteps = Math.max(0, (t - morphStart) / stepDur);
      const revealedChars = Math.min(totalChars, Math.floor(morphSteps));
      const iconsNeeded = Math.ceil((PIXEL_ICONS.length * Math.max(0, totalChars - revealedChars)) / totalChars);

      for (let idx = 0; idx < totalChars; idx += 1) {
        const el = charRefs.current[idx];
        if (!el) continue;
        const local = clamp((t - (morphStart + idx * stepDur)) / stepDur, 0, 1);
        if (local <= 0) {
          el.style.opacity = '0';
          el.style.maxWidth = '0px';
          el.style.clipPath = 'inset(0 100% 0 0)';
        } else {
          const wipe = clamp((local - 0.25) / 0.68, 0, 1);
          el.style.opacity = '1';
          el.style.maxWidth = `${hfs * 1.12}px`;
          el.style.clipPath = `inset(0 ${(1 - eOutCubic(wipe)) * 100}% 0 0)`;
        }
      }

      for (let j = 0; j < PIXEL_ICONS.length; j += 1) {
        const el = iconRefs.current[j];
        if (!el) continue;
        const popAt = 1.14 + j * 0.065;
        const popU = clamp((t - popAt) / 0.30, 0, 1);
        const consumedCount = PIXEL_ICONS.length - iconsNeeded;
        if (t < popAt) {
          el.style.opacity = '0';
          el.style.maxWidth = '0px';
          el.style.marginLeft = '0px';
        } else if (j < consumedCount) {
          // 已被吞并成字：快速压扁成墨线消失
          const vanishIndex = Math.floor((j / PIXEL_ICONS.length) * totalChars);
          const vU = clamp((t - (morphStart + vanishIndex * stepDur)) / (stepDur * 1.1), 0, 1);
          const sq = clamp(vU / 0.45, 0, 1);
          const out = clamp((vU - 0.45) / 0.55, 0, 1);
          const syScale = lerp(1, 0.16, sq);
          const sxScale = lerp(1, 1.25, sq);
          const rot = lerp(0, -28, sq) + lerp(0, -62, out);
          el.style.opacity = String(1 - out);
          el.style.maxWidth = `${lerp(ic, 0, out)}px`;
          el.style.marginLeft = `${lerp(ic * 0.18, 0, out)}px`;
          el.style.filter = `brightness(${lerp(1, 0, sq)})`;
          el.style.transform = `scale(${sxScale}, ${syScale}) rotate(${rot}deg)`;
        } else {
          const sc = eBackOut(popU, 1.15);
          el.style.opacity = String(clamp(popU / 0.4, 0, 1));
          el.style.maxWidth = `${ic}px`;
          el.style.marginLeft = j === consumedCount && revealedChars > 0 ? `${ic * 0.28}px` : `${ic * 0.18}px`;
          el.style.filter = 'none';
          el.style.transform = `scale(${sc})`;
        }
      }

      // 2) Process 文案块淡入与逐词去模糊
      const procEl = processRef.current;
      if (procEl) {
        const procOp = p < 0.055 ? 0 : p < 0.085 ? (p - 0.055) / 0.03 : p > 0.62 ? clamp(1 - (p - 0.62) / 0.06, 0, 1) : 1;
        procEl.style.opacity = String(procOp);
        procEl.style.pointerEvents = procOp > 0.35 ? 'auto' : 'none';
        if (p > 0.072 && !processFlag) {
          processFlag = true;
          setProcessRevealed(true);
        } else if (p < 0.045 && processFlag) {
          processFlag = false;
          setProcessRevealed(false);
        }
      }

      // 3) 12 张诗意卡片编舞（fan -> scatter -> pile -> wheel -> rotate）
      let wheelSettled = true;
      for (let i = 0; i < STORY_CARDS.length; i += 1) {
        let target: CardPose;
        if (p <= 0.005) {
          target = fanPose(i);
          // 首次加载时前 6 张卡按顺序从底边轻弹升起
          const orderIdx = HERO_CARD_ORDER.indexOf(i);
          if (orderIdx >= 0) {
            const delay = HERO_CARD_DELAYS[orderIdx];
            const riseU = clamp((t - delay) / 0.72, 0, 1);
            const eased = eBackOut(riseU, 1.12);
            target = {
              x: target.x,
              y: lerp(H + cw * 1.15, target.y, eased),
              r: target.r + lerp(8, 0, eased),
              s: 1,
              o: clamp(riseU * 2.2, 0, 1),
            };
          }
        } else if (p < 0.10) {
          const u = eInOut((p - 0.005) / 0.095);
          const a = fanPose(i);
          const b = scatterPose(i);
          target = { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), r: lerp(a.r, b.r, u), s: lerp(a.s, b.s, u), o: lerp(a.o, b.o, u) };
        } else if (p < 0.22) {
          target = scatterPose(i);
        } else if (p < 0.33) {
          const u = eInOut((p - 0.22) / 0.11);
          const a = scatterPose(i);
          const b = pilePose(i);
          const startX = i >= 6 ? W * 0.5 : a.x;
          const startY = i >= 6 ? H * 1.25 : a.y;
          target = {
            x: lerp(startX, b.x, u),
            y: lerp(startY, b.y, u),
            r: lerp(a.r, b.r, u),
            s: lerp(a.s, b.s, u),
            o: i >= 6 ? clamp((u - 0.15) / 0.5, 0, 1) : 1,
          };
        } else if (p < 0.43) {
          const u = eGlide((p - 0.33) / 0.10);
          const a = pilePose(i);
          const b = wheelPose(i, 0);
          target = { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), r: lerp(a.r, b.r, u), s: lerp(a.s, b.s, u), o: lerp(a.o, b.o, u) };
        } else {
          const wheelProg = eInOut(clamp((p - 0.43) / 0.17, 0, 1));
          target = wheelPose(i, -3 * wheelProg);
        }

        // 错峰惯性插值
        const cur = currentPoses[i];
        if (p <= 0.005) {
          currentPoses[i] = target;
        } else {
          const w = 0.065 + (i % 4) * 0.009;
          const k = 1 - (1 - w) ** (dt / 16.67);
          cur.x += (target.x - cur.x) * k;
          cur.y += (target.y - cur.y) * k;
          cur.r += (target.r - cur.r) * k;
          cur.s += (target.s - cur.s) * k;
          cur.o += (target.o - cur.o) * k;
        }

        if (
          Math.abs(currentPoses[i].x - target.x) > 4
          || Math.abs(currentPoses[i].y - target.y) > 4
          || Math.abs(currentPoses[i].r - target.r) > 1.5
        ) {
          wheelSettled = false;
        }

        const el = cardRefs.current[i];
        if (el) {
          const cp = currentPoses[i];
          el.style.transform = `translate3d(${cp.x}px, ${cp.y}px, 0) rotate(${cp.r}deg) scale(${cp.s})`;
          el.style.opacity = String(cp.o);
          el.style.pointerEvents = cp.o > 0.3 && displayedSky < 0.15 ? 'auto' : 'none';
        }
      }

      // 4) 门控式晨曦天空窗扩张 + 悬浮徽章 3D 轻摆 & 镜头推近至深绿黑
      const rawSkyTarget = p >= 0.64 && (wheelSettled || p > 0.69)
        ? clamp((p - 0.64) / 0.13, 0, 1)
        : 0;
      const skyK = 1 - (1 - 0.10) ** (dt / 16.67);
      displayedSky += (rawSkyTarget - displayedSky) * skyK;
      if (displayedSky < 0.002 && rawSkyTarget === 0) displayedSky = 0;

      const skyPanel = skyPanelRef.current;
      const skyBg = skyBackdropRef.current;
      const medallion = medallionRef.current;
      const blackout = blackoutRef.current;

      if (skyPanel) {
        if (displayedSky <= 0.004) {
          skyPanel.style.visibility = 'hidden';
          skyPanel.style.opacity = '0';
          if (skyFlag) {
            skyFlag = false;
            setSkyWordsRevealed(false);
          }
        } else {
          skyPanel.style.visibility = 'visible';
          skyPanel.style.opacity = String(clamp(displayedSky * 5, 0, 1));
          const u = eInOut(displayedSky);
          const initW = isMobile ? 42 : 18;
          const initH = isMobile ? 16 : 20;
          const initTopOffset = isMobile ? 6 : 12;
          const insetX = lerp((100 - initW) / 2, 0, u);
          const insetTop = lerp((100 - initH) / 2 - initTopOffset, 0, u);
          const insetBottom = lerp((100 - initH) / 2 + initTopOffset, 0, u);
          const radius = lerp(16, 0, u);
          skyPanel.style.clipPath = `inset(${insetTop}% ${insetX}% ${insetBottom}% ${insetX}% round ${radius}px)`;

          if (skyBg) {
            skyBg.style.transform = `scale(${lerp(1.18, 1, u)})`;
          }

          if (displayedSky > 0.92 && !skyFlag) {
            skyFlag = true;
            setSkyWordsRevealed(true);
          } else if (displayedSky < 0.6 && skyFlag) {
            skyFlag = false;
            setSkyWordsRevealed(false);
          }

          // 徽章缩放、轻摆与推近
          if (medallion) {
            const baseScale = lerp(0.52, 1, u);
            const yawU = clamp((p - 0.77) / 0.12, 0, 1);
            const yawDeg = p > 0.77 ? lerp(-11, 11, eInOut(yawU)) : 0;
            const bobY = p > 0.75 ? Math.sin(t * 1.6) * (6 * nUnit) : 0;
            const gate = clamp((displayedSky - 0.90) / 0.10, 0, 1);
            const zoomRaw = clamp((p - 0.89) / 0.09, 0, 1) ** 1.6 * gate;
            const zoomScale = 1 + zoomRaw * zoomRaw * 24;
            medallion.style.transform = `translate3d(-50%, calc(-50% + ${bobY}px), 0) perspective(900px) rotateY(${yawDeg}deg) scale(${baseScale * zoomScale})`;

            if (blackout) {
              const blk = clamp((zoomRaw - 0.42) / 0.44, 0, 1);
              blackout.style.opacity = String(blk);
            }
          }
        }
      }

      // 5) 暗色横向宣言轨（Manifesto）
      const mRect = manifestoEl.getBoundingClientRect();
      const mScrollable = Math.max(1, manifestoEl.offsetHeight - H);
      const mp = clamp(-mRect.top / mScrollable, 0, 1);
      const track = trackRef.current;
      if (track) {
        const startX = isMobile ? W * 0.08 : W * 0.06;
        const endX = -(Math.max(0, track.scrollWidth - W * 0.88));
        const tx = lerp(startX, endX, mp);
        track.style.transform = `translate3d(${tx}px, -50%, 0)`;

        if (mRect.top < H * 0.25 && mRect.bottom > 0) {
          const threshold = isMobile ? W * 0.94 : W * 0.88;
          const items = track.querySelectorAll('[data-m-reveal]');
          items.forEach((item) => {
            if (revealedManifesto.has(item)) return;
            const r = item.getBoundingClientRect();
            if (r.left < threshold) {
              revealedManifesto.add(item);
              item.classList.add('is-shown');
            }
          });
        }
      }

      // 6) 暗色顶栏自适应切换（仅在黑幕与暗色宣言段生效）
      const inDark = (p > 0.975 && mRect.top < H) || (mRect.top <= 48 && mRect.bottom > 74);
      document.body.classList.toggle('dark-nav', inDark);

      rafId = window.requestAnimationFrame(frame);
    };

    rafId = window.requestAnimationFrame(frame);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      document.body.classList.remove('dark-nav');
    };
  }, [reducedMotion]);

  if (reducedMotion) {
    return (
      <section className="story-reduced page-container">
        <p className="eyebrow">给“改天”一个轻轻的结尾</p>
        <h1>今天，轻轻开始。</h1>
        <p>一件真正想做的事，一个只属于自己的约定。先去生活，再决定要不要留下故事。</p>
        <button type="button" className="primary-link" onClick={onJumpToThemes}>
          选一件想做的事<ArrowRight size={16} />
        </button>
      </section>
    );
  }

  return (
    <div ref={rootRef} className="poetic-story-root" data-testid="poetic-scroll-story">
      {/* ===== ACT 1–3: 560vh 钉住故事舞台 ===== */}
      <section id="story" ref={storyRef} className="story-section">
        {/* 独立随页面 1:1 滚离的 Hero 标题与纸飞机 */}
        <header className="story-hero">
          <div ref={heroHeadlineRef} className="story-headline-holder" role="heading" aria-level={1} aria-label="今天，轻轻开始。">
            <p className="story-hero-eyebrow">给“改天”一个轻轻的结尾</p>
            <div ref={wordGroupRef} className="story-word-row">
              {HERO_CHARS.map((ch, idx) => (
                <span
                  key={`${ch}-${idx}`}
                  ref={(el) => { charRefs.current[idx] = el; }}
                  className="story-hero-char"
                >
                  {ch}
                </span>
              ))}
              {PIXEL_ICONS.map((grid, j) => (
                <span
                  key={j}
                  ref={(el) => { iconRefs.current[j] = el; }}
                  className="story-pixel-icon"
                >
                  <PixelIconSvg grid={grid} />
                </span>
              ))}
            </div>
            <div ref={heroMetaRef} className="story-hero-meta">
              <p className="story-hero-sub">不用找搭子，不必连续打卡；先去生活，再决定要不要留下故事。</p>
              <div className="story-hero-ctas">
                <button type="button" className="story-cta-dark" onClick={onJumpToThemes} data-testid="story-start-btn">
                  选一件想做的事<ArrowRight size={15} />
                </button>
                <a className="story-cta-ghost" href="/intro.html#after-action">
                  为什么在完成之后相遇？
                </a>
              </div>
              <ul className="story-hero-pills">
                <li><Check size={13} />独立行动</li>
                <li><Check size={13} />分享由你</li>
                <li><Check size={13} />没有排名</li>
              </ul>
              <span className="story-scroll-cue"><ArrowDown size={13} />向下滚动，体验故事动效</span>
            </div>
          </div>

          {/* 飞行的折纸纸飞机 */}
          <div ref={planeRef} className="story-paper-plane" aria-hidden="true">
            <svg viewBox="0 0 64 64" fill="none">
              <path d="M8 31L56 10L41 54L29 37L8 31Z" fill="#FAFBF8" stroke="#1D3226" strokeWidth="2" strokeLinejoin="round" />
              <path d="M56 10L29 37L31 49L41 54" fill="#E3ECE5" stroke="#1D3226" strokeWidth="2" strokeLinejoin="round" />
              <path d="M29 37L56 10" stroke="#D47958" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
        </header>

        {/* Sticky 舞台：卡片扇形/散落/聚拢/转盘 + Process 居中诗句 + 晨曦天空窗 + 悬浮徽章 */}
        <div className="story-sticky-stage">
          {/* Process 中央诗意标语 */}
          <div ref={processRef} className={`story-process-block ${processRevealed ? 'is-revealed' : ''}`}>
            <h2 className="story-process-title">
              <span className="sp-line">
                <span className="sp-word is-muted" style={{ transitionDelay: '0ms' }}>先独自</span>
                <span className="sp-word sp-chip" style={{ transitionDelay: '100ms' }} aria-hidden="true">
                  <img src="/badges/thumbs/reading.webp" alt="" />
                </span>
                <span className="sp-word" style={{ transitionDelay: '200ms' }}>去生活</span>
              </span>
              <span className="sp-line">
                <span className="sp-word" style={{ transitionDelay: '320ms' }}>完成之后</span>
                <span className="sp-word is-muted" style={{ transitionDelay: '440ms' }}>再轻轻相遇</span>
              </span>
            </h2>
            <p className="story-process-sub">点选任意一张生活卡片，即刻开启属于自己的安静约定。</p>
            <div className="story-process-actions">
              <button type="button" className="story-cta-dark" onClick={onJumpToThemes}>
                进入四个生活场景<ArrowRight size={15} />
              </button>
              <button type="button" className="story-cta-outline" onClick={() => navigate('/activities/reading')}>
                直达《小王子》共读
              </button>
            </div>
          </div>

          {/* 12 张可点击诗意艺术与 3D 徽章卡片 */}
          <div className="story-cards-layer" aria-label="生活主题与器物卡片扇">
            {STORY_CARDS.map((card, i) => (
              <button
                key={card.id}
                type="button"
                ref={(el) => { cardRefs.current[i] = el; }}
                className="story-card"
                style={{ background: card.tint }}
                onClick={() => navigate(card.route)}
                aria-label={`${card.title}：${card.subtitle}`}
              >
                <span className="story-card-tag" style={{ color: card.accent }}>{card.tag}</span>
                <div className="story-card-art">
                  <img src={card.thumb} alt="" loading="eager" />
                </div>
                <div className="story-card-caption">
                  <strong style={{ color: card.accent }}>{card.title}</strong>
                  <span>{card.subtitle}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Act 3: 门控式晨曦天空画窗 + 3D 悬浮徽章镜头推近 */}
          <div ref={skyPanelRef} className="story-sky-panel" aria-hidden={!skyWordsRevealed}>
            <div ref={skyBackdropRef} className="story-sky-backdrop">
              <div className="story-sky-clouds-a" />
              <div className="story-sky-clouds-b" />
              <div className="story-sky-glow" />
            </div>

            <div className={`story-sky-words story-sky-tl ${skyWordsRevealed ? 'is-revealed' : ''}`}>
              <span className="sw-word is-muted" style={{ transitionDelay: '0ms' }}>不止</span>
              <span className="sw-word is-muted" style={{ transitionDelay: '110ms' }}>是一次</span>
              <span className="sw-word" style={{ transitionDelay: '220ms' }}>打卡</span>
            </div>

            <div ref={medallionRef} className="story-floating-medallion">
              <div className="story-medallion-halo" />
              <img src="/badges/thumbs/reading.webp" alt="一页之间三维纪念徽章" />
              <span className="story-medallion-ring" />
            </div>

            <div className={`story-sky-words story-sky-br ${skyWordsRevealed ? 'is-revealed' : ''}`}>
              <span className="sw-word is-muted" style={{ transitionDelay: '400ms' }}>会发光的</span>
              <span className="sw-word" style={{ transitionDelay: '520ms' }}>真实</span>
              <span className="sw-word is-muted" style={{ transitionDelay: '640ms' }}>生活</span>
              <span className="sw-word" style={{ transitionDelay: '760ms' }}>档案</span>
            </div>
          </div>

          {/* 镜头进入深绿黑转场遮罩 */}
          <div ref={blackoutRef} className="story-blackout" aria-hidden="true" />
        </div>
      </section>

      {/* ===== ACT 4: 340vh 深墨绿黑横向滚动宣言 ===== */}
      <section id="manifesto" ref={manifestoRef} className="story-manifesto" aria-label="Do Something 诗意宣言">
        <div className="story-manifesto-sticky">
          <div ref={trackRef} className="story-manifesto-track">
            <div className="mf-intro-block" data-m-reveal="sticker">
              <span className="mf-mini-sticker" style={{ background: '#EFCEBE', top: '-1.05em', left: '0em', transform: 'rotate(-6deg)' }}>轻轻开始</span>
              <span className="mf-mini-sticker" style={{ background: '#D8E8DD', top: '-1.2em', left: '4.6em', transform: 'rotate(-3deg)' }}>不必同步出发</span>
              <span className="mf-mini-sticker" style={{ background: '#BAD9E6', bottom: '-1.15em', left: '0.8em', transform: 'rotate(4deg)' }}>看见即是重逢</span>
              <div className="mf-intro-line"><span className="mf-muted">把「改天」</span><span>变成</span></div>
              <div className="mf-intro-line"><span>今天的一件</span><span className="mf-muted">小事。</span></div>
            </div>

            <div className="mf-trinket" data-m-reveal="sticker" style={{ ['--rest-rot' as string]: '-12deg' }}>
              <img src="/badges/thumbs/reading.webp" alt="" />
            </div>

            <span className="mf-word mf-muted" data-m-reveal="word">先独自</span>

            <div className="mf-sticker-stack" data-m-reveal="sticker">
              <span className="mf-big-sticker" style={{ background: '#EBC9AE', ['--rest-rot' as string]: '-7deg' }}>
                认真生活<i className="mf-sticker-dot" />
              </span>
              <span className="mf-small-sticker" style={{ background: '#D7CFE4', ['--rest-rot' as string]: '5deg' }}>不设排名与催促</span>
            </div>

            <span className="mf-word" data-m-reveal="word">再在字条里</span>
            <span className="mf-word mf-muted" data-m-reveal="word">相遇。</span>

            <svg className="mf-sparkle" viewBox="0 0 20 20" data-m-reveal="sticker" aria-hidden="true">
              <path d="M10 0c.8 5.6 3.6 8.6 10 10-6.4 1.4-9.2 4.4-10 10-.8-5.6-3.6-8.6-10-10 6.4-1.4 9.2-4.4 10-10z" fill="#F4E3D3" />
            </svg>

            <div className="mf-trinket is-sm" data-m-reveal="sticker" style={{ ['--rest-rot' as string]: '9deg' }}>
              <img src="/badges/thumbs/cooking.webp" alt="" />
            </div>

            <span className="mf-word" data-m-reveal="word">每一次</span>
            <span className="mf-word mf-muted" data-m-reveal="word">—</span>
            <span className="mf-word" data-m-reveal="word">微小的守约</span>

            <span className="mf-big-sticker" data-m-reveal="sticker" style={{ background: '#EFCEBE', ['--rest-rot' as string]: '-6deg' }}>一页之间</span>

            <div className="mf-trinket" data-m-reveal="sticker" style={{ ['--rest-rot' as string]: '10deg' }}>
              <img src="/badges/thumbs/travel.webp" alt="" />
            </div>

            <span className="mf-big-sticker" data-m-reveal="sticker" style={{ background: '#D8E8DD', ['--rest-rot' as string]: '4deg' }}>Monad 刻痕</span>

            <span className="mf-word mf-muted" data-m-reveal="word">都沉淀为</span>

            <span className="mf-big-sticker" data-m-reveal="sticker" style={{ background: '#BAD9E6', ['--rest-rot' as string]: '-8deg' }}>只属于你的</span>

            <div className="mf-trinket" data-m-reveal="sticker" style={{ ['--rest-rot' as string]: '-7deg' }}>
              <img src="/badges/thumbs/diamond100.webp" alt="" />
            </div>

            <span className="mf-word" data-m-reveal="word">立体生活档案</span>
            <span className="mf-word mf-muted" data-m-reveal="word">与</span>
            <span className="mf-word" data-m-reveal="word">纪念器物。</span>

            <div className="mf-spacer" aria-hidden="true" />
          </div>
        </div>
      </section>
    </div>
  );
}
