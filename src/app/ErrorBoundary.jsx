import React from 'react';

// Корневой предохранитель: при падении рендера предлагает очистить кэш и перезагрузиться.
export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) console.error('App render failed:', error, info);
  }

  refreshApp = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.update().catch(() => {})));
      }
      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.filter((key) => key.startsWith('tracker-')).map((key) => caches.delete(key).catch(() => false)));
      }
    } finally {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set('v', String(Date.now()));
      window.location.replace(nextUrl.toString());
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-[100dvh] w-full bg-[#09090b] text-zinc-100 flex items-center justify-center px-6">
        <div className="w-full max-w-sm bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-4">
          <div>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Нужно обновить приложение</p>
            <h1 className="text-xl font-black mt-2">Трекер не смог загрузиться</h1>
            <p className="text-sm text-zinc-400 leading-relaxed mt-2">
              Нажмите кнопку ниже: приложение очистит локальный кэш и загрузит свежую версию.
            </p>
          </div>
          <button type="button" onClick={this.refreshApp} className="w-full bg-emerald-600 text-white rounded-xl p-4 font-bold transition-all">
            Обновить приложение
          </button>
        </div>
      </div>
    );
  }
}
