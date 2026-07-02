import { motion, AnimatePresence } from 'framer-motion';
import { IconClose, IconDownload, IconRefresh, IconLogOut } from '../Icons.jsx';
import { APP_VERSION } from '../../constants/app.js';

// Выдвижное меню: навигация по второстепенным экранам, обновление и выход.
export default function DrawerMenu({ isOpen, onClose, userEmail, items, hasUpdate, isApplyingUpdate, onApplyUpdate, onSignOut }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="drawer-overlay"
          className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
        >
          <motion.aside
            className="drawer-panel h-full w-[84%] max-w-[360px] bg-[#18181b] border-l border-zinc-800/50 shadow-2xl p-4 flex flex-col"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 360, damping: 34 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0, right: 0.18 }}
            onDragEnd={(_, info) => {
              if (info.offset.x > 80 || info.velocity.x > 500) onClose();
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 mb-5 pt-[max(0px,env(safe-area-inset-top))]">
              <div className="min-w-0">
                <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">MoteoTracker</p>
                <p className="text-sm font-bold text-zinc-200 truncate">{userEmail || 'Профиль'}</p>
              </div>
              <button type="button" onClick={onClose} className="btn-active shrink-0 w-10 h-10 bg-zinc-800 rounded-xl text-zinc-300 border border-zinc-800/50 flex items-center justify-center cursor-pointer" aria-label="Закрыть меню"><IconClose className="w-5 h-5" /></button>
            </div>

            <div className="space-y-2">
              {items.map(({ key, label, icon: DrawerIcon, onClick, active, badge }) => (
                <button
                  key={key}
                  type="button"
                  onClick={onClick}
                  className={`drawer-item btn-active w-full flex items-center justify-between gap-3 rounded-2xl p-3 border text-left transition-all cursor-pointer ${active ? 'drawer-item-active bg-emerald-600/15 border-emerald-600/30 text-emerald-300' : 'bg-[#27272a] border-zinc-700/30 text-zinc-300'}`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${active ? 'bg-emerald-600/20' : 'bg-zinc-900/50'}`}><DrawerIcon className="w-5 h-5" /></span>
                    <span className="text-sm font-bold truncate">{label}</span>
                  </span>
                  {badge > 0 && <span className="shrink-0 min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">+{badge}</span>}
                </button>
              ))}
            </div>

            <div className="mt-auto pt-4 space-y-3">
              <button type="button" onClick={onApplyUpdate} disabled={isApplyingUpdate} className={`btn-active w-full rounded-2xl p-3 font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-60 ${hasUpdate ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-100 border border-zinc-700/40'}`}>
                {hasUpdate ? <IconDownload className="w-5 h-5" /> : <IconRefresh className="w-5 h-5" />}
                {isApplyingUpdate ? 'Обновляем…' : 'Обновить приложение'}
              </button>
              <button type="button" onClick={onSignOut} className="drawer-item btn-active w-full flex items-center gap-3 rounded-2xl p-3 border bg-[#27272a] border-zinc-700/30 text-red-400 text-left transition-all cursor-pointer">
                <span className="w-10 h-10 rounded-xl bg-zinc-900/50 flex items-center justify-center shrink-0"><IconLogOut className="w-5 h-5" /></span>
                <span className="text-sm font-bold">Выход</span>
              </button>
              <p className="text-[10px] text-zinc-600 text-center">v{APP_VERSION}</p>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
