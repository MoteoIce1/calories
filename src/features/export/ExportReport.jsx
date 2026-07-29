import { ProgressChart } from '../../components/Charts.jsx';
import { getUsualSteps } from '../../constants/app.js';
import { calculateStepCalorieAdjustment } from '../../utils/kbju.js';
import { sumExtraActivityCalories } from '../../utils/activity.js';

// PDF-отчёт: сводка периода, аналитика, недельные таблицы, графики и дневники по дням.
// Все данные считаются в App и передаются готовыми значениями.
export default function ExportReport({
  exportStart,
  exportEnd,
  allExportDates,
  totalPeriodCals,
  totalPeriodBurned,
  totalPeriodExtraActivityCalories,
  totalPeriodSteps,
  avgPeriodSteps,
  periodDefText,
  avgDeficit,
  filteredDatesForPdf,
  rangeDayCount,
  adherence,
  streak,
  latestWeekTrend,
  latestWeek,
  projectionDate,
  targetFat,
  daysToGoal,
  fatWeeklyRate,
  latestSmoothedFat,
  projectionConfidence,
  projectionConfidenceText,
  dayStats,
  bestDeficitDays,
  worstBalanceDays,
  highStepAvgDeficit,
  lowStepAvgDeficit,
  stepDeficitDelta,
  workoutDays,
  restDays,
  workoutAvgDeficit,
  workoutAvgCals,
  workoutAvgSteps,
  restAvgDeficit,
  restAvgCals,
  restAvgSteps,
  tdeeReal,
  weeklyRate,
  modelTdee,
  tdeeDiff,
  daysBetweenWeigh,
  workoutCount,
  weeklySummary,
  hasBodyData,
  wStart,
  wEnd,
  fStart,
  fEnd,
  lStart,
  lEnd,
  fmStart,
  fmEnd,
  bodyMeasureSummary,
  bodyMeasureSeries,
  bodyMeasureDates,
  datesWithMetrics,
  allWeight,
  allFat,
  allLean,
  allFatMass,
  chartDates,
  allSteps,
  stepChartLabels,
  getEffectiveGoals,
  dailyLogs,
  dailyMetrics,
  dailySteps,
  dailyWater,
  dailyExtraActivities,
  dailyWorkouts,
  foods,
}) {
  return (
      <div className="report-modern" style={{ fontFamily: 'sans-serif', maxWidth: '980px', margin: '0 auto', fontSize: '12px', background: 'white', color: 'black' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '15px', textAlign: 'center' }}>Отчет по питанию ({exportStart} — {exportEnd})</h1>
      
      {allExportDates.length > 0 && (
        <div style={{ backgroundColor: '#f4f4f5', padding: '10px', borderRadius: '8px', marginBottom: '15px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 5px 0' }}>Итоги за период:</h2>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
             <div style={{ minWidth: '200px' }}>
                <p><strong>Суммарно съедено:</strong> {totalPeriodCals} ккал</p>
                <p><strong>Суммарно потрачено:</strong> {totalPeriodBurned} ккал</p>
                {totalPeriodExtraActivityCalories > 0 && <p><strong>Доп. активность:</strong> +{totalPeriodExtraActivityCalories} ккал</p>}
                <p><strong>Пройдено шагов:</strong> {totalPeriodSteps}</p>
                {avgPeriodSteps > 0 && <p><strong>Средние шаги:</strong> {avgPeriodSteps} / день</p>}
             </div>
             <div style={{ minWidth: '200px' }}>
                <p><strong>Баланс ККАЛ:</strong> {periodDefText}</p>
                <p style={{ color: '#555' }}><em>(В среднем {avgDeficit} ккал/день)</em></p>
             </div>
          </div>
        </div>
      )}

      {allExportDates.length > 0 && (
        <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', padding: '10px', borderRadius: '8px', marginBottom: '15px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 5px 0', color: '#1e40af' }}>Дисциплина и прогноз:</h2>
          <p><strong>Дней с записями:</strong> {filteredDatesForPdf.length} из {rangeDayCount} ({adherence}%)</p>
          <p><strong>Текущий стрик:</strong> {streak} дн. подряд</p>
          {latestWeekTrend && latestWeek && <p><strong>Тренд веса за последнюю неделю:</strong> {latestWeekTrend} ({latestWeek.dW > 0 ? '+' : ''}{latestWeek.dW} кг к прошлой неделе)</p>}
          {projectionDate
            ? <p><strong>Прогноз до {targetFat}% жира:</strong> ~{projectionDate} (≈{Math.round(daysToGoal / 7)} нед.) <span style={{ color: '#555' }}>— при темпе {fatWeeklyRate} %/нед</span></p>
            : (latestSmoothedFat !== null && latestSmoothedFat <= targetFat
                ? <p><strong>Цель по жиру достигнута:</strong> {latestSmoothedFat}% ≤ {targetFat}% 🎉</p>
                : <p style={{ color: '#555' }}><em>Прогноз по жиру появится, когда жир пойдёт вниз по тренду (нужно 14+ дней замеров).</em></p>)}
          {projectionDate && <p style={{ color: '#555', fontSize: '11px' }}><em>Доверие к прогнозу: {projectionConfidence}. {projectionConfidenceText} Грубая линейная оценка — у тела темп нелинеен и к цели замедлится.</em></p>}
        </div>
      )}

      {dayStats.length > 0 && (
        <div style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa', padding: '10px', borderRadius: '8px', marginBottom: '15px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 8px 0', color: '#9a3412' }}>Лучшие и сложные дни:</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <h3 style={{ fontSize: '12px', margin: '0 0 5px 0', color: '#166534' }}>Лучший дефицит</h3>
              {bestDeficitDays.map(d => (
                <p key={d.date} style={{ margin: '3px 0' }}><strong>{d.date}:</strong> {d.deficit > 0 ? '+' : ''}{d.deficit} ккал, {d.steps} шагов{d.workout ? ' · тренировка' : ''}</p>
              ))}
            </div>
            <div>
              <h3 style={{ fontSize: '12px', margin: '0 0 5px 0', color: '#991b1b' }}>Самый слабый баланс</h3>
              {worstBalanceDays.map(d => (
                <p key={d.date} style={{ margin: '3px 0' }}><strong>{d.date}:</strong> {d.deficit > 0 ? '+' : ''}{d.deficit} ккал, {d.cals} ккал еды{d.workout ? ' · тренировка' : ''}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {dayStats.length > 1 && (
        <div style={{ backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', padding: '10px', borderRadius: '8px', marginBottom: '15px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 8px 0', color: '#334155' }}>Что помогало:</h2>
          <p><strong>Шаги и баланс:</strong> дни выше среднего по шагам давали в среднем {highStepAvgDeficit !== null ? `${highStepAvgDeficit > 0 ? '+' : ''}${highStepAvgDeficit}` : '—'} ккал баланса, ниже среднего — {lowStepAvgDeficit !== null ? `${lowStepAvgDeficit > 0 ? '+' : ''}${lowStepAvgDeficit}` : '—'} ккал.</p>
          {stepDeficitDelta !== null && <p style={{ color: stepDeficitDelta > 0 ? '#166534' : '#991b1b' }}><em>Разница между более и менее активными днями: {stepDeficitDelta > 0 ? '+' : ''}{stepDeficitDelta} ккал/день. Шаги добавляются к расходу отдельной строкой.</em></p>}
          {(workoutDays.length > 0 || restDays.length > 0) && (
            <table style={{ borderCollapse: 'collapse', textAlign: 'center', width: '100%', fontSize: '12px', marginTop: '8px' }}>
              <thead>
                <tr style={{ backgroundColor: '#e2e8f0' }}>
                  <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Тип дня</th>
                  <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Дней</th>
                  <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Ср. дефицит</th>
                  <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Ср. ккал</th>
                  <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Ср. шаги</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ border: '1px solid #cbd5e1', padding: '4px' }}>С тренировкой</td>
                  <td style={{ border: '1px solid #cbd5e1' }}>{workoutDays.length}</td>
                  <td style={{ border: '1px solid #cbd5e1' }}>{workoutAvgDeficit !== null ? `${workoutAvgDeficit > 0 ? '+' : ''}${workoutAvgDeficit}` : '—'}</td>
                  <td style={{ border: '1px solid #cbd5e1' }}>{workoutAvgCals !== null ? workoutAvgCals : '—'}</td>
                  <td style={{ border: '1px solid #cbd5e1' }}>{workoutAvgSteps !== null ? workoutAvgSteps : '—'}</td>
                </tr>
                <tr>
                  <td style={{ border: '1px solid #cbd5e1', padding: '4px' }}>Без тренировки</td>
                  <td style={{ border: '1px solid #cbd5e1' }}>{restDays.length}</td>
                  <td style={{ border: '1px solid #cbd5e1' }}>{restAvgDeficit !== null ? `${restAvgDeficit > 0 ? '+' : ''}${restAvgDeficit}` : '—'}</td>
                  <td style={{ border: '1px solid #cbd5e1' }}>{restAvgCals !== null ? restAvgCals : '—'}</td>
                  <td style={{ border: '1px solid #cbd5e1' }}>{restAvgSteps !== null ? restAvgSteps : '—'}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      )}

      {(tdeeReal !== null || weeklyRate !== null) && (
        <div style={{ backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', padding: '10px', borderRadius: '8px', marginBottom: '15px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 5px 0', color: '#065f46' }}>Аналитика динамики (по сглаженному весу):</h2>
          {weeklyRate !== null && <p><strong>Скорость изменения веса:</strong> {weeklyRate > 0 ? '+' : ''}{weeklyRate} кг/нед {weeklyRate < 0 ? '📉' : weeklyRate > 0 ? '📈' : ''}</p>}
          {tdeeReal !== null && <p><strong>Реальный расход по весам (TDEE):</strong> ~{tdeeReal} ккал/день <span style={{ color: '#555' }}>(уже включает ходьбу)</span></p>}
          {tdeeReal !== null && <p><strong>Модельный расход (TDEE):</strong> ~{modelTdee} ккал/день</p>}
          {tdeeReal !== null && (
            <p style={{ color: Math.abs(tdeeDiff) > 150 ? '#b45309' : '#555' }}><em>
              Расхождение модели с реальностью: {tdeeDiff > 0 ? '+' : ''}{tdeeDiff} ккал/день. {
                tdeeDiff > 150 ? `Вес уходит быстрее, чем считает модель — базу нормы можно поднять примерно на ${tdeeDiff} ккал (либо это остаточная вода в начале периода).`
                : tdeeDiff < -150 ? 'Вес уходит медленнее модели — вероятна недооценка съеденного или завышенная норма.'
                : 'Модель приложения близка к реальности.'
              }
            </em></p>
          )}
          {daysBetweenWeigh < 14 && <p style={{ color: '#b45309', fontSize: '11px' }}><em>⚠️ Замеры веса всего за {daysBetweenWeigh} дн. Для надёжного TDEE нужно 14+ дней данных.</em></p>}
          {workoutCount > 0 && <p><strong>Силовых тренировок за период:</strong> {workoutCount}</p>}
        </div>
      )}

      {weeklySummary.length > 1 && (
        <div style={{ marginBottom: '15px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 'bold', margin: '10px 0 5px 0', color: '#005f73' }}>Недельная сводка:</h3>
          <table style={{ borderCollapse: 'collapse', textAlign: 'center', width: '100%', fontSize: '12px' }}>
            <thead>
              <tr style={{ backgroundColor: '#e2e8f0' }}>
                <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Неделя с</th>
                <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Дней</th>
                <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Ср. ккал</th>
                <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Ср. дефицит</th>
                <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Ср. вес</th>
                <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Δ вес</th>
              </tr>
            </thead>
            <tbody>
              {weeklySummary.map(wk => (
                <tr key={wk.week}>
                  <td style={{ border: '1px solid #cbd5e1', padding: '4px' }}>{wk.week.slice(5)}</td>
                  <td style={{ border: '1px solid #cbd5e1' }}>{wk.logged}</td>
                  <td style={{ border: '1px solid #cbd5e1' }}>{wk.avgCals !== null ? wk.avgCals : '—'}</td>
                  <td style={{ border: '1px solid #cbd5e1', color: wk.avgDef > 0 ? '#10b981' : '#ef4444' }}>{wk.avgDef !== null ? (wk.avgDef > 0 ? '+' : '') + wk.avgDef : '—'}</td>
                  <td style={{ border: '1px solid #cbd5e1' }}>{wk.wAvg !== null ? wk.wAvg : '—'}</td>
                  <td style={{ border: '1px solid #cbd5e1', fontWeight: 'bold', color: wk.dW === null ? '#555' : (wk.dW > 0 ? '#ef4444' : wk.dW < 0 ? '#10b981' : '#555') }}>{wk.dW === null ? '—' : (wk.dW > 0 ? '+' : '') + wk.dW}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasBodyData && (
        <div style={{ marginBottom: '15px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 'bold', margin: '10px 0 5px 0', color: '#005f73' }}>Изменения по телу:</h3>
          <table style={{ borderCollapse: 'collapse', textAlign: 'center', width: '100%' }}>
            <thead>
              <tr style={{ backgroundColor: '#e2e8f0' }}>
                <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Показатель</th>
                <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Начало</th>
                <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Конец</th>
                <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Разница</th>
              </tr>
            </thead>
            <tbody>
              {wStart !== undefined && wEnd !== undefined && <tr><td style={{border:'1px solid #cbd5e1', padding:'5px'}}>Вес (кг)</td><td style={{border:'1px solid #cbd5e1'}}>{wStart}</td><td style={{border:'1px solid #cbd5e1'}}>{wEnd}</td><td style={{border:'1px solid #cbd5e1', fontWeight:'bold', color: wEnd - wStart > 0 ? '#ef4444' : '#10b981'}}>{(wEnd-wStart).toFixed(1)}</td></tr>}
              {fStart !== undefined && fEnd !== undefined && <tr><td style={{border:'1px solid #cbd5e1', padding:'5px'}}>Жир (%)</td><td style={{border:'1px solid #cbd5e1'}}>{fStart}</td><td style={{border:'1px solid #cbd5e1'}}>{fEnd}</td><td style={{border:'1px solid #cbd5e1', fontWeight:'bold', color: fEnd - fStart > 0 ? '#ef4444' : '#10b981'}}>{(fEnd-fStart).toFixed(1)}</td></tr>}
              {lStart !== undefined && lEnd !== undefined && <tr><td style={{border:'1px solid #cbd5e1', padding:'5px'}}>БЖМ (кг)</td><td style={{border:'1px solid #cbd5e1'}}>{lStart}</td><td style={{border:'1px solid #cbd5e1'}}>{lEnd}</td><td style={{border:'1px solid #cbd5e1', fontWeight:'bold', color: lEnd - lStart > 0 ? '#10b981' : '#ef4444'}}>{(lEnd-lStart).toFixed(1)}</td></tr>}
              {fmStart !== undefined && fmEnd !== undefined && <tr><td style={{border:'1px solid #cbd5e1', padding:'5px'}}>Масса жира (кг)</td><td style={{border:'1px solid #cbd5e1'}}>{fmStart}</td><td style={{border:'1px solid #cbd5e1'}}>{fmEnd}</td><td style={{border:'1px solid #cbd5e1', fontWeight:'bold', color: fmEnd - fmStart > 0 ? '#ef4444' : '#10b981'}}>{(fmEnd-fmStart).toFixed(1)}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {bodyMeasureSummary.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', margin: '10px 0 8px 0', color: '#005f73' }}>Замеры тела:</h3>
          <table style={{ borderCollapse: 'collapse', textAlign: 'center', width: '100%', fontSize: '12px', marginBottom: '12px' }}>
            <thead>
              <tr style={{ backgroundColor: '#e2e8f0' }}>
                <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Показатель</th>
                <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Начало</th>
                <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Конец</th>
                <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Разница</th>
              </tr>
            </thead>
            <tbody>
              {bodyMeasureSummary.map(item => {
                const decreaseGood = !['bicepsRelaxed', 'bicepsFlexed'].includes(item.key);
                const good = item.delta === 0 ? null : decreaseGood ? item.delta < 0 : item.delta > 0;
                return (
                  <tr key={item.key}>
                    <td style={{ border: '1px solid #cbd5e1', padding: '5px', textAlign: 'left' }}>{item.label}</td>
                    <td style={{ border: '1px solid #cbd5e1' }}>{item.first.value} см <span style={{ color: '#64748b' }}>({item.first.date.slice(5)})</span></td>
                    <td style={{ border: '1px solid #cbd5e1' }}>{item.last.value} см <span style={{ color: '#64748b' }}>({item.last.date.slice(5)})</span></td>
                    <td style={{ border: '1px solid #cbd5e1', fontWeight: 'bold', color: good === null ? '#555' : good ? '#10b981' : '#ef4444' }}>{item.delta > 0 ? '+' : ''}{item.delta} см</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {bodyMeasureSeries.length > 0 && (
            <div className="grid grid-cols-1 print:grid-cols-2 sm:grid-cols-2 gap-4 w-full">
              {bodyMeasureSeries.map(series => (
                <ProgressChart key={series.key} title={`${series.label} (см)`} data={series.data} dates={bodyMeasureDates} color={series.color} showAverage={false} />
              ))}
            </div>
          )}
        </div>
      )}

      {datesWithMetrics.length > 1 && (
        <div style={{ marginBottom: '20px' }}>
           <h3 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 10px 0', color: '#005f73' }}>Графики прогресса:</h3>
           {/* Адаптивная сетка графиков: 1 колонка на мобильном, 2 при печати */}
           <div className="grid grid-cols-1 print:grid-cols-2 sm:grid-cols-2 gap-4 w-full">
              <ProgressChart title="Вес (кг)" data={allWeight} dates={chartDates} color="#d8b46d" showAverage={true} />
              <ProgressChart title="Жир (%)" data={allFat} dates={chartDates} color="#ef4444" />
              <ProgressChart title="БЖМ (кг)" data={allLean} dates={chartDates} color="#83b3ae" />
              <ProgressChart title="Масса жира (кг)" data={allFatMass} dates={chartDates} color="#f59e0b" />
           </div>
        </div>
      )}

      {allSteps.length > 1 && (
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 10px 0', color: '#005f73' }}>Шаги и тренд:</h3>
          <div className="grid grid-cols-1 gap-4 w-full">
            <ProgressChart title="Шаги за день" data={allSteps} dates={stepChartLabels} color="#10b981" showAverage={true} averageMode="period" />
          </div>
        </div>
      )}

      {allExportDates.map(date => {
          const dayActiveGoals = getEffectiveGoals(date);
          const dayLogs = dailyLogs[date] || [];
          if (dayLogs.length === 0 && !dailyMetrics[date] && dailySteps[date] === undefined && dailyWater[date] === undefined && !(dailyExtraActivities[date] || []).length) return null;

          const dayCals = dayLogs.reduce((s, l) => s + (l.totalCalories || 0), 0);
          const dayPro = dayLogs.reduce((s, l) => s + (l.totalProtein || 0), 0);
          const dayFat = dayLogs.reduce((s, l) => s + (l.totalFats || 0), 0);
          const dayCarb = dayLogs.reduce((s, l) => s + (l.totalCarbs || 0), 0);
          const dayBaseSteps = getUsualSteps(dayActiveGoals.baseSteps);
          const daySteps = dailySteps[date] !== undefined ? dailySteps[date] : dayBaseSteps;
          const dayExtraActivityCalories = sumExtraActivityCalories(dailyExtraActivities[date] || []);
          const dayBurned = (dayActiveGoals.maintenance || 2300) + calculateStepCalorieAdjustment(daySteps, dayBaseSteps) + dayExtraActivityCalories;
          const m = dailyMetrics[date] || {};
          const mText = [ m.weight ? `Вес: ${m.weight} кг` : '', m.fatPercent ? `Жир: ${m.fatPercent}%` : '', m.leanMass ? `БЖМ: ${m.leanMass} кг` : '', m.fatMass ? `Жир: ${m.fatMass} кг` : '' ].filter(Boolean).join(' | ');

          return (
            <div key={date} style={{ marginBottom: '15px', borderTop: '1px solid #eee', paddingTop: '8px' }}>
              <h2 style={{ fontSize: '14px', fontWeight: 'bold', color: '#10b981', margin: '0 0 4px 0' }}>{date}</h2>
              <p style={{ fontSize: '11px', marginBottom: '5px' }}>
                Шаги: {dailySteps[date] || '—'} | Доп. активность: {dayExtraActivityCalories || '—'} ккал | <strong>Дефицит: {dayBurned - dayCals} ккал</strong>{dailyWorkouts[date] ? ' | Силовая тренировка' : ''}{dailyWater[date] !== undefined ? ` | Вода: ${dailyWater[date]} мл` : ''}<br/>
                {dayLogs.length > 0 && <span>Б: {Math.round(dayPro)}г | Ж: {Math.round(dayFat)}г | У: {Math.round(dayCarb)}г</span>}
                {mText && <span><br/><span style={{ color: '#005f73' }}>Тело: {mText}</span></span>}
              </p>

              {dayLogs.length > 0 && (
                <table style={{ fontSize: '10px', width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ backgroundColor: '#f9fafb' }}>
                    <tr>
                      <th style={{ border: '1px solid #e4e4e7', padding: '4px', textAlign: 'left', width: '40%' }}>Продукт</th>
                      <th style={{ border: '1px solid #e4e4e7', padding: '4px', width: '15%' }}>Вес (г)</th>
                      <th style={{ border: '1px solid #e4e4e7', padding: '4px', width: '15%' }}>Ккал</th>
                      <th style={{ border: '1px solid #e4e4e7', padding: '4px', width: '10%' }}>Б</th>
                      <th style={{ border: '1px solid #e4e4e7', padding: '4px', width: '10%' }}>Ж</th>
                      <th style={{ border: '1px solid #e4e4e7', padding: '4px', width: '10%' }}>У</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayLogs.map((log, i) => (
                      <tr key={i}>
                        <td style={{ border: '1px solid #e4e4e7', padding: '3px' }}>{foods.find(f => f.id === log.foodId)?.name || '—'}</td>
                        <td style={{ border: '1px solid #e4e4e7', padding: '3px', textAlign: 'center' }}>{log.grams}</td>
                        <td style={{ border: '1px solid #e4e4e7', padding: '3px', textAlign: 'center' }}>{Math.round(log.totalCalories)}</td>
                        <td style={{ border: '1px solid #e4e4e7', padding: '3px', textAlign: 'center' }}>{Math.round(log.totalProtein)}</td>
                        <td style={{ border: '1px solid #e4e4e7', padding: '3px', textAlign: 'center' }}>{Math.round(log.totalFats)}</td>
                        <td style={{ border: '1px solid #e4e4e7', padding: '3px', textAlign: 'center' }}>{Math.round(log.totalCarbs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
      })}
    </div>
  );
}
