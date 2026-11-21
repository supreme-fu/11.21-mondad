import { LITTLE_PRINCE_CONTRACTS } from '@/lib/reading-contracts';
import type { RecordItem } from '@/types';

/**
 * 徽章资产目录与器物档案。GLB 与 manifest.json 由 app/scripts/sync-badge-assets.mjs 从
 * badge-studio/public/models 同步到 app/public/badges，这里只读取，不生成。
 */

export type BadgeSeries = 'task' | 'chain' | 'milestone';

export interface BadgeManifestEntry {
  id: string;
  name: string;
  material: string;
  series: BadgeSeries;
  file: string;
  bytes: number;
  meshes: number;
  triangles: number;
  vertices: number;
  bounds: { min: [number, number, number]; max: [number, number, number] };
  previousBytes: number;
  previousVertices: number;
}

export interface BadgeMeta {
  edition: string;
  englishTitle: string;
  craftNote: string;
  poeticNote: string;
  glowRgb: string;
  accentHex: string;
}

export interface Badge {
  id: string;
  name: string;
  material: string;
  series: BadgeSeries;
  seriesLabel: string;
  modelUrl: string;
  thumbUrl: string;
  triangles: number;
  edition: string;
  englishTitle: string;
  craftNote: string;
  poeticNote: string;
  glowRgb: string;
  accentHex: string;
}

export const BADGE_ASSET_BASE = '/badges';

export const SERIES_LABELS: Record<BadgeSeries, string> = {
  task: '主题徽章 · 系列预览',
  chain: '链上完成 · 系列预览',
  milestone: '10 / 50 / 100 里程碑 · 系列预览',
};

const BADGE_META: Record<string, BadgeMeta> = {
  reading: {
    edition: '01 / 10',
    englishTitle: 'BETWEEN PAGES',
    craftNote: '圆章 · 鼠尾草珐琅与黄铜书签丝带',
    poeticNote: '双页微倾展开，细线刻出字行与末句留白，一枚燕尾黄铜书签垂落其间，记下独自读完一页的安静片刻。',
    glowRgb: '118, 150, 128',
    accentHex: '#c4a464',
  },
  cooking: {
    edition: '02 / 10',
    englishTitle: 'DAILY FLAME',
    craftNote: '圆章 · 赤铜双耳炖锅与奶油搪瓷蒸汽',
    poeticNote: '温润奶油搪瓷盘面托起立体赤铜锅盖，两缕 S 形热气缓缓升腾，留住烟火厨房里为在意之人下厨的体温。',
    glowRgb: '194, 123, 82',
    accentHex: '#c27b52',
  },
  travel: {
    edition: '03 / 10',
    englishTitle: 'WINDWARD',
    craftNote: '圆章 · 青钛山脊与珊瑚罗盘指针',
    poeticNote: '青钛与珍珠雪峰错落浮雕，下方一枚小巧罗盘指向未定远方——出发不需要理由，只需要迈出那一步。',
    glowRgb: '72, 130, 133',
    accentHex: '#d4b068',
  },
  meeting: {
    edition: '04 / 10',
    englishTitle: 'CONVERGENCE',
    craftNote: '圆章 · 玫瑰金双环与柔光珍珠节点',
    poeticNote: '两条不同节奏的弧线从两侧轻轻靠近，于顶部柔光珍珠处交汇；先各自去生活，再在完成之后遇见彼此。',
    glowRgb: '212, 155, 137',
    accentHex: '#d49b89',
  },
  contract: {
    edition: '05 / 10',
    englishTitle: 'SELF REPORT',
    craftNote: '六角章 · 拉丝钛金属与烤漆铭牌',
    poeticNote: '平顶六角钛框稳固嵌合双环印记与深色铭牌，只刻下随机编号，不携带你的姓名、故事或任何私人痕迹。',
    glowRgb: '110, 134, 148',
    accentHex: '#94a7b2',
  },
  bronze10: {
    edition: '06 / 10',
    englishTitle: 'BEGIN · X',
    craftNote: '六角章 · 暖铜表盘与十刻度',
    poeticNote: '像刚起笔的十次日常小事，暖铜材质随光线泛出温柔余韵，记录那些从“改天”变成“今天”的开始。',
    glowRgb: '201, 128, 87',
    accentHex: '#c98057',
  },
  silver50: {
    edition: '07 / 10',
    englishTitle: 'ECHO · L',
    craftNote: '六角章 · 镜面银框与二十刻度',
    poeticNote: '深灰表盘衬托冷冽银光，二十道细刻刻度安静走过五十段真实生活，不催促、不排名，只作时间回响。',
    glowRgb: '164, 178, 190',
    accentHex: '#d4dce2',
  },
  gold100: {
    edition: '08 / 10',
    englishTitle: 'UNITY · C',
    craftNote: '六角章 · 镜面金与三十精密刻度',
    poeticNote: '暖金色边框环绕深琥珀底盘，主次分明的三十道表盘刻度如腕表般克制，映照百次守约的沉静重量。',
    glowRgb: '214, 174, 86',
    accentHex: '#e6c265',
  },
  platinum100: {
    edition: '09 / 10',
    englishTitle: 'PLATINUM · C',
    craftNote: '六角章 · 冷色白金与深岩刻度盘',
    poeticNote: '深岩灰绿哑光内盘托出高抛光白金字样，在冷冽与温润的反差之间，让每一次微小的坚持清晰可辨。',
    glowRgb: '126, 152, 160',
    accentHex: '#dfe7e9',
  },
  diamond100: {
    edition: '10 / 10',
    englishTitle: 'FACETED · C',
    craftNote: '六角章 · 折射八面晶体与白金底座',
    poeticNote: '一枚澄澈八面晶体静立于深灰岩盘之上，随转动折射细碎虹光——真正的光芒不在奖章里，而在你走过的日子。',
    glowRgb: '148, 196, 214',
    accentHex: '#bce6f5',
  },
};

/** 主题徽章与里程碑系列按视觉色阶与次数递进排序（10 → 50 → 100 金 → 100 白金 → 100 钻石）。 */
const SERIES_ORDER: Record<BadgeSeries, number> = { task: 0, chain: 1, milestone: 2 };
const BADGE_ORDER: Record<string, number> = {
  reading: 0,
  cooking: 1,
  travel: 2,
  meeting: 3,
  contract: 4,
  bronze10: 5,
  silver50: 6,
  gold100: 7,
  platinum100: 8,
  diamond100: 9,
};

function toBadge(entry: BadgeManifestEntry): Badge {
  const meta = BADGE_META[entry.id] ?? {
    edition: '00 / 10',
    englishTitle: entry.id.toUpperCase(),
    craftNote: entry.material,
    poeticNote: '轻转器物，感受光线在金属与珐琅之间留下的细微层次。',
    glowRgb: '140, 160, 150',
    accentHex: '#c4a464',
  };
  return {
    id: entry.id,
    name: entry.name,
    material: entry.material,
    series: entry.series,
    seriesLabel: SERIES_LABELS[entry.series],
    modelUrl: `${BADGE_ASSET_BASE}/${entry.file}`,
    thumbUrl: `${BADGE_ASSET_BASE}/thumbs/${entry.id}.webp`,
    triangles: entry.triangles,
    ...meta,
  };
}

let cached: Promise<Badge[]> | null = null;

export function loadBadges(): Promise<Badge[]> {
  if (!cached) {
    cached = fetch(`${BADGE_ASSET_BASE}/models/manifest.json`)
      .then(async (response) => {
        if (!response.ok) throw new Error('徽章目录读取失败，请稍后重试。');
        const entries = (await response.json()) as BadgeManifestEntry[];
        if (!Array.isArray(entries) || entries.length === 0) throw new Error('徽章目录是空的。');
        return entries
          .map(toBadge)
          .sort((left, right) => SERIES_ORDER[left.series] - SERIES_ORDER[right.series]
            || (BADGE_ORDER[left.id] ?? 99) - (BADGE_ORDER[right.id] ?? 99)
            || left.name.localeCompare(right.name, 'zh-Hans-CN'));
      })
      .catch((error: unknown) => {
        cached = null;
        throw error;
      });
  }
  return cached;
}

export const BADGE_ACTIVITY_MAP: Record<string, string> = {
  reading: 'reading',
  cooking: 'cooking',
  travel: 'outing',
  meeting: 'meeting',
};

const ACTIVITY_BADGE_MAP: Record<string, string> = {
  reading: 'reading',
  cooking: 'cooking',
  outing: 'travel',
  meeting: 'meeting',
};

export function badgeIdForActivity(activityId: string): string | undefined {
  return ACTIVITY_BADGE_MAP[activityId];
}

export const MILESTONE_THRESHOLDS: Record<string, number> = {
  bronze10: 10,
  silver50: 50,
  gold100: 100,
  platinum100: 100,
  diamond100: 100,
};

export interface BadgeContractAnchor {
  label: string;
  address: string;
  explorerUrl: string;
  note: string;
}

export interface BadgePortalSource {
  platforms: string[];
  summary: string;
  contextRole: string;
  contractAnchors?: BadgeContractAnchor[];
}

export const BADGE_PORTAL_SOURCES: Record<string, BadgePortalSource> = {
  reading: {
    platforms: ['微信读书', 'Apple Books', '豆瓣读书'],
    summary: '当你在阅读软件读完一本书，未来可通过链上轻量凭证同步至此，与本平台自报阅读共同构成你的阅读上下文。',
    contextRole: '跨应用阅读偏好与静心时段上下文',
    contractAnchors: [
      {
        label: 'ReadingBadge',
        address: LITTLE_PRINCE_CONTRACTS.readingBadge.address,
        explorerUrl: LITTLE_PRINCE_CONTRACTS.readingBadge.explorerUrl,
        note: '《小王子》共读 Soulbound 勋章合约 · Monad 测试网',
      },
      {
        label: 'ReadingChallenge',
        address: LITTLE_PRINCE_CONTRACTS.readingChallenge.address,
        explorerUrl: LITTLE_PRINCE_CONTRACTS.readingChallenge.explorerUrl,
        note: '《小王子》EIP-712 阅读覆盖与末章核验合约 · Chain ID 10143',
      },
    ],
  },
  cooking: {
    platforms: ['下厨房', '饮食手账', '小红书美食记录'],
    summary: '无论是照着食谱 App 做出的第一道菜，还是在 Do Something 许下的厨房约定，都在此汇入你的烟火生活档案。',
    contextRole: '日常饮食与照料亲友的生活轨迹上下文',
  },
  travel: {
    platforms: ['Keep', 'Apple Fitness', '户外足迹 App'],
    summary: '不吞并你习惯的运动或足迹工具，只把每一次真实的出发与抵达锚定进你的个人行动图谱。',
    contextRole: '城市探索与户外抵达记忆上下文',
  },
  meeting: {
    platforms: ['日历约定', '慢社交信件', '生活手账'],
    summary: '记录每一次认真赴约的相逢，在算法之外留存人与人真实连接的温度。',
    contextRole: '真实人际连接与重要相见上下文',
  },
  contract: {
    platforms: ['Monad 跨应用统一凭证协议', 'Personal AI Context'],
    summary: '通过链上统一的 bytes32 最小凭证将分散在各 App 的行动汇聚成全维度视野，在 AI 时代为你提供真正归属于自己的个人生活上下文（Personal Context）。',
    contextRole: '跨应用主权凭证锚点与验证底座',
  },
};

const DEFAULT_MILESTONE_PORTAL: BadgePortalSource = {
  platforms: ['Monad 跨应用统一凭证协议', 'Personal AI Context'],
  summary: '通过链上统一的 bytes32 最小凭证将分散在各 App 的行动汇聚成全维度视野，在 AI 时代为你提供真正归属于自己的个人生活上下文（Personal Context）。',
  contextRole: '长期生活行动时间线与 AI 个人上下文底座',
};

export function getBadgePortalSource(badgeId: string): BadgePortalSource {
  return BADGE_PORTAL_SOURCES[badgeId] ?? DEFAULT_MILESTONE_PORTAL;
}

export type BadgeTrustTier = 'issuer_verified' | 'hybrid_verified' | 'self_attested' | 'onchain_protocol' | 'protocol_derived';

export interface BadgeState {
  badge: Badge;
  unlocked: boolean;
  count: number;
  target?: number;
  activityId?: string;
  matchedRecords: RecordItem[];
  portalSource: BadgePortalSource;
  /** 首次解锁/获得该徽章的 ISO 时间戳（按完成记录正序计算），未解锁为 null */
  acquiredAt: string | null;
  /** 最近一次更新该徽章对应行动的 ISO 时间戳 */
  lastUpdatedAt: string | null;
  /** 徽章等级编码（如 Tier S / Tier A+ / Tier A / Tier SSR） */
  tierCode: string;
  /** 徽章等级完整展示文案 */
  levelLabel: string;
  /** 用于按等级排序的数值权重（越大等级越高） */
  levelRank: number;
  /** 凭证信任分层类型 */
  trustTier: BadgeTrustTier;
  /** 徽章来源（对应活动或协议触发源） */
  sourceLabel: string;
  /** 签发方与合约核验标识 */
  issuerLabel: string;
}

function getEarliestDeclaredAt(items: RecordItem[], index = 0): { earliest: string | null; latest: string | null } {
  const withCompletion = items.filter((item) => item.completion !== null);
  if (withCompletion.length === 0) return { earliest: null, latest: null };
  const sorted = [...withCompletion].sort(
    (a, b) => new Date(a.completion!.declaredAt).getTime() - new Date(b.completion!.declaredAt).getTime(),
  );
  const targetItem = sorted[Math.min(index, sorted.length - 1)];
  const latestItem = sorted[sorted.length - 1];
  return {
    earliest: targetItem?.completion?.declaredAt ?? null,
    latest: latestItem?.completion?.declaredAt ?? null,
  };
}

function computeBadgeGrading(
  badgeId: string,
  unlocked: boolean,
  count: number,
): {
  tierCode: string;
  levelLabel: string;
  levelRank: number;
  trustTier: BadgeTrustTier;
  sourceLabel: string;
  issuerLabel: string;
} {
  const dynamicLv = count >= 3 ? 'Lv.3 恒常' : count >= 2 ? 'Lv.2 笃行' : 'Lv.1 初识';

  switch (badgeId) {
    case 'reading':
      return {
        tierCode: 'Tier S',
        levelLabel: unlocked ? `Tier S · ${dynamicLv}（机构 EIP-712 核验）` : 'Tier S · 机构核验级',
        levelRank: 95 + Math.min(count, 10),
        trustTier: 'issuer_verified',
        sourceLabel: '《小王子》共读挑战 · 章节进度 / 购书核验',
        issuerLabel: '共读主理方 EIP-712 核验节点 (ReadingBadge 合约)',
      };
    case 'contract':
      return {
        tierCode: 'Tier S',
        levelLabel: unlocked ? `Tier S · ${dynamicLv}（链上协议锚点）` : 'Tier S · 链上协议级',
        levelRank: 92 + Math.min(count, 10),
        trustTier: 'onchain_protocol',
        sourceLabel: 'Monad 跨场景链上凭证存证',
        issuerLabel: 'Monad CompletionReceipt 协议合约 (Chain 10143)',
      };
    case 'travel':
      return {
        tierCode: 'Tier A+',
        levelLabel: unlocked ? `Tier A+ · ${dynamicLv}（出行/门票核销）` : 'Tier A+ · 出行核销级',
        levelRank: 84 + Math.min(count, 10),
        trustTier: 'hybrid_verified',
        sourceLabel: '档案活动执行 · 城市出行 / 景区门票二维码核销',
        issuerLabel: '文旅门票核销方 / 本人主权声明 (ActivityHub)',
      };
    case 'cooking':
      return {
        tierCode: 'Tier A',
        levelLabel: unlocked ? `Tier A · ${dynamicLv}（个人主权声明）` : 'Tier A · 个人主权级',
        levelRank: 80 + Math.min(count, 10),
        trustTier: 'self_attested',
        sourceLabel: '档案活动执行 · 给在乎的人做一道菜',
        issuerLabel: '本人主权声明 (Self-Attested · CompletionReceipt)',
      };
    case 'meeting':
      return {
        tierCode: 'Tier A',
        levelLabel: unlocked ? `Tier A · ${dynamicLv}（个人主权声明）` : 'Tier A · 个人主权级',
        levelRank: 78 + Math.min(count, 10),
        trustTier: 'self_attested',
        sourceLabel: '档案活动执行 · 见一个想见的人',
        issuerLabel: '本人主权声明 (Self-Attested · CompletionReceipt)',
      };
    case 'diamond100':
      return {
        tierCode: 'Tier SSR',
        levelLabel: 'Tier SSR · Lv.5 百次钻石典藏',
        levelRank: 120,
        trustTier: 'protocol_derived',
        sourceLabel: 'LIFE CONTEXT 档案累计 100 次行动里程碑',
        issuerLabel: 'Do Something 链上档案聚合器 (Protocol Derived)',
      };
    case 'platinum100':
      return {
        tierCode: 'Tier SSR',
        levelLabel: 'Tier SSR · Lv.4 百次白金典藏',
        levelRank: 115,
        trustTier: 'protocol_derived',
        sourceLabel: 'LIFE CONTEXT 档案累计 100 次行动里程碑',
        issuerLabel: 'Do Something 链上档案聚合器 (Protocol Derived)',
      };
    case 'gold100':
      return {
        tierCode: 'Tier SR',
        levelLabel: 'Tier SR · Lv.3 百次黄金里程碑',
        levelRank: 110,
        trustTier: 'protocol_derived',
        sourceLabel: 'LIFE CONTEXT 档案累计 100 次行动里程碑',
        issuerLabel: 'Do Something 链上档案聚合器 (Protocol Derived)',
      };
    case 'silver50':
      return {
        tierCode: 'Tier SR',
        levelLabel: 'Tier SR · Lv.2 五十次白银里程碑',
        levelRank: 89,
        trustTier: 'protocol_derived',
        sourceLabel: 'LIFE CONTEXT 档案累计 50 次行动里程碑',
        issuerLabel: 'Do Something 链上档案聚合器 (Protocol Derived)',
      };
    case 'bronze10':
    default:
      return {
        tierCode: 'Tier B+',
        levelLabel: 'Tier B+ · Lv.1 十次暖铜里程碑',
        levelRank: 74,
        trustTier: 'protocol_derived',
        sourceLabel: 'LIFE CONTEXT 档案累计 10 次行动里程碑',
        issuerLabel: 'Do Something 链上档案聚合器 (Protocol Derived)',
      };
  }
}

export function computeBadgeStates(badges: Badge[], records: RecordItem[]): Record<string, BadgeState> {
  const completedRecords = records.filter((item) => item.completion !== null);
  const receiptRecords = completedRecords.filter(
    (item) => item.completion && item.completion.receipt.status !== 'not_requested',
  );
  const confirmedOrPendingReceiptRecords = receiptRecords.filter(
    (item) => item.completion && ['queued', 'submitted', 'confirmed'].includes(item.completion.receipt.status),
  );
  const confirmedReceipts = receiptRecords.filter(
    (item) => item.completion?.receipt.status === 'confirmed',
  );

  const states: Record<string, BadgeState> = {};
  for (const badge of badges) {
    const portalSource = getBadgePortalSource(badge.id);

    if (badge.series === 'task') {
      const activityId = BADGE_ACTIVITY_MAP[badge.id];
      const matchedRecords = activityId
        ? completedRecords.filter((item) => item.activity.id === activityId)
        : [];
      const unlocked = matchedRecords.length >= 1;
      const count = matchedRecords.length;
      const { earliest, latest } = getEarliestDeclaredAt(matchedRecords, 0);
      const grading = computeBadgeGrading(badge.id, unlocked, count);
      states[badge.id] = {
        badge,
        unlocked,
        count,
        activityId,
        matchedRecords,
        portalSource,
        acquiredAt: unlocked ? earliest : null,
        lastUpdatedAt: unlocked ? latest : null,
        ...grading,
      };
      continue;
    }

    if (badge.id === 'contract') {
      const unlocked = confirmedOrPendingReceiptRecords.length >= 1;
      const count = confirmedReceipts.length || confirmedOrPendingReceiptRecords.length;
      const { earliest, latest } = getEarliestDeclaredAt(confirmedOrPendingReceiptRecords, 0);
      const grading = computeBadgeGrading(badge.id, unlocked, count);
      states[badge.id] = {
        badge,
        unlocked,
        count,
        matchedRecords: receiptRecords,
        portalSource,
        acquiredAt: unlocked ? earliest : null,
        lastUpdatedAt: unlocked ? latest : null,
        ...grading,
      };
      continue;
    }

    const target = MILESTONE_THRESHOLDS[badge.id] ?? 10;
    const unlocked = completedRecords.length >= target;
    const count = completedRecords.length;
    const { earliest, latest } = unlocked
      ? getEarliestDeclaredAt(completedRecords, target - 1)
      : { earliest: null, latest: null };
    const grading = computeBadgeGrading(badge.id, unlocked, count);
    states[badge.id] = {
      badge,
      unlocked,
      count,
      target,
      matchedRecords: completedRecords,
      portalSource,
      acquiredAt: unlocked ? earliest : null,
      lastUpdatedAt: unlocked ? latest : null,
      ...grading,
    };
  }

  return states;
}
