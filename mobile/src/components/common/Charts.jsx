import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Line, Polyline, Circle, Text as SvgText } from 'react-native-svg';

import { movingAverage } from '../../utils/stats.js';
import { useTheme } from '../../theme/ThemeContext.jsx';

// Порт SVG-графиков из web src/components/Charts.jsx на react-native-svg.
// Математика построения (масштаб, скользящее среднее) не менялась.

export function ProgressChart({ title, data, dates, color, showAverage, averageMode = 'moving7' }) {
  const t = useTheme();
  if (!data || data.length < 2) return null;
  const validPoints = data
    .map((v, i) => ({ v: Number(v), i, raw: data[i] }))
    .filter((p) => p.raw !== null && p.raw !== undefined && p.raw !== '' && !Number.isNaN(p.v));
  if (validPoints.length < 2) return null;

  const W = 320, H = 150, padL = 40, padR = 14, padT = 12, padB = 24;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const values = validPoints.map((p) => p.v);
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min === 0 ? 1 : max - min;
  const pad = range * 0.15;
  const yMin = min - pad, yMax = max + pad;
  const n = data.length;

  const xFor = (i) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yFor = (v) => padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const rawLine = validPoints.map((p) => `${xFor(p.i).toFixed(1)},${yFor(p.v).toFixed(1)}`).join(' ');

  let avgLine = null;
  if (showAverage) {
    if (averageMode === 'period') {
      const avgValue = values.reduce((sum, v) => sum + v, 0) / values.length;
      avgLine = `${xFor(0).toFixed(1)},${yFor(avgValue).toFixed(1)} ${xFor(n - 1).toFixed(1)},${yFor(avgValue).toFixed(1)}`;
    } else {
      const avg = movingAverage(data, 7);
      const avgPts = avg.map((v, i) => ({ v, i })).filter((p) => p.v !== null);
      if (avgPts.length >= 2) avgLine = avgPts.map((p) => `${xFor(p.i).toFixed(1)},${yFor(p.v).toFixed(1)}`).join(' ');
    }
  }

  const yTicks = [yMax, (yMax + yMin) / 2, yMin];

  return (
    <View style={[styles.chartCard, { backgroundColor: t.surface, borderColor: t.line }]}>
      <Text style={[styles.chartTitle, { color: t.text }]}>{title}</Text>
      <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
        {yTicks.map((tick, k) => (
          <React.Fragment key={k}>
            <Line x1={padL} y1={yFor(tick)} x2={W - padR} y2={yFor(tick)} stroke={t.line} strokeWidth="1" />
            <SvgText x={padL - 5} y={yFor(tick) + 3} textAnchor="end" fontSize="8" fill={t.textMuted}>
              {tick.toFixed(1)}
            </SvgText>
          </React.Fragment>
        ))}
        <Polyline
          points={rawLine}
          fill="none"
          stroke={color}
          strokeWidth={showAverage ? 1 : 2}
          strokeOpacity={showAverage ? 0.3 : 1}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {validPoints.map((p, k) => (
          <Circle key={k} cx={xFor(p.i)} cy={yFor(p.v)} r="2.2" fill={color} fillOpacity={showAverage ? 0.35 : 1} />
        ))}
        {avgLine && <Polyline points={avgLine} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
        <SvgText x={padL} y={H - 7} textAnchor="start" fontSize="8" fill={t.textMuted}>{dates[validPoints[0].i]}</SvgText>
        <SvgText x={W - padR} y={H - 7} textAnchor="end" fontSize="8" fill={t.textMuted}>{dates[validPoints[validPoints.length - 1].i]}</SvgText>
      </Svg>
      {showAverage && (
        <Text style={[styles.chartHint, { color: t.textMuted }]}>
          {averageMode === 'period' ? 'Линия — среднее за выбранный период, точки — дни' : 'Линия — среднее за 7 дней, точки — замеры'}
        </Text>
      )}
    </View>
  );
}

export function MiniWeightChart({ title = 'Динамика веса', data, dates, color, unit = 'кг', positiveIsGood = false }) {
  const t = useTheme();
  const lineColor = color || t.accent;
  const points = (data || [])
    .map((v, i) => ({ v: Number(v), i, raw: v }))
    .filter((p) => p.raw !== null && p.raw !== undefined && p.raw !== '' && !Number.isNaN(p.v));
  if (points.length < 2) return null;

  const W = 320, H = 96, padL = 34, padR = 10, padT = 12, padB = 16;
  const values = points.map((p) => p.v);
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const yMin = Math.floor(min - range * 0.12), yMax = Math.ceil(max + range * 0.12);
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const xFor = (i) => padL + (data.length <= 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const yFor = (v) => padT + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;
  const line = points.map((p) => `${xFor(p.i).toFixed(1)},${yFor(p.v).toFixed(1)}`).join(' ');
  const yTicks = Array.from(new Set([yMax, Math.round((yMax + yMin) / 2), yMin]));
  const first = points[0].v;
  const last = points[points.length - 1].v;
  const delta = Math.round((last - first) * 10) / 10;
  const deltaColor = delta === 0 ? t.textMuted : ((delta > 0) === positiveIsGood ? '#34d399' : t.danger);

  return (
    <View style={[styles.chartCard, { backgroundColor: t.surface, borderColor: t.line }]}>
      <View style={styles.miniHeader}>
        <Text style={[styles.miniTitle, { color: t.textMuted }]}>{title.toUpperCase()}</Text>
        <Text style={{ color: deltaColor, fontSize: 11, fontWeight: '700' }}>
          {delta > 0 ? '+' : ''}{delta} {unit}
        </Text>
      </View>
      <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
        {yTicks.map((tick) => (
          <React.Fragment key={tick}>
            <Line x1={padL} y1={yFor(tick)} x2={W - padR} y2={yFor(tick)} stroke={t.line} strokeWidth="1" />
            <SvgText x={padL - 5} y={yFor(tick) + 3} textAnchor="end" fontSize="8" fill={t.textMuted}>{tick}</SvgText>
          </React.Fragment>
        ))}
        <Polyline points={line} fill="none" stroke={lineColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, idx) => <Circle key={idx} cx={xFor(p.i)} cy={yFor(p.v)} r="2.2" fill={lineColor} />)}
        <SvgText x={padL} y={H - 2} fontSize="9" fill={t.textMuted}>{dates[points[0].i]}</SvgText>
        <SvgText x={W - padR} y={H - 2} textAnchor="end" fontSize="9" fill={t.textMuted}>{dates[points[points.length - 1].i]}</SvgText>
      </Svg>
    </View>
  );
}

export function MacroBar({ label, current, goal, color }) {
  const t = useTheme();
  const numGoal = Number(goal) || 1;
  const progress = Math.min(100, (current / numGoal) * 100);
  const remaining = Math.max(0, (Number(goal) || 0) - Math.round(current));
  return (
    <View style={styles.macroWrap}>
      <View style={styles.macroHeader}>
        <Text style={[styles.macroLabel, { color: t.textMuted }]}>{label.toUpperCase()}</Text>
        <Text style={{ color, fontSize: 11, fontWeight: '700' }}>{Math.round(current)} / {goal || 0}</Text>
      </View>
      <View style={[styles.macroTrack, { backgroundColor: t.track }]}>
        <View style={{ width: `${progress}%`, backgroundColor: color, height: '100%', borderRadius: 4 }} />
      </View>
      <Text style={[styles.macroRest, { color: t.textFaint }]}>Ост: {remaining}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chartCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  chartTitle: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  chartHint: {
    fontSize: 9,
    textAlign: 'center',
    marginTop: 4,
  },
  miniHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  miniTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  macroWrap: {
    marginBottom: 10,
  },
  macroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 4,
  },
  macroLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  macroTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 3,
  },
  macroRest: {
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'right',
  },
});
