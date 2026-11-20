// A card over the screen: pause, confirm, settings, match end.
//   actions: [{ label, onClick, primary }]
//   onClose: what Back and Esc do (pass escCloses={false} to ignore Esc)

import { useEffect, useRef } from 'react';
import { useBackLayer } from '../../hooks/useBackLayer.js';

export function Dialog({
  title,
  text,
  actions,
  onClose,
  escCloses = true,
  className = '',
  children,
}) {
  const card = useRef(null);
  const row = useRef(null);
  useBackLayer(true, onClose);

  // Focus the first action, so Enter and Space work straight away, and hand
  // focus back to whatever had it when the dialog closes.
  useEffect(() => {
    const before = document.activeElement;
    row.current?.querySelector('button')?.focus({ preventScroll: true }); // a long dialog opens at its top
    return () => {
      if (before instanceof HTMLElement && before.isConnected) before.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Escape' && escCloses) {
        e.stopPropagation();
        onClose();
      } else if (e.code === 'Tab') {
        // Tab goes round the dialog's own controls and never reaches the page behind it.
        const stops = [
          ...card.current.querySelectorAll('button:not(:disabled), input, [tabindex]'),
        ];
        const at = stops.indexOf(document.activeElement);
        const next = stops[(at + (e.shiftKey ? -1 : 1) + stops.length) % stops.length];
        e.preventDefault();
        next?.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [escCloses, onClose]);

  return (
    <div className="overlay">
      <div
        className={`card ${className}`}
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <h2>{title}</h2>
        {text && <p>{text}</p>}
        {children}
        <div className="overlay-actions" ref={row}>
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              className={`btn${a.primary ? ' primary' : ''}`}
              onClick={a.onClick}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
