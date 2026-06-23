    const normalizeFoodSearchQuery = (query) => query.toLowerCase().trim().replace(/\s+/g, ' ');

    const getFoodNameWords = (name) => name.toLowerCase().split(/[\s,()\/\-–—+]+/).filter(Boolean);

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
      const normalizedName = name.toLowerCase();
      const normalizedQuery = normalizeFoodSearchQuery(query);
      if (!normalizedQuery) return 0;
      if (normalizedName === normalizedQuery) return 1000;
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

    const searchFoodsByName = (foods, query, limit = 40) => {
      const normalizedQuery = normalizeFoodSearchQuery(query);
      if (!normalizedQuery) return foods.slice(0, limit);
      return foods
        .map(food => ({ food, score: scoreFoodNameMatch(food.name, normalizedQuery) }))
        .filter(item => item.score >= 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          if (a.food.isFavorite !== b.food.isFavorite) return a.food.isFavorite ? -1 : 1;
          return a.food.name.localeCompare(b.food.name, 'ru');
        })
        .slice(0, limit)
        .map(item => item.food);
    };


export { searchFoodsByName, normalizeFoodSearchQuery, getFoodNameWords, scoreFoodNameMatch };
