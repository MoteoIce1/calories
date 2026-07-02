import { IconSparkles, IconDownload } from '../../components/Icons.jsx';

// Баннер обновления: карточка в дневнике или блокирующий экран при mandatory-версии.
export default function UpdateCallout({ appUpdate, applyAppUpdate, isApplyingUpdate, blocking = false }) {
  return (
    <div className={`${blocking ? 'min-h-[100dvh] w-full px-6 flex items-center justify-center' : 'card-enter mb-4'} bg-[#09090b]`}>
      <div className={`w-full ${blocking ? 'max-w-sm' : ''} bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-4`}>
        <div className="w-12 h-12 rounded-2xl bg-emerald-600/15 border border-emerald-600/30 flex items-center justify-center"><IconSparkles className="w-6 h-6 text-emerald-400" /></div>
        <div>
          <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{appUpdate?.message || 'Доступно обновление'}</h2>
          <p className="text-sm text-zinc-400 leading-relaxed mt-2">
            {blocking ? 'Эта версия больше не поддерживается. Обновите приложение, чтобы продолжить.' : 'Можно обновить сейчас — приложение перезагрузится и подтянет свежую версию.'}
          </p>
          {appUpdate?.version && <p className="text-[11px] text-zinc-600 mt-2">Новая версия: {appUpdate.version}</p>}
        </div>
        <button type="button" onClick={applyAppUpdate} disabled={isApplyingUpdate} className="btn-active w-full bg-emerald-600 text-white rounded-xl p-4 font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-60">
          <IconDownload className="w-5 h-5" /> {isApplyingUpdate ? 'Обновляем…' : 'Обновить приложение'}
        </button>
      </div>
    </div>
  );
}
