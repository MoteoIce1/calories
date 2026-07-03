import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';

import { useAppData } from '../../app/AppDataProvider.jsx';
import { useTheme } from '../../theme/ThemeContext.jsx';
import { Card, SectionTitle, Button, Input } from '../../components/common/ui.jsx';
import FoodAiModal from '../food/FoodAiModal.jsx';
import { searchFoodsByName } from '../../utils/food.js';
import { evaluateMath } from '../../utils/math.js';

// Добавление еды в дневник: избранное, поиск по базе, вес, ИИ-распознавание.
export default function MealComposer({ currentDate, addFoodLog }) {
  const t = useTheme();
  const { foods, favoriteIds } = useAppData();
  const [foodSearch, setFoodSearch] = useState('');
  const [selectedFoodId, setSelectedFoodId] = useState('');
  const [gramsInput, setGramsInput] = useState('');
  const [showAiModal, setShowAiModal] = useState(false);

  const favorites = useMemo(() => {
    const byId = new Map(foods.map((f) => [f.id, f]));
    return favoriteIds.map((id) => byId.get(id)).filter(Boolean);
  }, [foods, favoriteIds]);

  const searchResults = useMemo(
    () => searchFoodsByName(foods, foodSearch, 20),
    [foods, foodSearch],
  );

  const selectedFood = foods.find((f) => f.id === selectedFoodId) || null;

  const submit = () => {
    if (!selectedFood || !gramsInput) return;
    const grams = evaluateMath(gramsInput);
    if (addFoodLog(currentDate, selectedFood, grams)) {
      setSelectedFoodId('');
      setGramsInput('');
      setFoodSearch('');
    }
  };

  const chip = (food) => {
    const active = food.id === selectedFoodId;
    return (
      <Pressable
        key={food.id}
        onPress={() => setSelectedFoodId(active ? '' : food.id)}
        style={[
          styles.chip,
          { backgroundColor: active ? t.accent : t.surfaceStrong, borderColor: active ? t.accent : t.line },
        ]}
      >
        <Text style={{ color: active ? t.accentInk : t.text2, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
          {food.name}
        </Text>
      </Pressable>
    );
  };

  return (
    <Card>
      <View style={styles.headerRow}>
        <SectionTitle style={{ marginBottom: 0 }}>Добавить еду</SectionTitle>
        <Button title="ИИ" small variant="secondary" onPress={() => setShowAiModal(true)} />
      </View>

      {favorites.length > 0 && !foodSearch && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
          {favorites.map(chip)}
        </ScrollView>
      )}

      <Input
        placeholder="Поиск продукта…"
        value={foodSearch}
        onChangeText={(text) => { setFoodSearch(text); }}
        style={{ marginTop: 10 }}
      />

      {foodSearch.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
          {searchResults.length === 0 ? (
            <Text style={{ color: t.textMuted, fontSize: 12, paddingVertical: 8 }}>Ничего не найдено</Text>
          ) : (
            searchResults.map(chip)
          )}
        </ScrollView>
      )}

      {selectedFood && (
        <View style={styles.selectedBlock}>
          <Text style={{ color: t.text2, fontSize: 12, marginBottom: 8 }}>
            {selectedFood.name} · {selectedFood.calories} ккал/100 г
          </Text>
          <View style={styles.gramsRow}>
            <Input
              style={{ flex: 1 }}
              keyboardType="numeric"
              placeholder="Вес, г (можно 100+50)"
              value={gramsInput}
              onChangeText={setGramsInput}
              onSubmitEditing={submit}
            />
            <Button title="Добавить" onPress={submit} style={{ marginLeft: 8 }} />
          </View>
        </View>
      )}

      <FoodAiModal visible={showAiModal} currentDate={currentDate} onClose={() => setShowAiModal(false)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chipsRow: {
    marginTop: 10,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginRight: 6,
    maxWidth: 180,
  },
  selectedBlock: {
    marginTop: 12,
  },
  gramsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
