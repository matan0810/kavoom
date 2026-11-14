// The playing field: the canvas the engine draws on, plus the countdown number
// and the "round over" banner on top of it.
//
// The arena is wider than it is tall. On a tall screen (a phone held upright)
// it is drawn turned 90 degrees so it fills the screen. Steering is relative
// to each line, so turning the picture changes nothing about how you play.

import { useEffect, useRef, useState } from 'react';
import { ARENA } from '../../../shared/config.js';
import { game, input } from '../../engine/index.js';
import { useAnimationFrame } from '../../hooks/useAnimationFrame.js';
import { useT } from '../../state/SettingsContext.jsx';

const RATIO = ARENA.w / ARENA.h;

// The largest arena that fits in a box, lying down or standing up.
function fit(boxW, boxH) {
  const flatW = Math.min(boxW, boxH * RATIO);
  const tallW = Math.min(boxW, boxH / RATIO);
  const flat = { w: flatW, h: flatW / RATIO, rotated: false };
  const tall = { w: tallW, h: tallW * RATIO, rotated: true };
  // Turn it only when that is clearly bigger, so a nearly square window does not flip back and forth.
  const best = tall.w * tall.h > flat.w * flat.h * 1.25 ? tall : flat;
  return { w: Math.max(120, Math.floor(best.w)), h: Math.max(120, Math.floor(best.h)), rotated: best.rotated };
}

export function Arena({ ui, touchHint }) {
  const t = useT();
  const wrap = useRef(null);
  const canvas = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0, rotated: false });

  useEffect(() => {
    const measure = () => setSize(fit(wrap.current.clientWidth, wrap.current.clientHeight));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrap.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    game.renderer.attach(canvas.current);
    const unbind = input.bindTouch(wrap.current);
    return () => {
      unbind();
      game.renderer.attach(null);
    };
  }, []);

  game.renderer.rotated = size.rotated;
  useAnimationFrame((dt) => game.frame(dt));

  const { banner } = ui;
  const winner = banner && banner.winner >= 0 ? ui.players[banner.winner] : null;

  return (
    <div className="arena-wrap" ref={wrap}>
      <div className="arena-box" style={{ width: size.w, height: size.h }}>
        <canvas ref={canvas} className="arena" />
        {ui.count > 0 && <div className="count">{ui.count}</div>}
        {banner && (
          <div className="banner" style={winner ? { color: winner.color } : undefined}>
            {winner ? t('roundOf', winner.name) : t('draw')}
            <small>{ui.mode === 'local' && !touchHint ? t('spaceNext') : t('nextSoon')}</small>
          </div>
        )}
      </div>
    </div>
  );
}
