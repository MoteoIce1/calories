import { motion, AnimatePresence } from 'framer-motion';

// Промис-подтверждение действия (замена нативного confirm). onResolve(true|false).
export default function ConfirmModal({ state, onResolve }) {
  return (
    <AnimatePresence>
      {state && (
        <motion.div
          key="confirm"
          className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={() => onResolve(false)}
        >
          <motion.div
            className="bg-[#18181b] p-6 rounded-3xl border border-zinc-800 w-full max-w-xs"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-zinc-200 leading-relaxed text-center mb-5">{state.message}</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => onResolve(false)} className="btn-active flex-1 border border-zinc-800 text-zinc-400 rounded-xl p-3 font-bold transition-all">{state.cancelLabel}</button>
              <button type="button" onClick={() => onResolve(true)} className={`btn-active flex-1 rounded-xl p-3 font-bold text-white transition-all ${state.danger ? 'bg-red-600' : 'bg-emerald-600'}`}>{state.confirmLabel}</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
