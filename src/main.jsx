import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App.jsx';

// Service worker для офлайн-работы (network-first; файл лежит в public/).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW:', e));
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
