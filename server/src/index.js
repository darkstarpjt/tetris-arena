import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';

import {
  createUser,
  findUserById,
  findUserByUsername,
  getRecentMatches,
  getTop10Online,
  getTop10PersonalBest,
  getUserRanks,
  updatePersonalBest,
} from './db.js';
import { hashPassword, requireAuth, signToken, verifyPassword, verifyToken } from './auth.js';
import { setupMultiplayer } from './rooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4000);

const app = express();
app.use(cors());
app.use(express.json());

// --- Health Check ---
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'tetris-arena-server' });
});

// --- Auth Routes (ID / Password Sign-up & Login) ---
app.post('/api/auth/register', (req, res) => {
  const { username, password, nickname } = req.body || {};
  const cleanUser = String(username || '').trim();
  const cleanPass = String(password || '');
  const cleanNick = String(nickname || cleanUser).trim();

  if (cleanUser.length < 3 || cleanUser.length > 20 || !/^[a-zA-Z0-9_]+$/.test(cleanUser)) {
    return res.status(400).json({ error: '아이디는 영문, 숫자, 밑줄(_) 3~20자로 입력해주세요.' });
  }
  if (cleanPass.length < 4 || cleanPass.length > 64) {
    return res.status(400).json({ error: '비밀번호는 4자 이상 입력해주세요.' });
  }
  if (cleanNick.length < 2 || cleanNick.length > 16) {
    return res.status(400).json({ error: '닉네임은 2~16자로 입력해주세요.' });
  }

  if (findUserByUsername(cleanUser)) {
    return res.status(409).json({ error: '이미 사용 중인 아이디입니다.' });
  }

  const { hash, salt } = hashPassword(cleanPass);
  const user = createUser({
    username: cleanUser,
    nickname: cleanNick,
    passwordHash: hash,
    passwordSalt: salt,
  });

  const token = signToken(user);
  const ranks = getUserRanks(user.id);
  res.status(201).json({ token, user, ranks });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const cleanUser = String(username || '').trim();
  const cleanPass = String(password || '');

  const record = findUserByUsername(cleanUser);
  if (!record || !verifyPassword(cleanPass, record.password_hash, record.password_salt)) {
    return res.status(401).json({ error: '아이디 또는 비밀번호가 일치하지 않습니다.' });
  }

  const user = findUserById(record.id);
  const token = signToken(user);
  const ranks = getUserRanks(user.id);
  res.json({ token, user, ranks });
});

app.get('/api/me', requireAuth, (req, res) => {
  const ranks = getUserRanks(req.user.id);
  res.json({ user: req.user, ranks });
});

// --- Personal Best Score Submission ---
app.post('/api/scores/personal-best', requireAuth, (req, res) => {
  const { score } = req.body || {};
  const updated = updatePersonalBest(req.user.id, score);
  const ranks = getUserRanks(req.user.id);
  res.json({ user: updated, ranks });
});

// --- Top 10 Leaderboard ---
app.get('/api/leaderboard', (_req, res) => {
  res.json({
    onlineTop10: getTop10Online(),
    personalBestTop10: getTop10PersonalBest(),
    recentMatches: getRecentMatches(8),
  });
});

// --- Serve built client in production ---
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

setupMultiplayer(io, verifyToken, findUserById);

server.listen(PORT, () => {
  console.log(`Tetris Arena server listening on http://localhost:${PORT}`);
});
