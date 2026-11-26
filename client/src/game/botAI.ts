import {
  ActivePiece,
  BOARD_COLS,
  BOARD_ROWS,
  CellValue,
  TetrisGame,
  getShapeMatrix,
} from './tetrisEngine';

export type BotDifficulty = 'easy' | 'normal' | 'hard';

interface BotPlacement {
  rotation: number;
  x: number;
  score: number;
}

function evaluateBoard(board: CellValue[][]): number {
  const heights = new Array<number>(BOARD_COLS).fill(0);
  let holes = 0;
  let completedLines = 0;

  for (let r = 0; r < BOARD_ROWS; r++) {
    if (board[r].every((cell) => cell !== null)) {
      completedLines++;
    }
  }

  for (let c = 0; c < BOARD_COLS; c++) {
    let foundBlock = false;
    for (let r = 0; r < BOARD_ROWS; r++) {
      if (board[r][c] !== null) {
        if (!foundBlock) {
          heights[c] = BOARD_ROWS - r;
          foundBlock = true;
        }
      } else if (foundBlock) {
        holes++;
      }
    }
  }

  let aggregateHeight = 0;
  let bumpiness = 0;
  for (let c = 0; c < BOARD_COLS; c++) {
    aggregateHeight += heights[c];
    if (c < BOARD_COLS - 1) {
      bumpiness += Math.abs(heights[c] - heights[c + 1]);
    }
  }

  return (
    completedLines * 0.92 -
    aggregateHeight * 0.51 -
    holes * 0.58 -
    bumpiness * 0.19
  );
}

function simulatePlacement(game: TetrisGame, rotation: number, x: number): number | null {
  const piece: ActivePiece = {
    type: game.current.type,
    rotation,
    x,
    y: game.current.y,
  };

  if (!game.isValidPosition(piece)) return null;

  while (game.isValidPosition({ ...piece, y: piece.y + 1 })) {
    piece.y += 1;
  }

  const clone: CellValue[][] = game.board.map((row) => [...row]);
  const matrix = getShapeMatrix(piece.type, piece.rotation);
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (!matrix[r][c]) continue;
      const bx = piece.x + c;
      const by = piece.y + r;
      if (by < 0) return -9999;
      clone[by][bx] = piece.type;
    }
  }

  return evaluateBoard(clone);
}

export function chooseBotMove(game: TetrisGame, difficulty: BotDifficulty): { rotation: number; x: number } | null {
  const candidates: BotPlacement[] = [];
  const maxRotations = game.current.type === 'O' ? 1 : 4;

  for (let rot = 0; rot < maxRotations; rot++) {
    for (let x = -2; x < BOARD_COLS + 2; x++) {
      const score = simulatePlacement(game, rot, x);
      if (score !== null) {
        candidates.push({ rotation: rot, x, score });
      }
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);

  if (difficulty === 'easy' && candidates.length > 3 && Math.random() < 0.35) {
    const pick = candidates[Math.floor(Math.random() * Math.min(5, candidates.length))];
    return { rotation: pick.rotation, x: pick.x };
  }
  if (difficulty === 'normal' && candidates.length > 2 && Math.random() < 0.12) {
    const pick = candidates[1];
    return { rotation: pick.rotation, x: pick.x };
  }

  return { rotation: candidates[0].rotation, x: candidates[0].x };
}

export function getBotTickIntervalMs(difficulty: BotDifficulty): number {
  switch (difficulty) {
    case 'easy':
      return 920;
    case 'normal':
      return 560;
    case 'hard':
      return 310;
  }
}
