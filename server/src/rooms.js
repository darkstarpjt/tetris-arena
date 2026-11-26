import { recordOnlineMatchWin, updatePersonalBest } from './db.js';

const rooms = new Map();

function normalizeMaxPlayers(maxPlayers, mode) {
  if (maxPlayers !== undefined && maxPlayers !== null) {
    const num = Math.floor(Number(maxPlayers));
    if (!Number.isNaN(num) && num >= 1 && num <= 5) {
      return num;
    }
  }
  if (mode === '4p') return 4;
  if (mode === '5p') return 5;
  if (mode === '3p') return 3;
  if (mode === '1p') return 1;
  return 2;
}

function modeFromMaxPlayers(maxPlayers) {
  return maxPlayers === 2 ? '1v1' : `${maxPlayers}p`;
}

function normalizeDeviceType(deviceType, userAgent = '') {
  if (deviceType === 'mobile' || deviceType === 'pc') {
    return deviceType;
  }
  if (/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i.test(userAgent)) {
    return 'mobile';
  }
  return 'pc';
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

function serializeRoom(room) {
  return {
    code: room.code,
    mode: room.mode,
    maxPlayers: room.maxPlayers,
    deviceType: room.deviceType || 'pc',
    status: room.status,
    hostSocketId: room.hostSocketId,
    players: Array.from(room.players.values()).map((p) => ({
      socketId: p.socketId,
      userId: p.userId,
      nickname: p.nickname,
      deviceType: p.deviceType || room.deviceType || 'pc',
      ready: p.ready,
      alive: p.alive,
      score: p.score,
      lines: p.lines,
      level: p.level,
      attacksSent: p.attacksSent,
      koOrder: p.koOrder,
    })),
  };
}

export function setupMultiplayer(io, verifyTokenFn, findUserByIdFn) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const ua = socket.handshake.headers?.['user-agent'] || '';
    socket.data.deviceType = normalizeDeviceType(socket.handshake.auth?.deviceType, ua);
    const payload = verifyTokenFn(token);
    if (payload) {
      const user = findUserByIdFn(payload.uid);
      if (user) {
        socket.data.user = user;
      }
    }
    next();
  });

  function leaveCurrentRoom(socket) {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    socket.leave(roomCode);
    socket.data.roomCode = null;
    if (!room) return;

    const leavingPlayer = room.players.get(socket.id);
    if (room.status === 'playing' && leavingPlayer && leavingPlayer.alive) {
      leavingPlayer.alive = false;
      room.koCounter += 1;
      leavingPlayer.koOrder = room.koCounter;
      io.to(roomCode).emit('game:player_ko', {
        socketId: socket.id,
        nickname: leavingPlayer.nickname,
        reason: 'disconnect',
      });
      checkMatchEnd(room);
    }

    room.players.delete(socket.id);

    if (room.players.size === 0) {
      rooms.delete(roomCode);
      return;
    }

    if (room.hostSocketId === socket.id) {
      const firstPlayer = room.players.values().next().value;
      room.hostSocketId = firstPlayer.socketId;
    }

    io.to(roomCode).emit('room:updated', serializeRoom(room));
  }

  function startMatch(room) {
    if (room.status === 'playing') return;
    if (room.players.size < 1) return;
    room.status = 'playing';
    room.koCounter = 0;
    room.initialPlayerCount = room.players.size;
    const seed = Math.floor(Math.random() * 1000000000);

    for (const p of room.players.values()) {
      p.ready = false;
      p.alive = true;
      p.score = 0;
      p.lines = 0;
      p.level = 1;
      p.attacksSent = 0;
      p.koOrder = 0;
    }

    io.to(room.code).emit('room:updated', serializeRoom(room));
    io.to(room.code).emit('game:start', {
      seed,
      mode: room.mode,
      maxPlayers: room.maxPlayers,
      deviceType: room.deviceType || 'pc',
      players: serializeRoom(room).players,
    });
  }

  function checkMatchEnd(room) {
    if (room.status !== 'playing') return;
    const allPlayers = Array.from(room.players.values());
    const alivePlayers = allPlayers.filter((p) => p.alive);
    const startedWith = room.initialPlayerCount || allPlayers.length;

    // For a 1-player match, end when 0 alive; for 2+ players, end when <= 1 alive
    const shouldEnd = startedWith <= 1 ? alivePlayers.length === 0 : alivePlayers.length <= 1;

    if (shouldEnd) {
      room.status = 'finished';

      // Sort rankings: alive player first, then highest koOrder (last to die), then score
      const rankings = [...allPlayers].sort((a, b) => {
        if (a.alive !== b.alive) return a.alive ? -1 : 1;
        if (a.koOrder !== b.koOrder) return b.koOrder - a.koOrder;
        return b.score - a.score;
      });

      const winner = rankings[0];
      let awardedPoints = 0;

      if (winner && startedWith >= 2 && allPlayers.length >= 2) {
        const result = recordOnlineMatchWin({
          mode: modeFromMaxPlayers(allPlayers.length),
          winnerUserId: winner.userId,
          winnerNickname: winner.nickname,
          winnerScore: winner.score,
          participants: rankings.map((p, idx) => ({
            rank: idx + 1,
            userId: p.userId,
            nickname: p.nickname,
            score: p.score,
            lines: p.lines,
            attacksSent: p.attacksSent,
          })),
        });
        awardedPoints = result.awardedPoints;
      } else if (winner && winner.userId) {
        updatePersonalBest(winner.userId, winner.score);
      }

      io.to(room.code).emit('game:over', {
        mode: room.mode,
        maxPlayers: room.maxPlayers,
        awardedPoints,
        winner: winner
          ? {
              socketId: winner.socketId,
              userId: winner.userId,
              nickname: winner.nickname,
              score: winner.score,
            }
          : null,
        rankings: rankings.map((p, idx) => ({
          rank: idx + 1,
          socketId: p.socketId,
          userId: userOrNull(p.userId),
          nickname: p.nickname,
          score: p.score,
          lines: p.lines,
          attacksSent: p.attacksSent,
        })),
      });

      // Reset room to waiting after a short delay so players can rematch
      setTimeout(() => {
        const current = rooms.get(room.code);
        if (!current) return;
        current.status = 'waiting';
        for (const p of current.players.values()) {
          p.ready = false;
        }
        io.to(current.code).emit('room:updated', serializeRoom(current));
      }, 1500);
    }
  }

  function userOrNull(uid) {
    return uid || null;
  }

  function joinRoom(socket, room) {
    leaveCurrentRoom(socket);

    const user = socket.data.user;
    const nickname = user?.nickname || `플레이어${socket.id.slice(0, 4)}`;
    const playerDevice = socket.data.deviceType || room.deviceType || 'pc';

    room.players.set(socket.id, {
      socketId: socket.id,
      userId: user?.id || null,
      nickname,
      deviceType: playerDevice,
      ready: false,
      alive: true,
      score: 0,
      lines: 0,
      level: 1,
      attacksSent: 0,
      koOrder: 0,
    });

    socket.join(room.code);
    socket.data.roomCode = room.code;

    io.to(room.code).emit('room:updated', serializeRoom(room));

    // Auto-start if a multi-player public quick-match room becomes completely full
    if (room.isPublic && room.maxPlayers >= 2 && room.players.size === room.maxPlayers && room.status === 'waiting') {
      startMatch(room);
    }
  }

  io.on('connection', (socket) => {
    socket.on('auth:refresh', ({ token, deviceType } = {}) => {
      if (deviceType === 'mobile' || deviceType === 'pc') {
        socket.data.deviceType = deviceType;
      }
      const payload = verifyTokenFn(token);
      if (payload) {
        const user = findUserByIdFn(payload.uid);
        if (user) socket.data.user = user;
      }
    });

    socket.on('room:quick_match', ({ mode, maxPlayers, deviceType } = {}, cb) => {
      if (!socket.data.user) {
        return cb?.({ error: '온라인 대전은 로그인 후 이용할 수 있습니다.' });
      }
      const ua = socket.handshake.headers?.['user-agent'] || '';
      const playerDevice = normalizeDeviceType(deviceType || socket.data.deviceType, ua);
      socket.data.deviceType = playerDevice;

      const targetMax = normalizeMaxPlayers(maxPlayers, mode);
      const validMode = modeFromMaxPlayers(targetMax);

      // Find an open waiting public room for this player count AND same device type (mobile-only or pc-only)
      let targetRoom = null;
      for (const room of rooms.values()) {
        if (
          room.isPublic &&
          room.maxPlayers === targetMax &&
          room.deviceType === playerDevice &&
          room.status === 'waiting' &&
          room.players.size < room.maxPlayers
        ) {
          targetRoom = room;
          break;
        }
      }

      if (!targetRoom) {
        const code = generateRoomCode();
        targetRoom = {
          code,
          mode: validMode,
          maxPlayers: targetMax,
          deviceType: playerDevice,
          isPublic: true,
          status: 'waiting',
          hostSocketId: socket.id,
          koCounter: 0,
          initialPlayerCount: 0,
          players: new Map(),
        };
        rooms.set(code, targetRoom);
      }

      joinRoom(socket, targetRoom);
      cb?.({ ok: true, room: serializeRoom(targetRoom) });
    });

    socket.on('room:create', ({ mode, maxPlayers, deviceType } = {}, cb) => {
      if (!socket.data.user) {
        return cb?.({ error: '온라인 대전은 로그인 후 이용할 수 있습니다.' });
      }
      const ua = socket.handshake.headers?.['user-agent'] || '';
      const playerDevice = normalizeDeviceType(deviceType || socket.data.deviceType, ua);
      socket.data.deviceType = playerDevice;

      const targetMax = normalizeMaxPlayers(maxPlayers, mode);
      const validMode = modeFromMaxPlayers(targetMax);
      const code = generateRoomCode();
      const room = {
        code,
        mode: validMode,
        maxPlayers: targetMax,
        deviceType: playerDevice,
        isPublic: false,
        status: 'waiting',
        hostSocketId: socket.id,
        koCounter: 0,
        initialPlayerCount: 0,
        players: new Map(),
      };
      rooms.set(code, room);
      joinRoom(socket, room);
      cb?.({ ok: true, room: serializeRoom(room) });
    });

    socket.on('room:join', ({ code, deviceType } = {}, cb) => {
      if (!socket.data.user) {
        return cb?.({ error: '온라인 대전은 로그인 후 이용할 수 있습니다.' });
      }
      const ua = socket.handshake.headers?.['user-agent'] || '';
      const playerDevice = normalizeDeviceType(deviceType || socket.data.deviceType, ua);
      socket.data.deviceType = playerDevice;

      const cleanCode = String(code || '').trim().toUpperCase();
      const room = rooms.get(cleanCode);
      if (!room) return cb?.({ error: '해당 방 코드를 찾을 수 없습니다.' });
      if (room.status === 'playing') return cb?.({ error: '이미 게임이 진행 중인 방입니다.' });
      if (room.players.size >= room.maxPlayers) return cb?.({ error: '방 인원이 가득 찼습니다.' });
      if (room.deviceType && room.deviceType !== playerDevice) {
        const roomLabel = room.deviceType === 'mobile' ? '모바일' : 'PC';
        const myLabel = playerDevice === 'mobile' ? '모바일' : 'PC';
        return cb?.({
          error: `이 방은 ${roomLabel} 사용자 전용 방입니다. (현재 접속 기기: ${myLabel})`,
        });
      }

      joinRoom(socket, room);
      cb?.({ ok: true, room: serializeRoom(room) });
    });

    socket.on('room:toggle_ready', (_, cb) => {
      const room = rooms.get(socket.data.roomCode);
      if (!room) return cb?.({ error: '방에 입장해 있지 않습니다.' });
      if (room.status === 'playing') return cb?.({ error: '이미 게임이 진행 중입니다.' });
      const player = room.players.get(socket.id);
      if (!player) return cb?.({ error: '플레이어 정보를 찾을 수 없습니다.' });

      player.ready = !player.ready;
      io.to(room.code).emit('room:updated', serializeRoom(room));

      // Auto-start rematch when all players (>= 2) are ready
      const allPlayers = Array.from(room.players.values());
      if (allPlayers.length >= 2 && allPlayers.every((p) => p.ready)) {
        startMatch(room);
      }
      cb?.({ ok: true, ready: player.ready });
    });

    socket.on('room:start', (_, cb) => {
      const room = rooms.get(socket.data.roomCode);
      if (!room) return cb?.({ error: '방에 입장해 있지 않습니다.' });
      if (room.hostSocketId !== socket.id) return cb?.({ error: '방장만 게임을 시작할 수 있습니다.' });
      if (room.players.size < 1) return cb?.({ error: '최소 1명 이상 있어야 시작할 수 있습니다.' });
      startMatch(room);
      cb?.({ ok: true });
    });

    socket.on('room:leave', () => {
      leaveCurrentRoom(socket);
    });

    socket.on('game:state', ({ board, score, lines, level, pendingGarbage }) => {
      const room = rooms.get(socket.data.roomCode);
      if (!room || room.status !== 'playing') return;
      const player = room.players.get(socket.id);
      if (!player) return;

      player.score = Number(score) || 0;
      player.lines = Number(lines) || 0;
      player.level = Number(level) || 1;

      socket.to(room.code).emit('game:opponent_state', {
        socketId: socket.id,
        nickname: player.nickname,
        deviceType: player.deviceType || room.deviceType || 'pc',
        board,
        score: player.score,
        lines: player.lines,
        level: player.level,
        pendingGarbage: Number(pendingGarbage) || 0,
        alive: player.alive,
      });
    });

    // Simultaneous attack to ALL living opponents in 1v1 and 4-player battles!
    socket.on('game:attack', ({ lines, combo = 0, label = '' }) => {
      const room = rooms.get(socket.data.roomCode);
      if (!room || room.status !== 'playing') return;
      const attacker = room.players.get(socket.id);
      if (!attacker || !attacker.alive) return;

      const attackLines = Math.max(1, Math.min(8, Math.floor(Number(lines) || 0)));
      attacker.attacksSent += attackLines;

      for (const target of room.players.values()) {
        if (target.socketId !== socket.id && target.alive) {
          io.to(target.socketId).emit('game:incoming_attack', {
            fromSocketId: socket.id,
            fromNickname: attacker.nickname,
            lines: attackLines,
            combo,
            label,
          });
        }
      }
    });

    socket.on('game:ko', ({ score, lines }) => {
      const room = rooms.get(socket.data.roomCode);
      if (!room || room.status !== 'playing') return;
      const player = room.players.get(socket.id);
      if (!player || !player.alive) return;

      player.alive = false;
      player.score = Number(score) || player.score;
      player.lines = Number(lines) || player.lines;
      room.koCounter += 1;
      player.koOrder = room.koCounter;

      io.to(room.code).emit('game:player_ko', {
        socketId: socket.id,
        nickname: player.nickname,
        score: player.score,
      });

      checkMatchEnd(room);
    });

    socket.on('disconnect', () => {
      leaveCurrentRoom(socket);
    });
  });
}
