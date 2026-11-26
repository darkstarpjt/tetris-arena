import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'tetris.db');
export const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    nickname TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    best_score INTEGER NOT NULL DEFAULT 0,
    online_points INTEGER NOT NULL DEFAULT 0,
    online_wins INTEGER NOT NULL DEFAULT 0,
    online_matches INTEGER NOT NULL DEFAULT 0,
    best_online_win_score INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS match_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mode TEXT NOT NULL,
    winner_user_id INTEGER,
    winner_nickname TEXT NOT NULL,
    winner_score INTEGER NOT NULL DEFAULT 0,
    awarded_points INTEGER NOT NULL DEFAULT 0,
    players_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (winner_user_id) REFERENCES users(id)
  );
`);

export function createUser({ username, nickname, passwordHash, passwordSalt }) {
  const stmt = db.prepare(`
    INSERT INTO users (username, nickname, password_hash, password_salt)
    VALUES (?, ?, ?, ?)
  `);
  const info = stmt.run(username.trim(), nickname.trim(), passwordHash, passwordSalt);
  return findUserById(Number(info.lastInsertRowid));
}

export function findUserByUsername(username) {
  const stmt = db.prepare(`SELECT * FROM users WHERE username = ?`);
  return stmt.get(username.trim()) || null;
}

export function findUserById(id) {
  const stmt = db.prepare(`
    SELECT id, username, nickname, best_score, online_points, online_wins, online_matches, best_online_win_score, created_at
    FROM users
    WHERE id = ?
  `);
  return stmt.get(id) || null;
}

export function updatePersonalBest(userId, score) {
  const cleanScore = Math.max(0, Math.floor(Number(score) || 0));
  const stmt = db.prepare(`
    UPDATE users
    SET best_score = MAX(best_score, ?)
    WHERE id = ?
  `);
  stmt.run(cleanScore, userId);
  return findUserById(userId);
}

export function recordOnlineMatchWin({ mode, winnerUserId, winnerNickname, winnerScore, participants }) {
  const cleanScore = Math.max(0, Math.floor(Number(winnerScore) || 0));
  const participantCount = Array.isArray(participants) ? participants.length : 2;
  const baseWinPoints =
    participantCount >= 5
      ? 250
      : participantCount === 4
      ? 200
      : participantCount === 3
      ? 150
      : 100;
  const scoreBonus = Math.min(300, Math.floor(cleanScore / 40));
  const awardedPoints = baseWinPoints + scoreBonus;

  const incMatchStmt = db.prepare(`
    UPDATE users
    SET online_matches = online_matches + 1,
        best_score = MAX(best_score, ?)
    WHERE id = ?
  `);

  for (const p of participants) {
    if (p.userId) {
      incMatchStmt.run(Math.max(0, Math.floor(Number(p.score) || 0)), p.userId);
    }
  }

  if (winnerUserId) {
    const winStmt = db.prepare(`
      UPDATE users
      SET online_wins = online_wins + 1,
          online_points = online_points + ?,
          best_online_win_score = MAX(best_online_win_score, ?),
          best_score = MAX(best_score, ?)
      WHERE id = ?
    `);
    winStmt.run(awardedPoints, cleanScore, cleanScore, winnerUserId);
  }

  const insertMatch = db.prepare(`
    INSERT INTO match_results (mode, winner_user_id, winner_nickname, winner_score, awarded_points, players_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertMatch.run(
    mode,
    winnerUserId || null,
    winnerNickname || 'Unknown',
    cleanScore,
    awardedPoints,
    JSON.stringify(participants)
  );

  return { awardedPoints };
}

export function getTop10Online() {
  const stmt = db.prepare(`
    SELECT id, username, nickname, online_points, online_wins, online_matches, best_online_win_score, best_score
    FROM users
    WHERE online_points > 0 OR online_wins > 0
    ORDER BY online_points DESC, online_wins DESC, best_online_win_score DESC, id ASC
    LIMIT 10
  `);
  return stmt.all().map((row, idx) => ({ rank: idx + 1, ...row }));
}

export function getTop10PersonalBest() {
  const stmt = db.prepare(`
    SELECT id, username, nickname, best_score, online_points, online_wins
    FROM users
    WHERE best_score > 0
    ORDER BY best_score DESC, online_points DESC, id ASC
    LIMIT 10
  `);
  return stmt.all().map((row, idx) => ({ rank: idx + 1, ...row }));
}

export function getUserRanks(userId) {
  const user = findUserById(userId);
  if (!user) return null;

  const onlineRankRow = db.prepare(`
    SELECT COUNT(*) + 1 AS rank
    FROM users
    WHERE (online_points > ?)
       OR (online_points = ? AND online_wins > ?)
       OR (online_points = ? AND online_wins = ? AND best_online_win_score > ?)
       OR (online_points = ? AND online_wins = ? AND best_online_win_score = ? AND id < ?)
  `).get(
    user.online_points,
    user.online_points, user.online_wins,
    user.online_points, user.online_wins, user.best_online_win_score,
    user.online_points, user.online_wins, user.best_online_win_score, user.id
  );

  const bestRankRow = db.prepare(`
    SELECT COUNT(*) + 1 AS rank
    FROM users
    WHERE (best_score > ?)
       OR (best_score = ? AND id < ?)
  `).get(user.best_score, user.best_score, user.id);

  return {
    onlineRank: user.online_points > 0 ? Number(onlineRankRow.rank) : null,
    bestScoreRank: user.best_score > 0 ? Number(bestRankRow.rank) : null,
  };
}

export function getRecentMatches(limit = 8) {
  const stmt = db.prepare(`
    SELECT id, mode, winner_nickname, winner_score, awarded_points, created_at
    FROM match_results
    ORDER BY id DESC
    LIMIT ?
  `);
  return stmt.all(limit);
}
