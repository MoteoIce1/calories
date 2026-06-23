const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const crypto = require('crypto');

admin.initializeApp();
const db = admin.firestore();

// Ключ Anthropic хранится как секрет Firebase (никогда не попадает в клиент).
// Установить: firebase functions:secrets:set ANTHROPIC_API_KEY
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

// Модель для расчёта рецептов. Haiku 4.5 — быстрая и дешёвая, задачи извлечения
// КБЖУ ей более чем по силам. Поменяйте на 'claude-sonnet-4-6' / 'claude-opus-4-8'
// для большей точности (дороже).
const MODEL = 'claude-haiku-4-5';

// Дневной лимит ИИ-запросов на пользователя (защита от перерасхода бюджета).
// Каждый вызов calcRecipe/parseIngredients/analyzePhoto (включая уточнения) считается.
const AI_DAILY_LIMIT = 20;
// Дата по Москве (UTC+3) — лимит обнуляется в полночь по МСК.
const aiUsageDay = () => new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
// Атомарно проверяет и увеличивает счётчик. Бросает resource-exhausted при превышении.
async function enforceAiLimit(uid) {
  const ref = db.collection('aiUsage').doc(uid);
  const day = aiUsageDay();
  const used = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const count = data.date === day ? (data.count || 0) : 0;
    if (count >= AI_DAILY_LIMIT) return -1;
    tx.set(ref, { date: day, count: count + 1, updatedAt: Date.now() }, { merge: true });
    return count + 1;
  });
  if (used === -1) {
    throw new HttpsError('resource-exhausted', `Дневной лимит ИИ-запросов исчерпан (${AI_DAILY_LIMIT} в день). Лимит обновится завтра. Чтобы поднять лимит — потребуется подписка.`);
  }
}

// ── Дедуп: одинаковый текстовый запрос отдаём из кеша, без вызова ИИ ──
// Экономит и деньги, и дневной лимит пользователя (кеш-хит лимит не тратит).
const cacheKeyFor = (fn, input) => fn + '_' + crypto.createHash('sha256').update(input).digest('hex');
async function getCachedResult(key) {
  try { const snap = await db.collection('aiCache').doc(key).get(); return snap.exists ? snap.data().result : null; }
  catch (e) { return null; }
}
async function putCachedResult(key, result) {
  try { await db.collection('aiCache').doc(key).set({ result, createdAt: Date.now() }, { merge: true }); }
  catch (e) { /* кеш не критичен — игнорируем ошибки записи */ }
}

exports.calcRecipe = onCall({ secrets: [ANTHROPIC_API_KEY], region: 'us-central1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Войдите в аккаунт.');
  const text = String((request.data && request.data.text) || '').trim();
  if (!text) throw new HttpsError('invalid-argument', 'Опишите ингредиенты блюда.');
  if (text.length > 4000) throw new HttpsError('invalid-argument', 'Слишком длинный текст (макс. 4000 символов).');

  // Дедуп: одинаковый рецепт — из кеша, без вызова ИИ и без траты лимита.
  const cacheKey = cacheKeyFor('calcRecipe', text.toLowerCase().replace(/\s+/g, ' '));
  const cached = await getCachedResult(cacheKey);
  if (cached) return cached;
  await enforceAiLimit(request.auth.uid);

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
    // cache_control: помечаем системный промпт как кешируемый (выгодно при длинных
    // промптах; на коротких Haiku < 4096 токенов кеш молча не сработает — это нормально).
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
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
  const result = {
    name: String(parsed.name || 'Блюдо').slice(0, 80),
    calories: Math.round(Number(p.calories) || 0),
    protein: round1(p.protein),
    fats: round1(p.fats),
    carbs: round1(p.carbs),
    totalGrams: Math.round(Number(parsed.totalGrams) || 0),
    note: String(parsed.note || '').slice(0, 200),
  };
  await putCachedResult(cacheKey, result);
  return result;
});

// Разбор произвольного текста рецепта на ОТДЕЛЬНЫЕ продукты с КБЖУ на 100 г каждого.
// Используется в дневнике: пользователь описывает блюдо, ИИ возвращает список
// ингредиентов, новые из которых (после подтверждения) добавляются в базу продуктов.
exports.parseIngredients = onCall({ secrets: [ANTHROPIC_API_KEY], region: 'us-central1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Войдите в аккаунт.');
  const text = String((request.data && request.data.text) || '').trim();
  if (!text) throw new HttpsError('invalid-argument', 'Опишите ингредиенты блюда.');
  if (text.length > 4000) throw new HttpsError('invalid-argument', 'Слишком длинный текст (макс. 4000 символов).');

  // Дедуп по тексту рецепта (список базы в ключ не входит — совпадения с базой
  // клиент пересчитывает сам, поэтому кеш переиспользуется между пользователями).
  const cacheKey = cacheKeyFor('parseIngredients', text.toLowerCase().replace(/\s+/g, ' '));
  const cached = await getCachedResult(cacheKey);
  if (cached) return cached;
  await enforceAiLimit(request.auth.uid);

  // Названия продуктов, уже имеющихся в базе у пользователя. ИИ сопоставляет с ними
  // ингредиенты, чтобы не плодить дубли («масло сливочное» ↔ «Сливочное масло»).
  const knownNames = Array.isArray(request.data && request.data.knownNames)
    ? request.data.knownNames.map((n) => String(n || '').trim()).filter(Boolean).slice(0, 1000)
    : [];

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
            // Варианты продукта, заметно меняющие КБЖУ (жирность масла/молока/творога и т.п.).
            // Если их нет — пустой массив. В основные поля кладётся типичный/средний вариант.
            options: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  label: { type: 'string' },
                  calories: { type: 'number' },
                  protein: { type: 'number' },
                  fats: { type: 'number' },
                  carbs: { type: 'number' },
                },
                required: ['label', 'calories', 'protein', 'fats', 'carbs'],
              },
            },
          },
          required: ['name', 'calories', 'protein', 'fats', 'carbs', 'options'],
        },
      },
    },
    required: ['ingredients'],
  };

  const system = 'Ты нутрициолог. Из текста рецепта/блюда выдели ОТДЕЛЬНЫЕ продукты (ингредиенты) и для КАЖДОГО укажи КБЖУ НА 100 ГРАММ самого продукта (а не готового блюда). Игнорируй указанные количества/граммовку — нужны справочные значения именно на 100 г продукта. Не объединяй продукты в одно блюдо. Названия делай короткими, на русском, в именительном падеже единственного числа (например «Куриная грудка», «Рис», «Оливковое масло»). Пропускай воду, соль и специи без калорийности. ВАЖНО: если продукт уже есть в переданном списке «база» (тот же продукт, даже если отличается порядок слов, падеж или регистр — например «масло сливочное» и «Сливочное масло» это одно и то же), верни его name ДОСЛОВНО так, как он записан в базе, не придумывай новый вариант. ВАРИАНТЫ: если у продукта есть распространённые разновидности, заметно меняющие КБЖУ (жирность сливочного масла 72%/82%, молоко 1%/2.5%/3.2%, творог 0%/5%/9%, сметана 15%/20% и т.п.), а в тексте конкретная разновидность не указана — заполни options 2–4 вариантами (label вроде «82%», и его calories/protein/fats/carbs на 100 г), а в основные поля положи типичный/средний вариант. Если разновидностей нет или она явно указана в тексте — options оставь пустым массивом []. Отвечай строго в требуемом JSON, без пояснений вне него.';

  const content = 'Текст блюда/рецепта:\n' + text
    + (knownNames.length ? '\n\nБаза (уже добавленные продукты — при совпадении используй название ДОСЛОВНО отсюда):\n' + knownNames.join('\n') : '')
    + '\n\nВерни JSON: ingredients — массив продуктов, у каждого name (короткое название на русском), calories/protein/fats/carbs на 100 г продукта (ккал и граммы) и options (варианты по жирности/типу либо пустой массив).';

  const body = {
    model: MODEL,
    max_tokens: 2500,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    output_config: { format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content }],
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
      options: (Array.isArray(it && it.options) ? it.options : [])
        .map((o) => ({
          label: String((o && o.label) || '').trim().slice(0, 40),
          calories: Math.round(Number(o && o.calories) || 0),
          protein: round1(o && o.protein),
          fats: round1(o && o.fats),
          carbs: round1(o && o.carbs),
        }))
        .filter((o) => o.label)
        .slice(0, 4),
    }))
    .filter((it) => it.name)
    .slice(0, 30);

  const result = { ingredients };
  await putCachedResult(cacheKey, result);
  return result;
});

// Распознавание блюда по фото: название, КБЖУ всей порции и примерный вес.
// Если на фото не видно компонентов, сильно влияющих на КБЖУ (масло, соус, сахар),
// возвращает needClarification=true с вопросами. Учитывает ответы пользователя.
exports.analyzePhoto = onCall({ secrets: [ANTHROPIC_API_KEY], region: 'us-central1', memory: '512MiB' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Войдите в аккаунт.');
  await enforceAiLimit(request.auth.uid);
  const imageBase64 = String((request.data && request.data.imageBase64) || '');
  const mimeType = String((request.data && request.data.mimeType) || 'image/jpeg');
  const answers = String((request.data && request.data.answers) || '').trim().slice(0, 1500);
  if (!imageBase64) throw new HttpsError('invalid-argument', 'Нет изображения.');
  if (imageBase64.length > 7000000) throw new HttpsError('invalid-argument', 'Слишком большое изображение.');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) throw new HttpsError('invalid-argument', 'Поддерживаются JPEG, PNG, WebP.');

  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      name: { type: 'string' },
      needClarification: { type: 'boolean' },
      questions: { type: 'array', items: { type: 'string' } },
      detectedIngredients: { type: 'array', items: { type: 'string' } },
      grams: { type: 'number' },
      calories: { type: 'number' },
      protein: { type: 'number' },
      fats: { type: 'number' },
      carbs: { type: 'number' },
      note: { type: 'string' },
    },
    required: ['name', 'needClarification', 'questions', 'detectedIngredients', 'grams', 'calories', 'protein', 'fats', 'carbs', 'note'],
  };

  const system = 'Ты нутрициолог. По фото блюда определи: name — короткое название блюда на русском; detectedIngredients — что видно на фото; grams — примерный вес порции в граммах; calories/protein/fats/carbs — КБЖУ ВСЕЙ порции (ккал и граммы, не на 100 г). '
    + 'ВАЖНО про уточнения: некоторые компоненты сильно меняют КБЖУ, но на фото их часто не видно (сливочное/растительное масло, соус, заправка, майонез, сахар, сливки, сироп). Если такой скрытый компонент вероятен для этого блюда и пользователь его не подтвердил/не опроверг — поставь needClarification=true и задай 1–3 коротких конкретных вопроса в questions (например «Добавляли сливочное масло в гречку?», «Каким соусом заправлен салат?»). Если всё ясно или пользователь уже ответил на уточнения — needClarification=false и questions=[]. '
    + 'В любом случае дай свою лучшую числовую оценку КБЖУ и веса (с учётом ответов пользователя). note — одна короткая строка с допущениями. Отвечай строго в требуемом JSON, без пояснений вне него.';

  const userText = 'Определи блюдо и его КБЖУ по фото.'
    + (answers ? '\n\nОтветы пользователя на уточнения (учти их и больше не спрашивай про это):\n' + answers : '');

  const body = {
    model: MODEL,
    max_tokens: 1024,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    output_config: { format: { type: 'json_schema', schema } },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
        { type: 'text', text: userText },
      ],
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
  return {
    name: String(parsed.name || 'Блюдо').slice(0, 80),
    needClarification: !!parsed.needClarification,
    questions: (Array.isArray(parsed.questions) ? parsed.questions : []).map((q) => String(q || '').trim()).filter(Boolean).slice(0, 5),
    detectedIngredients: (Array.isArray(parsed.detectedIngredients) ? parsed.detectedIngredients : []).map((q) => String(q || '').trim()).filter(Boolean).slice(0, 20),
    grams: Math.round(Number(parsed.grams) || 0),
    calories: Math.round(Number(parsed.calories) || 0),
    protein: round1(parsed.protein),
    fats: round1(parsed.fats),
    carbs: round1(parsed.carbs),
    note: String(parsed.note || '').slice(0, 200),
  };
});
