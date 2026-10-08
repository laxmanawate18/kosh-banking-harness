import React, { useState } from 'react';
import { flushSync } from 'react-dom';
import { useI18n } from '../../i18n';
import { applyPrefs, crossfade, loadPrefs, ZOOM_STEPS, type DisplayPrefs } from '../../prefs';
import { Icon } from './Icon';

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

/** Topbar entry point: native popover holding the display settings. */
export const PreferencesMenu: React.FC = () => {
  const { t } = useI18n();
  return (
    <>
      <button type="button" className="k-icon-btn" popoverTarget="k-prefs" aria-label={t('Display settings')}>
        <Icon name="text" />
      </button>
      <div id="k-prefs" popover="auto" className="k-popover k-prefs-pop">
        <h2>{t('Display')}</h2>
        <DisplayControls />
      </div>
    </>
  );
};
