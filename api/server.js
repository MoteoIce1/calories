require('dotenv').config();

const { setGlobalDispatcher, ProxyAgent } = require('undici');

if (process.env.OUTBOUND_HTTP_PROXY) {
  setGlobalDispatcher(new ProxyAgent(process.env.OUTBOUND_HTTP_PROXY));
  console.log(`Outbound AI requests proxy enabled: ${process.env.OUTBOUND_HTTP_PROXY}`);
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createProviders, estimateFoodWithFallback, parseFoodWithFallback } = require('./ai/providers');
const { validateNutritionPer100g } = require('./ai/nutrition');

const MAX_FOOD_NAME_LENGTH = 120;

const VAGUE_QUERY_PATTERNS = [
  /что[\s-]?то\s+вкусн/i,
  /мой\s+(ужин|обед|завтрак|перекус)/i,
  /кусок\s+ед/i,
  /^тарелка$/i,
  /что[\s-]?то\s+съел/i,
  /моя\s+еда/i,
];

function isVagueFoodQuery(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed || trimmed.length < 3) return true;
  return VAGUE_QUERY_PATTERNS.some((pattern) => pattern.test(trimmed));
}

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(express.json({ limit: '32kb' }));

app.use(cors({
  origin: [
    'https://moteotracker.ru',
    'https://www.moteotracker.ru',
    'https://my-test-db-de78c.web.app',
    'https://my-test-db-de78c.firebaseapp.com'
  ],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use('/api/', rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
}));

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'moteotracker-api',
    time: new Date().toISOString()
  });
});

app.post('/api/ai/parse-food', async (req, res) => {
  const { text } = req.body || {};

  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Text is required' });
  }

  if (text.length > 500) {
    return res.status(400).json({ error: 'Text is too long' });
  }

  const result = await parseFoodWithFallback({
    text: text.trim(),
    providers: createProviders(),
  });

  if (!result) {
    return res.status(503).json({ error: 'AI temporarily unavailable' });
  }

  return res.json(result);
});

app.post('/api/ai/estimate-food', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';

  if (!name) {
    return res.status(400).json({ error: 'Введите название продукта или блюда.' });
  }

  if (name.length > MAX_FOOD_NAME_LENGTH) {
    return res.status(400).json({ error: `Название не должно быть длиннее ${MAX_FOOD_NAME_LENGTH} символов.` });
  }

  if (isVagueFoodQuery(name)) {
    return res.status(400).json({
      error: 'Уточните название продукта или блюда, например: курица с рисом, омлет или пицца Маргарита.',
    });
  }

  const result = await estimateFoodWithFallback({
    name,
    providers: createProviders(),
  });

  if (!result) {
    return res.status(503).json({ error: 'AI temporarily unavailable' });
  }

  const validation = validateNutritionPer100g(result);
  if (!validation.valid) {
    return res.status(503).json({ error: 'AI temporarily unavailable' });
  }

  return res.json({
    name: result.name,
    normalizedName: result.normalizedName,
    caloriesPer100g: validation.values.calories,
    proteinPer100g: validation.values.protein,
    fatPer100g: validation.values.fats,
    carbsPer100g: validation.values.carbs,
    source: 'ai_estimate',
    isAiGenerated: true,
    confidence: result.confidence,
    notes: result.notes,
    approximate: result.approximate,
  });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`MoteoTracker API listening on 127.0.0.1:${PORT}`);
});
