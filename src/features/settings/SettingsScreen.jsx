import { IconSliders, IconDownload } from '../../components/Icons.jsx';
import { THEMES } from '../../constants/themes.js';
import { TOGGLEABLE_BLOCKS } from '../../constants/app.js';

// Экран настроек: тема, размер шрифта, видимость блоков дневника, аккаунт.
export default function SettingsScreen({
  activeTheme,
  setTheme,
  fontScale,
  setFontScale,
  blocks,
  toggleBlock,
  accountEmail,
  installPrompt,
  installApp,
  deleteAccountNow,
  deleteBusy,
}) {
  return (
    <div className="space-y-5">
      <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-3">
        <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><IconSliders className="w-4 h-4" /> Тема оформления</h2>
        <p className="text-[11px] text-zinc-500 leading-relaxed">Темы применяются сразу, сохраняются в профиле и меняют главный цвет интерфейса глобально.</p>
        <div className="grid grid-cols-2 gap-2">
          {THEMES.map(t => (
            <button key={t.key} type="button" onClick={() => setTheme(t.key)} className={`btn-active flex items-center gap-2.5 rounded-xl p-3 border transition-all cursor-pointer ${activeTheme === t.key ? 'border-emerald-500 bg-emerald-600/15' : 'bg-[#27272a] border-zinc-700/30'}`}>
              <span className="shrink-0 w-7 h-7 rounded-lg border border-white/10 flex items-center justify-center" style={{ background: t.bg }}><span className="w-3 h-3 rounded-full" style={{ background: t.dot }} /></span>
              <span className={`text-xs font-bold text-left leading-tight ${activeTheme === t.key ? 'text-emerald-300' : 'text-zinc-300'}`}>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-3">
        <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><IconSliders className="w-4 h-4" /> Размер шрифта</h2>
        <div className="grid grid-cols-2 gap-2">
          {[['normal', 'Стандартный'], ['large', 'Увеличенный']].map(([sc, label]) => (
            <button key={sc} type="button" onClick={() => setFontScale(sc)} className={`btn-active rounded-xl p-3 text-sm font-bold border transition-all cursor-pointer ${fontScale === sc ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-[#27272a] text-zinc-300 border-zinc-700/30'}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-3">
        <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Блоки в дневнике</h2>
        <p className="text-[11px] text-zinc-500 leading-relaxed">По умолчанию включены все блоки. Отключите лишние — они исчезнут из дневника, но данные сохранятся.</p>
        <div className="space-y-2">
          {TOGGLEABLE_BLOCKS.map(b => (
            <button key={b.key} type="button" role="switch" aria-checked={!!blocks[b.key]} onClick={() => toggleBlock(b.key)} className="btn-active w-full flex items-center justify-between gap-3 bg-[#27272a] rounded-xl p-3 border border-zinc-700/30 text-left transition-all cursor-pointer">
              <div className="min-w-0">
                <span className="text-sm font-bold text-zinc-200">{b.label}</span>
                <span className="block text-[10px] text-zinc-500 mt-0.5">{b.hint}</span>
              </div>
              <div className={`shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors ${blocks[b.key] ? 'bg-emerald-500' : 'bg-zinc-700'}`}>
                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${blocks[b.key] ? 'translate-x-5' : 'translate-x-0'}`} />
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-3">
        <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Аккаунт</h2>
        <p className="text-xs text-zinc-500 break-all">{accountEmail}</p>
        {installPrompt && <button type="button" onClick={installApp} className="btn-active w-full bg-indigo-600 text-white rounded-xl p-4 font-bold transition-all flex items-center justify-center gap-2"><IconDownload className="w-5 h-5" />Установить приложение</button>}
        <button type="button" onClick={deleteAccountNow} disabled={deleteBusy} className="btn-active w-full bg-red-950/40 text-red-400 border border-red-900/50 rounded-xl p-3 font-bold transition-all disabled:opacity-50">{deleteBusy ? 'Удаление…' : 'Удалить аккаунт'}</button>
        <p className="text-[10px] text-zinc-600 leading-relaxed">Удаление аккаунта стирает все данные безвозвратно. Расчёты КБЖУ и ИИ-оценки — ориентировочные, не медицинская рекомендация.</p>
      </div>
    </div>
  );
}
