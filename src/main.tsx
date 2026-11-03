import './shared/compat/random-uuid.js';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import './app/styles.css';
import { localizeDocument } from './shared/i18n/runtime.js';

const stopLocalization = localizeDocument();
if (import.meta.hot) import.meta.hot.dispose(stopLocalization);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
