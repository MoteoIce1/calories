    const evaluateMath = (expr) => {
      if (!expr) return 0;
      try {
        let safeStr = expr.toString().replace(/,/g, '.');
        safeStr = safeStr.replace(/[^\d.\-+*/()]/g, '');
        if (!safeStr) return 0;
        const result = new Function('return ' + safeStr)();
        return Math.max(0, Math.round(result * 10) / 10);
      } catch (e) {
        return 0;
      }
    };

export { evaluateMath };
