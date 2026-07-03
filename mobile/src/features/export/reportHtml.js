import { calculateStepCalorieAdjustment } from '../../utils/kbju.js';
import { sumExtraActivityCalories } from '../../utils/activity.js';
import { getUsualSteps } from '../../constants/app.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Минимальный PDF-отчёт для expo-print: дата, цель, съедено, КБЖУ, список еды, дефицит.
// TODO(charts): графики прогресса в PDF можно добавить позже (SVG в HTML).
export function buildReportHtml({ dates, data }) {
  const { getEffectiveGoals, dailyLogs, dailySteps, dailyMetrics, dailyExtraActivities, foods } = data;
  const foodById = new Map(foods.map((f) => [f.id, f]));

  let totalEaten = 0;
  let totalDeficit = 0;
  let daysWithLogs = 0;

  const dayBlocks = dates.map((date) => {
    const goals = getEffectiveGoals(date);
    const logs = dailyLogs[date] || [];
    const baseSteps = getUsualSteps(goals.baseSteps);
    const maintenance = Number(goals.maintenance) || 2300;
    const steps = dailySteps[date] !== undefined ? dailySteps[date] : baseSteps;
    const extraCals = sumExtraActivityCalories(dailyExtraActivities[date] || []);
    const burned = maintenance + calculateStepCalorieAdjustment(steps, baseSteps) + extraCals;

    const cals = logs.reduce((s, l) => s + (l.totalCalories || 0), 0);
    const pro = Math.round(logs.reduce((s, l) => s + (l.totalProtein || 0), 0));
    const fat = Math.round(logs.reduce((s, l) => s + (l.totalFats || 0), 0));
    const carb = Math.round(logs.reduce((s, l) => s + (l.totalCarbs || 0), 0));
    const metrics = dailyMetrics[date] || {};

    if (logs.length) {
      totalEaten += cals;
      totalDeficit += burned - cals;
      daysWithLogs += 1;
    }

    const foodRows = logs.map((log) => {
      const food = foodById.get(log.foodId);
      return `<tr><td>${esc(food?.name || 'Продукт удалён')}</td><td>${log.grams} г</td><td>${log.totalCalories}</td><td>${log.totalProtein}</td><td>${log.totalFats}</td><td>${log.totalCarbs}</td></tr>`;
    }).join('');

    return `
      <section class="day">
        <h3>${esc(date)}</h3>
        <p class="meta">
          Цель: ${Number(goals.calories) || 0} ккал · Съедено: <b>${cals}</b> ккал · Расход: ${burned} ккал · Дефицит: <b>${burned - cals}</b> ккал
          ${extraCals ? ` · Доп. активность: +${extraCals}` : ''}
        </p>
        <p class="meta">КБЖУ: Б ${pro} / Ж ${fat} / У ${carb}
          ${metrics.weight ? ` · Вес: ${metrics.weight} кг` : ''}${metrics.fatPercent ? ` · Жир: ${metrics.fatPercent}%` : ''}
        </p>
        ${logs.length ? `
          <table>
            <tr><th>Продукт</th><th>Вес</th><th>Ккал</th><th>Б</th><th>Ж</th><th>У</th></tr>
            ${foodRows}
          </table>` : '<p class="meta empty">Записей нет</p>'}
      </section>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #0f172a; padding: 24px; }
    h1 { font-size: 20px; margin-bottom: 2px; }
    .sub { color: #64748b; font-size: 12px; margin-bottom: 18px; }
    .summary { background: #f1f5f9; border-radius: 10px; padding: 12px 14px; font-size: 13px; margin-bottom: 20px; }
    .day { margin-bottom: 18px; page-break-inside: avoid; }
    h3 { font-size: 14px; margin: 0 0 4px; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; }
    .meta { font-size: 11px; color: #334155; margin: 2px 0; }
    .empty { color: #94a3b8; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 6px; }
    th, td { border: 1px solid #e2e8f0; padding: 3px 6px; text-align: left; }
    th { background: #f8fafc; }
  </style>
</head>
<body>
  <h1>Отчёт по питанию</h1>
  <p class="sub">Период: ${esc(dates[0])} — ${esc(dates[dates.length - 1])}</p>
  <div class="summary">
    Дней с записями: <b>${daysWithLogs}</b> ·
    Съедено всего: <b>${totalEaten}</b> ккал ·
    Средний дефицит: <b>${daysWithLogs ? Math.round(totalDeficit / daysWithLogs) : 0}</b> ккал/день
  </div>
  ${dayBlocks}
</body>
</html>`;
}
