import { IconMenu } from '../Icons.jsx';

// Шапка приложения: заголовок активной вкладки и кнопка меню с бейджем заявок.
export default function Header({ title, activeTabKey, isDrawerOpen, onOpenDrawer, badgeCount = 0 }) {
  return (
    <header className="app-header shrink-0 pt-8 px-4 pb-4 bg-[#09090b] flex justify-between items-center z-10">
      <div>
        <h1 key={activeTabKey} className="text-2xl font-bold">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onOpenDrawer} className="relative btn-active p-2 bg-zinc-800 rounded-xl text-zinc-300 transition-all border border-zinc-800/50 cursor-pointer" aria-label="Открыть меню" aria-expanded={isDrawerOpen}>
          <IconMenu className="w-5 h-5" />
          {badgeCount > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center border-2 border-[#09090b]">+{badgeCount}</span>}
        </button>
      </div>
    </header>
  );
}
