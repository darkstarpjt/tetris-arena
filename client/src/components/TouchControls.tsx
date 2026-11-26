import React from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ChevronsDown,
  Repeat,
  RotateCw,
} from 'lucide-react';

interface TouchControlsProps {
  onLeft: () => void;
  onRight: () => void;
  onSoftDrop: () => void;
  onHardDrop: () => void;
  onRotate: () => void;
  onHold: () => void;
}

export const TouchControls: React.FC<TouchControlsProps> = ({
  onLeft,
  onRight,
  onSoftDrop,
  onHardDrop,
  onRotate,
  onHold,
}) => {
  const bind = (fn: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      fn();
    },
  });

  return (
    <div className="touch-controls">
      <div className="touch-group-left">
        <button type="button" className="touch-btn" {...bind(onLeft)} aria-label="왼쪽">
          <ArrowLeft size={22} />
        </button>
        <button type="button" className="touch-btn" {...bind(onSoftDrop)} aria-label="아래">
          <ArrowDown size={22} />
        </button>
        <button type="button" className="touch-btn" {...bind(onRight)} aria-label="오른쪽">
          <ArrowRight size={22} />
        </button>
      </div>

      <div className="touch-group-right">
        <button type="button" className="touch-btn secondary" {...bind(onHold)} aria-label="홀드">
          <Repeat size={18} />
          <span>HOLD</span>
        </button>
        <button type="button" className="touch-btn primary" {...bind(onRotate)} aria-label="회전">
          <RotateCw size={20} />
          <span>회전</span>
        </button>
        <button type="button" className="touch-btn accent" {...bind(onHardDrop)} aria-label="드롭">
          <ChevronsDown size={20} />
          <span>드롭</span>
        </button>
      </div>
    </div>
  );
};
