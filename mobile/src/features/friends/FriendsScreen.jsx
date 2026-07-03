import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAppData } from '../../app/AppDataProvider.jsx';
import { useTheme } from '../../theme/ThemeContext.jsx';
import ScreenContainer from '../../components/layout/ScreenContainer.jsx';
import { Card, SectionTitle, Button, Input, EmptyState } from '../../components/common/ui.jsx';

// Друзья: свой код, отправка заявок, входящие/исходящие, список друзей.
export default function FriendsScreen() {
  const t = useTheme();
  const {
    myFriendCode, sendFriendRequest, acceptConnection, removeConnection,
    acceptedFriends, incomingRequests, outgoingRequests, friendName, otherUid,
  } = useAppData();
  const [codeInput, setCodeInput] = useState('');

  const submitRequest = async () => {
    if (await sendFriendRequest(codeInput)) setCodeInput('');
  };

  return (
    <ScreenContainer>
      <Card>
        <SectionTitle>Ваш код друга</SectionTitle>
        <Text style={{ color: t.accent, fontSize: 28, fontWeight: '900', letterSpacing: 4, textAlign: 'center', marginVertical: 8 }}>
          {myFriendCode}
        </Text>
        <Text style={{ color: t.textMuted, fontSize: 12, textAlign: 'center' }}>
          Отправьте код другу — по нему он добавит вас.
        </Text>
      </Card>

      <Card>
        <SectionTitle>Добавить друга</SectionTitle>
        <View style={styles.row}>
          <Input
            style={{ flex: 1 }}
            placeholder="Код друга, например A1B2C3"
            autoCapitalize="characters"
            value={codeInput}
            onChangeText={setCodeInput}
          />
          <Button title="Добавить" onPress={submitRequest} style={{ marginLeft: 8 }} />
        </View>
      </Card>

      {incomingRequests.length > 0 && (
        <Card>
          <SectionTitle>Входящие заявки</SectionTitle>
          {incomingRequests.map((c) => (
            <View key={c.id} style={[styles.friendRow, { borderColor: t.line }]}>
              <Text style={{ color: t.text, flex: 1, fontSize: 14, fontWeight: '600' }}>{friendName(otherUid(c))}</Text>
              <Button title="Принять" small onPress={() => acceptConnection(c)} />
              <Pressable onPress={() => removeConnection(c)} hitSlop={8} style={{ padding: 6, marginLeft: 4 }}>
                <Ionicons name="close" size={20} color={t.danger} />
              </Pressable>
            </View>
          ))}
        </Card>
      )}

      {outgoingRequests.length > 0 && (
        <Card>
          <SectionTitle>Исходящие заявки</SectionTitle>
          {outgoingRequests.map((c) => (
            <View key={c.id} style={[styles.friendRow, { borderColor: t.line }]}>
              <Text style={{ color: t.text, flex: 1, fontSize: 14 }}>{friendName(otherUid(c))}</Text>
              <Text style={{ color: t.textMuted, fontSize: 12 }}>Ожидание…</Text>
              <Pressable onPress={() => removeConnection(c)} hitSlop={8} style={{ padding: 6, marginLeft: 4 }}>
                <Ionicons name="close" size={20} color={t.danger} />
              </Pressable>
            </View>
          ))}
        </Card>
      )}

      <Card>
        <SectionTitle>Друзья</SectionTitle>
        {acceptedFriends.length === 0 ? (
          <EmptyState text="Друзей пока нет. Обменяйтесь кодами и добавьте друг друга." />
        ) : (
          acceptedFriends.map((c) => (
            <View key={c.id} style={[styles.friendRow, { borderColor: t.line }]}>
              <Ionicons name="person-circle-outline" size={28} color={t.accent} />
              <Text style={{ color: t.text, flex: 1, fontSize: 14, fontWeight: '600', marginLeft: 8 }}>
                {friendName(otherUid(c))}
              </Text>
              <Pressable onPress={() => removeConnection(c)} hitSlop={8} style={{ padding: 6 }}>
                <Ionicons name="trash-outline" size={18} color={t.danger} />
              </Pressable>
            </View>
          ))
        )}
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
