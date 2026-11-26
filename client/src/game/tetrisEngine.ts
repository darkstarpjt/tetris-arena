export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export type CellValue = PieceType | 'G' | null;

export const BOARD_COLS = 10;
export const BOARD_ROWS = 20;

export const PIECE_COLORS: Record<PieceType | 'G', { fill: string; light: string; dark: string }> = {
  I: { fill: '#0891B2', light: '#22D3EE', dark: '#155E75' },
  O: { fill: '#D97706', light: '#FBBF24', dark: '#92400E' },
  T: { fill: '#7C3AED', light: '#A78BFA', dark: '#4C1D95' },
  S: { fill: '#059669', light: '#34D399', dark: '#065F46' },
  Z: { fill: '#E11D48', light: '#FB7185', dark: '#9F1239' },
  J: { fill: '#2563EB', light: '#60A5FA', dark: '#1E3A8A' },
  L: { fill: '#EA580C', light: '#FB923C', dark: '#9A3412' },
  G: { fill: '#64748B', light: '#94A3B8', dark: '#334155' },
};

const SHAPES: Record<PieceType, number[][][]> = {
  I: [
    [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    [
      [0, 0, 1, 0],
      [0, 0, 1, 0],
      [0, 0, 1, 0],
      [0, 0, 1, 0],
    ],
    [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
    ],
    [
      [0, 1, 0, 0],
      [0, 1, 0, 0],
      [0, 1, 0, 0],
      [0, 1, 0, 0],
    ],
  ],
  O: [
    [
      [1, 1],
      [1, 1],
    ],
    [
      [1, 1],
      [1, 1],
    ],
    [
      [1, 1],
      [1, 1],
    ],
    [
      [1, 1],
      [1, 1],
    ],
  ],
  T: [
    [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    [
      [0, 1, 0],
      [0, 1, 1],
      [0, 1, 0],
    ],
    [
      [0, 0, 0],
      [1, 1, 1],
      [0, 1, 0],
    ],
    [
      [0, 1, 0],
      [1, 1, 0],
      [0, 1, 0],
    ],
  ],
  S: [
    [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],
    [
      [0, 1, 0],
      [0, 1, 1],
      [0, 0, 1],
    ],
    [
      [0, 0, 0],
      [0, 1, 1],
      [1, 1, 0],
    ],
    [
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
    ],
  ],
  Z: [
    [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],
    [
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
    [
      [0, 0, 0],
      [1, 1, 0],
      [0, 1, 1],
    ],
    [
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
    ],
  ],
  J: [
    [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    [
      [0, 1, 1],
      [0, 1, 0],
      [0, 1, 0],
    ],
    [
      [0, 0, 0],
      [1, 1, 1],
      [0, 0, 1],
    ],
    [
      [0, 1, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
  ],
  L: [
    [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
    [
      [0, 1, 0],
      [0, 1, 0],
      [0, 1, 1],
    ],
    [
      [0, 0, 0],
      [1, 1, 1],
      [1, 0, 0],
    ],
    [
      [1, 1, 0],
      [0, 1, 0],
      [0, 1, 0],
    ],
  ],
};

export interface ActivePiece {
  type: PieceType;
  rotation: number;
  x: number;
  y: number;
}

export interface LockOutcome {
  clearedLines: number;
  attackSent: number;
  canceledGarbage: number;
  combo: number;
  label: string;
  gameOver: boolean;
}

function createMulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getShapeMatrix(type: PieceType, rotation: number): number[][] {
  return SHAPES[type][((rotation % 4) + 4) % 4];
}

export function createEmptyBoard(): CellValue[][] {
  return Array.from({ length: BOARD_ROWS }, () => Array<CellValue>(BOARD_COLS).fill(null));
}

export class TetrisGame {
  board: CellValue[][];
  current: ActivePiece;
  holdPiece: PieceType | null = null;
  canHold = true;
  nextQueue: PieceType[] = [];
  score = 0;
  lines = 0;
  level = 1;
  combo = -1;
  pendingGarbage = 0;
  attacksSent = 0;
  gameOver = false;
  lastClearedRows: number[] = [];
  /** Snapshot of cleared rows (before removal) for line-clear visual effects */
  lastClearedRowsData: Array<{ row: number; cells: CellValue[] }> = [];
  /** Increments every time lines are cleared, so the renderer can detect new clear events */
  clearEventId = 0;

  private rng: () => number;
  private bag: PieceType[] = [];

  constructor(seed = Date.now()) {
    this.rng = createMulberry32(seed);
    this.board = createEmptyBoard();
    this.fillQueue();
    this.current = this.spawnPiece(this.shiftNext());
  }

  private refillBag() {
    const pieces: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
    for (let i = pieces.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
    }
    this.bag.push(...pieces);
  }

  private shiftNext(): PieceType {
    if (this.nextQueue.length === 0) this.fillQueue();
    const next = this.nextQueue.shift()!;
    this.fillQueue();
    return next;
  }

  private fillQueue() {
    while (this.nextQueue.length < 4) {
      if (this.bag.length === 0) this.refillBag();
      this.nextQueue.push(this.bag.shift()!);
    }
  }

  private spawnPiece(type: PieceType): ActivePiece {
    const matrix = getShapeMatrix(type, 0);
    const x = Math.floor((BOARD_COLS - matrix[0].length) / 2);
    const y = type === 'I' ? -1 : 0;
    return { type, rotation: 0, x, y };
  }

  isValidPosition(piece: ActivePiece, board: CellValue[][] = this.board): boolean {
    const matrix = getShapeMatrix(piece.type, piece.rotation);
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (!matrix[r][c]) continue;
        const bx = piece.x + c;
        const by = piece.y + r;
        if (bx < 0 || bx >= BOARD_COLS || by >= BOARD_ROWS) return false;
        if (by >= 0 && board[by][bx] !== null) return false;
      }
    }
    return true;
  }

  move(dx: number, dy: number): boolean {
    if (this.gameOver) return false;
    const candidate = { ...this.current, x: this.current.x + dx, y: this.current.y + dy };
    if (this.isValidPosition(candidate)) {
      this.current = candidate;
      if (dy > 0) this.score += 1;
      return true;
    }
    return false;
  }

  rotate(dir: 1 | -1 = 1): boolean {
    if (this.gameOver) return false;
    const nextRot = (((this.current.rotation + dir) % 4) + 4) % 4;
    const kicks = [
      [0, 0],
      [-1, 0],
      [1, 0],
      [0, -1],
      [-2, 0],
      [2, 0],
      [-1, -1],
      [1, -1],
    ];
    for (const [kx, ky] of kicks) {
      const candidate: ActivePiece = {
        ...this.current,
        rotation: nextRot,
        x: this.current.x + kx,
        y: this.current.y + ky,
      };
      if (this.isValidPosition(candidate)) {
        this.current = candidate;
        return true;
      }
    }
    return false;
  }

  hold(): boolean {
    if (this.gameOver || !this.canHold) return false;
    const currentType = this.current.type;
    if (this.holdPiece === null) {
      this.holdPiece = currentType;
      this.current = this.spawnPiece(this.shiftNext());
    } else {
      const swap = this.holdPiece;
      this.holdPiece = currentType;
      this.current = this.spawnPiece(swap);
    }
    this.canHold = false;
    if (!this.isValidPosition(this.current)) {
      this.gameOver = true;
    }
    return true;
  }

  getGhostY(): number {
    let gy = this.current.y;
    while (this.isValidPosition({ ...this.current, y: gy + 1 })) {
      gy++;
    }
    return gy;
  }

  hardDrop(): LockOutcome {
    if (this.gameOver) {
      return { clearedLines: 0, attackSent: 0, canceledGarbage: 0, combo: 0, label: '', gameOver: true };
    }
    const ghostY = this.getGhostY();
    const dropped = Math.max(0, ghostY - this.current.y);
    this.current.y = ghostY;
    this.score += dropped * 2;
    return this.lockPiece();
  }

  stepDown(): LockOutcome | null {
    if (this.gameOver) return null;
    const candidate = { ...this.current, y: this.current.y + 1 };
    if (this.isValidPosition(candidate)) {
      this.current = candidate;
      return null;
    }
    return this.lockPiece();
  }

  queueGarbage(lines: number) {
    if (this.gameOver || lines <= 0) return;
    this.pendingGarbage = Math.min(12, this.pendingGarbage + lines);
  }

  private applyPendingGarbage() {
    if (this.pendingGarbage <= 0) return;
    const count = Math.min(this.pendingGarbage, 6);
    this.pendingGarbage -= count;
    const hole = Math.floor(this.rng() * BOARD_COLS);

    for (let i = 0; i < count; i++) {
      this.board.shift();
      const row: CellValue[] = Array.from({ length: BOARD_COLS }, (_, col) => (col === hole ? null : 'G'));
      this.board.push(row);
    }
  }

  private lockPiece(): LockOutcome {
    const matrix = getShapeMatrix(this.current.type, this.current.rotation);
    let toppedOut = false;

    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (!matrix[r][c]) continue;
        const bx = this.current.x + c;
        const by = this.current.y + r;
        if (by < 0) {
          toppedOut = true;
        } else if (by < BOARD_ROWS && bx >= 0 && bx < BOARD_COLS) {
          this.board[by][bx] = this.current.type;
        }
      }
    }

    // Check line clears
    const clearedIndices: number[] = [];
    for (let r = 0; r < BOARD_ROWS; r++) {
      if (this.board[r].every((cell) => cell !== null)) {
        clearedIndices.push(r);
      }
    }
    this.lastClearedRows = clearedIndices;
    const clearedLines = clearedIndices.length;

    if (clearedLines > 0) {
      this.lastClearedRowsData = clearedIndices.map((r) => ({ row: r, cells: [...this.board[r]] }));
      this.clearEventId += 1;
      for (let i = clearedIndices.length - 1; i >= 0; i--) {
        this.board.splice(clearedIndices[i], 1);
      }
      while (this.board.length < BOARD_ROWS) {
        this.board.unshift(Array<CellValue>(BOARD_COLS).fill(null));
      }
    }

    let attackSent = 0;
    let canceledGarbage = 0;
    let label = '';

    if (clearedLines > 0) {
      this.combo += 1;
      const baseScores = [0, 100, 300, 500, 800];
      const comboBonus = this.combo > 0 ? this.combo * 50 * this.level : 0;
      this.score += (baseScores[clearedLines] || 800) * this.level + comboBonus;
      this.lines += clearedLines;
      this.level = Math.min(15, Math.floor(this.lines / 10) + 1);

      // Every clear sends disruption attacks to opponents!
      const baseAttacks = [0, 1, 2, 3, 5];
      let rawAttack = (baseAttacks[clearedLines] || 5) + (this.combo >= 2 ? 1 : 0);

      // Cancel incoming pending garbage first (defense!)
      if (this.pendingGarbage > 0) {
        canceledGarbage = Math.min(this.pendingGarbage, rawAttack);
        this.pendingGarbage -= canceledGarbage;
        rawAttack -= canceledGarbage;
      }

      attackSent = rawAttack;
      this.attacksSent += attackSent;

      const names = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS!'];
      label = names[clearedLines] || 'TETRIS!';
      if (this.combo >= 1) {
        label += ` ${this.combo + 1} COMBO`;
      }
    } else {
      this.combo = -1;
      this.applyPendingGarbage();
    }

    this.canHold = true;
    this.current = this.spawnPiece(this.shiftNext());

    if (toppedOut || !this.isValidPosition(this.current)) {
      this.gameOver = true;
    }

    return {
      clearedLines,
      attackSent,
      canceledGarbage,
      combo: Math.max(0, this.combo),
      label,
      gameOver: this.gameOver,
    };
  }

  getDropIntervalMs(): number {
    return Math.max(90, 780 - (this.level - 1) * 52);
  }

  /** Compact board snapshot including active piece for multiplayer mini-board rendering */
  getBoardSnapshot(): string[] {
    const grid = this.board.map((row) => row.map((cell) => cell ?? '.'));
    if (!this.gameOver) {
      const matrix = getShapeMatrix(this.current.type, this.current.rotation);
      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          if (!matrix[r][c]) continue;
          const bx = this.current.x + c;
          const by = this.current.y + r;
          if (by >= 0 && by < BOARD_ROWS && bx >= 0 && bx < BOARD_COLS) {
            grid[by][bx] = this.current.type;
          }
        }
      }
    }
    return grid.map((row) => row.join(''));
  }
}
