// A card over the screen: pause, confirm, settings, match end.
//   actions: [{ label, onClick, primary }]
//   onClose: what Back and Esc do (pass escCloses={false} to ignore Esc)

import { useEffect, useRef } from 'react';
import { useBackLayer } from '../../hooks/useBackLayer.js';

export function Dialog({ title, text, actions, onClose, escCloses = true, children }) {
  const row = useRef(null);
  useBackLayer(true, onClose);

  // Focus the first action once, so Enter and Space work straight away.
  useEffect(() => {
    row.current?.querySelector('button')?.focus();
  }, []);

  useEffect(() => {
    if (!escCloses) return undefined;
    const onKey = (e) => {
      if (e.code !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [escCloses, onClose]);

  return (
    <div className="overlay">
      <div className="card" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {text && <p>{text}</p>}
        {children}
        <div className="overlay-actions" ref={row}>
          {actions.map((a) => (
            <button key={a.label} type="button" className={`btn${a.primary ? ' primary' : ''}`} onClick={a.onClick}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
