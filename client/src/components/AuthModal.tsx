import React, { useState } from 'react';
import { X } from 'lucide-react';
import { loginUser, registerUser, UserProfile, UserRanks } from '../services/api';
import { refreshSocketAuth } from '../services/socket';

interface AuthModalProps {
  onClose: () => void;
  onSuccess: (user: UserProfile, ranks: UserRanks) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onClose, onSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res =
        mode === 'login'
          ? await loginUser({ username, password })
          : await registerUser({ username, password, nickname: nickname || username });
      refreshSocketAuth();
      onSuccess(res.user, res.ranks);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '인증에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{mode === 'login' ? '로그인' : '회원가입'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            <X size={20} />
          </button>
        </div>

        <div className="tab-switch">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => {
              setMode('login');
              setError('');
            }}
          >
            로그인
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => {
              setMode('register');
              setError('');
            }}
          >
            회원가입
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            <span>아이디 (영문/숫자 3~20자)</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="tetris_king"
              required
              autoComplete="username"
            />
          </label>

          {mode === 'register' && (
            <label>
              <span>랭킹 표시 닉네임 (2~16자)</span>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="블록마스터"
                required
              />
            </label>
          )}

          <label>
            <span>비밀번호 (4자 이상)</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>

          {error && <div className="form-error">{error}</div>}

          <button type="submit" className="btn-primary full" disabled={loading}>
            {loading ? '처리 중...' : mode === 'login' ? '로그인하기' : '가입하고 랭킹 참여하기'}
          </button>
        </form>
      </div>
    </div>
  );
};
