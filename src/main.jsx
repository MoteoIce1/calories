import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './styles/themes.css';
import './styles/globals.css';
import './styles/animations.css';
import './styles/layout.css';
import App from './App.jsx';
import AppErrorBoundary from './app/ErrorBoundary.jsx';

// Service worker для офлайн-работы (network-first; файл лежит в public/).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => {
      if (import.meta.env.DEV) console.warn('SW:', e);
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
