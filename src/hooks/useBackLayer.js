// While `active` is true, the Back button calls onBack instead of leaving the page.
// See engine/backButton.js for how the layers work.

import { useEffect, useRef } from 'react';
import { LEVELS, addLayer, removeLayer } from '../engine/backButton.js';

// level: 'room', 'game' or 'dialog' (the default), see LEVELS.
export function useBackLayer(active, onBack, { sticky = false, level = 'dialog' } = {}) {
  const latest = useRef(onBack);
  latest.current = onBack;
  useEffect(() => {
    if (!active) return undefined;
    const layer = addLayer(() => latest.current(), sticky, LEVELS[level]);
    return () => removeLayer(layer);
  }, [active, sticky, level]);
}
