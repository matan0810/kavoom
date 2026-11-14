// The playing field: the canvas the engine draws on, plus the countdown number
// and the "round over" banner on top of it.
//
// On a tall screen (a phone held upright) the arena is drawn turned 90 degrees;
// see engine/layout.js.

import { useEffect, useRef, useState } from 'react';
import { game, input } from '../../engine/index.js';
import { fitArena } from '../../engine/layout.js';
import { useAnimationFrame } from '../../hooks/useAnimationFrame.js';
import { useT } from '../../state/SettingsContext.jsx';

export function Arena({ ui, touchHint }) {
  const t = useT();
  const wrap = useRef(null);
  const canvas = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0, rotated: false });

  useEffect(() => {
    const measure = () => setSize(fitArena(wrap.current.clientWidth, wrap.current.clientHeight));
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
