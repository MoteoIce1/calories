import { motion, AnimatePresence } from 'framer-motion';
import { IconCalc, IconChevronLeft, IconChevronRight, IconSteps, IconRefresh, IconDumbbell, IconCheck, IconDrop, IconMinus, IconPlus, IconSearch, IconClose, IconTrash } from '../../components/Icons.jsx';
import AnimatedNumber from '../../components/AnimatedNumber.jsx';
import { MacroBar } from '../../components/Charts.jsx';
import { getLocalDateString, displayDate } from '../../utils/date.js';
import { DAILY_BODY_METRICS, WATER_QUICK } from '../../constants/app.js';

// Экран дневника: дата, показатели тела, КБЖУ и активность, вода, приёмы пищи.
export default function DiaryScreen(props) {
  const {
    showKbjuRecalc, kbjuPreview, goals, applyAutoKbju, dismissKbjuRecalc,
    currentDate, setCurrentDate,
    blocks,
    totalCals, dailyAvailableCalories, calsColorClass, displayCals, calsLabel, isOver, progressCals,
    todaySteps, stepCaloriesDelta, refreshCurrentDayVitals, isRefreshingDay, uid, handleUpdateSteps,
    toggleWorkout, dailyWorkouts,
    extraActivityCalories, openExtraActivityModal, todayExtraActivities, removeExtraActivity,
    totalPro, totalFats, totalCarbs, activeGoals, dailyCarbGoal, proteinPerKg, proteinGoalPerKg,
    dailyMetrics, handleUpdateMetrics,
    todayWater, waterGoal, waterProgress, addWater, customWater, setCustomWater, addCustomWater, resetWater,
    mealFormRef, handleAddLog,
    onGoToFoodBase,
    foodSearchRef, foodSearch, setFoodSearch,
    favScrollRef, favoriteMealFoods, selectedFoodId, clearFoodSelection, selectFood,
    mealListScrollRef, allMealFoods,
    gramsInputRef, gramsInput, setGramsInput,
    currentDayLogs, editingLogId, setEditingLogId, editValue, setEditValue, modifier, setModifier, submitEdit, foods, deleteLog,
  } = props;

  return (
    <div className="space-y-4">
      {showKbjuRecalc && (
        <div className="card-enter bg-amber-500/10 border border-amber-400/30 rounded-3xl p-4 flex gap-3 items-start">
          <div className="w-10 h-10 shrink-0 rounded-2xl bg-amber-400/15 flex items-center justify-center"><IconCalc className="w-5 h-5 text-amber-400" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-100">Пора пересчитать КБЖУ</p>
            <p className="text-xs text-amber-200/70 mt-1">Замеры изменились — по формуле выходит {kbjuPreview.calories} ккал вместо {goals.calories}. Обновить цели?</p>
            <button type="button" onClick={applyAutoKbju} className="btn-active mt-2 bg-amber-400 text-amber-950 rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-widest">Пересчитать</button>
          </div>
          <button type="button" onClick={dismissKbjuRecalc} className="btn-active shrink-0 text-[10px] font-bold text-amber-100/70 bg-amber-950/40 rounded-xl px-3 py-2">Позже</button>
        </div>
      )}
      <div className="date-toolbar card-enter flex items-center justify-between bg-[#18181b] rounded-2xl p-1 border border-zinc-800/50">
        <button onClick={() => {const d = new Date(currentDate); d.setDate(d.getDate()-1); setCurrentDate(getLocalDateString(d));}} className="btn-active p-3 text-zinc-400"><IconChevronLeft className="w-5 h-5" /></button>
        <div className="relative font-bold text-sm text-zinc-200 flex items-center justify-center cursor-pointer px-4">
          {displayDate(currentDate)}
          <input type="date" className="absolute opacity-0 top-0 left-0 w-full h-full cursor-pointer" value={currentDate} max={getLocalDateString(new Date())} onChange={(e) => { if(e.target.value) setCurrentDate(e.target.value); }} />
        </div>
        <button onClick={() => {const d = new Date(currentDate); d.setDate(d.getDate()+1); setCurrentDate(getLocalDateString(d));}} disabled={currentDate === getLocalDateString(new Date())} className="btn-active p-3 text-zinc-400 disabled:opacity-20"><IconChevronRight className="w-5 h-5" /></button>
      </div>

      {blocks.bodyMetrics && (
        <div className="section-card card-enter bg-[#18181b] rounded-3xl p-4 border border-zinc-800/50 space-y-4">
          <h2 className="section-legend text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Показатели тела</h2>
          <div className="metric-date-nav flex items-center w-full min-h-14 bg-zinc-900 rounded-2xl border border-zinc-800/70 p-1">
            <button
              type="button"
              onClick={() => {
                const date = new Date(currentDate);
                date.setDate(date.getDate() - 1);
                setCurrentDate(getLocalDateString(date));
              }}
              className="btn-active h-11 w-14 shrink-0 rounded-xl text-zinc-400 flex items-center justify-center"
              aria-label="Предыдущий день"
            >
              <IconChevronLeft className="w-7 h-7" />
            </button>
            <div className="relative flex-1 self-stretch flex items-center justify-center">
              <span className="text-sm font-bold text-zinc-200">{displayDate(currentDate)}</span>
              <input type="date" aria-label="Дата показателей тела" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" value={currentDate} max={getLocalDateString(new Date())} onChange={(e) => { if(e.target.value) setCurrentDate(e.target.value); }} />
            </div>
            <button
              type="button"
              onClick={() => {
                const date = new Date(currentDate);
                date.setDate(date.getDate() + 1);
                setCurrentDate(getLocalDateString(date));
              }}
              disabled={currentDate === getLocalDateString(new Date())}
              className="btn-active h-11 w-14 shrink-0 rounded-xl text-zinc-400 flex items-center justify-center disabled:opacity-20"
              aria-label="Следующий день"
            >
              <IconChevronRight className="w-7 h-7" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {DAILY_BODY_METRICS.map((metric) => (
              <div key={metric.key} className="bg-[#27272a] rounded-xl p-2 flex flex-col items-center border border-zinc-700/50 focus-within:border-emerald-500">
                <label htmlFor={`daily-metric-${metric.key}`} className="text-[8px] text-zinc-400 uppercase font-bold tracking-widest mb-1 text-center leading-tight">{metric.label}</label>
                <input
                  id={`daily-metric-${metric.key}`}
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0"
                  className="w-full bg-transparent text-center text-sm font-bold text-zinc-200 outline-none"
                  value={dailyMetrics[currentDate]?.[metric.key] ?? ''}
                  onChange={(e) => handleUpdateMetrics(metric.key, e.target.value)}
                  onFocus={(e) => e.target.select()}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {(blocks.calories || blocks.steps || blocks.workout || blocks.protein || blocks.fats || blocks.carbs) && (
      <div className="calorie-overview section-card card-enter bg-[#18181b] rounded-3xl p-5 shadow-xl border border-zinc-800/50">
        <h2 className="section-legend text-[10px] text-zinc-500 uppercase font-bold tracking-widest">КБЖУ и активность</h2>
        {blocks.calories && (<>
        <div className="flex justify-between items-end mb-3">
          <div>
            <p className="text-[10px] text-zinc-500 uppercase font-bold mb-1 tracking-widest">Калории</p>
            <div className="flex items-baseline gap-1">
              <AnimatedNumber value={totalCals} className="text-4xl font-black" />
              <span className="text-zinc-600 text-sm">/ {dailyAvailableCalories}</span>
            </div>
          </div>
          <div className={`text-right ${calsColorClass}`}>
            <span className="text-2xl font-black">{displayCals}</span>
            <p className="text-[10px] uppercase font-bold mt-1 tracking-widest opacity-80">{calsLabel}</p>
          </div>
        </div>
        <div className="progress-track h-2 w-full bg-zinc-900 rounded-full overflow-hidden mb-4">
          <motion.div className={`h-full ${isOver ? 'bg-red-500' : 'bg-emerald-500'}`} initial={false} animate={{ width: `${progressCals}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }}></motion.div>
        </div>
        </>)}

        {blocks.steps && (
        <div className="movement-panel mt-4 mb-4 flex items-center justify-between bg-zinc-900/40 p-3 rounded-2xl border border-zinc-800/40">
          <div className="step-summary flex min-w-0 flex-1 items-center gap-3">
            <IconSteps className="w-5 h-5 text-amber-400" />
            <div className="flex flex-col">
              <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-widest">Шаги</span>
              {stepCaloriesDelta !== 0 && (
                <span className="text-[9px] text-zinc-500 font-bold mt-0.5">
                  {`${stepCaloriesDelta > 0 ? '+' : ''}${stepCaloriesDelta} ккал к цели`}
                </span>
              )}
            </div>
          </div>
          <div className="step-controls flex shrink-0 items-center gap-2">
            <button type="button" onClick={refreshCurrentDayVitals} disabled={isRefreshingDay || !uid} className="btn-active w-10 h-10 rounded-xl bg-zinc-800 text-zinc-300 flex items-center justify-center border border-zinc-700/30 disabled:opacity-40 transition-all" title="Обновить шаги">
              <IconRefresh className={`w-5 h-5 ${isRefreshingDay ? 'animate-spin' : ''}`} />
            </button>
            <input type="number" className="step-input w-24 bg-zinc-800 rounded-xl p-2 text-center text-sm font-bold outline-none text-zinc-200 border border-zinc-700/30 focus:border-emerald-500 transition-colors" value={todaySteps} onChange={(e) => handleUpdateSteps(e.target.value)} onFocus={(e) => e.target.select()} />
          </div>
        </div>
        )}

        {blocks.workout && (
        <div className="activity-panel mb-4 space-y-3">
          <button onClick={toggleWorkout} className={`workout-toggle btn-active w-full flex items-center justify-between p-3 rounded-2xl border transition-all ${dailyWorkouts[currentDate] ? 'bg-emerald-900/30 border-emerald-700/50' : 'bg-zinc-900/40 border-zinc-800/40'}`}>
            <div className="flex items-center gap-3">
              <IconDumbbell className="w-5 h-5 text-amber-400" />
              <span className={`text-[10px] uppercase font-bold tracking-widest ${dailyWorkouts[currentDate] ? 'text-emerald-400' : 'text-zinc-400'}`}>Силовая тренировка</span>
            </div>
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${dailyWorkouts[currentDate] ? 'bg-emerald-500' : 'bg-zinc-700'}`}>
              {dailyWorkouts[currentDate] && <IconCheck className="w-4 h-4 text-white" />}
            </div>
          </button>

          <div className="rounded-2xl border border-zinc-800/40 bg-zinc-900/40 p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-bold tracking-widest text-zinc-400">Дополнительная активность</p>
                <p className={`text-xs font-bold mt-1 ${extraActivityCalories > 0 ? 'text-emerald-400' : 'text-zinc-500'}`}>
                  {extraActivityCalories > 0 ? `+${extraActivityCalories} ккал` : 'не добавлена'}
                </p>
              </div>
              <button type="button" onClick={() => openExtraActivityModal()} className="btn-active shrink-0 cursor-pointer rounded-xl bg-emerald-600/15 border border-emerald-600/30 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-300 transition-all">
                + Добавить
              </button>
            </div>

            {todayExtraActivities.length > 0 && (
              <div className="flex flex-col gap-2">
                {todayExtraActivities.map((activity) => (
                  <div key={activity.id} className="flex items-center justify-between gap-2 rounded-xl bg-[#27272a] border border-zinc-700/30 px-3 py-2">
                    <span className="min-w-0 text-xs font-bold text-zinc-200 truncate">{activity.name} <span className="text-emerald-400">+{activity.calories} ккал</span></span>
                    <div className="flex shrink-0 items-center gap-1">
                      <button type="button" onClick={() => openExtraActivityModal(activity)} className="btn-active rounded-lg px-2 py-1 text-[10px] font-bold text-zinc-400 border border-zinc-700/30">Изменить</button>
                      <button type="button" onClick={() => removeExtraActivity(activity.id)} className="btn-active rounded-lg px-2 py-1 text-[10px] font-bold text-zinc-500 active:text-red-400" aria-label={`Удалить ${activity.name}`}>Удалить</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        )}

        {(blocks.protein || blocks.fats || blocks.carbs) && (
        <div className="macro-stack flex flex-col gap-3 mt-4 border-t border-zinc-800/50 pt-4">
          {blocks.protein && <MacroBar label="Белок" current={totalPro} goal={activeGoals.protein} colorClass="text-indigo-400" bgClass="bg-indigo-500" />}
          {blocks.fats && <MacroBar label="Жиры" current={totalFats} goal={activeGoals.fats} colorClass="text-amber-400" bgClass="bg-amber-500" />}
          {blocks.carbs && <MacroBar label="Углеводы" current={totalCarbs} goal={dailyCarbGoal} colorClass="text-blue-400" bgClass="bg-blue-500" />}
          {blocks.protein && proteinPerKg !== null && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Белок на кг веса</span>
              <span className={`text-[11px] font-bold ${proteinPerKg >= 1.6 ? 'text-emerald-400' : 'text-amber-400'}`}>{proteinPerKg} г/кг <span className="text-zinc-600">· цель {proteinGoalPerKg}</span></span>
            </div>
          )}
        </div>
        )}
      </div>
      )}

      {blocks.water && (
        <div className="water-card section-card card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50">
          <h2 className="section-legend text-[10px] text-zinc-500 uppercase font-bold tracking-widest flex items-center gap-1.5"><IconDrop className="w-3.5 h-3.5 text-blue-400" /> Вода</h2>
          <div className="flex justify-between items-end mb-3">
            <div>
              <div className="flex items-baseline gap-1">
                <AnimatedNumber value={todayWater} className="text-4xl font-black" />
                <span className="text-zinc-600 text-sm">/ {waterGoal} мл</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-blue-400">{Math.max(0, waterGoal - todayWater)}</span>
              <p className="text-[10px] uppercase font-bold mt-1 tracking-widest opacity-80 text-blue-400">осталось</p>
            </div>
          </div>
          <div className="progress-track h-2 w-full bg-zinc-900 rounded-full overflow-hidden mb-4">
            <motion.div className="h-full bg-blue-500" initial={false} animate={{ width: `${waterProgress}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }}></motion.div>
          </div>
          <div className="flex flex-wrap gap-2">
            {WATER_QUICK.map(v => (
              <motion.button whileTap={{ scale: 0.92 }} type="button" key={v} onClick={() => addWater(v)} className="btn-active flex-1 min-w-[64px] bg-zinc-900/40 border border-zinc-800/40 text-zinc-200 rounded-2xl py-3 text-sm font-bold transition-all">+{v}</motion.button>
            ))}
            <motion.button whileTap={{ scale: 0.92 }} type="button" onClick={() => addWater(-100)} disabled={todayWater <= 0} className="btn-active w-12 bg-zinc-900/40 border border-zinc-800/40 text-zinc-400 rounded-2xl py-3 flex items-center justify-center transition-all disabled:opacity-30" aria-label="Убрать 100 мл"><IconMinus className="w-4 h-4" /></motion.button>
          </div>
          <div className="flex gap-2 mt-2">
            <input type="number" inputMode="numeric" placeholder="Своё значение (мл)" className="flex-1 bg-[#27272a] rounded-2xl p-3 outline-none text-zinc-200 text-sm border border-zinc-700/30 focus:border-blue-500" value={customWater} onChange={(e) => setCustomWater(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addCustomWater(); }} onFocus={(e) => e.target.select()} />
            <button type="button" onClick={addCustomWater} disabled={!customWater} className="btn-active w-14 shrink-0 bg-blue-600 rounded-2xl flex items-center justify-center transition-all disabled:opacity-35" aria-label="Добавить воду"><IconPlus className="w-6 h-6 text-white" /></button>
            <button type="button" onClick={resetWater} disabled={todayWater <= 0} className="btn-active w-14 shrink-0 bg-zinc-800 text-zinc-400 rounded-2xl flex items-center justify-center transition-all disabled:opacity-30" aria-label="Сбросить воду"><IconRefresh className="w-5 h-5" /></button>
          </div>
        </div>
      )}

      <form ref={mealFormRef} onSubmit={handleAddLog} className="meal-composer section-card card-enter bg-[#18181b] rounded-3xl p-4 border border-zinc-800/50 flex flex-col gap-3">
        <h2 className="section-legend text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Добавить приём пищи</h2>

        <p className="text-[10px] text-zinc-500 leading-relaxed">
          Найдите продукт в базе, укажите вес порции и добавьте запись в дневник.
          Если вашего блюда или продукта нет в списке — добавьте его в Базу: там КБЖУ можно рассчитать с помощью ИИ или вписать вручную.
        </p>
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <label htmlFor="food-search" className="sr-only">Поиск продукта</label>
          <IconSearch aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
          <input
            ref={foodSearchRef}
            id="food-search"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Поиск продукта"
            className="w-full bg-[#27272a] rounded-2xl py-3 pl-11 pr-14 outline-none text-zinc-200 text-base border border-zinc-700/30 focus:border-emerald-500"
            value={foodSearch}
            onChange={(e) => setFoodSearch(e.target.value)}
          />
          {foodSearch && (
            <button type="button" onClick={() => { setFoodSearch(''); foodSearchRef.current?.focus(); }} className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 bg-transparent text-zinc-400 flex items-center justify-center active:text-zinc-200" title="Очистить поиск">
              <IconClose className="w-12 h-12" />
            </button>
          )}
        </div>

        <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
          <p className="px-1 text-[9px] text-zinc-500 uppercase font-bold tracking-widest">Избранные</p>
          <div ref={favScrollRef} className="hscroll-fade flex gap-2 overflow-x-auto py-2 -my-2 px-1 -mx-1">
            {favoriteMealFoods.map(f => (
              <motion.button whileTap={{ scale: 0.9 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }} type="button" key={f.id} onClick={() => selectedFoodId === f.id ? clearFoodSelection() : selectFood(f.id)} className={`shrink-0 text-xs font-bold px-3.5 py-2.5 rounded-xl border transition-colors ${selectedFoodId === f.id ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-zinc-800/60 text-zinc-300 border-zinc-700/40'}`}>{f.name}</motion.button>
            ))}
            {favoriteMealFoods.length === 0 && <span className="self-center text-xs text-zinc-500 px-1 py-2 whitespace-nowrap">{foodSearch.trim() ? 'Нет совпадений' : 'Нет избранных'}</span>}
          </div>
        </div>

        <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
          <p className="px-1 text-[9px] text-zinc-500 uppercase font-bold tracking-widest">Все</p>
          <div className="flex items-center gap-2 -mx-1 px-1">
            <button type="button" onClick={clearFoodSelection} title="Сбросить выбор" aria-label="Сбросить выбор продукта" className={`btn-active shrink-0 flex items-center justify-center w-10 h-10 rounded-xl border transition-all ${!selectedFoodId ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-zinc-800/60 text-emerald-300 border-emerald-700/40'}`}><IconClose className="w-4 h-4" /></button>
            <div ref={mealListScrollRef} className="hscroll-fade flex gap-2 overflow-x-auto py-2 -my-2 pl-1 -ml-1 min-w-0">
              {allMealFoods.map(f => (
                <motion.button whileTap={{ scale: 0.9 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }} type="button" key={f.id} onClick={() => selectFood(f.id)} className={`shrink-0 text-xs font-bold px-3.5 py-2.5 rounded-xl border transition-colors ${selectedFoodId === f.id ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-zinc-800/60 text-zinc-300 border-zinc-700/40'}`}>{f.name}</motion.button>
              ))}
              {allMealFoods.length === 0 && <span className="self-center text-xs text-zinc-500 px-1 py-2 whitespace-nowrap">{foodSearch.trim() ? 'Ничего не найдено' : 'Нет продуктов'}</span>}
            </div>
          </div>
        </div>

        {foodSearch.trim() && favoriteMealFoods.length === 0 && allMealFoods.length === 0 && (
          <div className="rounded-2xl border border-zinc-800/50 bg-zinc-900/40 p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-bold text-zinc-200">Продукт не найден</p>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Добавьте продукт в Базу — там КБЖУ можно рассчитать с помощью ИИ или вписать вручную.
            </p>
            <button
              type="button"
              onClick={() => onGoToFoodBase?.(foodSearch.trim())}
              className="btn-active w-full bg-emerald-600 text-white rounded-xl p-3 text-xs font-bold uppercase tracking-widest transition-all"
            >
              Перейти в Базу
            </button>
          </div>
        )}

        {/* Вес и добавление — после поиска и списка продуктов. */}
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <label htmlFor="grams-input" className="sr-only">Вес продукта в граммах</label>
          <input ref={gramsInputRef} id="grams-input" type="number" step="0.1" inputMode="decimal" placeholder="Вес (г)" className="flex-1 bg-[#27272a] rounded-2xl p-4 outline-none text-zinc-200 text-base border border-zinc-700/30 focus:border-emerald-500" value={gramsInput} onChange={(e) => setGramsInput(e.target.value)} onFocus={(e) => e.target.select()} required />
          <button type="submit" disabled={!selectedFoodId || !gramsInput} className="btn-active w-14 shrink-0 bg-emerald-600 rounded-2xl flex items-center justify-center transition-all shadow-lg shadow-emerald-900/20 disabled:opacity-35 disabled:shadow-none" aria-label="Добавить продукт"><IconPlus className="w-6 h-6 text-white" /></button>
        </div>
      </form>

      <div className="food-log-list space-y-3 pt-2">
        <AnimatePresence initial={false}>
        {currentDayLogs.map(log => (
          <motion.div key={log.id} layout initial={{ opacity: 0, y: -10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 60, scale: 0.95 }} transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }} className="food-log-row list-item-active bg-[#18181b] rounded-2xl p-4 flex justify-between items-center border border-zinc-800/30 transition-colors">
            <div className="flex-1 cursor-pointer pr-4 overflow-hidden" onClick={() => { if(editingLogId !== log.id) { setEditingLogId(log.id); setEditValue({ grams: log.grams }); setModifier({ type: null, value: '' }); }}}>
              {editingLogId === log.id ? (
                <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                  <input autoFocus={!modifier.type} type="number" step="0.1" className="w-16 bg-zinc-900 rounded-lg p-2 text-sm outline-none border border-emerald-500 text-white text-center" value={editValue.grams} onChange={(e) => setEditValue({grams: e.target.value})} onFocus={(e) => e.target.select()} />

                  {!modifier.type ? (
                    <>
                      <button type="button" onClick={() => setModifier({type: '+', value: ''})} className="w-8 h-8 bg-zinc-800 rounded-lg flex items-center justify-center text-emerald-400 font-bold text-lg active:bg-zinc-700">+</button>
                      <button type="button" onClick={() => setModifier({type: '-', value: ''})} className="w-8 h-8 bg-zinc-800 rounded-lg flex items-center justify-center text-red-400 font-bold text-lg active:bg-zinc-700">-</button>
                    </>
                  ) : (
                    <>
                      <span className={`font-bold text-lg ${modifier.type === '+' ? 'text-emerald-400' : 'text-red-400'}`}>{modifier.type}</span>
                      <input autoFocus type="number" step="0.1" className="w-16 bg-zinc-900 rounded-lg p-2 text-sm outline-none border border-emerald-500 text-white text-center" value={modifier.value} onChange={(e) => setModifier({...modifier, value: e.target.value})} placeholder="0" onFocus={(e) => e.target.select()} />
                    </>
                  )}

                  <button type="button" onClick={() => submitEdit(log.id)} className="w-8 h-8 ml-1 bg-emerald-600 rounded-lg flex items-center justify-center text-white active:bg-emerald-500"><IconCheck className="w-5 h-5"/></button>
                </div>
              ) : (
                <div className="flex flex-col">
                  <span className="text-[10px] text-zinc-500 font-medium mb-0.5">{new Date(parseInt(log.id)).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                  <p className="font-bold text-sm text-zinc-200 leading-tight break-words">{foods.find(f => f.id === log.foodId)?.name || 'Удалено'}</p>
                  <p className="text-[10px] text-zinc-400 font-bold uppercase block mt-1">{log.grams}г</p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex flex-col justify-center items-end text-right">
                <span className="text-emerald-400 font-bold text-sm mb-1">{Math.round(log.totalCalories || 0)} ккал</span>
                <div className="flex gap-1.5 opacity-80">
                    <span className="text-indigo-400 text-[9px] font-bold">Б:{Math.round(log.totalProtein || 0)}</span>
                    <span className="text-amber-400 text-[9px] font-bold">Ж:{Math.round(log.totalFats || 0)}</span>
                    <span className="text-blue-400 text-[9px] font-bold">У:{Math.round(log.totalCarbs || 0)}</span>
                </div>
              </div>
              <button onClick={() => deleteLog(log.id)} className="btn-active text-zinc-700 active:text-red-500 p-2 transition-colors"><IconTrash className="w-5 h-5" /></button>
            </div>
          </motion.div>
        ))}
        </AnimatePresence>
        {currentDayLogs.length === 0 && <div className="text-center text-zinc-600 text-sm mt-10">Записей нет. Добавьте первый прием пищи.</div>}
      </div>
    </div>
  );
}
