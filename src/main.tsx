import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

/* Self-hosted fonts. Nothing is fetched from a CDN, so the app looks right
   offline, on a LAN-only Sunmi terminal, and behind a corporate firewall. */
import '@fontsource-variable/inter';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';

import App from './App';
import './styles/index.css';
import { setupServiceWorker } from './lib/pwa';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root element #root is missing from index.html.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

setupServiceWorker();
