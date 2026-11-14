// Calls fn(dt) on every animation frame while the component is mounted.
// dt is the time since the last frame in seconds, clamped so a background
// tab does not come back with one huge step.

import { useEffect, useRef } from 'react';

export function useAnimationFrame(fn) {
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    let id = 0;
    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      latest.current(dt);
      id = requestAnimationFrame(frame);
    };
    id = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(id);
  }, []);
}
