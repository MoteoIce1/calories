import { IconTrash, IconTrophy, IconFlame } from '../../components/Icons.jsx';
import { MiniWeightChart } from '../../components/Charts.jsx';

// Карточка спора: статус, участники с целями, мини-графики динамики, действия.
export default function ChallengeCard({ challenge: c, standing: st, uid, onRemove, onAccept }) {
  const isInvite = c.status === 'pending' && !(c.acceptedBy || []).includes(uid);
  const isWaiting = c.status === 'pending' && (c.acceptedBy || []).includes(uid);
  const won = st.finished && st.winnerUid === uid && !st.tie;
  const lost = st.finished && st.winnerUid && st.winnerUid !== uid && !st.tie;
  const statusLine = st.cancelled ? 'отменён' : st.finished ? 'завершён' : (st.daysLeft < 0 ? 'подводим итог…' : `осталось ${Math.max(0, st.daysLeft)} дн`);
  const winnerName = st.winnerUid ? (st.rows.find(r => r.uid === st.winnerUid)?.name || 'Соперник') : '';
  return (
    <div className={`card-enter rounded-3xl p-4 border ${st.finished ? 'bg-[#141416] border-zinc-800/60' : 'bg-[#18181b] border-zinc-800/50'} ${st.cancelled ? 'opacity-70' : ''}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-black text-zinc-100">{st.tp.label}</p>
          <p className="text-[10px] text-zinc-500 mt-0.5">У каждого своя цель · {statusLine}</p>
        </div>
        <button type="button" onClick={() => onRemove(c)} className="btn-active text-zinc-700 active:text-red-400 p-1 shrink-0"><IconTrash className="w-4 h-4" /></button>
      </div>
      {st.finished && (
        <div className={`mb-3 rounded-xl px-3 py-2.5 border flex items-center gap-2 ${won ? 'bg-emerald-600/15 border-emerald-600/40 text-emerald-200' : lost ? 'bg-zinc-800/60 border-zinc-700/40 text-zinc-300' : 'bg-sky-500/15 border-sky-400/30 text-sky-100'}`}>
          <IconTrophy className={`w-5 h-5 shrink-0 ${won ? 'text-amber-400' : lost ? 'text-zinc-400' : 'text-sky-300'}`} />
          <span className="text-xs font-black">{st.tie || !st.winnerUid ? 'Ничья — оба молодцы!' : won ? '🏆 Вы победили!' : `Победил ${winnerName}`}</span>
        </div>
      )}
      {st.cancelled && <p className="mb-3 text-[10px] text-zinc-500 text-center">Спор отменён{c.cancelledBy && c.cancelledBy !== uid ? ' соперником' : ''}.</p>}
      <div className="space-y-2">
        {st.rows.map(r => {
          const goodDelta = r.delta != null && r.delta !== 0 && (st.tp.dir === 'down' ? r.delta < 0 : r.delta > 0);
          const highlight = st.finished ? st.winnerUid === r.uid && !st.tie : st.leaderUid === r.uid;
          return (
          <div key={r.uid} className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 border ${highlight ? 'bg-emerald-600/15 border-emerald-600/40' : 'bg-[#27272a] border-zinc-700/30'}`}>
            <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5 min-w-0 truncate">{highlight && <IconFlame className="w-4 h-4 text-amber-400 shrink-0" />}{r.name}</span>
            <span className="shrink-0 text-right">
              <span className={`text-sm font-black ${r.reached ? 'text-emerald-400' : 'text-zinc-200'}`}>{typeof r.value === 'number' ? Math.round(r.value * 10) / 10 : '—'}{r.reached ? ' ✓' : ''}</span>
              {typeof r.target === 'number' && <span className="text-[10px] text-zinc-500 font-bold"> {st.tp.dir === 'down' ? '→ ≤' : '→ ≥'}{r.target} {st.tp.unit}</span>}
              {r.delta != null && r.delta !== 0 && <span className={`block text-[9px] font-bold ${goodDelta ? 'text-emerald-400' : 'text-red-400'}`}>{r.delta > 0 ? '▲ +' : '▼ −'}{Math.abs(r.delta)} {st.tp.unit} от старта</span>}
              {typeof r.start === 'number' && (r.delta == null || r.delta === 0) && <span className="block text-[9px] text-zinc-500">старт {Math.round(r.start * 10) / 10} {st.tp.unit}</span>}
            </span>
          </div>
          );
        })}
      </div>
      {['weight', 'fat', 'steps', 'waist'].includes(st.tp.key) && st.rows.some(r => (r.history || []).length >= 2) && (
        <div className="mt-3 space-y-2">
          <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">Динамика · {st.tp.short.toLowerCase()}</p>
          {st.rows.map(r => {
            const hist = r.history || [];
            if (hist.length < 2) return null;
            return <MiniWeightChart key={r.uid} title={`${r.name} · ${st.tp.short.toLowerCase()}`} data={hist.map(p => p.v)} dates={hist.map(p => { const a = (p.d || '').split('-'); return a.length === 3 ? `${a[2]}.${a[1]}` : p.d; })} color={(st.finished ? st.winnerUid === r.uid : st.leaderUid === r.uid) ? '#34d399' : '#a3e635'} unit={st.tp.unit} positiveIsGood={st.tp.dir === 'up'} />;
          })}
        </div>
      )}
      {isInvite && (
        <div className="flex gap-2 mt-3">
          <button type="button" onClick={() => onAccept(c)} className="btn-active flex-1 bg-emerald-600 text-white rounded-xl p-3 text-xs font-bold">Принять вызов</button>
          <button type="button" onClick={() => onRemove(c)} className="btn-active flex-1 bg-zinc-800 text-zinc-400 rounded-xl p-3 text-xs font-bold">Отказаться</button>
        </div>
      )}
      {isWaiting && <p className="text-[10px] text-zinc-500 mt-2 text-center">Ждём, пока соперник примет вызов…</p>}
    </div>
  );
}
