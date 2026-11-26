import React, { useEffect, useState } from 'react';
import { Award, Check, Crown, Share2, Trophy, X } from 'lucide-react';
import {
  fetchLeaderboard,
  LeaderboardResponse,
  UserProfile,
  UserRanks,
} from '../services/api';

interface LeaderboardModalProps {
  user: UserProfile | null;
  ranks: UserRanks | null;
  onClose: () => void;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({ user, ranks, onClose }) => {
  const [tab, setTab] = useState<'online' | 'best'>('online');
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchLeaderboard()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleBrag = async () => {
    if (!user) return;
    const rankStr = ranks?.onlineRank ? `온라인 배틀 #${ranks.onlineRank}위` : '온라인 배틀 도전자';
    const text = `🏆 Tetris Arena 내 기록 자랑하기!\n👤 ${user.nickname} (${rankStr})\n⚔️ 온라인 승점: ${user.online_points.toLocaleString()} pts (${user.online_wins}승)\n🔥 개인 최고 점수: ${user.best_score.toLocaleString()}점\n나랑 1:1 / 4인 배틀 테트리스 한 판 붙자!`;

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Tetris Arena 기록 자랑', text });
        return;
      } catch {
        // Fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      alert(text);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-row">
            <Trophy size={22} className="text-amber" />
            <h2>명예의 전당 TOP 10</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            <X size={20} />
          </button>
        </div>

        {user && (
          <div className="my-rank-banner">
            <div>
              <div className="my-rank-name">{user.nickname}님의 현재 기록</div>
              <div className="my-rank-stats">
                <span>
                  온라인 순위:{' '}
                  <strong>{ranks?.onlineRank ? `${ranks.onlineRank}위` : '기록 없음'}</strong>
                </span>
                <span>•</span>
                <span>
                  승점: <strong>{user.online_points.toLocaleString()} pts</strong> ({user.online_wins}승)
                </span>
                <span>•</span>
                <span>
                  최고점수: <strong>{user.best_score.toLocaleString()}</strong>
                </span>
              </div>
            </div>
            <button className="btn-brag" onClick={handleBrag}>
              {copied ? <Check size={16} /> : <Share2 size={16} />}
              <span>{copied ? '복사됨!' : '기록 자랑하기'}</span>
            </button>
          </div>
        )}

        <div className="tab-switch">
          <button
            type="button"
            className={tab === 'online' ? 'active' : ''}
            onClick={() => setTab('online')}
          >
            <Crown size={15} /> 온라인 배틀 TOP 10
          </button>
          <button
            type="button"
            className={tab === 'best' ? 'active' : ''}
            onClick={() => setTab('best')}
          >
            <Award size={15} /> 개인 최고점수 TOP 10
          </button>
        </div>

        {loading ? (
          <div className="empty-state">랭킹을 불러오는 중...</div>
        ) : tab === 'online' ? (
          <div className="rank-list">
            {data?.onlineTop10.length ? (
              data.onlineTop10.map((entry) => (
                <div
                  key={entry.id}
                  className={`rank-row ${user?.id === entry.id ? 'is-me' : ''} ${
                    entry.rank <= 3 ? `top-${entry.rank}` : ''
                  }`}
                >
                  <div className="rank-badge">#{entry.rank}</div>
                  <div className="rank-info">
                    <div className="rank-nick">{entry.nickname}</div>
                    <div className="rank-sub">
                      {entry.online_wins}승 / {entry.online_matches}전 • 최고 승리점수{' '}
                      {entry.best_online_win_score.toLocaleString()}
                    </div>
                  </div>
                  <div className="rank-score">{entry.online_points.toLocaleString()} pts</div>
                </div>
              ))
            ) : (
              <div className="empty-state">
                아직 온라인 대전 우승 기록이 없습니다. 첫 번째 1위 주인공이 되어보세요!
              </div>
            )}
          </div>
        ) : (
          <div className="rank-list">
            {data?.personalBestTop10.length ? (
              data.personalBestTop10.map((entry) => (
                <div
                  key={entry.id}
                  className={`rank-row ${user?.id === entry.id ? 'is-me' : ''} ${
                    entry.rank <= 3 ? `top-${entry.rank}` : ''
                  }`}
                >
                  <div className="rank-badge">#{entry.rank}</div>
                  <div className="rank-info">
                    <div className="rank-nick">{entry.nickname}</div>
                    <div className="rank-sub">온라인 승점 {entry.online_points.toLocaleString()} pts</div>
                  </div>
                  <div className="rank-score">{entry.best_score.toLocaleString()} 점</div>
                </div>
              ))
            ) : (
              <div className="empty-state">아직 기록된 점수가 없습니다.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
