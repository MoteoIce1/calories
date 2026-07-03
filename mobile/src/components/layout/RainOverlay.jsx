import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useTheme } from '../../theme/ThemeContext.jsx';

const DROP_COUNT = 14;

// Неоновый дождь — рендерится ТОЛЬКО в теме dark-neon-rain (см. ScreenContainer).
// Реализован через нативный Animated (useNativeDriver), чтобы не грузить JS-поток.
function Drop({ height, color, delay, duration, x }) {
  const translateY = useRef(new Animated.Value(-80)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(translateY, {
        toValue: height + 80,
        duration,
        delay,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [translateY, height, delay, duration]);

  return (
    <Animated.View
      style={[
        styles.drop,
        { left: x, backgroundColor: color, transform: [{ translateY }] },
      ]}
    />
  );
}

export default function RainOverlay() {
  const t = useTheme();
  const { width, height } = useWindowDimensions();
  if (!t.rain) return null;

  const drops = Array.from({ length: DROP_COUNT }, (_, i) => ({
    x: ((i + 0.5) / DROP_COUNT) * width + (i % 3) * 6,
    delay: (i * 331) % 2200,
    duration: 2400 + (i % 5) * 480,
    color: i % 4 === 0 ? t.rain.drop : t.rain.streak,
  }));

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: t.rain.opacity, zIndex: 0 }]}>
      {drops.map((d, i) => (
        <Drop key={i} height={height} color={d.color} delay={d.delay} duration={d.duration} x={d.x} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  drop: {
    position: 'absolute',
    top: 0,
    width: 2,
    height: 64,
    borderRadius: 1,
  },
});
