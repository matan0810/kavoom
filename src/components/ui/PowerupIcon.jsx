// A power-up drawn exactly as it appears on the arena, for the rules.

import { useEffect, useRef } from 'react';
import { drawPowerupIcon } from '../../engine/renderer.js';

const SIZE = 36; // CSS pixels

export function PowerupIcon({ def }) {
  const canvas = useRef(null);
  useEffect(() => {
    const ratio = Math.min(3, window.devicePixelRatio || 1);
    canvas.current.width = Math.round(SIZE * ratio);
    canvas.current.height = Math.round(SIZE * ratio);
    drawPowerupIcon(canvas.current, def);
  }, [def]);
  return <canvas ref={canvas} className="pu-icon" width={SIZE} height={SIZE} aria-hidden="true" />;
}
