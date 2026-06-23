import { motion } from 'framer-motion';
import { movingAverage } from '../utils/stats.js';

    const MacroBar = ({ label, current, goal, colorClass, bgClass }) => {
      const numGoal = Number(goal) || 1;
      const progress = Math.min(100, (current / numGoal) * 100);
      const remaining = Math.max(0, (Number(goal) || 0) - Math.round(current));
      return (
        <div className="macro-bar w-full">
          <div className="flex justify-between items-end mb-1">
            <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">{label}</p>
            <span className={`text-[11px] font-bold ${colorClass}`}>{Math.round(current)} / {goal || 0}</span>
          </div>
          <div className="progress-track h-2 w-full bg-zinc-900 rounded-full overflow-hidden mb-1">
            <motion.div className={`h-full ${bgClass}`} initial={false} animate={{ width: `${progress}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }}></motion.div>
          </div>
          <p className="text-[9px] text-zinc-500 font-bold uppercase text-right opacity-80">Ост: {remaining}</p>
        </div>
      );
    };

    const ProgressChart = ({ title, data, dates, color, showAverage, averageMode = 'moving7' }) => {
      if (!data || data.length < 2) return null;
      const validPoints = data
        .map((v, i) => ({ v: Number(v), i, raw: data[i] }))
        .filter(p => p.raw !== null && p.raw !== undefined && p.raw !== '' && !isNaN(p.v));
      if (validPoints.length < 2) return null;

      const W = 320, H = 150, padL = 40, padR = 14, padT = 12, padB = 24;
      const plotW = W - padL - padR, plotH = H - padT - padB;

      const values = validPoints.map(p => p.v);
      const min = Math.min(...values), max = Math.max(...values);
      const range = max - min === 0 ? 1 : max - min;
      const pad = range * 0.15;
      const yMin = min - pad, yMax = max + pad;
      const n = data.length;

      const xFor = (i) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
      const yFor = (v) => padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

      const rawLine = validPoints.map(p => `${xFor(p.i).toFixed(1)},${yFor(p.v).toFixed(1)}`).join(' ');

      let avgLine = null;
      if (showAverage) {
        if (averageMode === 'period') {
          const avgValue = values.reduce((sum, v) => sum + v, 0) / values.length;
          avgLine = `${xFor(0).toFixed(1)},${yFor(avgValue).toFixed(1)} ${xFor(n - 1).toFixed(1)},${yFor(avgValue).toFixed(1)}`;
        } else {
          const avg = movingAverage(data, 7);
          const avgPts = avg.map((v, i) => ({ v, i })).filter(p => p.v !== null);
          if (avgPts.length >= 2) avgLine = avgPts.map(p => `${xFor(p.i).toFixed(1)},${yFor(p.v).toFixed(1)}`).join(' ');
        }
      }

      const yTicks = [yMax, (yMax + yMin) / 2, yMin];

      return (
        <div className="report-chart avoid-break w-full box-border font-sans bg-white border border-slate-200 rounded-xl p-3">
          <h4 className="text-sm font-bold mb-2 text-center text-slate-800">{title}</h4>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
            {yTicks.map((t, k) => (
              <g key={k}>
                <line x1={padL} y1={yFor(t)} x2={W - padR} y2={yFor(t)} stroke="rgba(0, 0, 0, 0.08)" strokeWidth="1" />
                <text x={padL - 5} y={yFor(t) + 3} textAnchor="end" fontSize="8" fill="#94a3b8">{t.toFixed(1)}</text>
              </g>
            ))}
            <polyline points={rawLine} fill="none" stroke={color} strokeWidth={showAverage ? 1 : 2} strokeOpacity={showAverage ? 0.3 : 1} strokeLinejoin="round" strokeLinecap="round" />
            {validPoints.map((p, k) => (
              <circle key={k} cx={xFor(p.i)} cy={yFor(p.v)} r="2.2" fill={color} fillOpacity={showAverage ? 0.35 : 1} />
            ))}
            {avgLine && <polyline points={avgLine} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
            <text x={padL} y={H - 7} textAnchor="start" fontSize="8" fill="#94a3b8">{dates[validPoints[0].i]}</text>
            <text x={W - padR} y={H - 7} textAnchor="end" fontSize="8" fill="#94a3b8">{dates[validPoints[validPoints.length - 1].i]}</text>
          </svg>
          {showAverage && <p className="text-[8px] text-slate-500 mt-1 text-center">{averageMode === 'period' ? 'Линия — среднее за выбранный период, точки — дни' : 'Линия — среднее за 7 дней, точки — замеры'}</p>}
        </div>
      );
    };

    const MiniWeightChart = ({ title = 'Динамика веса', data, dates, color = '#a3e635', unit = 'кг' }) => {
      const points = (data || [])
        .map((v, i) => ({ v: Number(v), i, raw: v }))
        .filter(p => p.raw !== null && p.raw !== undefined && p.raw !== '' && !isNaN(p.v));
      if (points.length < 2) return null;

      const W = 320, H = 96, padL = 34, padR = 10, padT = 12, padB = 16;
      const values = points.map(p => p.v);
      const min = Math.min(...values), max = Math.max(...values);
      const range = max - min || 1;
      const yMin = Math.floor(min - range * 0.12), yMax = Math.ceil(max + range * 0.12);
      const plotW = W - padL - padR, plotH = H - padT - padB;
      const xFor = (i) => padL + (data.length <= 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
      const yFor = (v) => padT + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;
      const line = points.map(p => `${xFor(p.i).toFixed(1)},${yFor(p.v).toFixed(1)}`).join(' ');
      const yTicks = Array.from(new Set([yMax, Math.round((yMax + yMin) / 2), yMin]));
      const first = points[0].v;
      const last = points[points.length - 1].v;
      const delta = Math.round((last - first) * 10) / 10;

      return (
        <div className="card-enter bg-zinc-900/40 rounded-2xl border border-zinc-800/40 p-3 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-widest">{title}</span>
            <span className={`text-[11px] font-bold ${delta > 0 ? 'text-red-400' : delta < 0 ? 'text-emerald-400' : 'text-zinc-500'}`}>{delta > 0 ? '+' : ''}{delta} {unit}</span>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block">
            {yTicks.map((tick) => (
              <g key={tick}>
                <line x1={padL} y1={yFor(tick)} x2={W - padR} y2={yFor(tick)} stroke="rgba(255, 255, 255, 0.08)" strokeWidth="1" />
                <text x={padL - 5} y={yFor(tick) + 3} textAnchor="end" fontSize="8" fill="#8b8b91">{tick}</text>
              </g>
            ))}
            <polyline points={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            {points.map((p, idx) => <circle key={idx} cx={xFor(p.i)} cy={yFor(p.v)} r="2.2" fill={color} />)}
            <text x={padL} y={H - 2} fontSize="9" fill="#8b8b91">{dates[points[0].i]}</text>
            <text x={W - padR} y={H - 2} textAnchor="end" fontSize="9" fill="#8b8b91">{dates[points[points.length - 1].i]}</text>
          </svg>
        </div>
      );
    };

export { MacroBar, ProgressChart, MiniWeightChart };
