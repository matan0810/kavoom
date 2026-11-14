// The strip at the top of the menu: five bots playing a live demo behind the title.

import { useEffect, useRef } from 'react';
import { DT, PLAYER_COLORS, makeRng } from '../../../shared/config.js';
import { Round } from '../../../shared/sim/round.js';
import { Renderer } from '../../engine/renderer.js';
import { useAnimationFrame } from '../../hooks/useAnimationFrame.js';
import { useT } from '../../state/SettingsContext.jsx';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const SIZE = window.innerWidth < 700 ? { w: 720, h: 300 } : { w: 1120, h: 300 };

function newDemo(renderer) {
  renderer.reset(PLAYER_COLORS);
  return new Round({
    w: SIZE.w,
    h: SIZE.h,
    players: Array.from({ length: SIZE.w < 1000 ? 4 : 5 }, () => ({ bot: 'hard' })),
    rng: makeRng((Math.random() * 2 ** 32) >>> 0),
    powerups: true,
    hooks: renderer.hooks(),
  });
}

export function Hero() {
  const t = useT();
  const canvas = useRef(null);
  const demo = useRef(null); // { renderer, round, acc, rest }

  useEffect(() => {
    const renderer = new Renderer(SIZE.w, SIZE.h, { calm: true });
    renderer.attach(canvas.current);
    const round = newDemo(renderer);
    // With reduced motion the demo is a still frame with some trails on it.
    if (reducedMotion) for (let i = 0; i < 120 * 5 && !round.over; i++) round.step();
    demo.current = { renderer, round, acc: 0, rest: 0 };
  }, []);

  useAnimationFrame((dt) => {
    const d = demo.current;
    if (!d) return;
    if (!reducedMotion) {
      if (d.round.over) {
        d.rest += dt;
        if (d.rest > 1.6) {
          d.round = newDemo(d.renderer);
          d.rest = 0;
        }
      } else {
        d.acc += dt;
        while (d.acc >= DT && !d.round.over) {
          d.round.step();
          d.acc -= DT;
        }
      }
    }
    d.renderer.draw(d.round, { dt });
  });

  return (
    <header className="hero">
      <canvas ref={canvas} style={{ aspectRatio: `${SIZE.w} / ${SIZE.h}` }} aria-hidden="true" />
      <div className="hero-text">
        <h1 dir="ltr">KAVOOM</h1>
        <p>{t('tagline')}</p>
      </div>
    </header>
  );
}
