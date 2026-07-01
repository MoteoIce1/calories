import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CHALLENGE_TYPES,
  challengeType,
  challengeHistKey,
  challengeTargetFor,
  challengeDaysLeft,
  computeChallengeStanding,
  shouldFinalizeChallenge,
  challengeRecordVs,
  computeChallengeSafetyWarning,
} from '../src/utils/challenges.js';

const ME = 'me-uid';
const FRIEND = 'friend-uid';

function weightChallenge(overrides = {}) {
  return {
    id: 'c1',
    type: 'weight',
    status: 'active',
    members: [ME, FRIEND],
    deadline: '2026-07-31',
    targets: { [ME]: 75, [FRIEND]: 80 },
    start: { [ME]: { weight: 82 }, [FRIEND]: { weight: 90 } },
    live: {
      [ME]: { value: 79, history: [{ d: '2026-07-01', v: 79 }] },
      [FRIEND]: { value: 85, history: [{ d: '2026-07-01', v: 85 }] },
    },
    ...overrides,
  };
}

test('challenge type helpers resolve by key with a safe fallback', () => {
  assert.equal(challengeType('steps').metric, 'avg7Steps');
  assert.equal(challengeType('does-not-exist').key, CHALLENGE_TYPES[0].key);
  assert.equal(challengeHistKey('weight'), 'weightHistory');
  assert.equal(challengeHistKey('goalStreak'), undefined);
});

test('challengeTargetFor prefers per-member targets, falls back to legacy target', () => {
  assert.equal(challengeTargetFor({ targets: { [ME]: 70 } }, ME), 70);
  assert.equal(challengeTargetFor({ target: 65 }, ME), 65);
  assert.equal(challengeTargetFor({}, ME), null);
});

test('challengeDaysLeft counts inclusive days to the deadline', () => {
  assert.equal(challengeDaysLeft({ deadline: '2026-07-10' }, '2026-07-01'), 9);
  assert.equal(challengeDaysLeft({ deadline: '2026-06-30' }, '2026-07-01'), -1);
});

test('active standing uses live myStatsNow for self and c.live for opponent', () => {
  const st = computeChallengeStanding({
    challenge: weightChallenge(),
    uid: ME,
    myStatsNow: { weight: 78, weightHistory: [{ d: '2026-07-02', v: 78 }] },
    friendName: () => 'Друг',
    today: '2026-07-02',
  });
  const me = st.rows.find((r) => r.uid === ME);
  const friend = st.rows.find((r) => r.uid === FRIEND);
  assert.equal(me.value, 78);
  assert.equal(me.delta, -4);
  assert.equal(me.remaining, 3);
  assert.equal(friend.value, 85);
  assert.equal(friend.remaining, 5);
  assert.equal(st.leaderUid, ME);
  assert.equal(st.winnerUid, null);
});

test('finished standing freezes self value from live and names a winner', () => {
  const st = computeChallengeStanding({
    challenge: weightChallenge({ status: 'finished' }),
    uid: ME,
    myStatsNow: { weight: 60 },
    today: '2026-08-01',
  });
  const me = st.rows.find((r) => r.uid === ME);
  assert.equal(me.value, 79);
  assert.equal(st.finished, true);
  assert.equal(st.winnerUid, ME);
  assert.equal(st.tie, false);
});

test('reaching the goal marks the row as reached and yields the closest leader', () => {
  const st = computeChallengeStanding({
    challenge: weightChallenge({ live: { [ME]: { value: 74 }, [FRIEND]: { value: 88 } } }),
    uid: ME,
    myStatsNow: { weight: 74 },
    today: '2026-07-05',
  });
  const me = st.rows.find((r) => r.uid === ME);
  assert.equal(me.reached, true);
  assert.equal(me.remaining, 0);
  assert.equal(st.leaderUid, ME);
});

test('shouldFinalizeChallenge triggers on expiry or an early reached goal', () => {
  const expired = weightChallenge({ deadline: '2026-06-01' });
  assert.equal(shouldFinalizeChallenge({ challenge: expired, uid: ME, myStatsNow: { weight: 79 }, today: '2026-07-01' }), true);

  const early = weightChallenge();
  assert.equal(shouldFinalizeChallenge({ challenge: early, uid: ME, myStatsNow: { weight: 74 }, today: '2026-07-05' }), true);

  const ongoing = weightChallenge();
  assert.equal(shouldFinalizeChallenge({ challenge: ongoing, uid: ME, myStatsNow: { weight: 79 }, today: '2026-07-05' }), false);

  const pending = weightChallenge({ status: 'pending' });
  assert.equal(shouldFinalizeChallenge({ challenge: pending, uid: ME, myStatsNow: { weight: 74 }, today: '2026-07-05' }), false);
});

test('challengeRecordVs tallies finished challenges between two friends', () => {
  const finishedWin = weightChallenge({ id: 'w', status: 'finished', live: { [ME]: { value: 75 }, [FRIEND]: { value: 88 } } });
  const finishedLoss = weightChallenge({ id: 'l', status: 'finished', live: { [ME]: { value: 81 }, [FRIEND]: { value: 80 } } });
  const stillActive = weightChallenge({ id: 'a', status: 'active' });
  const record = challengeRecordVs([finishedWin, finishedLoss, stillActive], ME, FRIEND);
  assert.deepEqual(record, { wins: 1, losses: 1, ties: 0 });
});

test('safety warning checks both sides only when the value is known', () => {
  const both = computeChallengeSafetyWarning({
    type: 'weight', myTarget: 70, friendTarget: 70, myCurrent: 80, friendCurrent: 95, deadline: '2026-07-15', today: '2026-07-01',
  });
  assert.match(both, /у соперника/);

  const safe = computeChallengeSafetyWarning({
    type: 'weight', myTarget: 79, friendTarget: 79, myCurrent: 80, friendCurrent: 80, deadline: '2026-09-01', today: '2026-07-01',
  });
  assert.equal(safe, '');

  const unknownFriend = computeChallengeSafetyWarning({
    type: 'weight', myTarget: 79, friendTarget: 60, myCurrent: 80, friendCurrent: undefined, deadline: '2026-07-15', today: '2026-07-01',
  });
  assert.equal(unknownFriend, '');
});
