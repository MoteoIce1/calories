    const normalizeFoodSearchQuery = (query) => query.toLowerCase().trim().replace(/\s+/g, ' ');

    const getFoodNameWords = (name) => name.toLowerCase().split(/[\s,()\/\-–—+]+/).filter(Boolean);

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
