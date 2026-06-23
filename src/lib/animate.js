    // Безопасная обёртка над Motion One: если библиотека не загрузилась — тихо ничего не делаем.
    const EASE_OUT = [0.22, 1, 0.36, 1];
    const mAnimate = (el, keyframes, options) => {
      if (!el || !(window.Motion && window.Motion.animate)) return null;
      try { return window.Motion.animate(el, keyframes, options); } catch (e) { return null; }
    };

export { EASE_OUT, mAnimate };
