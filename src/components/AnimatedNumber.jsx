import { useState, useEffect, useRef } from 'react';
import { animate } from 'framer-motion';

// Плавный «накрут» числа при изменении значения (count-up).
export default function AnimatedNumber({ value, className }) {
  const [display, setDisplay] = useState(Math.round(Number(value) || 0));
  const prev = useRef(Math.round(Number(value) || 0));
  useEffect(() => {
    const target = Math.round(Number(value) || 0);
    const controls = animate(prev.current, target, {
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    prev.current = target;
    return () => controls.stop();
  }, [value]);
  return <span className={className}>{display}</span>;
}
