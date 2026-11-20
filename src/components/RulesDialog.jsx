// The rules, in full: opened from the "?" in the menu bar and from the game menu.
// Every number comes from the game's own settings, so the text cannot drift
// from what the game does.

import { POWERUPS } from '../../shared/config.js';
import { useT } from '../state/SettingsContext.jsx';
import { Dialog } from './ui/Dialog.jsx';
import { PowerupIcon } from './ui/PowerupIcon.jsx';

function Section({ title, children }) {
  return (
    <section className="rules-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function RulesDialog({ onClose }) {
  const t = useT();
  return (
    <Dialog
      className="wide"
      title={t('howTitle')}
      onClose={onClose}
      actions={[{ label: t('close'), onClick: onClose, primary: true }]}
    >
      <div className="rules">
        <Section title={t('rulesAimTitle')}>
          <p>{t('rulesAim')}</p>
        </Section>
        <Section title={t('rulesSteerTitle')}>
          <p>{t('rulesSteer')}</p>
        </Section>
        <Section title={t('rulesGapsTitle')}>
          <p>{t('rulesGaps')}</p>
        </Section>
        <Section title={t('rulesScoreTitle')}>
          <p>{t('rulesScore')}</p>
          <p>{t('rulesWin')}</p>
        </Section>
        <Section title={t('rulesPowerTitle')}>
          <p>{t('rulesPower')}</p>
          <ul className="rules-powerups">
            {POWERUPS.map((def) => (
              <li key={def.id} className={`pu-${def.target}`}>
                <PowerupIcon def={def} />
                <span>
                  <strong>{t(`pu_${def.id}`)}</strong>
                  {def.dur > 0 && <small> · {t('seconds', def.dur)}</small>}
                  <br />
                  {t(`pu_${def.id}_what`)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
        <Section title={t('rulesOnlineTitle')}>
          <p>{t('rulesOnline')}</p>
        </Section>
      </div>
    </Dialog>
  );
}
