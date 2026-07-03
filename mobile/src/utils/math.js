    const evaluateMath = (expr) => {
      const input = String(expr || '').replace(/,/g, '.').replace(/\s+/g, '');
      if (!input || /[^\d.+\-*/()]/.test(input)) return 0;

      let index = 0;

      const readNumber = () => {
        let raw = '';
        while (index < input.length && /[\d.]/.test(input[index])) raw += input[index++];
        if (!raw || raw.split('.').length > 2) throw new Error('INVALID_NUMBER');
        return Number(raw);
      };

      const readFactor = () => {
        if (input[index] === '+') { index++; return readFactor(); }
        if (input[index] === '-') { index++; return -readFactor(); }
        if (input[index] === '(') {
          index++;
          const value = readExpression();
          if (input[index] !== ')') throw new Error('MISSING_BRACKET');
          index++;
          return value;
        }
        return readNumber();
      };

      const readTerm = () => {
        let value = readFactor();
        while (input[index] === '*' || input[index] === '/') {
          const op = input[index++];
          const next = readFactor();
          value = op === '*' ? value * next : value / next;
        }
        return value;
      };

      const readExpression = () => {
        let value = readTerm();
        while (input[index] === '+' || input[index] === '-') {
          const op = input[index++];
          const next = readTerm();
          value = op === '+' ? value + next : value - next;
        }
        return value;
      };

      try {
        const result = readExpression();
        if (index !== input.length || !Number.isFinite(result)) return 0;
        return Math.max(0, Math.round(result * 10) / 10);
      } catch (e) {
        return 0;
      }
    };

export { evaluateMath };
