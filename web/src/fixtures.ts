import type {
  AccountSummary,
  BillingOrder,
  BillingSummary,
  MusicModelProfile,
  MusicProject,
  PlatformTask,
  SessionSummary,
} from './types';

export const DEMO_ACCOUNT: AccountSummary = {
  balance: 1280,
  availableBalance: 1240,
  reservedBalance: 40,
  currency: 'credits',
  subscription: {
    name: 'Creator Pro',
    status: 'active',
    renewsAt: '2026-09-25T00:00:00.000Z',
    includedCredits: 2000,
  },
  topUpUrl: '/api/billing/topup',
  ordersUrl: '/api/billing/orders',
  accountUrl: '/api/auth/login',
};

export const DEMO_SESSION: SessionSummary = {
  authenticated: true,
  demo: true,
  user: {
    id: 'preview-user',
    subject: 'preview-user',
    name: '音乐创作者',
    email: 'creator@museflow.local',
    role: 'user',
  },
  account: DEMO_ACCOUNT,
};

const baseCapabilities = {
  simple: true,
  custom: true,
  instrumental: true,
  negativeTags: true,
  vocalGender: true,
  styleWeight: { min: 0, max: 1, step: 0.01, default: 0.65 },
  weirdness: { min: 0, max: 1, step: 0.01, default: 0.5 },
  operations: ['generate', 'extend', 'cover', 'remaster'] as const,
  maxTitleLength: 100,
  maxDescriptionLength: 1000,
  maxStyleLength: 1000,
  maxLyricsLength: 5000,
  maxNegativeTagsLength: 1000,
};

export const DEMO_MODELS: MusicModelProfile[] = [
  {
    id: 'chirp-fenix',
    displayName: 'Suno V5.5',
    provider: 'MXAPI',
    description: '旗舰品质，细腻人声与复杂编曲表现最佳。',
    badge: '推荐',
    enabled: true,
    estimatedCredits: { generatePair: 20, extendPair: 20, coverPair: 24, remasterPair: 24 },
    capabilities: { ...baseCapabilities, operations: ['generate', 'extend', 'cover', 'sound'] as const },
  },
  {
    id: 'chirp-crow',
    displayName: 'Suno V5',
    provider: 'MXAPI',
    description: '高品质完整歌曲，速度与表现均衡。',
    badge: '稳定',
    enabled: true,
    estimatedCredits: { generatePair: 16, extendPair: 16, coverPair: 20, remasterPair: 20 },
    capabilities: { ...baseCapabilities, operations: [...baseCapabilities.operations, 'sound'] as const },
  },
  {
    id: 'chirp-auk-turbo',
    displayName: 'Suno V4.5 All',
    provider: 'MXAPI',
    description: 'V4.5 全能力兼容模型，适合复现完整旧版工作流。',
    badge: '全能力',
    enabled: true,
    estimatedCredits: { generatePair: 10, extendPair: 10, coverPair: 14, remasterPair: 14 },
    capabilities: {
      ...baseCapabilities,
      maxTitleLength: 80,
      maxStyleLength: 200,
      maxLyricsLength: 3000,
      maxNegativeTagsLength: 200,
    },
  },
];

export const DEMO_PROJECTS: MusicProject[] = [
  {
    id: 'project-neon',
    title: '霓虹夜航',
    description: 'Dream Pop / Synthwave 概念 EP',
    trackCount: 8,
    status: 'active',
    updatedAt: '2026-08-24T15:20:00.000Z',
  },
  {
    id: 'project-road',
    title: '沿海公路',
    description: '复古摇滚与夏日公路电影配乐',
    trackCount: 5,
    status: 'active',
    updatedAt: '2026-08-21T09:10:00.000Z',
  },
  {
    id: 'project-ideas',
    title: '灵感收集箱',
    description: '还没有归档的歌词与草稿',
    trackCount: 3,
    status: 'active',
    updatedAt: '2026-08-18T03:45:00.000Z',
  },
];

export const DEMO_TASKS: PlatformTask[] = [
  {
    id: 'task-preview-1',
    batchId: 'batch-preview-1',
    title: '凌晨三点的海',
    operation: 'generate',
    model: 'chirp-fenix',
    status: 'generating',
    progress: 0.68,
    estimatedCredits: 20,
    chargedCredits: null,
    createdAt: '2026-08-25T03:12:00.000Z',
    updatedAt: '2026-08-25T03:13:10.000Z',
  },
  {
    id: 'task-preview-2',
    batchId: 'batch-preview-2',
    title: '回声公路',
    operation: 'remaster',
    model: 'chirp-crow',
    status: 'refunded',
    progress: 1,
    estimatedCredits: 20,
    chargedCredits: 0,
    refundCredits: 20,
    createdAt: '2026-08-24T09:20:00.000Z',
    updatedAt: '2026-08-24T09:24:00.000Z',
    error: '上游任务超时，预留积分已自动退回。',
  },
];

export const DEMO_BILLING: BillingSummary = {
  account: DEMO_ACCOUNT,
  monthSpent: 360,
  monthGeneratedTracks: 34,
  pendingReservations: 40,
};

export const DEMO_ORDERS: BillingOrder[] = [
  { id: 'order-20260820', kind: 'topup', description: '积分充值 2,000', amount: 9900, amountMinor: 9900, currency: 'CNY', credits: 2000, status: 'paid', createdAt: '2026-08-20T10:22:00.000Z' },
  { id: 'order-20260801', kind: 'subscription', description: 'Creator Pro 月度套餐', amount: 5900, amountMinor: 5900, currency: 'CNY', credits: 2000, status: 'paid', createdAt: '2026-08-01T08:00:00.000Z' },
  { id: 'usage-20260824', kind: 'usage', description: 'Suno V5.5 · 双版本生成', amount: 0, credits: -20, status: 'paid', createdAt: '2026-08-24T15:23:00.000Z' },
];
