import React, { useEffect, useRef, useState } from 'react';
import {
  BOARD_COLS,
  BOARD_ROWS,
  PIECE_COLORS,
  PieceType,
  TetrisGame,
  getShapeMatrix,
} from '../game/tetrisEngine';

interface Particle {
  kind: 'shard' | 'spark';
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
  light: string;
  life: number;
  maxLife: number;
}

interface RowFlash {
  y: number;
  start: number;
  duration: number;
  glow: string;
  big: boolean;
}

interface Ring {
  x: number;
  y: number;
  start: number;
  duration: number;
  maxRadius: number;
  color: string;
}

function easeOut(t: number) {
  return 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
}

interface TetrisCanvasProps {
  game: TetrisGame;
  tick: number;
  banner?: string;
  attackFlash?: boolean;
  cellSize?: number;
  deviceType?: 'mobile' | 'pc';
}

function drawRoundedBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  colorKey: PieceType | 'G',
  alpha = 1
) {
  const palette = PIECE_COLORS[colorKey];
  const pad = 1.5;
  const rx = x + pad;
  const ry = y + pad;
  const rw = size - pad * 2;
  const rh = size - pad * 2;
  const radius = Math.max(3, size * 0.18);

  ctx.save();
  ctx.globalAlpha = alpha;

  // Main body
  ctx.beginPath();
  ctx.roundRect(rx, ry, rw, rh, radius);
  ctx.fillStyle = palette.fill;
  ctx.fill();

  // Subtle top highlight
  ctx.beginPath();
  ctx.roundRect(rx + 2, ry + 2, rw - 4, Math.max(3, rh * 0.28), radius * 0.6);
  ctx.fillStyle = palette.light;
  ctx.globalAlpha = alpha * 0.45;
  ctx.fill();

  // Subtle bottom border
  ctx.globalAlpha = alpha * 0.35;
  ctx.strokeStyle = palette.dark;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1, radius);
  ctx.stroke();

  ctx.restore();
}

export const TetrisCanvas: React.FC<TetrisCanvasProps> = ({
  game,
  tick,
  banner,
  attackFlash,
  cellSize = 26,
  deviceType = 'pc',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fxCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const flashesRef = useRef<RowFlash[]>([]);
  const ringsRef = useRef<Ring[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastGameRef = useRef<TetrisGame | null>(null);
  const lastEventRef = useRef<number>(0);
  const [burst, setBurst] = useState(0);
  const width = BOARD_COLS * cellSize;
  const height = BOARD_ROWS * cellSize;

  // Setup the effects overlay canvas once
  useEffect(() => {
    const fx = fxCanvasRef.current;
    if (!fx) return;
    const dpr = window.devicePixelRatio || 1;
    fx.width = width * dpr;
    fx.height = height * dpr;
    const ctx = fx.getContext('2d');
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [width, height]);

  const runFxLoop = () => {
    if (rafRef.current) return;
    let last = performance.now();
    const loop = (now: number) => {
      const fx = fxCanvasRef.current;
      const ctx = fx?.getContext('2d');
      if (!fx || !ctx) {
        rafRef.current = null;
        return;
      }
      const dt = Math.min(3, (now - last) / 16.67);
      last = now;
      ctx.clearRect(0, 0, width, height);

      // Row flashes: white beam expanding from center, then fading
      flashesRef.current = flashesRef.current.filter((f) => now - f.start < f.duration);
      for (const f of flashesRef.current) {
        const p = (now - f.start) / f.duration;
        const w = width * Math.min(1, p * 4);
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - p);
        ctx.shadowColor = f.glow;
        ctx.shadowBlur = 24;
        ctx.fillStyle = '#FFFFFF';
        const grow = f.big ? cellSize * 0.6 * p : 0;
        ctx.fillRect((width - w) / 2, f.y - grow / 2, w, cellSize + grow);
        ctx.restore();
      }

      // Shockwave rings (Tetris / multi-line)
      ringsRef.current = ringsRef.current.filter((r) => now - r.start < r.duration);
      for (const r of ringsRef.current) {
        const p = (now - r.start) / r.duration;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - p);
        ctx.strokeStyle = r.color;
        ctx.lineWidth = 6 * (1 - p) + 1;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.maxRadius * easeOut(p), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Shards & sparks
      const alive: Particle[] = [];
      for (const pt of particlesRef.current) {
        pt.life += 16.67 * dt;
        if (pt.life >= pt.maxLife) continue;
        pt.vy += pt.gravity * dt;
        pt.vx *= Math.pow(0.985, dt);
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.rot += pt.vr * dt;
        const alpha = 1 - pt.life / pt.maxLife;

        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        if (pt.kind === 'spark') {
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = pt.color;
          ctx.shadowColor = pt.color;
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pt.size * (0.5 + alpha * 0.5), 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.translate(pt.x, pt.y);
          ctx.rotate(pt.rot);
          ctx.fillStyle = pt.color;
          ctx.fillRect(-pt.size / 2, -pt.size / 2, pt.size, pt.size);
          ctx.fillStyle = pt.light;
          ctx.globalAlpha = Math.max(0, alpha * 0.6);
          ctx.fillRect(-pt.size / 2, -pt.size / 2, pt.size, pt.size * 0.3);
        }
        ctx.restore();
        alive.push(pt);
      }
      particlesRef.current = alive;

      if (alive.length || flashesRef.current.length || ringsRef.current.length) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        ctx.clearRect(0, 0, width, height);
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(loop);
  };

  // Detect new line-clear events and spawn the explosion
  useEffect(() => {
    if (lastGameRef.current !== game) {
      lastGameRef.current = game;
      lastEventRef.current = game.clearEventId;
      particlesRef.current = [];
      flashesRef.current = [];
      ringsRef.current = [];
      return;
    }
    if (game.clearEventId === lastEventRef.current) return;
    lastEventRef.current = game.clearEventId;

    const rows = game.lastClearedRowsData;
    const lines = rows.length;
    if (!lines) return;
    const isTetris = lines >= 4;
    const now = performance.now();
    const shardsPerCell = isTetris ? 7 : 3 + lines;
    const power = isTetris ? 1.6 : 1 + lines * 0.15;

    rows.forEach(({ row, cells }, idx) => {
      const y = row * cellSize;
      flashesRef.current.push({
        y,
        start: now + idx * 40,
        duration: isTetris ? 420 : 300,
        glow: isTetris ? '#FDE047' : '#A5B4FC',
        big: isTetris,
      });

      cells.forEach((cell, c) => {
        const palette = PIECE_COLORS[cell ?? 'G'];
        const cx = c * cellSize + cellSize / 2;
        const cy = y + cellSize / 2;
        const dirX = (cx - width / 2) / (width / 2);

        for (let i = 0; i < shardsPerCell; i++) {
          particlesRef.current.push({
            kind: 'shard',
            x: cx + (Math.random() - 0.5) * cellSize * 0.8,
            y: cy + (Math.random() - 0.5) * cellSize * 0.8,
            vx: (dirX * 3 + (Math.random() - 0.5) * 7) * power,
            vy: (-Math.random() * 7 - 2) * power,
            gravity: 0.38,
            size: cellSize * (0.18 + Math.random() * 0.3),
            rot: Math.random() * Math.PI,
            vr: (Math.random() - 0.5) * 0.5,
            color: palette.fill,
            light: palette.light,
            life: 0,
            maxLife: 650 + Math.random() * 550,
          });
        }
        // Glowing sparks
        const sparkCount = isTetris ? 3 : 1;
        for (let i = 0; i < sparkCount; i++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = (3 + Math.random() * 6) * power;
          particlesRef.current.push({
            kind: 'spark',
            x: cx,
            y: cy,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd - 2,
            gravity: 0.12,
            size: 2 + Math.random() * 2.5,
            rot: 0,
            vr: 0,
            color: isTetris ? (Math.random() < 0.5 ? '#FDE047' : '#FFFFFF') : palette.light,
            light: palette.light,
            life: 0,
            maxLife: 400 + Math.random() * 400,
          });
        }
      });
    });

    if (lines >= 2) {
      const avgRow = rows.reduce((s, r) => s + r.row, 0) / lines;
      ringsRef.current.push({
        x: width / 2,
        y: avgRow * cellSize + cellSize / 2,
        start: now,
        duration: isTetris ? 650 : 450,
        maxRadius: isTetris ? width * 0.95 : width * 0.6,
        color: isTetris ? '#FACC15' : '#818CF8',
      });
      if (isTetris) {
        ringsRef.current.push({
          x: width / 2,
          y: avgRow * cellSize + cellSize / 2,
          start: now + 120,
          duration: 700,
          maxRadius: width * 1.2,
          color: '#F472B6',
        });
      }
    }

    // Cap total particles for low-end mobile devices
    if (particlesRef.current.length > 900) {
      particlesRef.current = particlesRef.current.slice(-900);
    }

    setBurst(lines);
    window.setTimeout(() => setBurst(0), isTetris ? 520 : 320);
    runFxLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, tick]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clean light background
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(0, 0, width, height);

    // Subtle crisp grid lines
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    for (let c = 1; c < BOARD_COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * cellSize + 0.5, 0);
      ctx.lineTo(c * cellSize + 0.5, height);
      ctx.stroke();
    }
    for (let r = 1; r < BOARD_ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * cellSize + 0.5);
      ctx.lineTo(width, r * cellSize + 0.5);
      ctx.stroke();
    }

    // Placed blocks
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let c = 0; c < BOARD_COLS; c++) {
        const cell = game.board[r][c];
        if (cell) {
          drawRoundedBlock(ctx, c * cellSize, r * cellSize, cellSize, cell);
        }
      }
    }

    // Ghost piece & Active piece
    if (!game.gameOver) {
      const matrix = getShapeMatrix(game.current.type, game.current.rotation);
      const ghostY = game.getGhostY();

      // Ghost outline
      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          if (!matrix[r][c]) continue;
          const bx = game.current.x + c;
          const by = ghostY + r;
          if (by < 0) continue;
          const palette = PIECE_COLORS[game.current.type];
          ctx.save();
          ctx.fillStyle = palette.fill;
          ctx.globalAlpha = 0.14;
          ctx.beginPath();
          ctx.roundRect(bx * cellSize + 2, by * cellSize + 2, cellSize - 4, cellSize - 4, 4);
          ctx.fill();
          ctx.globalAlpha = 0.45;
          ctx.strokeStyle = palette.fill;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();
        }
      }

      // Active piece
      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          if (!matrix[r][c]) continue;
          const bx = game.current.x + c;
          const by = game.current.y + r;
          if (by < 0) continue;
          drawRoundedBlock(ctx, bx * cellSize, by * cellSize, cellSize, game.current.type);
        }
      }
    }

    // Game Over overlay
    if (game.gameOver) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
      ctx.fillRect(0, 0, width, height);
    }
  }, [game, tick, width, height]);

  const garbageRatio = Math.min(1, game.pendingGarbage / 10);

  return (
    <div
      className={`board-frame ${attackFlash ? 'board-shake' : ''} ${
        burst >= 4 ? 'board-burst-big' : burst > 0 ? 'board-burst' : ''
      }`}
    >
      <div className="garbage-meter" title={`대기 중인 방해 줄: ${game.pendingGarbage}`}>
        <div
          className="garbage-fill"
          style={{ height: `${garbageRatio * 100}%` }}
        />
      </div>
      <div className="board-canvas-wrap">
        <canvas
          ref={canvasRef}
          style={{ width, height }}
          className="tetris-canvas"
        />
        <canvas
          ref={fxCanvasRef}
          style={{ width, height }}
          className="tetris-fx-canvas"
        />
        <div
          className={`board-device-badge ${deviceType}`}
          title={
            deviceType === 'mobile'
              ? '모바일 사용자 (모바일 전용 매칭)'
              : 'PC 사용자 (PC 전용 매칭)'
          }
        >
          {deviceType === 'mobile' ? '📱 모바일' : '💻 PC'}
        </div>
        {banner && (
          <div className="board-banner" key={banner + tick}>
            {banner}
          </div>
        )}
      </div>
    </div>
  );
};

export const PiecePreview: React.FC<{ type: PieceType | null; size?: number }> = ({
  type,
  size = 14,
}) => {
  if (!type) {
    return <div className="piece-preview-empty">—</div>;
  }
  const matrix = getShapeMatrix(type, 0);
  const color = PIECE_COLORS[type];
  return (
    <div
      className="piece-preview-grid"
      style={{
        gridTemplateColumns: `repeat(${matrix[0].length}, ${size}px)`,
      }}
    >
      {matrix.flatMap((row, r) =>
        row.map((val, c) => (
          <div
            key={`${r}-${c}`}
            style={{
              width: size,
              height: size,
              borderRadius: 3,
              backgroundColor: val ? color.fill : 'transparent',
              boxShadow: val ? `inset 0 2px 0 ${color.light}` : 'none',
            }}
          />
        ))
      )}
    </div>
  );
};
