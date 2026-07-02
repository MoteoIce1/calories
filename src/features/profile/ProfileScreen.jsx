import { IconUser, IconCalc, IconCheck, IconDrop, IconSave } from '../../components/Icons.jsx';
import { ACTIVITY_LEVELS } from '../../utils/kbju.js';
import { DEFAULT_USUAL_STEPS } from '../../constants/app.js';

// Экран профиля: личные данные, уровень активности, расчёт КБЖУ, норма воды.
export default function ProfileScreen({
  profileData,
  handleProfileChange,
  measuredWeight,
  selectedActivityKey,
  handleUsualStepsChange,
  kbjuPreview,
  applyAutoKbju,
  draftGoals,
  handleDraftGoalChange,
  hasUnsavedGoals,
  onOpenGoalModal,
}) {
  return (
    <div className="space-y-5">
      {/* Личные данные */}
      <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-4">
        <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><IconUser className="w-4 h-4" /> Личные данные</h2>
        <div className="grid grid-cols-2 gap-2">
          {[['male', 'Мужчина'], ['female', 'Женщина']].map(([s, label]) => (
            <button key={s} type="button" onClick={() => handleProfileChange('sex', s)} className={`btn-active rounded-xl p-3 text-sm font-bold border transition-all ${profileData.sex === s ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-[#27272a] text-zinc-300 border-zinc-700/30'}`}>{label}</button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><span className="text-[9px] text-zinc-500 font-bold block mb-1">ВОЗРАСТ</span><input type="number" inputMode="numeric" className="w-full bg-[#27272a] rounded-xl p-3 text-zinc-200 font-bold outline-none border border-zinc-700/30 focus:border-emerald-500 transition-colors" value={profileData.age} onChange={(e) => handleProfileChange('age', e.target.value)} onFocus={(e) => e.target.select()} /></div>
          <div><span className="text-[9px] text-zinc-500 font-bold block mb-1">РОСТ, СМ</span><input type="number" inputMode="numeric" className="w-full bg-[#27272a] rounded-xl p-3 text-zinc-200 font-bold outline-none border border-zinc-700/30 focus:border-emerald-500 transition-colors" value={profileData.height} onChange={(e) => handleProfileChange('height', e.target.value)} onFocus={(e) => e.target.select()} /></div>
          <div><span className="text-[9px] text-zinc-500 font-bold block mb-1">ВЕС, КГ</span><input type="number" inputMode="decimal" step="0.1" disabled={measuredWeight != null} title={measuredWeight != null ? 'Берётся из показателей в «Дневнике»' : undefined} className="w-full bg-[#27272a] rounded-xl p-3 text-zinc-200 font-bold outline-none border border-zinc-700/30 focus:border-emerald-500 transition-colors disabled:opacity-70" value={measuredWeight != null ? measuredWeight : profileData.weight} onChange={(e) => handleProfileChange('weight', e.target.value)} onFocus={(e) => e.target.select()} /></div>
        </div>
        {measuredWeight != null && <p className="text-[10px] text-zinc-600 leading-relaxed">Вес берётся из последних показателей в «Дневнике» ({measuredWeight} кг). Он обновляется автоматически.</p>}
        <div>
          <span className="text-[9px] text-zinc-500 font-bold block mb-2">УРОВЕНЬ АКТИВНОСТИ</span>
          <p className="text-[10px] text-zinc-600 leading-relaxed mb-2">
            Уровень активности — это фиксированная надбавка за NEAT, работу и тренировки. Шаги считаются отдельной строкой.
          </p>
          <div className="flex flex-col gap-2">
            {ACTIVITY_LEVELS.map(l => (
              <button key={l.key} type="button" onClick={() => handleProfileChange('activity', l.key)} className={`btn-active text-left rounded-xl p-3 border transition-all ${selectedActivityKey === l.key ? 'bg-emerald-600/15 border-emerald-600/40' : 'bg-[#27272a] border-zinc-700/30'}`}>
                <span className={`text-sm font-bold ${selectedActivityKey === l.key ? 'text-emerald-300' : 'text-zinc-200'}`}>{l.label}</span>
                <span className="block text-[10px] text-zinc-500 mt-0.5">{l.hint} · +{l.activityCalories} ккал</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="usual-steps" className="text-[9px] text-zinc-500 font-bold block mb-1">ОБЫЧНО ШАГОВ В ДЕНЬ</label>
          <input
            id="usual-steps"
            type="number"
            inputMode="numeric"
            min="0"
            className="w-full bg-[#27272a] rounded-xl p-3 text-zinc-200 font-bold outline-none border border-zinc-700/30 focus:border-emerald-500 transition-colors"
            value={profileData.usualSteps ?? DEFAULT_USUAL_STEPS}
            onChange={(e) => handleUsualStepsChange(e.target.value)}
            onFocus={(e) => e.target.select()}
          />
          <p className="text-[10px] text-zinc-600 leading-relaxed mt-1.5">Шаги добавляются к расходу отдельно: шаги × 0.04 ккал. В активности они не спрятаны.</p>
        </div>
      </div>

      {/* Расчёт КБЖУ */}
      <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-4">
        <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><IconCalc className="w-4 h-4" /> Расчёт КБЖУ</h2>
        <div className="grid grid-cols-2 gap-2">
          {[['auto', 'Автоматически'], ['manual', 'Вручную']].map(([m, label]) => (
            <button key={m} type="button" onClick={() => handleProfileChange('mode', m)} className={`btn-active rounded-xl p-3 text-sm font-bold border transition-all ${profileData.mode === m ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-[#27272a] text-zinc-300 border-zinc-700/30'}`}>{label}</button>
          ))}
        </div>
        {profileData.mode === 'auto' ? (
          <>
            <div>
              <span className="text-[9px] text-zinc-500 font-bold block mb-1">ДЕФИЦИТ, ККАЛ/ДЕНЬ</span>
              <input type="number" inputMode="numeric" className="w-full bg-[#27272a] rounded-xl p-3 text-zinc-200 font-bold outline-none border border-zinc-700/30 focus:border-emerald-500 transition-colors" value={profileData.deficit} onChange={(e) => handleProfileChange('deficit', e.target.value === '' ? '' : parseInt(e.target.value))} onFocus={(e) => e.target.select()} />
              <p className="text-[10px] text-zinc-600 leading-relaxed mt-1.5">По умолчанию 500 — комфортное похудение ~0,5 кг/нед. Поставьте 0, чтобы удерживать вес, или отрицательное значение — для набора массы.</p>
            </div>
            {kbjuPreview ? (
              <div className="bg-[#27272a] rounded-2xl p-4 border border-zinc-700/30">
                <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-3">Расчёт по формуле Миффлина</p>
                <div className="grid grid-cols-2 gap-y-2 text-sm">
                  <span className="text-zinc-400">Базовый обмен (BMR)</span><span className="text-right font-bold text-zinc-200">{kbjuPreview.bmr} ккал</span>
                  <span className="text-zinc-400">Шаги</span><span className="text-right font-bold text-zinc-200">{kbjuPreview.steps} × {kbjuPreview.kcalPerStep.toFixed(2)} = {kbjuPreview.stepsCalories} ккал</span>
                  <span className="text-zinc-400">Активность</span><span className="text-right font-bold text-zinc-200">{kbjuPreview.activityLabel}, +{kbjuPreview.activityCalories} ккал</span>
                  <span className="text-zinc-400">Норма (TDEE)</span><span className="text-right font-bold text-zinc-200">{kbjuPreview.maintenance} ккал</span>
                  <span className="text-zinc-400">Цель калорий</span><span className="text-right font-bold text-emerald-400">{kbjuPreview.calories} ккал</span>
                  <span className="text-zinc-400">Белок</span><span className="text-right font-bold text-indigo-400">{kbjuPreview.protein} г</span>
                  <span className="text-zinc-400">Жиры</span><span className="text-right font-bold text-amber-400">{kbjuPreview.fats} г</span>
                  <span className="text-zinc-400">Углеводы</span><span className="text-right font-bold text-blue-400">{kbjuPreview.carbs} г</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-amber-400/90 leading-relaxed">Заполните пол, возраст, рост и вес выше — расчёт появится здесь.</p>
            )}
            <button type="button" onClick={applyAutoKbju} disabled={!kbjuPreview} className="btn-active w-full bg-emerald-600 text-white rounded-xl p-4 font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-35"><IconCheck className="w-5 h-5" /> Рассчитать и применить</button>
          </>
        ) : (
          <p className="text-xs text-zinc-500 leading-relaxed">Ручной режим: задайте КБЖУ самостоятельно во вкладке «База» → «Ваши цели».</p>
        )}
      </div>

      {/* Норма воды */}
      <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-3">
        <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><IconDrop className="w-4 h-4" /> Норма воды</h2>
        <div><span className="text-[9px] text-zinc-500 font-bold block mb-1">ЦЕЛЬ, МЛ/ДЕНЬ</span><input type="number" inputMode="numeric" className="w-full bg-[#27272a] rounded-xl p-3 text-blue-400 font-bold outline-none border border-zinc-700/30 focus:border-emerald-500 transition-colors" value={draftGoals.waterGoal} onChange={(e) => handleDraftGoalChange('waterGoal', e.target.value === '' ? '' : parseInt(e.target.value))} onFocus={(e) => e.target.select()} /></div>
        {hasUnsavedGoals && <button type="button" onClick={onOpenGoalModal} className="btn-active w-full bg-indigo-600 text-white p-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2"><IconSave className="w-5 h-5" /> Сохранить цели</button>}
      </div>

    </div>
  );
}
