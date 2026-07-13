import {
  getFoodNameWords,
  normalizeFoodName,
  scoreFoodMatch,
} from './food.js';

const COOKING_METHODS = [
  { key: 'fried', stems: ['жарен', 'поджар', 'яичниц', 'fried'] },
  { key: 'boiled', stems: ['варен', 'отварн', 'вкрутую', 'boiled'] },
  { key: 'baked', stems: ['запечен', 'печен', 'baked'] },
  { key: 'raw', stems: ['сыро', 'raw'] },
  { key: 'dry', stems: ['сух', 'dry'] },
  { key: 'smoked', stems: ['копчен', 'smoked'] },
  { key: 'stewed', stems: ['тушен', 'stewed'] },
];

const DISH_VARIANTS = [
  { key: 'margherita', tokens: ['маргарит', 'margherita', 'margarita'] },
  { key: 'four_cheese', tokens: ['четыре сыра', '4 сыра', 'four cheese'] },
  { key: 'caesar', tokens: ['цезар', 'caesar'] },
];

function detectCookingMethod(normalizedName) {
  const words = getFoodNameWords(normalizedName);
  for (const method of COOKING_METHODS) {
    if (words.some((word) => method.stems.some((stem) => word.includes(stem)))) return method.key;
    if (method.stems.some((stem) => normalizedName.includes(stem))) return method.key;
  }
  return null;
}

function detectFatPercent(normalizedName) {
  const percentMatch = normalizedName.match(/(\d{1,2})\s*(?:процент|percent|%)/);
  if (percentMatch) return Number(percentMatch[1]);
  return null;
}

function detectDishVariant(normalizedName) {
  for (const variant of DISH_VARIANTS) {
    if (variant.tokens.some((token) => normalizedName.includes(token))) return variant.key;
  }
  return null;
}

function extractBrandHint(normalizedName, words) {
  const generic = new Set([
    'пицца', 'яйцо', 'яйца', 'рис', 'гречка', 'курица', 'грудка', 'творог', 'йогурт', 'суп',
    'омлет', 'макароны', 'салат', 'мясо', 'рыба', 'бургер', 'шаурма', 'сырники', 'борщ',
  ]);
  const brandWords = words.filter((word) => word.length >= 4 && !generic.has(word));
  return brandWords.length ? brandWords.sort().join(' ') : null;
}

export function extractFoodAttributes(name) {
  const normalized = normalizeFoodName(name);
  const words = getFoodNameWords(normalized);
  return {
    cooking: detectCookingMethod(normalized),
    fatPercent: detectFatPercent(normalized),
    dishVariant: detectDishVariant(normalized),
    brandHint: extractBrandHint(normalized, words),
  };
}

export function attributesAreCompatible(queryAttrs, foodAttrs) {
  if (queryAttrs.cooking && foodAttrs.cooking && queryAttrs.cooking !== foodAttrs.cooking) {
    return false;
  }
  if (
    queryAttrs.fatPercent != null
    && foodAttrs.fatPercent != null
    && queryAttrs.fatPercent !== foodAttrs.fatPercent
  ) {
    return false;
  }
  if (
    queryAttrs.dishVariant
    && foodAttrs.dishVariant
    && queryAttrs.dishVariant !== foodAttrs.dishVariant
  ) {
    return false;
  }
  if (queryAttrs.brandHint && foodAttrs.brandHint && queryAttrs.brandHint !== foodAttrs.brandHint) {
    return false;
  }
  return true;
}

function getCoreProductWords(name) {
  const cookingStems = COOKING_METHODS.flatMap((method) => method.stems);
  return getFoodNameWords(normalizeFoodName(name))
    .filter((word) => word.length >= 3)
    .filter((word) => !cookingStems.some((stem) => word.includes(stem)));
}

function findRelatedFoods(foods, query) {
  const queryCore = getCoreProductWords(query);
  if (!queryCore.length) return [];

  return foods.filter((food) => {
    const foodCore = getCoreProductWords(food.name);
    return queryCore.some((queryWord) => foodCore.some((foodWord) => (
      foodWord === queryWord
      || foodWord.startsWith(queryWord)
      || queryWord.startsWith(foodWord)
    )));
  });
}

export function classifyFoodSearch(foods, query) {
  const normalizedQuery = normalizeFoodName(query);
  if (!normalizedQuery) {
    return { type: 'none', match: null, suggestions: [], score: -1, conflictingFood: null };
  }

  const queryAttrs = extractFoodAttributes(query);
  const ranked = foods
    .map((food) => ({ food, score: scoreFoodMatch(food, normalizedQuery) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.food.name.localeCompare(b.food.name, 'ru');
    });

  const top = ranked[0];
  const relatedFoods = findRelatedFoods(foods, query);

  if (!top) {
    if (relatedFoods.length) {
      return {
        type: 'similar',
        match: null,
        suggestions: relatedFoods.slice(0, 3),
        score: 0,
        conflictingFood: relatedFoods[0],
      };
    }
    return { type: 'none', match: null, suggestions: [], score: -1, conflictingFood: null };
  }

  const topAttrs = extractFoodAttributes(top.food.name);
  const attrsMatch = attributesAreCompatible(queryAttrs, topAttrs);
  const nameExact = top.score >= 960;
  const nameStrong = top.score >= 900;
  const sharedWords = getCoreProductWords(query).filter((word) => getCoreProductWords(top.food.name).includes(word));

  if ((nameExact || nameStrong) && attrsMatch) {
    return {
      type: 'exact',
      match: top.food,
      suggestions: [],
      score: top.score,
      conflictingFood: null,
    };
  }

  const attributeConflict = !attrsMatch && (nameStrong || sharedWords.length > 0 || relatedFoods.some((food) => food.id === top.food.id));
  const similarSuggestions = ranked
    .filter((item) => item.score >= 350 || getCoreProductWords(item.food.name).some((word) => getCoreProductWords(query).includes(word)))
    .slice(0, 3)
    .map((item) => item.food);

  if (attributeConflict || top.score >= 500 || relatedFoods.length) {
    const suggestions = similarSuggestions.length
      ? similarSuggestions
      : relatedFoods.slice(0, 3);
    return {
      type: 'similar',
      match: null,
      suggestions: suggestions.length ? suggestions : [top.food],
      score: top.score,
      conflictingFood: attributeConflict ? top.food : (relatedFoods[0] || null),
    };
  }

  return {
    type: 'none',
    match: null,
    suggestions: similarSuggestions,
    score: top.score,
    conflictingFood: null,
  };
}
