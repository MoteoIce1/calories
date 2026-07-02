import { IconTimer, IconTrash } from '../../components/Icons.jsx';
import { MiniWeightChart } from '../../components/Charts.jsx';
import { progressPeriods } from '../../utils/progress.js';
import { getLocalDateString, displayDate } from '../../utils/date.js';
import { BODY_MEASURE_FIELDS, BODY_PHOTO_LABELS } from '../../constants.js';
import { getBodyPhotoSrc, getBodyPhotoLabel, countBodyPhotos } from './bodyPhotos.js';

// Экран прогресса: графики тела и замеров, редактор записей с фото и сравнение.
export default function ProgressScreen({
  showBodyReminder,
  latestBodyDate,
  dismissBodyReminder,
  progressChartPeriod,
  setProgressChartPeriod,
  metricChartSeries,
  metricChartLabels,
  progressBodyMeasureSeries,
  progressBodyMeasureDates,
  showBodyEditor,
  toggleBodyEditor,
  addBodyEntry,
  bodyDraft,
  setBodyDraft,
  handleBodyMeasureChange,
  handleBodyPhotoFiles,
  handleBodyDraftPhotoSlot,
  bodyEntryOptions,
  compareBodyIds,
  setCompareBodyIds,
  comparePhotoIndexes,
  setComparePhotoIndexes,
  compareBodyA,
  compareBodyB,
  comparePhotoA,
  comparePhotoB,
  setBodyPhotoZoom,
  setShowBodyPhotoCompare,
  bodyEntries,
  sortedBodyEntries,
  deleteBodyEntry,
  handleBodyEntryPhotoSlot,
  setSingleBodyPhotoZoom,
  setSingleBodyPhoto,
  removeBodyEntryPhoto,
}) {
  return (
    <div className="progress-panel space-y-4 w-full max-w-full">
      {showBodyReminder && (
        <div className="card-enter bg-amber-500/10 border border-amber-400/30 rounded-3xl p-4 flex gap-3 items-start max-w-full">
          <div className="w-10 h-10 shrink-0 rounded-2xl bg-amber-400/15 flex items-center justify-center"><IconTimer className="w-5 h-5 text-amber-400" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-100">Добавьте замеры (талия и др.) и фото</p>
            <p className="text-xs text-amber-200/70 mt-1">{latestBodyDate ? `Последняя запись была ${displayDate(latestBodyDate).toLowerCase()}.` : 'Замеров пока нет.'} Фиксируйте обхваты и фото раз в 2 недели — так будет проще видеть изменения.</p>
          </div>
          <button type="button" onClick={dismissBodyReminder} className="btn-active shrink-0 text-[10px] font-bold text-amber-100/70 bg-amber-950/40 rounded-xl px-3 py-2">Позже</button>
        </div>
      )}

      <div className="card-enter bg-[#18181b] rounded-3xl p-4 border border-zinc-800/50 space-y-3">
        <div>
          <h2 className="text-sm font-bold text-zinc-100">Период графиков</h2>
          <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mt-1">Фильтр от сегодняшней даты назад</p>
        </div>
        <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1 -mx-1 px-1">
          {progressPeriods.map(period => {
            const active = progressChartPeriod === period.key;
            return (
              <button
                key={period.key}
                type="button"
                onClick={() => setProgressChartPeriod(period.key)}
                aria-pressed={active}
                className={`btn-active shrink-0 cursor-pointer rounded-2xl px-3.5 py-2 text-[10px] font-black uppercase tracking-widest border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 ${active ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-950/20' : 'bg-zinc-900/70 text-zinc-400 border-zinc-800/70 hover:text-zinc-200 hover:border-zinc-700'}`}
              >
                {period.label}
              </button>
            );
          })}
        </div>
      </div>

      {metricChartSeries.some(series => series.data.filter(v => v !== null && v !== undefined && v !== '' && !isNaN(Number(v))).length >= 2) && (
        <div className="space-y-3">
          <h2 className="px-1 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Графики тела</h2>
          {metricChartSeries.map(series => (
            <MiniWeightChart key={series.key} title={series.title} data={series.data} dates={metricChartLabels} color={series.color} unit={series.unit} />
          ))}
        </div>
      )}

      {progressBodyMeasureSeries.length > 0 && (
        <div className="space-y-3">
          <h2 className="px-1 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Графики замеров</h2>
          {progressBodyMeasureSeries.map(series => (
            <MiniWeightChart key={series.key} title={series.label} data={series.data} dates={progressBodyMeasureDates} color={series.color} unit="см" />
          ))}
        </div>
      )}

      <button type="button" onClick={toggleBodyEditor} className="btn-active w-full rounded-3xl bg-zinc-900/70 border border-zinc-800/70 p-4 flex items-center justify-between">
        <span className="text-sm font-black text-zinc-100">{showBodyEditor ? 'Скрыть фото и замеры' : 'Открыть фото и замеры'}</span>
        <span className="text-lg text-zinc-500">{showBodyEditor ? '−' : '+'}</span>
      </button>

      {showBodyEditor && (
      <div className="body-editor-panel space-y-6">
      <form onSubmit={addBodyEntry} className="bg-[#18181b] rounded-3xl p-4 border border-zinc-800/50 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-zinc-100">Новая запись</h2>
            <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mt-1">Мерки тела и фото</p>
          </div>
          <div className="relative shrink-0 bg-zinc-900 rounded-xl px-3 py-2 border border-zinc-800/70">
            <span className="text-xs font-bold text-zinc-200">{displayDate(bodyDraft.date)}</span>
            <input type="date" className="absolute inset-0 opacity-0" value={bodyDraft.date} max={getLocalDateString(new Date())} onChange={(e) => setBodyDraft(prev => ({ ...prev, date: e.target.value }))} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {BODY_MEASURE_FIELDS.map(field => (
            <label key={field.key} className="bg-[#27272a] rounded-2xl p-3 border border-zinc-700/50">
              <span className="block text-[9px] text-zinc-500 uppercase font-bold tracking-widest mb-2 leading-tight">{field.label}</span>
              <div className="flex items-baseline gap-1">
                <input type="number" step="0.1" inputMode="decimal" className="w-full bg-transparent text-lg font-black text-zinc-100 outline-none" value={bodyDraft.measures[field.key]} onChange={(e) => handleBodyMeasureChange(field.key, e.target.value)} onFocus={(e) => e.target.select()} />
                <span className="text-[10px] text-zinc-500 font-bold">{field.unit}</span>
              </div>
            </label>
          ))}
        </div>

        <div className="bg-zinc-900/50 rounded-2xl p-3 border border-zinc-800/60">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-zinc-200">Фото прогресса</p>
              <p className="text-[10px] text-zinc-500 mt-1">До 3 фото: анфас, бок, спина. Они сжимаются перед сохранением.</p>
            </div>
            <label className="btn-active shrink-0 rounded-xl bg-indigo-500/20 text-indigo-200 px-3 py-2 text-[10px] font-bold uppercase tracking-widest border border-indigo-400/20">
              Добавить
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { handleBodyPhotoFiles(e.target.files); e.target.value = ''; }} />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            {BODY_PHOTO_LABELS.map((label, idx) => {
              const photo = bodyDraft.photos[idx];
              const src = getBodyPhotoSrc(photo);
              return (
                <label key={label} className="relative aspect-[3/4] rounded-xl overflow-hidden border border-zinc-700/60 bg-zinc-950 btn-active cursor-pointer block">
                  {src ? (
                    <img src={src} className="w-full h-full object-cover pointer-events-none" alt={label} />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center px-2 text-center gap-1 bg-zinc-900/70 pointer-events-none">
                      <span className="text-lg text-zinc-600">+</span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">{label}</span>
                    </div>
                  )}
                  <span className="absolute left-1 bottom-1 rounded-full bg-black/60 px-2 py-0.5 text-[8px] font-bold text-white/80 pointer-events-none">{label}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { handleBodyDraftPhotoSlot(idx, e.target.files); e.target.value = ''; }} />
                  {src && <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setBodyDraft(prev => ({ ...prev, photos: (prev.photos || []).map((item, itemIdx) => itemIdx === idx ? null : item) })); }} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white text-xs z-10">×</button>}
                </label>
              );
            })}
          </div>
        </div>

        <button type="submit" className="btn-active w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-rose-500 text-white rounded-2xl p-4 font-black transition-all">Сохранить замеры</button>
      </form>

      {bodyEntryOptions.length >= 2 && (
        <div className="bg-[#18181b] rounded-3xl p-4 border border-zinc-800/50 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-zinc-100">Сравнение</h2>
            <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mt-1">Выбери две записи</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[0, 1].map(idx => (
              <select key={idx} className="w-full min-w-0 bg-zinc-900 border border-zinc-800 rounded-2xl p-3 text-xs font-bold outline-none" value={compareBodyIds[idx] || (idx === 0 ? compareBodyA?.id : compareBodyB?.id) || ''} onChange={(e) => { setCompareBodyIds(prev => idx === 0 ? [e.target.value, prev[1]] : [prev[0], e.target.value]); setComparePhotoIndexes(prev => idx === 0 ? [0, prev[1]] : [prev[0], 0]); }}>
                {bodyEntryOptions.map(entry => <option key={entry.id} value={entry.id}>{displayDate(entry.date)}</option>)}
              </select>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[compareBodyA, compareBodyB].map((entry, idx) => (
              <select key={idx} className="w-full min-w-0 bg-zinc-900/70 border border-zinc-800 rounded-2xl p-3 text-xs font-bold outline-none" value={comparePhotoIndexes[idx]} onChange={(e) => setComparePhotoIndexes(prev => idx === 0 ? [Number(e.target.value), prev[1]] : [prev[0], Number(e.target.value)])}>
                {BODY_PHOTO_LABELS.map((label, photoIdx) => <option key={label} value={photoIdx}>{label}{getBodyPhotoSrc(entry?.photos?.[photoIdx]) ? '' : ' (нет)'}</option>)}
              </select>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Сравнение фото</p>
              <button type="button" onClick={() => { setBodyPhotoZoom(false); setShowBodyPhotoCompare(true); }} className="btn-active text-[10px] font-bold text-violet-200 bg-violet-500/15 border border-violet-400/15 rounded-xl px-3 py-2">На весь экран</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[[compareBodyA, comparePhotoA], [compareBodyB, comparePhotoB]].map(([entry, photo], idx) => (
                <div key={entry?.id || idx} className="rounded-2xl overflow-hidden bg-zinc-950 border border-zinc-800">
                  <div className="aspect-[9/16] bg-zinc-900 relative">
                    {getBodyPhotoSrc(photo) ? <img src={getBodyPhotoSrc(photo)} className="w-full h-full object-contain" /> : <div className="h-full flex items-center justify-center text-[10px] text-zinc-600 font-bold uppercase text-center px-2">Нет фото</div>}
                    <span className="absolute left-2 top-2 rounded-full bg-black/30 px-2 py-1 text-[9px] font-black text-white/65">{idx === 0 ? 'Было' : 'Стало'}</span>
                  </div>
                  <p className="p-2 text-center text-[10px] font-bold text-zinc-400">{entry ? `${displayDate(entry.date)} · ${getBodyPhotoLabel(photo, comparePhotoIndexes[idx])}` : '—'}</p>
                </div>
              ))}
            </div>
          </div>

          {compareBodyA && compareBodyB && (
            <div className="space-y-2">
              {BODY_MEASURE_FIELDS.map(field => {
                const a = Number(compareBodyA.measures?.[field.key]);
                const b = Number(compareBodyB.measures?.[field.key]);
                const hasBoth = !isNaN(a) && !isNaN(b) && a > 0 && b > 0;
                const delta = hasBoth ? Math.round((b - a) * 10) / 10 : null;
                return (
                  <div key={field.key} className="flex items-center justify-between bg-zinc-900/50 rounded-2xl p-3 border border-zinc-800/50">
                    <span className="text-xs font-bold text-zinc-300">{field.label}</span>
                    <div className="text-right">
                      <span className="text-xs text-zinc-500">{hasBoth ? `${a} → ${b} см` : '—'}</span>
                      {hasBoth && <span className={`ml-2 text-sm font-black ${delta < 0 ? 'text-emerald-400' : delta > 0 ? 'text-rose-400' : 'text-zinc-500'}`}>{delta > 0 ? '+' : ''}{delta}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        <h2 className="px-1 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">История ({bodyEntries.length})</h2>
        {sortedBodyEntries.map(entry => (
          <div key={entry.id} className="bg-[#18181b] rounded-3xl p-4 border border-zinc-800/50">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-zinc-100">{displayDate(entry.date)}</p>
                <p className="text-[10px] text-zinc-500 mt-1">{countBodyPhotos(entry.photos)} фото</p>
              </div>
              <div className="shrink-0">
                <button type="button" onClick={() => deleteBodyEntry(entry.id)} className="btn-active text-zinc-700 active:text-red-400 p-2"><IconTrash className="w-5 h-5" /></button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {BODY_PHOTO_LABELS.map((label, idx) => {
                const photo = entry.photos?.[idx];
                const src = getBodyPhotoSrc(photo);
                return (
                  <label key={label} className="relative aspect-[3/4] rounded-xl overflow-hidden border border-zinc-700/60 bg-zinc-950 btn-active cursor-pointer block">
                    {src ? (
                      <img src={src} className="w-full h-full object-cover pointer-events-none" alt={label} />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center px-2 text-center gap-1 bg-zinc-900/70 pointer-events-none">
                        <span className="text-lg text-zinc-600">+</span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">{label}</span>
                      </div>
                    )}
                    <span className="absolute left-1 bottom-1 rounded-full bg-black/60 px-2 py-0.5 text-[8px] font-bold text-white/80 pointer-events-none">{label}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { handleBodyEntryPhotoSlot(entry.id, idx, e.target.files); e.target.value = ''; }} />
                    {src && (
                      <>
                        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSingleBodyPhotoZoom(false); setSingleBodyPhoto({ src, date: entry.date, label: getBodyPhotoLabel(photo, idx) }); }} className="absolute top-1 left-1 w-6 h-6 rounded-full bg-black/70 text-white text-[10px] z-10">⤢</button>
                        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeBodyEntryPhoto(entry.id, idx); }} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white text-[10px] z-10">×</button>
                      </>
                    )}
                  </label>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {BODY_MEASURE_FIELDS.map(field => entry.measures?.[field.key] ? (
                <div key={field.key} className="bg-zinc-900/50 rounded-xl p-2 border border-zinc-800/40">
                  <p className="text-[9px] text-zinc-500 uppercase font-bold tracking-widest leading-tight">{field.label}</p>
                  <p className="text-sm font-black text-zinc-200 mt-1">{entry.measures[field.key]} см</p>
                </div>
              ) : null)}
            </div>
          </div>
        ))}
      </div>
      </div>
      )}
    </div>
  );
}
