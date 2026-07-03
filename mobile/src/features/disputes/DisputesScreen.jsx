import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { useAppData } from '../../app/AppDataProvider.jsx';
import { useTheme } from '../../theme/ThemeContext.jsx';
import ScreenContainer from '../../components/layout/ScreenContainer.jsx';
import { Card, SectionTitle, Button, Input, Label, EmptyState, Segmented } from '../../components/common/ui.jsx';
import { MiniWeightChart } from '../../components/common/Charts.jsx';
import AppModal from '../../components/common/AppModal.jsx';
import { CHALLENGE_TYPES, challengeType, challengeTargetFor } from '../../utils/challenges.js';
import { progressPeriods, getProgressPeriod, summarizeWeightProgress, compareWeightLoss, normalizeWeightHistory } from '../../utils/progress.js';
import { getLocalDateString } from '../../utils/date.js';

// Споры: сравнение прогресса с другом + вызовы (challenges).
export default function DisputesScreen() {
  const t = useTheme();
  const {
    uid, challenges, acceptedFriends, friendName, otherUid,
    createChallenge, acceptChallenge, removeChallenge, challengeStanding, challengeSafetyWarningFor,
    myWeightProgressHistory,
  } = useAppData();

  const acceptedFriendUids = acceptedFriends.map((c) => otherUid(c)).filter(Boolean);
  const [progressFriendUid, setProgressFriendUid] = useState('');
  const [progressPeriod, setProgressPeriod] = useState('14d');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [acceptTarget, setAcceptTarget] = useState(null); // { challenge, myTarget }

  useEffect(() => {
    if (!acceptedFriendUids.length) {
      if (progressFriendUid) setProgressFriendUid('');
      return;
    }
    if (!progressFriendUid || !acceptedFriendUids.includes(progressFriendUid)) {
      setProgressFriendUid(acceptedFriendUids[0]);
    }
  }, [progressFriendUid, acceptedFriendUids.join('|')]);

  // ── Сравнение прогресса (портировано из web) ──
  const progressToday = getLocalDateString(new Date());
  const selectedConnection = acceptedFriends.find((c) => otherUid(c) === progressFriendUid) || null;
  const friendConnectionHistory = normalizeWeightHistory(selectedConnection?.progress?.[progressFriendUid]?.weightHistory || []);
  const friendChallengeHistory = normalizeWeightHistory(
    challenges
      .filter((c) => (c.members || []).includes(progressFriendUid) && challengeType(c.type).metric === 'weight')
      .flatMap((c) => c.live?.[progressFriendUid]?.history || [])
  );
  const friendWeightHistory = normalizeWeightHistory([...friendConnectionHistory, ...friendChallengeHistory]);

  const mySummary = summarizeWeightProgress({
    history: myWeightProgressHistory,
    periodKey: progressPeriod,
    today: progressToday,
    emptyMessage: 'У вас пока нет записей прогресса',
  });
  const friendSummary = summarizeWeightProgress({
    history: friendWeightHistory,
    periodKey: progressPeriod,
    today: progressToday,
    emptyMessage: 'Отчёт не ведётся',
  });
  const outcome = compareWeightLoss(mySummary, friendSummary, getProgressPeriod(progressPeriod).label);

  const activeChallenges = challenges.filter((c) => c.status === 'active' || c.status === 'pending');
  const archivedChallenges = challenges.filter((c) => c.status === 'finished' || c.status === 'cancelled');

  const outcomeColor = { me: '#34d399', friend: t.cFatText, tie: t.cCarb, insufficient: t.textMuted }[outcome.status] || t.textMuted;

  return (
    <ScreenContainer>
      {/* ── Сравнение прогресса ── */}
      <Card>
        <SectionTitle>Прогресс с другом</SectionTitle>
        {acceptedFriends.length === 0 ? (
          <EmptyState text="Добавьте друга на экране «Друзья», чтобы сравнивать прогресс и спорить." />
        ) : (
          <>
            <Segmented
              options={acceptedFriendUids.map((fid) => ({ key: fid, label: friendName(fid) }))}
              value={progressFriendUid}
              onChange={setProgressFriendUid}
            />
            <View style={{ marginTop: 10 }}>
              <Segmented
                options={progressPeriods.map((p) => ({ key: p.key, label: p.label }))}
                value={progressPeriod}
                onChange={setProgressPeriod}
              />
            </View>
            <View style={styles.compareRow}>
              <CompareCol title="Вы" summary={mySummary} />
              <CompareCol title={friendName(progressFriendUid)} summary={friendSummary} />
            </View>
            <Text style={{ color: outcomeColor, fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: 8 }}>
              {outcome.text}
            </Text>
            <View style={{ marginTop: 12 }}>
              <MiniWeightChart
                title="Ваш вес"
                data={mySummary.filteredHistory.map((p) => p.v)}
                dates={mySummary.filteredHistory.map((p) => p.d)}
              />
              {friendSummary.hasData && (
                <MiniWeightChart
                  title={`Вес: ${friendName(progressFriendUid)}`}
                  data={friendSummary.filteredHistory.map((p) => p.v)}
                  dates={friendSummary.filteredHistory.map((p) => p.d)}
                  color={t.cFatText}
                />
              )}
            </View>
          </>
        )}
      </Card>

      {/* ── Споры ── */}
      <Card>
        <View style={styles.rowBetween}>
          <SectionTitle style={{ marginBottom: 0 }}>Споры</SectionTitle>
          {acceptedFriends.length > 0 && <Button title="+ Вызов" small onPress={() => setShowCreateModal(true)} />}
        </View>
        {activeChallenges.length === 0 ? (
          <EmptyState text="Активных споров нет. Бросьте вызов другу!" />
        ) : (
          activeChallenges.map((c) => (
            <ChallengeCard
              key={c.id}
              challenge={c}
              uid={uid}
              standing={challengeStanding(c)}
              onAccept={() => setAcceptTarget({ challenge: c, myTarget: String(challengeTargetFor(c, uid) ?? '') })}
              onRemove={() => removeChallenge(c)}
            />
          ))
        )}
      </Card>

      {archivedChallenges.length > 0 && (
        <Card>
          <SectionTitle>История споров</SectionTitle>
          {archivedChallenges.map((c) => (
            <ChallengeCard
              key={c.id}
              challenge={c}
              uid={uid}
              standing={challengeStanding(c)}
              onRemove={() => removeChallenge(c)}
            />
          ))}
        </Card>
      )}

      <CreateChallengeModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        acceptedFriendUids={acceptedFriendUids}
        friendName={friendName}
        createChallenge={createChallenge}
        challengeSafetyWarningFor={challengeSafetyWarningFor}
      />

      <AcceptChallengeModal
        target={acceptTarget}
        onClose={() => setAcceptTarget(null)}
        acceptChallenge={acceptChallenge}
      />
    </ScreenContainer>
  );
}

function CompareCol({ title, summary }) {
  const t = useTheme();
  return (
    <View style={[styles.compareCol, { backgroundColor: t.surfaceStrong, borderColor: t.line }]}>
      <Text style={{ color: t.textMuted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 }}>{title}</Text>
      {summary.hasComparableData ? (
        <>
          <Text style={{ color: summary.loss >= 0 ? '#34d399' : t.danger, fontSize: 20, fontWeight: '900', marginTop: 4 }}>
            {summary.loss >= 0 ? '−' : '+'}{Math.abs(summary.loss)} кг
          </Text>
          <Text style={{ color: t.textMuted, fontSize: 11 }}>{summary.firstWeight} → {summary.lastWeight} кг</Text>
        </>
      ) : (
        <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 6 }}>{summary.status}</Text>
      )}
    </View>
  );
}

function ChallengeCard({ challenge, uid, standing, onAccept, onRemove }) {
  const t = useTheme();
  const { tp, rows, daysLeft, finished, cancelled, winnerUid, tie } = standing;
  const isPending = challenge.status === 'pending';
  const needsMyAccept = isPending && !(challenge.acceptedBy || []).includes(uid);

  let statusText = '';
  if (cancelled) statusText = 'Спор отменён';
  else if (finished) statusText = tie ? 'Ничья' : winnerUid === uid ? 'Вы победили! 🏆' : 'Победил соперник';
  else if (isPending) statusText = needsMyAccept ? 'Вас вызвали на спор' : 'Ожидает подтверждения соперника';
  else if (daysLeft != null) statusText = `Осталось дней: ${daysLeft}`;

  return (
    <View style={[styles.challengeCard, { borderColor: t.line, backgroundColor: t.surfaceStrong }]}>
      <View style={styles.rowBetween}>
        <Text style={{ color: t.text, fontSize: 14, fontWeight: '800' }}>{tp.label}</Text>
        <Text style={{ color: t.textMuted, fontSize: 11 }}>до {challenge.deadline}</Text>
      </View>
      <Text style={{ color: t.accent, fontSize: 12, fontWeight: '600', marginVertical: 4 }}>{statusText}</Text>
      {rows.map((row) => (
        <View key={row.uid} style={styles.rowBetween}>
          <Text style={{ color: row.uid === uid ? t.accent : t.text2, fontSize: 13, fontWeight: row.uid === uid ? '700' : '400' }}>
            {row.name}{standing.leaderUid === row.uid && !finished ? ' · лидер' : ''}
          </Text>
          <Text style={{ color: t.text2, fontSize: 13 }}>
            {row.value != null ? `${row.value} ${tp.unit}` : '—'}
            {row.target != null ? ` → ${row.target} ${tp.unit}` : ''}
          </Text>
        </View>
      ))}
      <View style={[styles.row, { marginTop: 8, gap: 8 }]}>
        {needsMyAccept && <Button title="Принять вызов" small onPress={onAccept} />}
        <Button
          title={finished || cancelled ? 'Удалить из истории' : 'Отменить спор'}
          small
          variant="secondary"
          onPress={onRemove}
        />
      </View>
    </View>
  );
}

function CreateChallengeModal({ visible, onClose, acceptedFriendUids, friendName, createChallenge, challengeSafetyWarningFor }) {
  const t = useTheme();
  const emptyDraft = () => ({
    friendUid: acceptedFriendUids[0] || '',
    type: 'weight',
    myTarget: '',
    friendTarget: '',
    deadline: getLocalDateString(new Date(Date.now() + 30 * 86400000)),
  });
  const [draft, setDraft] = useState(emptyDraft);

  useEffect(() => {
    if (visible) setDraft(emptyDraft());
  }, [visible]);

  const warning = challengeSafetyWarningFor(draft);
  const tp = challengeType(draft.type);

  const submit = async () => {
    if (await createChallenge(draft)) onClose();
  };

  return (
    <AppModal visible={visible} title="Новый спор" onClose={onClose}>
      <Label>Соперник</Label>
      <Segmented
        options={acceptedFriendUids.map((fid) => ({ key: fid, label: friendName(fid) }))}
        value={draft.friendUid}
        onChange={(fid) => setDraft((d) => ({ ...d, friendUid: fid }))}
      />
      <View style={{ marginTop: 12 }}>
        <Label>Тип спора</Label>
        <Segmented
          options={CHALLENGE_TYPES.map((ct) => ({ key: ct.key, label: ct.short }))}
          value={draft.type}
          onChange={(type) => setDraft((d) => ({ ...d, type }))}
        />
        <Text style={{ color: t.textMuted, fontSize: 11, marginTop: 6 }}>{tp.help}</Text>
      </View>
      <View style={{ marginTop: 12 }}>
        <Label>Ваша цель ({tp.unit})</Label>
        <Input keyboardType="numeric" value={draft.myTarget} onChangeText={(v) => setDraft((d) => ({ ...d, myTarget: v }))} style={{ marginBottom: 10 }} />
        <Label>Цель соперника (необязательно — он подтвердит свою)</Label>
        <Input keyboardType="numeric" value={draft.friendTarget} onChangeText={(v) => setDraft((d) => ({ ...d, friendTarget: v }))} style={{ marginBottom: 10 }} />
        <Label>Срок (ГГГГ-ММ-ДД)</Label>
        <Input value={draft.deadline} onChangeText={(v) => setDraft((d) => ({ ...d, deadline: v }))} style={{ marginBottom: 10 }} />
      </View>
      {warning ? <Text style={{ color: t.cFatText, fontSize: 12, marginBottom: 10 }}>{warning}</Text> : null}
      <Button title="Отправить вызов" onPress={submit} />
    </AppModal>
  );
}

function AcceptChallengeModal({ target, onClose, acceptChallenge }) {
  const t = useTheme();
  const [myTarget, setMyTarget] = useState('');

  useEffect(() => {
    if (target) setMyTarget(target.myTarget || '');
  }, [target]);

  if (!target) return null;
  const tp = challengeType(target.challenge.type);

  const submit = async () => {
    if (await acceptChallenge(target.challenge, myTarget)) onClose();
  };

  return (
    <AppModal visible title="Принять вызов" onClose={onClose}>
      <Text style={{ color: t.text2, fontSize: 13, marginBottom: 12 }}>
        {tp.label}. Укажите СВОЮ цель — с ней вы вступаете в спор.
      </Text>
      <Label>Моя цель ({tp.unit})</Label>
      <Input keyboardType="numeric" value={myTarget} onChangeText={setMyTarget} style={{ marginBottom: 12 }} />
      <Button title="Принять спор" onPress={submit} />
    </AppModal>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  compareRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  compareCol: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
  },
  challengeCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginTop: 10,
  },
});
