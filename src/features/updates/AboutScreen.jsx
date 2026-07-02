import { IconBowl, IconInfo, IconDownload, IconRefresh } from '../../components/Icons.jsx';
import { APP_VERSION } from '../../constants/app.js';

// Экран «О приложении»: версия, статус обновления, установка PWA.
export default function AboutScreen({ appUpdate, applyAppUpdate, isApplyingUpdate, installPrompt, installApp }) {
  return (
    <div className="space-y-5">
      <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-emerald-600/15 border border-emerald-600/30 flex items-center justify-center"><IconBowl className="w-7 h-7 text-emerald-400" /></div>
        <div>
          <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><IconInfo className="w-4 h-4" /> О приложении</h2>
          <p className="text-2xl font-black text-zinc-100 mt-2">MoteoTracker</p>
          <p className="text-xs text-zinc-500 leading-relaxed mt-2">Дневник питания, активности, прогресса тела и личной базы продуктов. Расчёты КБЖУ и ИИ-подсказки — ориентировочные, не медицинская рекомендация.</p>
        </div>
        <div className="bg-[#27272a] rounded-2xl p-4 border border-zinc-700/30 space-y-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-zinc-500">Текущая версия</span>
            <span className="font-bold text-zinc-200">{APP_VERSION}</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-zinc-500">Обновления</span>
            <span className={`font-bold ${appUpdate ? 'text-amber-400' : 'text-emerald-400'}`}>{appUpdate ? `доступна ${appUpdate.version}` : 'актуально'}</span>
          </div>
        </div>
        {appUpdate ? (
          <button type="button" onClick={applyAppUpdate} disabled={isApplyingUpdate} className="btn-active w-full bg-emerald-600 text-white rounded-xl p-4 font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-60"><IconDownload className="w-5 h-5" />{isApplyingUpdate ? 'Обновляем…' : 'Обновить приложение'}</button>
        ) : (
          <>
            <button type="button" onClick={applyAppUpdate} disabled={isApplyingUpdate} className="btn-active w-full bg-zinc-800 text-zinc-100 border border-zinc-700/40 rounded-xl p-4 font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-60"><IconRefresh className="w-5 h-5" />{isApplyingUpdate ? 'Обновляем…' : 'Обновить приложение'}</button>
            <p className="text-[11px] text-zinc-500 leading-relaxed">Приложение само проверяет обновления при запуске. Эта кнопка принудительно сбрасывает кэш и подтягивает свежую сборку.</p>
          </>
        )}
        {installPrompt && <button type="button" onClick={installApp} className="btn-active w-full bg-indigo-600 text-white rounded-xl p-4 font-bold transition-all flex items-center justify-center gap-2"><IconDownload className="w-5 h-5" />Установить приложение</button>}
      </div>
    </div>
  );
}
