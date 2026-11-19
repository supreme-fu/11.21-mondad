import type {
  Activity,
  ActivityDetail,
  Echo,
  ReadingChallengeState,
  ReadingProgressPreset,
  ReadingRewardKind,
  Receipt,
  RecordItem,
  User,
} from '@/types';

interface SessionResponse {
  user: User | null;
  receiptMode: 'simulation' | 'monad-testnet';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    credentials: 'same-origin',
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || '请求没有成功，请稍后重试。');
  return body as T;
}

export const api = {
  session: () => request<SessionResponse>('/api/session'),
  loginDemo: (account: 'a' | 'b') => request<SessionResponse>('/api/session/demo', {
    method: 'POST', body: JSON.stringify({ account }),
  }),
  activities: () => request<Activity[]>('/api/activities'),
  activity: (id: string) => request<ActivityDetail>(`/api/activities/${id}`),
  join: (activityId: string) => request<{ id: string }>('/api/participations', {
    method: 'POST', body: JSON.stringify({ activityId }),
  }),
  leave: (id: string) => request<{ ok: boolean }>(`/api/participations/${id}/leave`, { method: 'POST' }),
  complete: (id: string, idempotencyKey: string) => request<{ id: string }>(`/api/participations/${id}/complete`, {
    method: 'POST', body: JSON.stringify({ idempotencyKey }),
  }),
  saveReflection: (id: string, text: string, visibility: 'private' | 'shared') => request<{ text: string | null }>(`/api/completions/${id}/reflection`, {
    method: 'PUT', body: JSON.stringify({ text, visibility }),
  }),
  deleteReflection: (id: string) => request<void>(`/api/completions/${id}/reflection`, { method: 'DELETE' }),
  requestReceipt: (id: string) => request<unknown>(`/api/completions/${id}/receipt`, {
    method: 'POST', body: JSON.stringify({ acknowledged: true }),
  }),
  receipt: (id: string) => request<Receipt>(`/api/completions/${id}/receipt`),
  echo: (activityId: string, excludeText?: string) => {
    const query = excludeText
      ? `?activityId=${encodeURIComponent(activityId)}&excludeText=${encodeURIComponent(excludeText)}`
      : `?activityId=${encodeURIComponent(activityId)}`;
    return request<{ echo: Echo | null; totalAvailable?: number }>(`/api/echoes${query}`);
  },
  records: () => request<RecordItem[]>('/api/me/records'),
  deleteAccount: () => request<{ publicReceiptsRemaining: number }>('/api/account', { method: 'DELETE' }),
  readingChallenge: (participationId: string) =>
    request<ReadingChallengeState>(`/api/reading-challenge/${encodeURIComponent(participationId)}`),
  syncReadingProgress: (participationId: string, preset: ReadingProgressPreset) =>
    request<ReadingChallengeState>(`/api/reading-challenge/${encodeURIComponent(participationId)}/progress`, {
      method: 'POST',
      body: JSON.stringify({ preset }),
    }),
  claimReadingReward: (participationId: string, kind: ReadingRewardKind) =>
    request<ReadingChallengeState>(`/api/reading-challenge/${encodeURIComponent(participationId)}/claim`, {
      method: 'POST',
      body: JSON.stringify({ kind }),
    }),
};
