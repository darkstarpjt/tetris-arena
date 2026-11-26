export interface UserProfile {
  id: number;
  username: string;
  nickname: string;
  best_score: number;
  online_points: number;
  online_wins: number;
  online_matches: number;
  best_online_win_score: number;
}

export interface UserRanks {
  onlineRank: number | null;
  bestScoreRank: number | null;
}

export interface LeaderboardOnlineEntry {
  rank: number;
  id: number;
  username: string;
  nickname: string;
  online_points: number;
  online_wins: number;
  online_matches: number;
  best_online_win_score: number;
  best_score: number;
}

export interface LeaderboardBestEntry {
  rank: number;
  id: number;
  username: string;
  nickname: string;
  best_score: number;
  online_points: number;
  online_wins: number;
}

export interface RecentMatch {
  id: number;
  mode: '1v1' | '4p';
  winner_nickname: string;
  winner_score: number;
  awarded_points: number;
  created_at: string;
}

export interface LeaderboardResponse {
  onlineTop10: LeaderboardOnlineEntry[];
  personalBestTop10: LeaderboardBestEntry[];
  recentMatches: RecentMatch[];
}

const TOKEN_KEY = 'tetris_arena_token';
export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || '';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || '요청 처리 중 오류가 발생했습니다.');
  }
  return data as T;
}

export async function registerUser(payload: {
  username: string;
  password: string;
  nickname: string;
}): Promise<{ token: string; user: UserProfile; ranks: UserRanks }> {
  const data = await request<{ token: string; user: UserProfile; ranks: UserRanks }>(
    '/api/auth/register',
    { method: 'POST', body: JSON.stringify(payload) }
  );
  setStoredToken(data.token);
  return data;
}

export async function loginUser(payload: {
  username: string;
  password: string;
}): Promise<{ token: string; user: UserProfile; ranks: UserRanks }> {
  const data = await request<{ token: string; user: UserProfile; ranks: UserRanks }>(
    '/api/auth/login',
    { method: 'POST', body: JSON.stringify(payload) }
  );
  setStoredToken(data.token);
  return data;
}

export async function fetchMe(): Promise<{ user: UserProfile; ranks: UserRanks }> {
  return request<{ user: UserProfile; ranks: UserRanks }>('/api/me');
}

export async function submitPersonalBest(score: number): Promise<{ user: UserProfile; ranks: UserRanks }> {
  return request<{ user: UserProfile; ranks: UserRanks }>('/api/scores/personal-best', {
    method: 'POST',
    body: JSON.stringify({ score }),
  });
}

export async function fetchLeaderboard(): Promise<LeaderboardResponse> {
  return request<LeaderboardResponse>('/api/leaderboard');
}
