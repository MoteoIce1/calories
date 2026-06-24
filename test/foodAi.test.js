import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_UNAVAILABLE_MESSAGE,
  FoodAiInputError,
  FoodAiUnavailableError,
  formatParsedFoodAmount,
  getFoodAiBaseUrl,
  parseFoodText,
} from '../src/services/foodAi.js';

const parsedItems = [
  { name: 'яйцо', amount: 2, unit: 'pcs', amount_g: null, confidence: 1 },
  { name: 'рис', amount: 150, unit: 'g', amount_g: 150, confidence: 1 },
  { name: 'кефир', amount: 300, unit: 'ml', amount_g: null, confidence: 1 },
  { name: 'гречка', amount: null, unit: 'unknown', amount_g: null, confidence: 0.8 },
];

test('uses a configured API base URL or the production fallback', () => {
  assert.equal(getFoodAiBaseUrl({ VITE_API_BASE_URL: 'https://example.test/' }), 'https://example.test');
  assert.equal(getFoodAiBaseUrl({}), 'https://api.moteotracker.ru:8443');
});

test('sends only text to the backend and preserves null grams for non-weight units', async () => {
  let request;
  const result = await parseFoodText('2 яйца, рис 150 г, кефир 300 мл', {
    env: { VITE_API_BASE_URL: 'https://api.example.test/' },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ items: parsedItems, provider: 'openai' }), { status: 200 });
    },
  });

  assert.equal(request.url, 'https://api.example.test/api/ai/parse-food');
  assert.deepEqual(JSON.parse(request.options.body), { text: '2 яйца, рис 150 г, кефир 300 мл' });
  assert.deepEqual(result, { items: parsedItems, provider: 'openai' });
  assert.equal(result.items[0].amount_g, null);
  assert.equal(result.items[2].amount_g, null);
});

test('formats count, volume, and missing quantities without pretending they are grams', () => {
  assert.equal(formatParsedFoodAmount(parsedItems[0]), '2 шт');
  assert.equal(formatParsedFoodAmount(parsedItems[1]), '150 г');
  assert.equal(formatParsedFoodAmount(parsedItems[2]), '300 мл');
  assert.equal(formatParsedFoodAmount(parsedItems[3]), 'Количество не указано');
});

test('keeps the required example quantities intact', async () => {
  const examples = [
    {
      text: 'творог 5% 250 г, банан 100 г',
      items: [
        { name: 'творог 5%', amount: 250, unit: 'g', amount_g: 250, confidence: 1 },
        { name: 'банан', amount: 100, unit: 'g', amount_g: 100, confidence: 1 },
      ],
    },
    {
      text: '2 яйца, рис 150 г, куриная грудка 200 г',
      items: [
        { name: 'яйцо', amount: 2, unit: 'pcs', amount_g: null, confidence: 1 },
        { name: 'рис', amount: 150, unit: 'g', amount_g: 150, confidence: 1 },
        { name: 'куриная грудка', amount: 200, unit: 'g', amount_g: 200, confidence: 1 },
      ],
    },
    {
      text: 'гречка, кефир 300 мл',
      items: [
        { name: 'гречка', amount: null, unit: 'unknown', amount_g: null, confidence: 1 },
        { name: 'кефир', amount: 300, unit: 'ml', amount_g: null, confidence: 1 },
      ],
    },
  ];

  for (const example of examples) {
    const result = await parseFoodText(example.text, {
      fetchImpl: async () => new Response(JSON.stringify({ items: example.items, provider: 'openai' }), { status: 200 }),
    });
    assert.deepEqual(result.items, example.items);
  }
});

test('turns service and network failures into a manual-entry-friendly message', async () => {
  await assert.rejects(
    parseFoodText('банан 100 г', { fetchImpl: async () => new Response(JSON.stringify({ error: 'AI temporarily unavailable' }), { status: 503 }) }),
    (error) => error instanceof FoodAiUnavailableError && error.message === AI_UNAVAILABLE_MESSAGE,
  );
  await assert.rejects(
    parseFoodText('банан 100 г', { fetchImpl: async () => { throw new TypeError('Network error'); } }),
    (error) => error instanceof FoodAiUnavailableError,
  );
});

test('does not send empty or overlong text', async () => {
  await assert.rejects(parseFoodText('   '), FoodAiInputError);
  await assert.rejects(parseFoodText('a'.repeat(501)), FoodAiInputError);
});
