    // Скользящее среднее по последним N валидным точкам (сглаживает шум веса/воды)
    const movingAverage = (data, windowSize = 7) => {
      const result = [];
      for (let i = 0; i < data.length; i++) {
        const cur = data[i];
        if (cur === null || cur === undefined || isNaN(cur) || cur === '') {
          result.push(null);
          continue;
        }
        let sum = 0, count = 0;
        for (let j = Math.max(0, i - windowSize + 1); j <= i; j++) {
          const v = data[j];
          if (v !== null && v !== undefined && !isNaN(v) && v !== '') { sum += Number(v); count++; }
        }
        result.push(count > 0 ? Math.round((sum / count) * 100) / 100 : null);
      }
      return result;
    };

export { movingAverage };
