import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/anek-devanagari'
import '@fontsource/mukta/400.css'
import '@fontsource/mukta/500.css'
import '@fontsource/mukta/600.css'
import '@fontsource/mukta/700.css'
import '@fontsource/tiro-devanagari-hindi/400.css'
import '@fontsource/tiro-devanagari-hindi/400-italic.css'
import './index.css'
import './kosh.css'
import './customer.css'
import './staff.css'
import './site.css'
import App from './App.tsx'
import { applyPrefs, loadPrefs } from './prefs'
import { festivalFor } from './festival'

applyPrefs(loadPrefs())
const festival = festivalFor(new Date(), new URLSearchParams(location.search).get('festival'))
if (festival) document.documentElement.dataset.festival = festival

createRoot(document.getElementById('root')!).render(
  <StrictMode>
      <App />
  </StrictMode>,
)
