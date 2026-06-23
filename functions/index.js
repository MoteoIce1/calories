const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

// Ключ Anthropic хранится как секрет Firebase (никогда не попадает в клиент).
// Установить: firebase functions:secrets:set ANTHROPIC_API_KEY
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

// Модель для расчёта рецептов. Haiku 4.5 — быстрая и дешёвая, задачи извлечения
// КБЖУ ей более чем по силам. Поменяйте на 'claude-sonnet-4-6' / 'claude-opus-4-8'
// для большей точности (дороже).
const MODEL = 'claude-haiku-4-5';

exports.calcRecipe = onCall({ secrets: [ANTHROPIC_API_KEY], region: 'us-central1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Войдите в аккаунт.');
  const text = String((request.data && request.data.text) || '').trim();
  if (!text) throw new HttpsError('invalid-argument', 'Опишите ингредиенты блюда.');
  if (text.length > 4000) throw new HttpsError('invalid-argument', 'Слишком длинный текст (макс. 4000 символов).');

  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      name: { type: 'string' },
      per100g: {
        type: 'object',
        additionalProperties: false,
        properties: {
          calories: { type: 'number' },
          protein: { type: 'number' },
          fats: { type: 'number' },
          carbs: { type: 'number' },
        },
        required: ['calories', 'protein', 'fats', 'carbs'],
      },
      totalGrams: { type: 'number' },
      note: { type: 'string' },
    },
    required: ['name', 'per100g', 'totalGrams', 'note'],
  };

  const system = 'Ты нутрициолог. По списку ингредиентов с количеством рассчитай КБЖУ блюда НА 100 ГРАММ готового блюда. Используй стандартные справочные значения КБЖУ продуктов. Если у ингредиента не указано количество — оцени разумно. Отвечай строго в требуемом JSON, без пояснений вне него.';

  const body = {
    model: MODEL,
    max_tokens: 1024,
    system,
    output_config: { format: { type: 'json_schema', schema } },
    messages: [{
      role: 'user',
      content: 'Ингредиенты блюда:\n' + text + '\n\nВерни JSON: name — короткое название блюда на русском; per100g — {calories, protein, fats, carbs} на 100 г готового блюда (ккал и граммы); totalGrams — суммарная масса всех ингредиентов в граммах; note — одна короткая строка с допущениями расчёта.',
    }],
  };

  let resp;
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY.value(),
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new HttpsError('unavailable', 'Не удалось связаться с ИИ.');
  }

  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new HttpsError('internal', 'Ошибка ИИ (' + resp.status + '): ' + t.slice(0, 300));
  }

  const data = await resp.json();
  const out = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  let parsed;
  try { parsed = JSON.parse(out); } catch (e) { throw new HttpsError('internal', 'ИИ вернул некорректный ответ. Попробуйте ещё раз.'); }

  const p = parsed.per100g || {};
  const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
  return {
    name: String(parsed.name || 'Блюдо').slice(0, 80),
    calories: Math.round(Number(p.calories) || 0),
    protein: round1(p.protein),
    fats: round1(p.fats),
    carbs: round1(p.carbs),
    totalGrams: Math.round(Number(parsed.totalGrams) || 0),
    note: String(parsed.note || '').slice(0, 200),
  };
});
