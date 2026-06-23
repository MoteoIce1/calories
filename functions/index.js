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

// Разбор произвольного текста рецепта на ОТДЕЛЬНЫЕ продукты с КБЖУ на 100 г каждого.
// Используется в дневнике: пользователь описывает блюдо, ИИ возвращает список
// ингредиентов, новые из которых (после подтверждения) добавляются в базу продуктов.
exports.parseIngredients = onCall({ secrets: [ANTHROPIC_API_KEY], region: 'us-central1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Войдите в аккаунт.');
  const text = String((request.data && request.data.text) || '').trim();
  if (!text) throw new HttpsError('invalid-argument', 'Опишите ингредиенты блюда.');
  if (text.length > 4000) throw new HttpsError('invalid-argument', 'Слишком длинный текст (макс. 4000 символов).');

  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      ingredients: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            calories: { type: 'number' },
            protein: { type: 'number' },
            fats: { type: 'number' },
            carbs: { type: 'number' },
          },
          required: ['name', 'calories', 'protein', 'fats', 'carbs'],
        },
      },
    },
    required: ['ingredients'],
  };

  const system = 'Ты нутрициолог. Из текста рецепта/блюда выдели ОТДЕЛЬНЫЕ продукты (ингредиенты) и для КАЖДОГО укажи КБЖУ НА 100 ГРАММ самого продукта (а не готового блюда). Игнорируй указанные количества/граммовку — нужны справочные значения именно на 100 г продукта. Не объединяй продукты в одно блюдо. Названия делай короткими, на русском, в именительном падеже единственного числа (например «Куриная грудка», «Рис», «Оливковое масло»). Пропускай воду, соль и специи без калорийности. Отвечай строго в требуемом JSON, без пояснений вне него.';

  const body = {
    model: MODEL,
    max_tokens: 1500,
    system,
    output_config: { format: { type: 'json_schema', schema } },
    messages: [{
      role: 'user',
      content: 'Текст блюда/рецепта:\n' + text + '\n\nВерни JSON: ingredients — массив продуктов, у каждого name (короткое название продукта на русском) и calories/protein/fats/carbs на 100 г продукта (ккал и граммы).',
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

  const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
  const ingredients = (Array.isArray(parsed.ingredients) ? parsed.ingredients : [])
    .map((it) => ({
      name: String((it && it.name) || '').trim().slice(0, 80),
      calories: Math.round(Number(it && it.calories) || 0),
      protein: round1(it && it.protein),
      fats: round1(it && it.fats),
      carbs: round1(it && it.carbs),
    }))
    .filter((it) => it.name)
    .slice(0, 30);

  return { ingredients };
});
