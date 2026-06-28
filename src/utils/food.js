    const normalizeFoodSearchQuery = (query) => query.toLowerCase().trim().replace(/\s+/g, ' ');

    const FOOD_TRANSLITERATION_ALIASES = {
      pizza: 'пицца',
      pizzeria: 'пицца',
      margherita: 'маргарита',
      margarita: 'маргарита',
      chicken: 'курица',
      breast: 'грудка',
      rice: 'рис',
      banana: 'банан',
      egg: 'яйцо',
      eggs: 'яйца',
      kefir: 'кефир',
      buckwheat: 'гречка',
      cottage: 'творог',
      cheese: 'сыр',
    };

    const normalizeFoodName = (name) => String(name || '')
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[%]/g, ' процент ')
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map(word => FOOD_TRANSLITERATION_ALIASES[word] || word)
      .join(' ')
      .trim();

    const getFoodAliases = (food) => Array.isArray(food?.aliases)
      ? food.aliases.map(normalizeFoodName).filter(Boolean)
      : [];

    const getFoodNameWords = (name) => normalizeFoodName(name).split(/[\s,()\/\-–—+]+/).filter(Boolean);

    // Лёгкий стеммер для русского: отбрасывает распространённые падежные/числовые
    // окончания, чтобы словоформы сводились к общей основе («яйца», «яйцо», «яйцами» → «яйц»).
    // Не лингвистически точный — задача только схлопнуть формы одного слова, не порождая
    // ложных совпадений: отбрасываем окончание лишь если основа остаётся ≥ 3 букв.
    const RU_ENDINGS = ['иями', 'ями', 'ами', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими', 'ах', 'ях', 'ам', 'ям', 'ов', 'ев', 'ой', 'ей', 'ую', 'юю', 'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ий', 'ый', 'а', 'я', 'ы', 'и', 'о', 'е', 'у', 'ю', 'ь', 'й']
      .sort((a, b) => b.length - a.length);
    const stemRu = (word) => {
      for (const end of RU_ENDINGS) {
        if (word.length - end.length >= 3 && word.endsWith(end)) return word.slice(0, -end.length);
      }
      return word;
    };

    const scoreFoodNameMatch = (name, query) => {
      const normalizedName = normalizeFoodName(name);
      const normalizedQuery = normalizeFoodName(query);
      if (!normalizedQuery) return 0;
      if (normalizedName === normalizedQuery) return 1000;
      const nameWordKey = getFoodNameWords(normalizedName).sort().join(' ');
      const queryWordKey = getFoodNameWords(normalizedQuery).sort().join(' ');
      if (nameWordKey && nameWordKey === queryWordKey) return 960;
      if (normalizedName.startsWith(normalizedQuery)) return 900 - (normalizedName.length - normalizedQuery.length);

      const words = getFoodNameWords(name);
      let bestWordPrefix = -1;
      for (const word of words) {
        if (word === normalizedQuery) bestWordPrefix = Math.max(bestWordPrefix, 860);
        else if (word.startsWith(normalizedQuery)) bestWordPrefix = Math.max(bestWordPrefix, 800 - (word.length - normalizedQuery.length));
      }
      if (bestWordPrefix >= 0) return bestWordPrefix;

      // Морфология: сводим запрос и слова названия к основам, чтобы «яйца» находило «яйцо».
      // Только для одиночного слова длиной от 3 букв — иначе риск ложных совпадений.
      if (!normalizedQuery.includes(' ') && normalizedQuery.length >= 3) {
        const queryStem = stemRu(normalizedQuery);
        if (queryStem.length >= 3) {
          let bestStem = -1;
          for (const word of words) {
            const wordStem = stemRu(word);
            if (wordStem.length < 3) continue;
            if (wordStem === queryStem) bestStem = Math.max(bestStem, 780);
            else if ((wordStem.startsWith(queryStem) || queryStem.startsWith(wordStem)) && Math.abs(wordStem.length - queryStem.length) <= 2) bestStem = Math.max(bestStem, 720);
          }
          if (bestStem >= 0) return bestStem;
        }
      }

      if (normalizedQuery.length <= 2) return -1;

      for (const word of words) {
        const wordIndex = word.indexOf(normalizedQuery);
        if (wordIndex === 0) continue;
        if (wordIndex > 0) return 500 - wordIndex;
      }

      if (normalizedQuery.length >= 3) {
        const substringIndex = normalizedName.indexOf(normalizedQuery);
        if (substringIndex >= 0) return 350 - substringIndex;
      }

      return -1;
    };

    const scoreFoodMatch = (food, query) => {
      const names = [
        food?.name,
        food?.normalizedName,
        ...getFoodAliases(food),
      ].filter(Boolean);
      return names.reduce((best, name) => Math.max(best, scoreFoodNameMatch(name, query)), -1);
    };

    const findBestFoodMatch = (foods, query, { confidentScore = 900, suggestionsLimit = 3 } = {}) => {
      const normalizedQuery = normalizeFoodName(query);
      if (!normalizedQuery) return { match: null, suggestions: [], score: -1 };

      const ranked = foods
        .map(food => ({ food, score: scoreFoodMatch(food, normalizedQuery) }))
        .filter(item => item.score >= 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.food.name.localeCompare(b.food.name, 'ru');
        });

      const best = ranked[0];
      return {
        match: best && best.score >= confidentScore ? best.food : null,
        suggestions: ranked.slice(0, suggestionsLimit).map(item => item.food),
        score: best ? best.score : -1,
      };
    };

    const FOOD_NUTRITION_ESTIMATES = [
      {
        normalizedName: 'пицца маргарита',
        aliases: ['pizza margherita', 'margherita pizza', 'маргарита пицца', 'маргарита'],
        estimate: {
          name: 'Пицца Маргарита',
          calories: 250,
          protein: 10,
          fats: 9,
          carbs: 32,
          confidence: 0.75,
        },
      },
    ];

    const findEstimatedNutrition = (query) => {
      const normalizedQuery = normalizeFoodName(query);
      if (!normalizedQuery) return null;

      const ranked = FOOD_NUTRITION_ESTIMATES
        .map(item => {
          const candidates = [item.normalizedName, ...item.aliases];
          const score = candidates.reduce((best, name) => Math.max(best, scoreFoodNameMatch(name, normalizedQuery)), -1);
          return { item, score };
        })
        .sort((a, b) => b.score - a.score);

      const best = ranked[0];
      if (!best || best.score < 900) return null;
      return {
        ...best.item.estimate,
        normalizedName: best.item.normalizedName,
        aliases: best.item.aliases.map(normalizeFoodName).filter(Boolean),
        source: 'AI estimate',
        isAiGenerated: true,
      };
    };

    const createEstimatedFood = (query, id = Date.now().toString()) => {
      const estimate = findEstimatedNutrition(query);
      if (!estimate) return null;
      const now = new Date().toISOString();
      return {
        id,
        name: estimate.name,
        normalizedName: estimate.normalizedName,
        aliases: estimate.aliases,
        calories: estimate.calories,
        protein: estimate.protein,
        fats: estimate.fats,
        carbs: estimate.carbs,
        caloriesPer100g: estimate.calories,
        proteinPer100g: estimate.protein,
        fatPer100g: estimate.fats,
        carbsPer100g: estimate.carbs,
        source: estimate.source,
        isAiGenerated: estimate.isAiGenerated,
        confidence: estimate.confidence,
        createdAt: now,
        updatedAt: now,
      };
    };

    const calculateFoodPortion = (food, grams) => {
      const g = Number(grams);
      if (!Number.isFinite(g) || g <= 0) return null;
      return {
        calories: Math.round(((Number(food?.calories) || 0) * g) / 100),
        protein: Math.round(((Number(food?.protein) || 0) * g) / 100),
        fats: Math.round(((Number(food?.fats) || 0) * g) / 100),
        carbs: Math.round(((Number(food?.carbs) || 0) * g) / 100),
      };
    };

    const searchFoodsByName = (foods, query, limit = 40) => {
      const normalizedQuery = normalizeFoodSearchQuery(query);
      if (!normalizedQuery) return foods.slice(0, limit);
      return foods
        .map(food => ({ food, score: scoreFoodMatch(food, normalizedQuery) }))
        .filter(item => item.score >= 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          if (a.food.isFavorite !== b.food.isFavorite) return a.food.isFavorite ? -1 : 1;
          return a.food.name.localeCompare(b.food.name, 'ru');
        })
        .slice(0, limit)
        .map(item => item.food);
    };


export {
  calculateFoodPortion,
  createEstimatedFood,
  findBestFoodMatch,
  findEstimatedNutrition,
  getFoodNameWords,
  normalizeFoodName,
  normalizeFoodSearchQuery,
  scoreFoodMatch,
  scoreFoodNameMatch,
  searchFoodsByName,
};
