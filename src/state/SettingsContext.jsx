// Gives every component the saved settings, a way to change them, and the
// translate function for the current language.
//
//   const { settings, update } = useSettings();
//   update((s) => { s.length = 'long'; });   // change a copy, it is saved for you
//   const t = useT();                         // t('start') -> 'התחל משחק' / 'Start game'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { PALETTE } from '../../shared/config.js';
import { translate } from '../i18n/strings.js';
import { loadSettings, saveSettings } from './settings.js';

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(loadSettings);

  const update = useCallback((change) => {
    setSettings((old) => {
      const next = structuredClone(old);
      change(next);
      saveSettings(next);
      return next;
    });
  }, []);

  const value = useMemo(() => {
    const { lang } = settings;
    return {
      settings,
      update,
      lang,
      t: (key, ...args) => translate(lang, key, ...args),
      colorName: (i) => PALETTE[i][lang],
    };
  }, [settings, update]);

  // The page itself follows the language: Hebrew reads right to left.
  useEffect(() => {
    document.documentElement.lang = settings.lang;
    document.documentElement.dir = settings.lang === 'he' ? 'rtl' : 'ltr';
  }, [settings.lang]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
export const useT = () => useContext(SettingsContext).t;
