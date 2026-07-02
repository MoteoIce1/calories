import { IconTrophy, IconTarget } from '../../components/Icons.jsx';
import { MiniWeightChart } from '../../components/Charts.jsx';
import { progressPeriods } from '../../utils/progress.js';

// Сравнение динамики веса с выбранным другом за период.
export default function ProgressCompareSection({
  acceptedFriends,
  otherUid,
  friendName,
  challengeProgressFriendUid,
  setChallengeProgressFriendUid,
  challengeProgressPeriod,
  setChallengeProgressPeriod,
  challengeProgressToneClass,
  challengeProgressOutcome,
  myDisplayName,
  myWeightProgressSummary,
  friendWeightProgressSummary,
  selectedChallengeProgressPeriod,
}) {
  return (
    <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><IconTrophy className="w-4 h-4" /> Сравнение прогресса</h2>
          <p className="text-xs text-zinc-500 mt-2 leading-relaxed">Выберите друга и период, чтобы сравнить динамику веса.</p>
        </div>
        <div className="w-11 h-11 shrink-0 rounded-2xl bg-emerald-600/15 border border-emerald-600/30 flex items-center justify-center"><IconTarget className="w-5 h-5 text-emerald-400" /></div>
      </div>

      {acceptedFriends.length === 0 ? (
        <div className="rounded-2xl bg-[#27272a] border border-zinc-700/30 p-4">
          <p className="text-sm font-bold text-zinc-200">У вас пока нет друзей для спора</p>
          <p className="text-[11px] text-zinc-500 mt-1">Добавьте друга по коду, и здесь появится сравнение прогресса.</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">Выберите друга</p>
            <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1 -mx-1 px-1">
              {acceptedFriends.map(c => {
                const fid = otherUid(c);
                const active = challengeProgressFriendUid === fid;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setChallengeProgressFriendUid(fid)}
                    aria-pressed={active}
                    className={`btn-active shrink-0 cursor-pointer rounded-2xl px-3.5 py-2.5 text-xs font-bold border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 ${active ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-950/20' : 'bg-[#27272a] text-zinc-300 border-zinc-700/30 hover:border-zinc-600 hover:text-zinc-100'}`}
                  >
                    {friendName(fid)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">Период</p>
            <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1 -mx-1 px-1">
              {progressPeriods.map(period => {
                const active = challengeProgressPeriod === period.key;
                return (
                  <button
                    key={period.key}
                    type="button"
                    onClick={() => setChallengeProgressPeriod(period.key)}
                    aria-pressed={active}
                    className={`btn-active shrink-0 cursor-pointer rounded-2xl px-3 py-2 text-[10px] font-black uppercase tracking-widest border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 ${active ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-zinc-900/70 text-zinc-400 border-zinc-800/70 hover:text-zinc-200 hover:border-zinc-700'}`}
                  >
                    {period.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={`rounded-2xl border p-4 ${challengeProgressToneClass}`}>
            <p className="text-[9px] font-black uppercase tracking-widest opacity-70">Итог</p>
            <p className="text-sm font-black mt-1">{challengeProgressOutcome.text}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { key: 'me', title: 'Мой прогресс', name: myDisplayName, summary: myWeightProgressSummary, empty: 'У вас пока нет записей прогресса', color: '#34d399' },
              { key: 'friend', title: 'Прогресс друга', name: challengeProgressFriendUid ? friendName(challengeProgressFriendUid) : 'Друг', summary: friendWeightProgressSummary, empty: 'У друга пока нет записей прогресса', color: '#38bdf8' },
            ].map(card => {
              const summary = card.summary;
              const deltaClass = summary.delta == null || summary.delta === 0 ? 'text-zinc-400' : (summary.delta < 0 ? 'text-emerald-400' : 'text-red-400');
              const deltaText = summary.delta == null ? '—' : `${summary.delta > 0 ? '+' : ''}${summary.delta} кг`;
              const percentText = summary.percent == null ? '' : ` (${summary.percent > 0 ? '+' : ''}${summary.percent}%)`;
              return (
                <div key={card.key} className="bg-[#27272a] rounded-2xl p-4 border border-zinc-700/30 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">{card.title}</p>
                      <p className="text-sm font-black text-zinc-100 mt-1 truncate">{card.name}</p>
                    </div>
                    <span className={`shrink-0 rounded-xl px-2.5 py-1 text-[9px] font-bold ${summary.hasData ? 'bg-emerald-600/15 text-emerald-300' : 'bg-zinc-900/70 text-zinc-500'}`}>{summary.status}</span>
                  </div>

                  {summary.hasData ? (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl bg-zinc-900/60 p-3 border border-zinc-800/60">
                          <p className="text-[9px] text-zinc-500 font-bold uppercase">Текущий вес</p>
                          <p className="text-lg font-black text-zinc-100 mt-1">{summary.currentWeight != null ? `${summary.currentWeight} кг` : '—'}</p>
                        </div>
                        <div className="rounded-xl bg-zinc-900/60 p-3 border border-zinc-800/60">
                          <p className="text-[9px] text-zinc-500 font-bold uppercase">Изменение</p>
                          <p className={`text-lg font-black mt-1 ${deltaClass}`}>{deltaText}</p>
                          {percentText && <p className="text-[9px] text-zinc-500 font-bold">{percentText}</p>}
                        </div>
                        <div className="rounded-xl bg-zinc-900/60 p-3 border border-zinc-800/60">
                          <p className="text-[9px] text-zinc-500 font-bold uppercase">Записей</p>
                          <p className="text-lg font-black text-zinc-100 mt-1">{summary.count}</p>
                        </div>
                        <div className="rounded-xl bg-zinc-900/60 p-3 border border-zinc-800/60">
                          <p className="text-[9px] text-zinc-500 font-bold uppercase">Лучший вес</p>
                          <p className="text-lg font-black text-zinc-100 mt-1">{summary.bestWeight != null ? `${summary.bestWeight} кг` : '—'}</p>
                        </div>
                      </div>
                      {summary.filteredHistory.length >= 2 ? (
                        <MiniWeightChart
                          title={`${card.title} · ${selectedChallengeProgressPeriod.label.toLowerCase()}`}
                          data={summary.filteredHistory.map(point => point.v)}
                          dates={summary.filteredHistory.map(point => point.d.slice(5))}
                          color={card.color}
                          unit="кг"
                        />
                      ) : (
                        <p className="text-[11px] text-zinc-500 leading-relaxed">Для честного сравнения нужна ещё одна запись в выбранном периоде.</p>
                      )}
                    </>
                  ) : (
                    <div className="rounded-xl bg-zinc-900/60 p-4 border border-zinc-800/60">
                      <p className="text-sm font-bold text-zinc-200">{card.empty}</p>
                      <p className="text-[11px] text-zinc-500 mt-1">Карточка обновится автоматически, когда появятся записи.</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
