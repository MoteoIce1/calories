// Логика споров (вызовов между друзьями). Чистые функции — их удобно тестировать
// отдельно от React-компонента. dir: 'down' — цель не выше target; 'up' — не ниже.
export const CHALLENGE_TYPES = Object.freeze([
  { key: 'weight', label: 'Сбросить вес', short: 'Вес', unit: 'кг', metric: 'weight', dir: 'down', help: 'Кто первым дойдёт до целевого веса' },
  { key: 'fat', label: 'Снизить % жира', short: 'Жир', unit: '%', metric: 'fatPercent', dir: 'down', help: 'Кто первым дойдёт до целевого % жира' },
  { key: 'waist', label: 'Уменьшить талию', short: 'Талия', unit: 'см', metric: 'waist', dir: 'down', help: 'Кто первым дойдёт до целевого обхвата талии' },
  { key: 'steps', label: 'Среднее шагов в день', short: 'Шаги', unit: 'шаг', metric: 'avg7Steps', dir: 'up', help: 'У кого выше среднее за 7 дней' },
  { key: 'deficit', label: 'Средний дефицит', short: 'Дефицит', unit: 'ккал', metric: 'avg7Deficit', dir: 'up', help: 'У кого выше средний дефицит за 7 дней' },
  { key: 'streak', label: 'Дни подряд в цели', short: 'Серия', unit: 'дн', metric: 'goalStreak', dir: 'up', help: 'Кто дольше держит дефицит без срыва' },
]);

const HIST_KEY_BY_METRIC = { weight: 'weightHistory', fatPercent: 'fatHistory', avg7Steps: 'stepsHistory', waist: 'waistHistory' };

// Безопасный темп похудения/сушки: ~0.5 в неделю, предупреждаем от 1.
export const SAFE_RATE_PER_WEEK = 1;

export function challengeType(key) {
  return CHALLENGE_TYPES.find((t) => t.key === key) || CHALLENGE_TYPES[0];
}

export function challengeHistKey(metric) {
  return HIST_KEY_BY_METRIC[metric];
}

// Цель участника: новые споры хранят targets[uid]; старые — единый target.
export function challengeTargetFor(challenge, member) {
  if (challenge?.targets && typeof challenge.targets[member] === 'number') return challenge.targets[member];
  return typeof challenge?.target === 'number' ? challenge.target : null;
}

export function challengeDaysLeft(challenge, today) {
  if (!challenge?.deadline) return null;
  return Math.ceil((new Date(challenge.deadline) - new Date(today)) / 86400000);
}

function isReached(value, target, dir) {
  const hasV = typeof value === 'number' && !Number.isNaN(value);
  const hasT = typeof target === 'number' && !Number.isNaN(target);
  if (!hasV || !hasT) return false;
  return dir === 'down' ? value <= target : value >= target;
}

// Ближайший к своей цели — лидер. Возвращаем и флаг ничьей (несколько с равным остатком).
function computeLeader(rows) {
  const valid = rows.filter((r) => r.remaining != null);
  if (!valid.length) return { leaderUid: null, tie: false };
  const min = Math.min(...valid.map((r) => r.remaining));
  const leaders = valid.filter((r) => r.remaining === min);
  return { leaderUid: leaders[0].uid, tie: leaders.length > 1 };
}

/**
 * Табло спора. Своё значение берём из свежих myStatsNow, пока спор идёт;
 * в завершённом споре — из замороженного live[uid] (не «плывёт» после дедлайна).
 * Значение соперника всегда из c.live (приватно, видно только участникам).
 */
export function computeChallengeStanding({ challenge, uid, myStatsNow = {}, friendName, today }) {
  const tp = challengeType(challenge.type);
  const histKey = challengeHistKey(tp.metric);
  const isFinished = challenge.status === 'finished';
  const nameFor = typeof friendName === 'function' ? friendName : () => 'Друг';

  const rows = (challenge.members || []).map((m) => {
    const live = challenge.live && challenge.live[m] ? challenge.live[m] : null;
    const useLiveForSelf = isFinished || !myStatsNow || typeof myStatsNow[tp.metric] !== 'number';
    const value = m === uid
      ? (useLiveForSelf ? (live ? live.value : undefined) : myStatsNow[tp.metric])
      : (live ? live.value : undefined);
    const history = m === uid
      ? (useLiveForSelf ? (live && Array.isArray(live.history) ? live.history : []) : (histKey ? (myStatsNow[histKey] || []) : []))
      : (live && Array.isArray(live.history) ? live.history : []);
    const target = challengeTargetFor(challenge, m);
    const hasV = typeof value === 'number' && !Number.isNaN(value);
    const hasT = typeof target === 'number' && !Number.isNaN(target);
    const reached = isReached(value, target, tp.dir);
    const remaining = (hasV && hasT) ? Math.max(0, tp.dir === 'down' ? value - target : target - value) : null;
    const startVal = challenge.start && challenge.start[m] ? challenge.start[m][tp.metric] : null;
    const delta = (hasV && typeof startVal === 'number') ? Math.round((value - startVal) * 10) / 10 : null;
    return {
      uid: m,
      name: m === uid ? 'Вы' : nameFor(m),
      value,
      target,
      reached,
      remaining,
      start: typeof startVal === 'number' ? startVal : null,
      delta,
      history,
    };
  });

  const { leaderUid, tie } = computeLeader(rows);
  const daysLeft = challengeDaysLeft(challenge, today);
  const anyoneReached = rows.some((r) => r.reached);
  return {
    tp,
    rows,
    leaderUid,
    daysLeft,
    finished: isFinished,
    cancelled: challenge.status === 'cancelled',
    anyoneReached,
    winnerUid: isFinished ? leaderUid : null,
    tie: isFinished ? tie : false,
  };
}

// Спор пора закрывать: он активен, но срок вышел или кто-то уже достиг цели.
export function shouldFinalizeChallenge({ challenge, uid, myStatsNow, today }) {
  if (challenge.status !== 'active') return false;
  const daysLeft = challengeDaysLeft(challenge, today);
  if (daysLeft != null && daysLeft < 0) return true;
  const { anyoneReached } = computeChallengeStanding({ challenge, uid, myStatsNow, today });
  return anyoneReached;
}

// Счёт личных встреч по завершённым спорам: {wins, losses, ties} против конкретного друга.
export function challengeRecordVs(challenges, uid, friendUid) {
  const record = { wins: 0, losses: 0, ties: 0 };
  challenges
    .filter((c) => c.status === 'finished' && (c.members || []).includes(uid) && (c.members || []).includes(friendUid))
    .forEach((c) => {
      const st = computeChallengeStanding({ challenge: c, uid, today: c.deadline });
      if (st.tie || st.winnerUid == null) record.ties += 1;
      else if (st.winnerUid === uid) record.wins += 1;
      else record.losses += 1;
    });
  return record;
}

/**
 * Предупреждение об опасно быстром темпе. Проверяем обе стороны, если известно
 * текущее значение соперника (например вес — из прогресса связи). Метрики, которых
 * мы не видим у соперника, в проверку не попадают (приватность).
 */
export function computeChallengeSafetyWarning({ type, myTarget, friendTarget, myCurrent, friendCurrent, deadline, today }) {
  if ((type !== 'weight' && type !== 'fat') || !deadline) return '';
  const weeks = Math.max(0.5, (new Date(deadline) - new Date(today)) / (86400000 * 7));
  const rateFor = (current, target) => {
    if (typeof current !== 'number' || target === '' || target == null) return 0;
    const drop = current - Number(target);
    return drop <= 0 ? 0 : drop / weeks;
  };
  const myRate = rateFor(myCurrent, myTarget);
  const friendRate = rateFor(friendCurrent, friendTarget);
  const worst = Math.max(myRate, friendRate);
  if (worst <= SAFE_RATE_PER_WEEK) return '';
  const who = myRate >= friendRate ? 'у вас' : 'у соперника';
  if (type === 'weight') {
    return `Темп ${who} ~${worst.toFixed(1)} кг/нед — такое агрессивное похудение вредит организму (безопасно ≈0,5 кг/нед, дефицит ~500 ккал/день). Поставьте срок подальше или цель помягче.`;
  }
  return `Темп ${who} ~${worst.toFixed(1)}% жира в неделю — слишком быстро и вредно (безопасно ≈0,5%/нед). Лучше увеличьте срок.`;
}
