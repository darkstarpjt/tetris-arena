import React from 'react';
import { BOARD_COLS, BOARD_ROWS, PIECE_COLORS, PieceType } from '../game/tetrisEngine';

export interface OpponentSnapshot {
  id: string;
  nickname: string;
  board: string[];
  score: number;
  lines: number;
  pendingGarbage: number;
  alive: boolean;
  isBot?: boolean;
  deviceType?: 'mobile' | 'pc';
}

export const MiniBoard: React.FC<{ opponent: OpponentSnapshot; compact?: boolean; cellSize?: number }> = ({
  opponent,
  compact = false,
  cellSize: cellSizeProp,
}) => {
  const cellSize = cellSizeProp ?? (compact ? 7 : 10);
  const tiny = cellSize <= 6;
  const prefix = opponent.isBot ? '🤖 ' : opponent.deviceType === 'mobile' ? '📱 ' : '💻 ';

  return (
    <div className={`mini-board-card ${!opponent.alive ? 'is-ko' : ''} ${tiny ? 'tiny' : ''}`}>
      <div className="mini-board-header">
        <span className="mini-name" title={opponent.nickname}>
          {prefix}
          {opponent.nickname}
        </span>
        <span className="mini-score">{opponent.score.toLocaleString()}</span>
      </div>

      <div className="mini-grid-wrap">
        <div
          className="mini-grid"
          style={{
            width: BOARD_COLS * cellSize,
            height: BOARD_ROWS * cellSize,
            gridTemplateColumns: `repeat(${BOARD_COLS}, ${cellSize}px)`,
            gridTemplateRows: `repeat(${BOARD_ROWS}, ${cellSize}px)`,
          }}
        >
          {Array.from({ length: BOARD_ROWS }).map((_, r) => {
            const rowStr = opponent.board[r] || '..........';
            return Array.from({ length: BOARD_COLS }).map((__, c) => {
              const ch = rowStr[c];
              const color =
                ch && ch !== '.' && ch in PIECE_COLORS
                  ? PIECE_COLORS[ch as PieceType | 'G'].fill
                  : 'transparent';
              return (
                <div
                  key={`${r}-${c}`}
                  className="mini-cell"
                  style={{ backgroundColor: color }}
                />
              );
            });
          })}
        </div>

        {opponent.pendingGarbage > 0 && opponent.alive && (
          <div className="mini-garbage-badge">+{opponent.pendingGarbage}</div>
        )}

        {!opponent.alive && <div className="mini-ko-overlay">KO</div>}
      </div>
    </div>
  );
};
