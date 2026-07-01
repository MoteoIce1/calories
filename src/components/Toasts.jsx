import { motion, AnimatePresence } from 'framer-motion';

// Стек всплывающих уведомлений (замена нативного alert). Клик закрывает.
export default function Toasts({ toasts, onDismiss }) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[80] flex flex-col items-center gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            role="status"
            aria-live="polite"
            onClick={() => onDismiss(t.id)}
            className={`pointer-events-auto w-full rounded-2xl px-4 py-3 text-sm font-bold shadow-xl border backdrop-blur-sm text-center ${t.kind === 'error' ? 'bg-red-500/20 border-red-400/40 text-red-100' : 'bg-emerald-600/20 border-emerald-500/40 text-emerald-100'}`}
          >
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
