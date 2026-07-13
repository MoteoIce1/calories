const AI_TIMEOUT_MS = 15_000;

const SYSTEM_PROMPT = `You are a food text parser.

Return ONLY valid JSON.
Do not wrap JSON in markdown.
Do not write explanations.

Required JSON schema:
{
  "items": [
    {
      "name": "string",
      "amount": number | null,
      "unit": "g" | "kg" | "ml" | "l" | "pcs" | "unknown",
      "amount_g": number | null,
      "confidence": number
    }
  ]
}

Rules:
- Extract only food items explicitly present in the user's text.
- Split different products into separate items.
- Use Russian product names if the input is Russian.
- amount is the numeric value from the user's text.
- unit is the unit from the user's text.
- Use "g" for grams, "kg" for kilograms, "ml" for milliliters, "l" for liters, "pcs" for pieces/counts like eggs, bananas, apples, slices, portions.
- If the amount is in grams, amount_g must equal amount.
- If the amount is in kilograms, amount_g must equal amount * 1000.
- If the unit is ml, l, pcs, or unknown, set amount_g to null unless grams are explicitly provided.
- If amount is unclear, set amount to null, unit to "unknown", amount_g to null.
- confidence must be a number from 0 to 1.
- Do not estimate calories.
- Do not estimate food weight for pieces.
- Do not provide medical advice.
- Do not add products that are not present in the text.`;

const ESTIMATE_SYSTEM_PROMPT = `You are a nutrition reference assistant.

Return ONLY valid JSON.
Do not wrap JSON in markdown.
Do not write explanations.

Required JSON schema:
{
  "name": "string",
  "normalizedName": "string",
  "caloriesPer100g": number,
  "proteinPer100g": number,
  "fatPer100g": number,
  "carbsPer100g": number,
  "confidence": number,
  "notes": "string",
  "approximate": boolean
}

Rules:
- Estimate per-100g nutrition for one food product or dish.
- Use standard reference values for typical products.
- Calories must be consistent with macros: calories ≈ protein*4 + fat*9 + carbs*4 (within 20%).
- name — Russian product name as the user would recognize it.
- normalizedName — lowercase normalized name.
- confidence — number from 0 to 1.
- notes — one short sentence about assumptions.
- approximate — true when the estimate is very rough.
- Do not provide medical advice.`;

class AiProviderError extends Error {
  constructor(provider, code, status) {
    super(`${provider} provider failed: ${code}`);
    this.name = 'AiProviderError';
    this.provider = provider;
    this.code = code;
    this.status = status;
  }
}

function isTimeoutError(error) {
  return error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

function statusToErrorCode(status) {
  if (status === 401 || status === 403) return 'invalid_key';
  if (status === 429) return 'rate_limit';
  return 'provider_unavailable';
}

async function postJson({ provider, url, headers, body, fetchImpl, timeoutMs = AI_TIMEOUT_MS }) {
  let response;

  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new AiProviderError(provider, isTimeoutError(error) ? 'timeout' : 'provider_unavailable');
  }

  if (!response.ok) {
    throw new AiProviderError(provider, statusToErrorCode(response.status), response.status);
  }

  try {
    return await response.json();
  } catch (error) {
    throw new AiProviderError(provider, 'provider_unavailable');
  }
}

function parseModelJson(provider, content) {
  if (typeof content !== 'string' || !content.trim()) {
    throw new AiProviderError(provider, 'malformed_json');
  }

  const normalized = content.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  try {
    return JSON.parse(normalized);
  } catch (error) {
    const firstBrace = normalized.indexOf('{');
    const lastBrace = normalized.lastIndexOf('}');

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(normalized.slice(firstBrace, lastBrace + 1));
      } catch (_) {
        throw new AiProviderError(provider, 'malformed_json');
      }
    }

    throw new AiProviderError(provider, 'malformed_json');
  }
}

function normalizeAmount(value) {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  if (typeof value === 'string') {
    const normalized = value.replace(',', '.');
    const match = normalized.match(/-?\d+(?:\.\d+)?/);

    if (!match) return null;

    const number = Number(match[0]);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  return null;
}

function normalizeUnit(value, rawAmount) {
  const joined = `${value || ''} ${rawAmount || ''}`.toLowerCase();

  if (/\bkg\b|кг|килограмм/.test(joined)) return 'kg';
  if (/\bg\b|гр\b|грамм/.test(joined)) return 'g';
  if (/\bml\b|мл|миллилитр/.test(joined)) return 'ml';
  if (/\bl\b|литр|\bл\b/.test(joined)) return 'l';
  if (/\bpcs\b|\bpc\b|шт|штук|яйц|банан|яблок|кус|порц/.test(joined)) return 'pcs';

  return value === 'unknown' ? 'unknown' : 'unknown';
}

function normalizeAmountG({ amount, unit, explicitAmountG }) {
  const parsedExplicitAmountG = normalizeAmount(explicitAmountG);

  if (parsedExplicitAmountG !== null) {
    return parsedExplicitAmountG;
  }

  if (amount === null) return null;

  if (unit === 'g') return amount;
  if (unit === 'kg') return amount * 1000;

  return null;
}

function normalizeConfidence(value) {
  if (value === null || value === undefined || value === '') return 0.8;

  let number = value;

  if (typeof value === 'string') {
    number = Number(value.replace('%', '').replace(',', '.'));
  }

  if (!Number.isFinite(number)) return 0.8;

  if (number > 1 && number <= 100) {
    number = number / 100;
  }

  return Math.min(1, Math.max(0, number));
}

function validateFoodResult(provider, value) {
  let itemsSource = value?.items;

  if (!Array.isArray(itemsSource) && Array.isArray(value)) {
    itemsSource = value;
  }

  if (!Array.isArray(itemsSource) && Array.isArray(value?.products)) {
    itemsSource = value.products;
  }

  if (!Array.isArray(itemsSource) && Array.isArray(value?.foods)) {
    itemsSource = value.foods;
  }

  if (!Array.isArray(itemsSource)) {
    throw new AiProviderError(provider, 'malformed_json');
  }

  const items = itemsSource.map((item) => {
    const name = typeof item?.name === 'string'
      ? item.name.trim()
      : typeof item?.product === 'string'
        ? item.product.trim()
        : typeof item?.food === 'string'
          ? item.food.trim()
          : '';

    const rawAmount = item?.amount ?? item?.quantity ?? item?.count ?? item?.amount_g ?? item?.grams ?? item?.g ?? item?.weight_g ?? null;
    const amount = normalizeAmount(rawAmount);

    const rawUnit = item?.unit ?? item?.amount_unit ?? item?.measure ?? item?.measurement_unit ?? null;
    const unit = normalizeUnit(rawUnit, rawAmount);

    const amount_g = normalizeAmountG({
      amount,
      unit,
      explicitAmountG: item?.amount_g ?? item?.grams ?? item?.g ?? item?.weight_g ?? null,
    });

    const confidence = normalizeConfidence(item?.confidence);

    if (!name || name.length > 200) {
      throw new AiProviderError(provider, 'malformed_json');
    }

    return { name, amount, unit, amount_g, confidence };
  });

  return { items };
}

function validateEstimateResult(provider, value, fallbackName) {
  const name = typeof value?.name === 'string' && value.name.trim()
    ? value.name.trim()
    : String(fallbackName || '').trim();
  if (!name || name.length > 120) {
    throw new AiProviderError(provider, 'malformed_json');
  }

  const normalizedName = typeof value?.normalizedName === 'string' && value.normalizedName.trim()
    ? value.normalizedName.trim()
    : name.toLowerCase();

  const caloriesPer100g = normalizeAmount(value?.caloriesPer100g ?? value?.calories);
  const proteinPer100g = normalizeAmount(value?.proteinPer100g ?? value?.protein);
  const fatPer100g = normalizeAmount(value?.fatPer100g ?? value?.fats);
  const carbsPer100g = normalizeAmount(value?.carbsPer100g ?? value?.carbs);

  if (
    caloriesPer100g === null
    || proteinPer100g === null
    || fatPer100g === null
    || carbsPer100g === null
  ) {
    throw new AiProviderError(provider, 'malformed_json');
  }

  return {
    name,
    normalizedName,
    caloriesPer100g,
    proteinPer100g,
    fatPer100g,
    carbsPer100g,
    confidence: normalizeConfidence(value?.confidence),
    notes: typeof value?.notes === 'string' ? value.notes.trim().slice(0, 200) : '',
    approximate: Boolean(value?.approximate),
  };
}

function chatCompletionsBody(model, text) {
  return {
    model,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text },
    ],
  };
}

function estimateChatCompletionsBody(model, name) {
  return {
    model,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: ESTIMATE_SYSTEM_PROMPT },
      { role: 'user', content: `Продукт или блюдо: ${name}` },
    ],
  };
}

function createOpenAIProvider({ apiKey, model = 'gpt-4o-mini', fetchImpl = fetch }) {
  return {
    name: 'openai',
    async parse(text) {
      const data = await postJson({
        provider: 'openai',
        url: 'https://api.openai.com/v1/chat/completions',
        headers: { authorization: `Bearer ${apiKey}` },
        body: chatCompletionsBody(model, text),
        fetchImpl,
      });
      const parsed = parseModelJson('openai', data.choices?.[0]?.message?.content);
      return validateFoodResult('openai', parsed);
    },
    async estimate(name) {
      const data = await postJson({
        provider: 'openai',
        url: 'https://api.openai.com/v1/chat/completions',
        headers: { authorization: `Bearer ${apiKey}` },
        body: estimateChatCompletionsBody(model, name),
        fetchImpl,
      });
      const parsed = parseModelJson('openai', data.choices?.[0]?.message?.content);
      return validateEstimateResult('openai', parsed, name);
    },
  };
}

function createOpenRouterProvider({ apiKey, model = 'openai/gpt-4o-mini', fetchImpl = fetch }) {
  return {
    name: 'openrouter',
    async parse(text) {
      const data = await postJson({
        provider: 'openrouter',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        headers: { authorization: `Bearer ${apiKey}` },
        body: chatCompletionsBody(model, text),
        fetchImpl,
      });
      const parsed = parseModelJson('openrouter', data.choices?.[0]?.message?.content);
      return validateFoodResult('openrouter', parsed);
    },
    async estimate(name) {
      const data = await postJson({
        provider: 'openrouter',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        headers: { authorization: `Bearer ${apiKey}` },
        body: estimateChatCompletionsBody(model, name),
        fetchImpl,
      });
      const parsed = parseModelJson('openrouter', data.choices?.[0]?.message?.content);
      return validateEstimateResult('openrouter', parsed, name);
    },
  };
}

function createGeminiProvider({ apiKey, model = 'gemini-2.5-flash', fetchImpl = fetch }) {
  return {
    name: 'gemini',
    async parse(text) {
      const data = await postJson({
        provider: 'gemini',
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        headers: { 'x-goog-api-key': apiKey },
        body: {
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json' },
        },
        fetchImpl,
      });
      const content = data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || '')
        .join('');
      const parsed = parseModelJson('gemini', content);
      return validateFoodResult('gemini', parsed);
    },
    async estimate(name) {
      const data = await postJson({
        provider: 'gemini',
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        headers: { 'x-goog-api-key': apiKey },
        body: {
          systemInstruction: { parts: [{ text: ESTIMATE_SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: `Продукт или блюдо: ${name}` }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json' },
        },
        fetchImpl,
      });
      const content = data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || '')
        .join('');
      const parsed = parseModelJson('gemini', content);
      return validateEstimateResult('gemini', parsed, name);
    },
  };
}

function createProviders({ env = process.env, fetchImpl = fetch } = {}) {
  const providers = new Map();

  if (env.OPENAI_API_KEY) {
    providers.set('openai', createOpenAIProvider({
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL || 'gpt-4o-mini',
      fetchImpl,
    }));
  }
  if (env.OPENROUTER_API_KEY) {
    providers.set('openrouter', createOpenRouterProvider({
      apiKey: env.OPENROUTER_API_KEY,
      model: env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
      fetchImpl,
    }));
  }
  if (env.GEMINI_API_KEY) {
    providers.set('gemini', createGeminiProvider({
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL || 'gemini-2.5-flash',
      fetchImpl,
    }));
  }

  return providers;
}

function providerOrder(env = process.env) {
  const primary = env.AI_PRIMARY_PROVIDER || 'openai';
  const fallback = env.AI_FALLBACK_PROVIDER || 'openrouter';
  return [...new Set([primary, fallback, 'gemini'])]
    .filter((provider) => ['openai', 'openrouter', 'gemini'].includes(provider));
}

async function parseFoodWithFallback({ text, providers, env = process.env, log = console }) {
  for (const providerName of providerOrder(env)) {
    const provider = providers.get(providerName);
    if (!provider) continue;

    try {
      const result = await provider.parse(text);
      return { ...result, provider: providerName };
    } catch (error) {
      const code = error instanceof AiProviderError ? error.code : 'provider_unavailable';
      const status = error instanceof AiProviderError ? error.status : undefined;

      // Never log the food text or raw model output: both can contain user data.
      log.warn('Food AI provider failed', { provider: providerName, code, status });
    }
  }

  return null;
}

async function estimateFoodWithFallback({ name, providers, env = process.env, log = console }) {
  for (const providerName of providerOrder(env)) {
    const provider = providers.get(providerName);
    if (!provider || typeof provider.estimate !== 'function') continue;

    try {
      const result = await provider.estimate(name);
      return { ...result, provider: providerName };
    } catch (error) {
      const code = error instanceof AiProviderError ? error.code : 'provider_unavailable';
      const status = error instanceof AiProviderError ? error.status : undefined;
      log.warn('Food estimate provider failed', { provider: providerName, code, status });
    }
  }

  return null;
}

module.exports = {
  AI_TIMEOUT_MS,
  SYSTEM_PROMPT,
  ESTIMATE_SYSTEM_PROMPT,
  AiProviderError,
  createGeminiProvider,
  createOpenAIProvider,
  createOpenRouterProvider,
  createProviders,
  estimateFoodWithFallback,
  parseFoodWithFallback,
  providerOrder,
  validateEstimateResult,
  validateFoodResult,
};
