import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot,
  Copy,
  Crown,
  LogIn,
  LogOut,
  Monitor,
  Play,
  RotateCcw,
  Shield,
  Smartphone,
  Sparkles,
  Swords,
  Trophy,
  User,
  Users,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { TetrisGame, LockOutcome } from './game/tetrisEngine';
import { BotDifficulty, chooseBotMove, getBotTickIntervalMs } from './game/botAI';
import { TetrisCanvas, PiecePreview } from './components/TetrisCanvas';
import { MiniBoard, OpponentSnapshot } from './components/MiniBoard';
import { useTouchGestures } from './hooks/useTouchGestures';
import { AuthModal } from './components/AuthModal';
import { LeaderboardModal } from './components/LeaderboardModal';
import {
  fetchMe,
  getStoredToken,
  setStoredToken,
  submitPersonalBest,
  UserProfile,
  UserRanks,
} from './services/api';
import {
  detectDeviceType,
  DeviceType,
  getSocket,
  refreshSocketAuth,
} from './services/socket';
import {
  isMuted,
  playAttackHit,
  playClear,
  playGameOver,
  playHardDrop,
  playRotate,
  playWin,
  setMuted as persistMuted,
} from './game/sound';

type Screen = 'lobby' | 'waiting' | 'playing';
type GameMode = 'solo' | 'bot_1v1' | 'bot_4p' | 'online_1v1' | 'online_4p';

interface RoomPlayer {
  socketId: string;
  userId: number | null;
  nickname: string;
  deviceType?: DeviceType;
  ready: boolean;
  alive: boolean;
  score: number;
  lines: number;
  level: number;
  attacksSent: number;
}

interface RoomState {
  code: string;
  mode: string;
  maxPlayers: number;
  deviceType?: DeviceType;
  status: 'waiting' | 'playing' | 'finished';
  hostSocketId: string;
  players: RoomPlayer[];
}

interface MatchSummary {
  won: boolean;
  title: string;
  subtitle: string;
  score: number;
  lines: number;
  attacksSent: number;
  awardedPoints?: number;
  isNewBest: boolean;
  rankings?: Array<{
    rank: number;
    nickname: string;
    score: number;
    lines: number;
    attacksSent: number;
  }>;
}

const LOCAL_BEST_KEY = 'tetris_arena_local_best';

function getLocalBest(): number {
  return Number(localStorage.getItem(LOCAL_BEST_KEY) || '0') || 0;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('lobby');
  const [mode, setMode] = useState<GameMode>('bot_1v1');
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('normal');

  // Auth & User Profile
  const [user, setUser] = useState<UserProfile | null>(null);
  const [ranks, setRanks] = useState<UserRanks | null>(null);
  const [localBest, setLocalBest] = useState<number>(getLocalBest());
  const [showAuth, setShowAuth] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [muted, setMutedState] = useState<boolean>(isMuted());

  // Online Room UI
  const [room, setRoom] = useState<RoomState | null>(null);
  const [onlineMaxPlayers, setOnlineMaxPlayers] = useState<number>(4);
  const [mySocketId, setMySocketId] = useState<string>(() => getSocket().id || '');
  const [joinCode, setJoinCode] = useState('');
  const [lobbyError, setLobbyError] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);

  // Active Game State
  const arenaRef = useRef<HTMLElement | null>(null);
  const [viewport, setViewport] = useState<{ w: number; h: number }>(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1024,
    h: typeof window !== 'undefined' ? window.innerHeight : 768,
  }));
  const gameRef = useRef<TetrisGame>(new TetrisGame());
  const botGamesRef = useRef<Array<{ id: string; nickname: string; game: TetrisGame }>>([]);
  const [tick, setTick] = useState(0);
  const [opponents, setOpponents] = useState<OpponentSnapshot[]>([]);
  const [banner, setBanner] = useState('');
  const [attackFlash, setAttackFlash] = useState(false);
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [summary, setSummary] = useState<MatchSummary | null>(null);

  const summaryRef = useRef<MatchSummary | null>(null);
  summaryRef.current = summary;

  const modeRef = useRef<GameMode>(mode);
  modeRef.current = mode;

  const userRef = useRef<UserProfile | null>(user);
  userRef.current = user;

  const displayBest = Math.max(localBest, user?.best_score || 0);

  const pushLog = useCallback((msg: string) => {
    setBattleLog((prev) => [msg, ...prev].slice(0, 4));
  }, []);

  const flashBanner = useCallback((text: string) => {
    setBanner(text);
    setTimeout(() => {
      setBanner((curr) => (curr === text ? '' : curr));
    }, 1100);
  }, []);

  const triggerAttackFlash = useCallback(() => {
    setAttackFlash(true);
    setTimeout(() => setAttackFlash(false), 320);
  }, []);

  const syncPersonalBest = useCallback(
    async (score: number): Promise<boolean> => {
      const prevBest = Math.max(getLocalBest(), userRef.current?.best_score || 0);
      const isNewBest = score > prevBest && score > 0;
      if (score > getLocalBest()) {
        localStorage.setItem(LOCAL_BEST_KEY, String(score));
        setLocalBest(score);
      }
      if (userRef.current && score > 0) {
        try {
          const res = await submitPersonalBest(score);
          setUser(res.user);
          setRanks(res.ranks);
        } catch {
          // ignore offline error
        }
      }
      return isNewBest;
    },
    []
  );

  // Restore session on load
  useEffect(() => {
    const onResize = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (getStoredToken()) {
      fetchMe()
        .then((res) => {
          setUser(res.user);
          setRanks(res.ranks);
          refreshSocketAuth();
        })
        .catch(() => {
          setStoredToken(null);
        });
    }
  }, []);

  const handleLogout = () => {
    setStoredToken(null);
    setUser(null);
    setRanks(null);
    refreshSocketAuth();
  };

  // Start local Solo / Bot match
  const startLocalGame = useCallback(
    (selectedMode: 'solo' | 'bot_1v1' | 'bot_4p') => {
      const seed = Date.now();
      gameRef.current = new TetrisGame(seed);
      setMode(selectedMode);
      setSummary(null);
      setBanner('');
      setBattleLog([]);

      if (selectedMode === 'solo') {
        botGamesRef.current = [];
        setOpponents([]);
      } else {
        const botCount = selectedMode === 'bot_4p' ? 3 : 1;
        const botNames = ['알파봇', '네오봇', '타이탄봇'];
        const bots = Array.from({ length: botCount }, (_, i) => ({
          id: `bot-${i + 1}`,
          nickname: `${botNames[i]} (${
            botDifficulty === 'easy' ? '쉬움' : botDifficulty === 'normal' ? '보통' : '어려움'
          })`,
          game: new TetrisGame(seed + i + 17),
        }));
        botGamesRef.current = bots;
        setOpponents(
          bots.map((b) => ({
            id: b.id,
            nickname: b.nickname,
            board: b.game.getBoardSnapshot(),
            score: 0,
            lines: 0,
            pendingGarbage: 0,
            alive: true,
            isBot: true,
          }))
        );
      }

      setScreen('playing');
      setTick((t) => t + 1);
    },
    [botDifficulty]
  );

  // Broadcast player state in online mode
  const emitOnlineState = useCallback(() => {
    if (modeRef.current !== 'online_1v1' && modeRef.current !== 'online_4p') return;
    const g = gameRef.current;
    getSocket().emit('game:state', {
      board: g.getBoardSnapshot(),
      score: g.score,
      lines: g.lines,
      level: g.level,
      pendingGarbage: g.pendingGarbage,
    });
  }, []);

  // Process lock outcome (line clears, attacks to ALL opponents, KO)
  const handleLockOutcome = useCallback(
    async (outcome: LockOutcome | null) => {
      if (!outcome || summaryRef.current) return;
      const g = gameRef.current;

      if (outcome.clearedLines > 0) {
        playClear(outcome.clearedLines, outcome.combo);
      }

      if (outcome.canceledGarbage > 0 && outcome.attackSent === 0) {
        flashBanner(`방어 성공! -${outcome.canceledGarbage}줄`);
      } else if (outcome.attackSent > 0) {
        flashBanner(`${outcome.label}  +${outcome.attackSent} ATTACK!`);

        if (modeRef.current === 'bot_1v1' || modeRef.current === 'bot_4p') {
          let targetsHit = 0;
          for (const bot of botGamesRef.current) {
            if (!bot.game.gameOver) {
              bot.game.queueGarbage(outcome.attackSent);
              targetsHit++;
            }
          }
          if (targetsHit > 0) {
            pushLog(`⚔️ 상대 ${targetsHit}명에게 방해 블록 ${outcome.attackSent}줄 공격!`);
          }
        } else if (modeRef.current === 'online_1v1' || modeRef.current === 'online_4p') {
          getSocket().emit('game:attack', {
            lines: outcome.attackSent,
            combo: outcome.combo,
            label: outcome.label,
          });
          pushLog(`⚔️ 모든 생존 상대에게 ${outcome.attackSent}줄 동시 공격!`);
        }
      } else if (outcome.label) {
        flashBanner(outcome.label);
      }

      emitOnlineState();

      if (outcome.gameOver) {
        const isNewBest = await syncPersonalBest(g.score);
        if (modeRef.current === 'online_1v1' || modeRef.current === 'online_4p') {
          getSocket().emit('game:ko', { score: g.score, lines: g.lines });
          playGameOver();
          pushLog('💥 탈락했습니다. 최종 결과를 기다리는 중...');
        } else {
          playGameOver();
          setSummary({
            won: false,
            title: modeRef.current === 'solo' ? '게임 종료' : '패배했습니다',
            subtitle:
              modeRef.current === 'solo'
                ? '멋진 플레이였어요! 최고 기록에 다시 도전해보세요.'
                : '봇의 공격을 막아내지 못했습니다.',
            score: g.score,
            lines: g.lines,
            attacksSent: g.attacksSent,
            isNewBest,
          });
        }
      }
    },
    [emitOnlineState, flashBanner, pushLog, syncPersonalBest]
  );

  // Socket.io listeners for online multiplayer
  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => {
      setMySocketId(socket.id || '');
    };

    const onRoomUpdated = (updatedRoom: RoomState) => {
      setMySocketId(socket.id || '');
      setRoom(updatedRoom);
    };

    const onGameStart = (payload: { seed: number; mode: string; maxPlayers?: number; players: RoomPlayer[] }) => {
      const onlineMode: GameMode = (payload.maxPlayers || payload.players.length) > 2 ? 'online_4p' : 'online_1v1';
      setMode(onlineMode);
      gameRef.current = new TetrisGame(payload.seed);
      botGamesRef.current = [];
      setSummary(null);
      setBanner('BATTLE START!');
      setBattleLog([
        payload.players.length > 2
          ? `🔥 ${payload.players.length}인 배틀 시작! 블록을 없애면 모든 상대를 동시 공격합니다.`
          : payload.players.length === 2
          ? '🔥 1:1 배틀 시작! 블록을 없애 상대를 방해하세요.'
          : '🔥 1인 온라인 플레이 시작! 최고 점수에 도전하세요.',
      ]);

      const others: OpponentSnapshot[] = payload.players
        .filter((p) => p.socketId !== socket.id)
        .map((p) => ({
          id: p.socketId,
          nickname: p.nickname,
          deviceType: p.deviceType || (isMobile ? 'mobile' : 'pc'),
          board: Array.from({ length: 20 }, () => '..........'),
          score: 0,
          lines: 0,
          pendingGarbage: 0,
          alive: true,
        }));
      setOpponents(others);
      setScreen('playing');
      setTick((t) => t + 1);
      setTimeout(() => setBanner(''), 1000);
    };

    const onOpponentState = (data: {
      socketId: string;
      nickname: string;
      deviceType?: DeviceType;
      board: string[];
      score: number;
      lines: number;
      pendingGarbage: number;
      alive: boolean;
    }) => {
      setOpponents((prev) => {
        const exists = prev.some((o) => o.id === data.socketId);
        const snap: OpponentSnapshot = {
          id: data.socketId,
          nickname: data.nickname,
          deviceType: data.deviceType,
          board: data.board,
          score: data.score,
          lines: data.lines,
          pendingGarbage: data.pendingGarbage,
          alive: data.alive,
        };
        if (!exists) return [...prev, snap];
        return prev.map((o) => (o.id === data.socketId ? snap : o));
      });
    };

    const onIncomingAttack = (data: { fromNickname: string; lines: number }) => {
      if (summaryRef.current || gameRef.current.gameOver) return;
      gameRef.current.queueGarbage(data.lines);
      triggerAttackFlash();
      playAttackHit();
      pushLog(`⚠️ ${data.fromNickname}님이 ${data.lines}줄 공격!`);
      setTick((t) => t + 1);
    };

    const onPlayerKO = (data: { socketId: string; nickname: string }) => {
      setOpponents((prev) =>
        prev.map((o) => (o.id === data.socketId ? { ...o, alive: false } : o))
      );
      pushLog(`💀 ${data.nickname}님 탈락!`);
    };

    const onGameOver = async (data: {
      mode: string;
      maxPlayers?: number;
      awardedPoints: number;
      winner: { socketId: string; nickname: string; score: number } | null;
      rankings: Array<{
        rank: number;
        socketId: string;
        nickname: string;
        score: number;
        lines: number;
        attacksSent: number;
      }>;
    }) => {
      const g = gameRef.current;
      const didWin = data.winner?.socketId === socket.id;
      if (didWin) playWin();
      const isNewBest = await syncPersonalBest(g.score);

      // Refresh server profile to reflect newly earned online win points
      if (getStoredToken()) {
        fetchMe()
          .then((res) => {
            setUser(res.user);
            setRanks(res.ranks);
          })
          .catch(() => {});
      }

      const isSoloRoom = (data.rankings?.length || 1) <= 1;
      setSummary({
        won: didWin,
        title: isSoloRoom
          ? '게임 종료!'
          : didWin
          ? '🏆 최종 승리!'
          : `${data.winner?.nickname || '상대'}님 우승`,
        subtitle: isSoloRoom
          ? '점수가 최고 기록 DB에 반영되었습니다!'
          : didWin
          ? `온라인 승점 +${data.awardedPoints} pts가 랭킹 DB에 기록되었습니다!`
          : '다음 판에서 복수전에 도전해보세요!',
        score: g.score,
        lines: g.lines,
        attacksSent: g.attacksSent,
        awardedPoints: didWin ? data.awardedPoints : 0,
        isNewBest,
        rankings: data.rankings,
      });
    };

    socket.on('connect', onConnect);
    socket.on('room:updated', onRoomUpdated);
    socket.on('game:start', onGameStart);
    socket.on('game:opponent_state', onOpponentState);
    socket.on('game:incoming_attack', onIncomingAttack);
    socket.on('game:player_ko', onPlayerKO);
    socket.on('game:over', onGameOver);

    return () => {
      socket.off('connect', onConnect);
      socket.off('room:updated', onRoomUpdated);
      socket.off('game:start', onGameStart);
      socket.off('game:opponent_state', onOpponentState);
      socket.off('game:incoming_attack', onIncomingAttack);
      socket.off('game:player_ko', onPlayerKO);
      socket.off('game:over', onGameOver);
    };
  }, [pushLog, syncPersonalBest, triggerAttackFlash]);

  // Gravity loop for player
  useEffect(() => {
    if (screen !== 'playing' || summary) return;

    let timerId: number;
    const schedule = () => {
      const interval = gameRef.current.getDropIntervalMs();
      timerId = window.setTimeout(() => {
        if (!gameRef.current.gameOver && !summaryRef.current) {
          const outcome = gameRef.current.stepDown();
          if (outcome) {
            handleLockOutcome(outcome);
          } else {
            emitOnlineState();
          }
          setTick((t) => t + 1);
          schedule();
        }
      }, interval);
    };
    schedule();

    return () => clearTimeout(timerId);
  }, [screen, summary, handleLockOutcome, emitOnlineState]);

  // Bot AI loop (for bot_1v1 and bot_4p)
  useEffect(() => {
    if (screen !== 'playing' || summary) return;
    if (mode !== 'bot_1v1' && mode !== 'bot_4p') return;

    const interval = getBotTickIntervalMs(botDifficulty);
    const id = window.setInterval(async () => {
      if (summaryRef.current) return;

      let aliveBots = 0;
      for (const bot of botGamesRef.current) {
        if (bot.game.gameOver) continue;
        const move = chooseBotMove(bot.game, botDifficulty);
        if (move) {
          bot.game.current.rotation = move.rotation;
          bot.game.current.x = move.x;
        }
        const outcome = bot.game.hardDrop();

        if (outcome.attackSent > 0) {
          // Bot attacks all other alive players (the human + other bots in 4p)
          if (!gameRef.current.gameOver) {
            gameRef.current.queueGarbage(outcome.attackSent);
            triggerAttackFlash();
            playAttackHit();
            pushLog(`🤖 ${bot.nickname}이(가) ${outcome.attackSent}줄 공격!`);
          }
          for (const other of botGamesRef.current) {
            if (other.id !== bot.id && !other.game.gameOver) {
              other.game.queueGarbage(outcome.attackSent);
            }
          }
        }

        if (!bot.game.gameOver) aliveBots++;
      }

      setOpponents(
        botGamesRef.current.map((b) => ({
          id: b.id,
          nickname: b.nickname,
          board: b.game.getBoardSnapshot(),
          score: b.game.score,
          lines: b.game.lines,
          pendingGarbage: b.game.pendingGarbage,
          alive: !b.game.gameOver,
          isBot: true,
        }))
      );
      setTick((t) => t + 1);

      if (aliveBots === 0 && !gameRef.current.gameOver && !summaryRef.current) {
        const g = gameRef.current;
        const isNewBest = await syncPersonalBest(g.score);
        playWin();
        setSummary({
          won: true,
          title: '🏆 봇 대전 승리!',
          subtitle:
            mode === 'bot_4p'
              ? '3명의 봇을 모두 제압하고 최후의 1인이 되었습니다!'
              : '봇을 완벽하게 제압했습니다!',
          score: g.score,
          lines: g.lines,
          attacksSent: g.attacksSent,
          isNewBest,
        });
      }
    }, interval);

    return () => clearInterval(id);
  }, [screen, summary, mode, botDifficulty, pushLog, syncPersonalBest, triggerAttackFlash]);

  // Controls
  const actMove = useCallback(
    (dx: number, dy: number) => {
      if (screen !== 'playing' || summaryRef.current || gameRef.current.gameOver) return;
      if (gameRef.current.move(dx, dy)) {
        emitOnlineState();
        setTick((t) => t + 1);
      }
    },
    [screen, emitOnlineState]
  );

  const actRotate = useCallback(
    (dir: 1 | -1 = 1) => {
      if (screen !== 'playing' || summaryRef.current || gameRef.current.gameOver) return;
      if (gameRef.current.rotate(dir)) {
        playRotate();
        emitOnlineState();
        setTick((t) => t + 1);
      }
    },
    [screen, emitOnlineState]
  );

  const actHold = useCallback(() => {
    if (screen !== 'playing' || summaryRef.current || gameRef.current.gameOver) return;
    if (gameRef.current.hold()) {
      emitOnlineState();
      setTick((t) => t + 1);
    }
  }, [screen, emitOnlineState]);

  const actHardDrop = useCallback(() => {
    if (screen !== 'playing' || summaryRef.current || gameRef.current.gameOver) return;
    const outcome = gameRef.current.hardDrop();
    if (outcome.clearedLines === 0) playHardDrop();
    handleLockOutcome(outcome);
    setTick((t) => t + 1);
  }, [screen, handleLockOutcome]);

  // Mobile Touch Gesture Controls (Drag left/right to move, Tap to rotate, Drag down to drop)
  useTouchGestures(
    arenaRef,
    {
      onLeft: () => actMove(-1, 0),
      onRight: () => actMove(1, 0),
      onSoftDrop: () => actMove(0, 1),
      onHardDrop: actHardDrop,
      onRotate: () => actRotate(1),
      onHold: actHold,
    },
    {
      enabled: screen === 'playing' && !summary,
      stepX: 24,
      stepY: 20,
    }
  );

  // Keyboard listener
  useEffect(() => {
    if (screen !== 'playing') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (summaryRef.current) return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      switch (e.code) {
        case 'ArrowLeft':
          actMove(-1, 0);
          break;
        case 'ArrowRight':
          actMove(1, 0);
          break;
        case 'ArrowDown':
          actMove(0, 1);
          break;
        case 'ArrowUp':
        case 'KeyX':
          actRotate(1);
          break;
        case 'KeyZ':
          actRotate(-1);
          break;
        case 'Space':
          actHardDrop();
          break;
        case 'KeyC':
        case 'ShiftLeft':
        case 'ShiftRight':
          actHold();
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [screen, actMove, actRotate, actHardDrop, actHold]);

  // Online Room Actions
  const requireLoginOrRun = (fn: () => void) => {
    if (!user) {
      setLobbyError('온라인 대전 및 랭킹 등록을 위해 먼저 로그인해주세요.');
      setShowAuth(true);
      return;
    }
    setLobbyError('');
    fn();
  };

  const handleQuickMatch = (maxPlayersCount: number) => {
    const dev: DeviceType = viewport.w <= 768 || detectDeviceType() === 'mobile' ? 'mobile' : 'pc';
    requireLoginOrRun(() => {
      getSocket().emit(
        'room:quick_match',
        { maxPlayers: maxPlayersCount, deviceType: dev },
        (res: { error?: string; room?: RoomState }) => {
          if (res?.error) {
            setLobbyError(res.error);
            return;
          }
          if (res?.room) {
            setRoom(res.room);
            if (res.room.status === 'waiting') setScreen('waiting');
          }
        }
      );
    });
  };

  const handleCreateRoom = (maxPlayersCount: number) => {
    const dev: DeviceType = viewport.w <= 768 || detectDeviceType() === 'mobile' ? 'mobile' : 'pc';
    requireLoginOrRun(() => {
      getSocket().emit(
        'room:create',
        { maxPlayers: maxPlayersCount, deviceType: dev },
        (res: { error?: string; room?: RoomState }) => {
          if (res?.error) {
            setLobbyError(res.error);
            return;
          }
          if (res?.room) {
            setRoom(res.room);
            setScreen('waiting');
          }
        }
      );
    });
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    const dev: DeviceType = viewport.w <= 768 || detectDeviceType() === 'mobile' ? 'mobile' : 'pc';
    requireLoginOrRun(() => {
      getSocket().emit(
        'room:join',
        { code: joinCode.trim(), deviceType: dev },
        (res: { error?: string; room?: RoomState }) => {
          if (res?.error) {
            setLobbyError(res.error);
            return;
          }
          if (res?.room) {
            setRoom(res.room);
            if (res.room.status === 'waiting') setScreen('waiting');
          }
        }
      );
    });
  };

  const handleLeaveToLobby = () => {
    if (room) {
      getSocket().emit('room:leave');
      setRoom(null);
    }
    setSummary(null);
    setScreen('lobby');
  };

  const handleStartRoomNow = () => {
    setLobbyError('');
    getSocket().emit('room:start', {}, (res: { error?: string }) => {
      if (res?.error) setLobbyError(res.error);
    });
  };

  const handleToggleReady = () => {
    setLobbyError('');
    getSocket().emit('room:toggle_ready', {}, (res: { error?: string }) => {
      if (res?.error) setLobbyError(res.error);
    });
  };

  const handleCopyRoomCode = async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  const g = gameRef.current;
  const isMobile = viewport.w <= 768;
  const myDeviceType: DeviceType =
    isMobile || detectDeviceType() === 'mobile' ? 'mobile' : 'pc';
  const hasOpponents = opponents.length > 0;
  const mobileCellSize = isMobile
    ? Math.max(
        16,
        Math.min(
          22,
          Math.floor(
            Math.min(
              (viewport.h - 170) / 20,
              (hasOpponents ? viewport.w - 134 : viewport.w - 36) / 10
            )
          )
        )
      )
    : 26;
  const effectiveSocketId = mySocketId || getSocket().id || '';
  const meInRoom = room?.players.find(
    (p) => p.socketId === effectiveSocketId || (user && p.userId === user.id)
  );
  const isRoomHost = Boolean(
    room &&
      (room.hostSocketId === effectiveSocketId ||
        (meInRoom && room.hostSocketId === meInRoom.socketId))
  );

  return (
    <div className="app-shell">
      {/* Top Navigation Bar */}
      <header className="topbar">
        <div className="brand" onClick={handleLeaveToLobby} role="button" tabIndex={0}>
          <div className="brand-logo">
            <span className="b1" />
            <span className="b2" />
            <span className="b3" />
            <span className="b4" />
          </div>
          <div>
            <div className="brand-name">Tetris Arena</div>
            <div className="brand-tag">1:1 & 4인 실시간 배틀</div>
          </div>
        </div>

        <div className="topbar-actions">
          <div
            className={`device-type-pill ${myDeviceType}`}
            title={
              myDeviceType === 'mobile'
                ? '모바일 접속 중 (모바일 사용자끼리 매칭)'
                : 'PC 접속 중 (PC 사용자끼리 매칭)'
            }
          >
            {myDeviceType === 'mobile' ? <Smartphone size={13} /> : <Monitor size={13} />}
            <span>{myDeviceType === 'mobile' ? '모바일' : 'PC'}</span>
          </div>
          <button
            className="btn-ghost"
            onClick={() => {
              const next = !muted;
              persistMuted(next);
              setMutedState(next);
            }}
            title={muted ? '효과음 켜기' : '효과음 끄기'}
            aria-label={muted ? '효과음 켜기' : '효과음 끄기'}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <button className="btn-ghost" onClick={() => setShowLeaderboard(true)}>
            <Trophy size={16} className="text-amber" />
            <span>TOP 10</span>
          </button>

          {user ? (
            <div className="user-pill">
              <User size={15} />
              <span className="user-pill-name">{user.nickname}</span>
              <button className="icon-btn-sm" onClick={handleLogout} title="로그아웃">
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <button className="btn-primary sm" onClick={() => setShowAuth(true)}>
              <LogIn size={15} />
              <span>로그인</span>
            </button>
          )}
        </div>
      </header>

      {/* SCREEN 1: LOBBY */}
      {screen === 'lobby' && (
        <main className="lobby-container">
          {/* Personal Record Hero Strip */}
          <section className="stats-strip">
            <div className="stat-card">
              <div className="stat-label">
                <Sparkles size={14} /> 개인 최고 기록
              </div>
              <div className="stat-value">{displayBest.toLocaleString()}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">
                <Crown size={14} /> 온라인 승점
              </div>
              <div className="stat-value">
                {user ? `${user.online_points.toLocaleString()} pts` : '로그인 필요'}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">
                <Trophy size={14} /> 온라인 순위
              </div>
              <div className="stat-value">
                {ranks?.onlineRank ? `#${ranks.onlineRank}위` : user ? '미기록' : '—'}
              </div>
            </div>
          </section>

          {lobbyError && <div className="alert-banner">{lobbyError}</div>}

          {/* Mode Cards Grid */}
          <section className="mode-grid">
            {/* Bot Battle Card */}
            <div className="mode-card featured">
              <div className="mode-card-head">
                <div className="mode-icon indigo">
                  <Bot size={22} />
                </div>
                <div>
                  <h3>AI 봇 배틀</h3>
                  <p>라인을 지울 때마다 봇에게 방해 블록 공격!</p>
                </div>
              </div>

              <div className="difficulty-row">
                {(['easy', 'normal', 'hard'] as BotDifficulty[]).map((diff) => (
                  <button
                    key={diff}
                    className={`chip ${botDifficulty === diff ? 'active' : ''}`}
                    onClick={() => setBotDifficulty(diff)}
                  >
                    {diff === 'easy' ? '쉬움' : diff === 'normal' ? '보통' : '어려움'}
                  </button>
                ))}
              </div>

              <div className="mode-actions">
                <button className="btn-primary" onClick={() => startLocalGame('bot_1v1')}>
                  <Swords size={16} /> 1:1 봇 대전
                </button>
                <button className="btn-secondary" onClick={() => startLocalGame('bot_4p')}>
                  <Users size={16} /> 4인 봇 배틀
                </button>
              </div>
            </div>

            {/* Online 1v1 Card */}
            <div className="mode-card">
              <div className="mode-card-head">
                <div className="mode-icon rose">
                  <Swords size={22} />
                </div>
                <div>
                  <div className="mode-title-row">
                    <h3>온라인 1:1 대결</h3>
                    <span className="device-match-tag">
                      {myDeviceType === 'mobile' ? '📱 모바일 전용' : '💻 PC 전용'}
                    </span>
                  </div>
                  <p>동일 기기({myDeviceType === 'mobile' ? '모바일' : 'PC'}) 사용자끼리 실시간 1:1 승부!</p>
                </div>
              </div>
              <div className="mode-actions">
                <button className="btn-primary" onClick={() => handleQuickMatch(2)}>
                  <Zap size={16} /> 빠른 매칭
                </button>
                <button className="btn-secondary" onClick={() => handleCreateRoom(2)}>
                  방 만들기
                </button>
              </div>
            </div>

            {/* Online 1~5 Player Configurable Room Card */}
            <div className="mode-card">
              <div className="mode-card-head">
                <div className="mode-icon violet">
                  <Users size={22} />
                </div>
                <div>
                  <div className="mode-title-row">
                    <h3>온라인 멀티 배틀 (1~5명)</h3>
                    <span className="device-match-tag">
                      {myDeviceType === 'mobile' ? '📱 모바일 전용' : '💻 PC 전용'}
                    </span>
                  </div>
                  <p>
                    {myDeviceType === 'mobile' ? '모바일' : 'PC'} 사용자끼리 매칭되며, 다 안 모여도 방장이 시작 가능!
                  </p>
                </div>
              </div>

              <div className="difficulty-row">
                {[1, 2, 3, 4, 5].map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    className={`chip ${onlineMaxPlayers === cnt ? 'active' : ''}`}
                    onClick={() => setOnlineMaxPlayers(cnt)}
                  >
                    {cnt}명
                  </button>
                ))}
              </div>

              <div className="mode-actions">
                <button className="btn-primary" onClick={() => handleQuickMatch(onlineMaxPlayers)}>
                  <Zap size={16} /> {onlineMaxPlayers}인 빠른 매칭
                </button>
                <button className="btn-secondary" onClick={() => handleCreateRoom(onlineMaxPlayers)}>
                  {onlineMaxPlayers}인 방 만들기
                </button>
              </div>
            </div>

            {/* Solo + Room Code Join Card */}
            <div className="mode-card">
              <div className="mode-card-head">
                <div className="mode-icon emerald">
                  <Shield size={22} />
                </div>
                <div>
                  <h3>솔로 기록 도전 & 방 참가</h3>
                  <p>혼자서 최고 점수를 갱신하거나 친구 방 코드로 입장</p>
                </div>
              </div>
              <div className="mode-actions stack">
                <button className="btn-secondary full" onClick={() => startLocalGame('solo')}>
                  <Play size={15} /> 솔로 클래식 시작
                </button>
                <form className="join-form" onSubmit={handleJoinRoom}>
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="방 코드 4자리"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  />
                  <button type="submit" className="btn-dark">
                    입장
                  </button>
                </form>
              </div>
            </div>
          </section>

          <section className="rules-card">
            <h4>배틀 공격 규칙</h4>
            <div className="rules-pills">
              <span>1줄 제거 → <strong>1줄 공격</strong></span>
              <span>2줄 제거 → <strong>2줄 공격</strong></span>
              <span>3줄 제거 → <strong>3줄 공격</strong></span>
              <span>4줄(테트리스) → <strong>5줄 공격</strong></span>
              <span>콤보 보너스 → <strong>+1줄 추가</strong></span>
              <span>방어 상쇄 → <strong>내 대기 방해줄 먼저 제거</strong></span>
            </div>
          </section>
        </main>
      )}

      {/* SCREEN 2: ONLINE WAITING ROOM */}
      {screen === 'waiting' && room && (
        <main className="waiting-container">
          <div className="waiting-card">
            <div className="waiting-badge">
              {room.deviceType === 'mobile' ? '📱 모바일 전용' : '💻 PC 전용'} · {room.maxPlayers}인 배틀 대기실 ({room.players.length}/{room.maxPlayers}명)
            </div>
            <h2>
              {isRoomHost
                ? '방장님은 언제든 게임을 시작할 수 있습니다!'
                : room.players.length >= 2
                ? '대결 준비 완료!'
                : '상대 플레이어를 기다리는 중...'}
            </h2>
            <p className="waiting-sub">
              {isRoomHost
                ? `최대 ${room.maxPlayers}명 방이지만 인원이 다 차지 않아도 방장이 지금 바로 시작할 수 있습니다.`
                : '재대결 준비를 누르거나 방장님이 시작 버튼을 누르면 바로 게임이 시작됩니다.'}
            </p>

            <div className="room-code-box">
              <span className="room-code">{room.code}</span>
              <button className="btn-secondary sm" onClick={handleCopyRoomCode}>
                <Copy size={14} /> {codeCopied ? '복사됨' : '코드 복사'}
              </button>
            </div>

            <div className="waiting-players">
              {Array.from({ length: room.maxPlayers }).map((_, idx) => {
                const p = room.players[idx];
                return (
                  <div key={idx} className={`slot-row ${p ? 'filled' : ''}`}>
                    <span className="slot-num">P{idx + 1}</span>
                    <span className="slot-name">
                      {p
                        ? `${p.deviceType === 'mobile' ? '📱' : '💻'} ${p.nickname}`
                        : '빈 자리 (없이 시작 가능)'}
                      {p && p.socketId === room.hostSocketId ? ' (방장)' : ''}
                    </span>
                    {p && p.ready && <span className="ready-tag">준비 완료</span>}
                    <span className={`slot-dot ${p ? 'online' : ''}`} />
                  </div>
                );
              })}
            </div>

            {lobbyError && <div className="alert-banner">{lobbyError}</div>}

            <div className="waiting-actions">
              {isRoomHost && room.players.length >= 1 && (
                <button className="btn-primary" onClick={handleStartRoomNow}>
                  <Play size={16} /> 지금 바로 시작 ({room.players.length}/{room.maxPlayers}명)
                </button>
              )}
              {room.players.length >= 2 && (
                <button
                  className={meInRoom?.ready ? 'btn-secondary' : 'btn-primary'}
                  onClick={handleToggleReady}
                >
                  <Zap size={16} />{' '}
                  {meInRoom?.ready ? '준비 취소' : '재대결 준비 완료'}
                </button>
              )}
              <button className="btn-ghost" onClick={handleLeaveToLobby}>
                나가기
              </button>
            </div>
          </div>
        </main>
      )}

      {/* SCREEN 3: GAMEPLAY ARENA */}
      {screen === 'playing' && (
        <main className="arena-container" ref={arenaRef}>
          {isMobile ? (
            <div className="mobile-arena">
              {/* Mobile Top HUD: HOLD + Metrics + NEXT + Exit */}
              <div className="mobile-hud">
                <div
                  className="mobile-hud-box hold-box"
                  onClick={actHold}
                  role="button"
                  tabIndex={0}
                  title="터치하여 홀드"
                >
                  <span className="hud-mini-label">HOLD</span>
                  <div className="hud-mini-preview">
                    <PiecePreview type={g.holdPiece} size={10} />
                  </div>
                </div>

                <div className="mobile-hud-metrics">
                  <div className="hud-stat">
                    <span>SCORE</span>
                    <strong>{g.score.toLocaleString()}</strong>
                  </div>
                  <div className="hud-stat">
                    <span>BEST</span>
                    <strong>{Math.max(displayBest, g.score).toLocaleString()}</strong>
                  </div>
                  <div className="hud-stat">
                    <span>LV.{g.level}</span>
                    <strong>{g.lines}줄</strong>
                  </div>
                  <div className="hud-stat accent">
                    <span>ATK</span>
                    <strong>{g.attacksSent}줄</strong>
                  </div>
                </div>

                <div className="mobile-hud-box next-box">
                  <span className="hud-mini-label">NEXT</span>
                  <div className="hud-next-row">
                    {g.nextQueue.slice(0, 2).map((piece, idx) => (
                      <PiecePreview key={idx} type={piece} size={idx === 0 ? 10 : 8} />
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  className="mobile-exit-btn"
                  onClick={handleLeaveToLobby}
                >
                  나가기
                </button>
              </div>

              {/* Mobile Main Area: Board + Optional Side Opponents */}
              <div className="mobile-play-row">
                <div className="mobile-board-col">
                  <TetrisCanvas
                    game={g}
                    tick={tick}
                    banner={banner}
                    attackFlash={attackFlash}
                    cellSize={mobileCellSize}
                    deviceType={myDeviceType}
                  />
                </div>

                {opponents.length > 0 && (
                  <aside className="mobile-opponents-col">
                    <div className="mobile-opp-title">
                      상대 ({opponents.filter((o) => o.alive).length}/{opponents.length})
                    </div>
                    <div
                      className={`mobile-opp-list ${
                        opponents.length >= 3 ? 'many' : 'few'
                      }`}
                    >
                      {opponents.map((opp) => (
                        <MiniBoard
                          key={opp.id}
                          opponent={opp}
                          cellSize={opponents.length >= 3 ? 4 : 5}
                        />
                      ))}
                    </div>
                    {battleLog.length > 0 && (
                      <div className="mobile-feed-pill" title={battleLog[0]}>
                        {battleLog[0]}
                      </div>
                    )}
                  </aside>
                )}
              </div>

              <div className="mobile-gesture-bar">
                ↔ 드래그: 이동 · 탭: 회전 · ↓ 드래그: 내리기 · ↓↓: 즉시드롭 · HOLD 터치
              </div>
            </div>
          ) : (
            <div className="arena-layout">
              {/* Left Info Panel */}
              <aside className="side-panel left">
                <div
                  className="panel-box hold-box"
                  onClick={actHold}
                  role="button"
                  tabIndex={0}
                  title="터치하거나 C 키를 눌러 홀드"
                >
                  <div className="panel-label">HOLD (터치)</div>
                  <div className="preview-center">
                    <PiecePreview type={g.holdPiece} size={15} />
                  </div>
                </div>

                <div className="panel-box metrics">
                  <div className="metric">
                    <span>SCORE</span>
                    <strong>{g.score.toLocaleString()}</strong>
                  </div>
                  <div className="metric">
                    <span>BEST</span>
                    <strong>{Math.max(displayBest, g.score).toLocaleString()}</strong>
                  </div>
                  <div className="metric">
                    <span>LINES</span>
                    <strong>{g.lines}</strong>
                  </div>
                  <div className="metric">
                    <span>LEVEL</span>
                    <strong>Lv.{g.level}</strong>
                  </div>
                  <div className="metric accent">
                    <span>ATTACKS</span>
                    <strong>{g.attacksSent}줄</strong>
                  </div>
                </div>

                <button className="btn-ghost full" onClick={handleLeaveToLobby}>
                  로비로 나가기
                </button>
              </aside>

              {/* Center Main Board */}
              <section className="board-column">
                <TetrisCanvas
                  game={g}
                  tick={tick}
                  banner={banner}
                  attackFlash={attackFlash}
                  deviceType={myDeviceType}
                />
                <div className="controls-hint pc-hint">
                  PC 키보드: ← → 이동 · ↑ 회전 · ↓ 내리기 · Space 즉시 드롭 · C 홀드
                </div>
              </section>

              {/* Right Panel: Next Queue + Opponents */}
              <aside className="side-panel right">
                <div className="panel-box">
                  <div className="panel-label">NEXT</div>
                  <div className="next-list">
                    {g.nextQueue.slice(0, 3).map((piece, idx) => (
                      <div key={idx} className="next-item">
                        <PiecePreview type={piece} size={idx === 0 ? 15 : 12} />
                      </div>
                    ))}
                  </div>
                </div>

                {opponents.length > 0 && (
                  <div className="opponents-section">
                    <div className="panel-label">
                      상대 보드 ({opponents.filter((o) => o.alive).length}/{opponents.length} 생존)
                    </div>
                    <div className={`opponents-grid ${opponents.length > 1 ? 'multi' : 'single'}`}>
                      {opponents.map((opp) => (
                        <MiniBoard
                          key={opp.id}
                          opponent={opp}
                          compact={opponents.length > 1}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {battleLog.length > 0 && (
                  <div className="battle-feed">
                    {battleLog.map((line, i) => (
                      <div key={i} className="feed-item">
                        {line}
                      </div>
                    ))}
                  </div>
                )}
              </aside>
            </div>
          )}
        </main>
      )}

      {/* Match Result Overlay */}
      {summary && (
        <div className="modal-backdrop">
          <div className="modal-card result-card">
            <div className={`result-icon ${summary.won ? 'win' : 'lose'}`}>
              {summary.won ? <Crown size={32} /> : <Swords size={32} />}
            </div>
            <h2>{summary.title}</h2>
            <p className="result-sub">{summary.subtitle}</p>

            {summary.isNewBest && (
              <div className="new-best-pill">🎉 개인 최고 점수 갱신!</div>
            )}

            <div className="result-stats">
              <div>
                <span>점수</span>
                <strong>{summary.score.toLocaleString()}</strong>
              </div>
              <div>
                <span>지운 줄</span>
                <strong>{summary.lines}</strong>
              </div>
              <div>
                <span>보낸 공격</span>
                <strong>{summary.attacksSent}줄</strong>
              </div>
            </div>

            {summary.rankings && summary.rankings.length > 0 && (
              <div className="result-rankings">
                {summary.rankings.map((r) => (
                  <div key={r.rank} className="result-rank-row">
                    <span>#{r.rank} {r.nickname}</span>
                    <strong>{r.score.toLocaleString()}점</strong>
                  </div>
                ))}
              </div>
            )}

            <div className="result-actions">
              {(mode === 'solo' || mode === 'bot_1v1' || mode === 'bot_4p') && (
                <button
                  className="btn-primary"
                  onClick={() => startLocalGame(mode)}
                >
                  <RotateCcw size={16} /> 다시 하기
                </button>
              )}
              {(mode === 'online_1v1' || mode === 'online_4p') && room && (
                <button
                  className="btn-primary"
                  onClick={() => {
                    setSummary(null);
                    setScreen('waiting');
                  }}
                >
                  <RotateCcw size={16} /> 대기실로 돌아가기
                </button>
              )}
              <button
                className="btn-secondary"
                onClick={() => setShowLeaderboard(true)}
              >
                <Trophy size={16} /> TOP 10 보기
              </button>
              <button className="btn-ghost" onClick={handleLeaveToLobby}>
                로비로
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auth Modal */}
      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onSuccess={(u, r) => {
            setUser(u);
            setRanks(r);
            setLobbyError('');
          }}
        />
      )}

      {/* Top 10 Leaderboard Modal */}
      {showLeaderboard && (
        <LeaderboardModal
          user={user}
          ranks={ranks}
          onClose={() => setShowLeaderboard(false)}
        />
      )}
    </div>
  );
}
