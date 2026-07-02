import { IconCalendar, IconCamera, IconBook } from '../Icons.jsx';

const NAV_ITEMS = [
  { key: 'diary', label: 'Дневник', Icon: IconCalendar, activeClass: 'text-emerald-400 bg-zinc-900/50' },
  { key: 'progress', label: 'Прогресс', Icon: IconCamera, activeClass: 'text-violet-300 bg-zinc-900/50' },
  { key: 'directory', label: 'База', Icon: IconBook, activeClass: 'text-indigo-400 bg-zinc-900/50' },
];

// Нижняя навигация: три основные вкладки.
export default function BottomNav({ activeTab, onSelect }) {
  return (
    <nav className="bottom-nav shrink-0 bg-[#09090b] flex justify-around gap-1 px-1 pb-2 pt-2 safe-pb relative z-40 border-t border-zinc-900">
      {NAV_ITEMS.map(({ key, label, Icon, activeClass }) => (
        <button key={key} onClick={() => onSelect(key)} className={`btn-active flex-1 flex flex-col items-center py-2 transition-all rounded-xl ${activeTab === key ? activeClass : 'text-zinc-600'}`}>
          <Icon className="w-6 h-6" /><span className="text-[9px] font-bold mt-1 uppercase tracking-widest">{label}</span>
        </button>
      ))}
    </nav>
  );
}
