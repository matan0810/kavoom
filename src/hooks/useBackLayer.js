// While `active` is true, the Back button calls onBack instead of leaving the page.
// See engine/backButton.js for how the layers work.

import { useEffect, useRef } from 'react';
import { addLayer, removeLayer } from '../engine/backButton.js';

export function useBackLayer(active, onBack, { sticky = false } = {}) {
  const latest = useRef(onBack);
  latest.current = onBack;
  useEffect(() => {
    if (!active) return undefined;
    const layer = addLayer(() => latest.current(), sticky);
    return () => removeLayer(layer);
  }, [active, sticky]);
}
