const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AiProviderError,
  ESTIMATE_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
  createGeminiProvider,
  createOpenAIProvider,
  estimateFoodWithFallback,
  parseFoodWithFallback,
  providerOrder,
} = require('../ai/providers');

const foodResult = {
  items: [
    { name: 'творог 5%', amount: 250, unit: 'g', amount_g: 250, confidence: 0.95 },
    { name: 'банан', amount: 100, unit: 'g', amount_g: 100, confidence: 0.95 },
  ],
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('OpenAI provider sends the required system prompt and returns validated food items', async () => {
  let request;
  const provider = createOpenAIProvider({
    apiKey: 'server-only-key',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return jsonResponse({
        choices: [{ message: { content: JSON.stringify(foodResult) } }],
      });
    },
  });

  const result = await provider.parse('творог 5% 250 г, банан 100 г');

  assert.deepEqual(result, foodResult);
  assert.equal(request.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(request.options.headers.authorization, 'Bearer server-only-key');
  const body = JSON.parse(request.options.body);
  assert.equal(body.messages[0].content, SYSTEM_PROMPT);
  assert.equal(body.messages[1].content, 'творог 5% 250 г, банан 100 г');
  assert.deepEqual(body.response_format, { type: 'json_object' });
});

test('OpenAI provider classifies invalid keys, rate limits, and timeouts', async () => {
  const invalidKey = createOpenAIProvider({
    apiKey: 'invalid',
    fetchImpl: async () => jsonResponse({ error: {} }, 401),
  });
  const rateLimited = createOpenAIProvider({
    apiKey: 'rate-limited',
    fetchImpl: async () => jsonResponse({ error: {} }, 429),
  });
  const timedOut = createOpenAIProvider({
    apiKey: 'timeout',
    fetchImpl: async () => { throw new DOMException('Timed out', 'TimeoutError'); },
  });

  await assert.rejects(invalidKey.parse('банан'), (error) => error instanceof AiProviderError && error.code === 'invalid_key');
  await assert.rejects(rateLimited.parse('банан'), (error) => error instanceof AiProviderError && error.code === 'rate_limit');
  await assert.rejects(timedOut.parse('банан'), (error) => error instanceof AiProviderError && error.code === 'timeout');
});

test('malformed model JSON falls back to OpenRouter without logging the food text', async () => {
  const warnings = [];
  const text = 'творог 5% 250 г, банан 100 г';
  const providers = new Map([
    ['openai', {
      parse: async () => { throw new AiProviderError('openai', 'malformed_json'); },
    }],
    ['openrouter', {
      parse: async () => foodResult,
    }],
  ]);

  const result = await parseFoodWithFallback({
    text,
    providers,
    env: { AI_PRIMARY_PROVIDER: 'openai', AI_FALLBACK_PROVIDER: 'openrouter' },
    log: { warn: (message, details) => warnings.push({ message, details }) },
  });

  assert.deepEqual(result, { ...foodResult, provider: 'openrouter' });
  assert.deepEqual(warnings, [{
    message: 'Food AI provider failed',
    details: { provider: 'openai', code: 'malformed_json', status: undefined },
  }]);
  assert.equal(JSON.stringify(warnings).includes(text), false);
});

test('Gemini provider uses an API-key header and parses JSON-only output', async () => {
  let request;
  const provider = createGeminiProvider({
    apiKey: 'server-only-gemini-key',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return jsonResponse({
        candidates: [{ content: { parts: [{ text: JSON.stringify(foodResult) }] } }],
      });
    },
  });

  const result = await provider.parse('банан 100 г');

  assert.deepEqual(result, foodResult);
  assert.match(request.url, /generativelanguage\.googleapis\.com/);
  assert.equal(request.options.headers['x-goog-api-key'], 'server-only-gemini-key');
  assert.equal(request.url.includes('server-only-gemini-key'), false);
});

test('provider order keeps Gemini as an optional final fallback and rejects unknown providers', () => {
  assert.deepEqual(
    providerOrder({ AI_PRIMARY_PROVIDER: 'openai', AI_FALLBACK_PROVIDER: 'openrouter' }),
    ['openai', 'openrouter', 'gemini'],
  );
  assert.deepEqual(
    providerOrder({ AI_PRIMARY_PROVIDER: 'unknown', AI_FALLBACK_PROVIDER: 'gemini' }),
    ['gemini'],
  );
});

test('all providers failing produces no result for the route to turn into a 503 response', async () => {
  const providers = new Map([
    ['openai', { parse: async () => { throw new AiProviderError('openai', 'provider_unavailable'); } }],
    ['openrouter', { parse: async () => { throw new AiProviderError('openrouter', 'rate_limit'); } }],
  ]);

  const result = await parseFoodWithFallback({
    text: 'банан 100 г',
    providers,
    env: { AI_PRIMARY_PROVIDER: 'openai', AI_FALLBACK_PROVIDER: 'openrouter' },
    log: { warn: () => {} },
  });

  assert.equal(result, null);
});

const estimateResult = {
  name: 'Хурма',
  normalizedName: 'хурма',
  caloriesPer100g: 127,
  proteinPer100g: 0.8,
  fatPer100g: 0.4,
  carbsPer100g: 33,
  confidence: 0.85,
  notes: 'Средние справочные значения для свежей хурмы.',
  approximate: false,
};

test('OpenAI provider estimates per-100g nutrition with the estimate prompt', async () => {
  let request;
  const provider = createOpenAIProvider({
    apiKey: 'server-only-key',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return jsonResponse({
        choices: [{ message: { content: JSON.stringify(estimateResult) } }],
      });
    },
  });

  const result = await provider.estimate('Хурма');

  assert.deepEqual(result, estimateResult);
  const body = JSON.parse(request.options.body);
  assert.equal(body.messages[0].content, ESTIMATE_SYSTEM_PROMPT);
  assert.equal(body.messages[1].content, 'Продукт или блюдо: Хурма');
});

test('estimateFoodWithFallback falls back when the primary provider fails', async () => {
  const providers = new Map([
    ['openai', { estimate: async () => { throw new AiProviderError('openai', 'provider_unavailable'); } }],
    ['openrouter', { estimate: async () => estimateResult }],
  ]);

  const result = await estimateFoodWithFallback({
    name: 'Хурма',
    providers,
    env: { AI_PRIMARY_PROVIDER: 'openai', AI_FALLBACK_PROVIDER: 'openrouter' },
    log: { warn: () => {} },
  });

  assert.deepEqual(result, { ...estimateResult, provider: 'openrouter' });
});
