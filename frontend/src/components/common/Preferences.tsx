import React, { useState } from 'react';
import { flushSync } from 'react-dom';
import { LANGS, useI18n } from '../../i18n';
import { applyPrefs, crossfade, loadPrefs, ZOOM_STEPS, type DisplayPrefs } from '../../prefs';
import { Icon } from './Icon';

export const LanguageSwitch: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { lang, setLang, t } = useI18n();
  return (
    <div className={`k-seg ${compact ? 'compact' : ''}`} role="group" aria-label={t('Language')}>
      {LANGS.map(l => (
        <button
          key={l.id}
          type="button"
          lang={l.htmlLang}
          aria-pressed={lang === l.id}
          className={lang === l.id ? 'active' : ''}
          onClick={() => setLang(l.id)}
        >
          {compact ? l.short : l.label}
        </button>
      ))}
    </div>
  );
};

export const DisplayControls: React.FC = () => {
  const { t } = useI18n();
  const [prefs, setPrefs] = useState<DisplayPrefs>(loadPrefs);
  const update = (patch: Partial<DisplayPrefs>) => {
    const next = { ...prefs, ...patch };
    crossfade(() => { flushSync(() => setPrefs(next)); applyPrefs(next); });
  };
  const zi = ZOOM_STEPS.indexOf(prefs.zoom);

  return (
    <div className="k-display">
      <div className="k-seg" role="group" aria-label={t('Text size')}>
        {['A−', 'A', 'A+'].map((label, i) => (
          <button
            key={label}
            type="button"
            aria-pressed={zi === i}
            className={zi === i ? 'active' : ''}
            aria-label={[t('Smaller text'), t('Default text size'), t('Larger text')][i]}
            onClick={() => update({ zoom: ZOOM_STEPS[i] })}
          >
            <span style={{ fontSize: [12, 14, 17][i] }}>{label}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="k-chip-btn"
        aria-pressed={prefs.contrast === 'more'}
        onClick={() => update({ contrast: prefs.contrast === 'more' ? 'normal' : 'more' })}
      >
        <Icon name="contrast" /> {t('High contrast')}
      </button>
      <button
        type="button"
        className="k-chip-btn"
        aria-pressed={prefs.theme === 'dark'}
        onClick={() => update({ theme: prefs.theme === 'dark' ? 'light' : 'dark' })}
      >
        <Icon name={prefs.theme === 'dark' ? 'sun' : 'moon'} /> {prefs.theme === 'dark' ? t('Light mode') : t('Dark mode')}
      </button>
    </div>
  );
};

/** Topbar entry point: native popover holding language + display settings. */
export const PreferencesMenu: React.FC = () => {
  const { t } = useI18n();
  return (
    <>
      <button type="button" className="k-icon-btn" popoverTarget="k-prefs" aria-label={t('Language and display settings')}>
        <Icon name="language" />
      </button>
      <div id="k-prefs" popover="auto" className="k-popover k-prefs-pop">
        <h2>{t('Language')}</h2>
        <LanguageSwitch />
        <h2>{t('Display')}</h2>
        <DisplayControls />
      </div>
    </>
  );
};
