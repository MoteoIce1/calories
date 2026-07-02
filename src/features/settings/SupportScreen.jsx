import { IconHelpCircle } from '../../components/Icons.jsx';
import { OWNER_EMAIL } from '../../firebase.js';

// Экран поддержки: контакт владельца приложения.
export default function SupportScreen() {
  return (
    <div className="space-y-5">
      <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-emerald-600/15 border border-emerald-600/30 flex items-center justify-center"><IconHelpCircle className="w-7 h-7 text-emerald-400" /></div>
        <div>
          <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><IconHelpCircle className="w-4 h-4" /> Поддержка</h2>
          <p className="text-sm text-zinc-400 leading-relaxed mt-2">Если что-то сломалось, не считается или хочется предложить улучшение — напишите владельцу приложения.</p>
        </div>
        <a href={`mailto:${OWNER_EMAIL}?subject=MoteoTracker%20support`} className="btn-active w-full bg-emerald-600 text-white rounded-xl p-4 font-bold transition-all flex items-center justify-center gap-2 text-center">{OWNER_EMAIL}</a>
      </div>
    </div>
  );
}
