import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAppData } from '../../app/AppDataProvider.jsx';
import { useTheme } from '../../theme/ThemeContext.jsx';
import { Card, SectionTitle, Button, Input, Label } from '../../components/common/ui.jsx';
import AppModal from '../../components/common/AppModal.jsx';
import GoalsModal from './GoalsModal.jsx';
import { searchFoodsByName } from '../../utils/food.js';

// База продуктов: поиск, добавление, редактирование, избранное.
// FlatList — списки продуктов бывают длинными.
export default function FoodBaseScreen() {
  const t = useTheme();
  const { foods, isOwner, addFood, updateFoodBase, deleteFood, toggleFavorite, confirmDialog } = useAppData();
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showGoalsModal, setShowGoalsModal] = useState(false);
  const [editingFood, setEditingFood] = useState(null);

  const sortedFoods = useMemo(() => {
    if (search.trim()) return searchFoodsByName(foods, search, 100);
    return [...foods].sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      return a.name.localeCompare(b.name, 'ru');
    });
  }, [foods, search]);

  const confirmDelete = async (food) => {
    if (food._shared && !isOwner) return;
    if (await confirmDialog({ message: `Удалить «${food.name}» из базы?`, confirmLabel: 'Удалить', danger: true })) {
      deleteFood(food.id);
    }
  };

  const renderItem = ({ item }) => (
    <View style={[styles.foodRow, { borderColor: t.line }]}>
      <Pressable onPress={() => toggleFavorite(item.id)} hitSlop={8} style={{ padding: 4 }}>
        <Ionicons name={item.isFavorite ? 'star' : 'star-outline'} size={18} color={item.isFavorite ? t.cFatText : t.textFaint} />
      </Pressable>
      <View style={{ flex: 1, marginLeft: 8 }}>
        <Text style={{ color: t.text, fontSize: 14, fontWeight: '600' }}>{item.name}</Text>
        <Text style={{ color: t.textMuted, fontSize: 11 }}>
          {item.calories} ккал · Б{item.protein} Ж{item.fats} У{item.carbs}
          {item._shared ? ' · общая база' : ' · личный'}
          {item.isAiGenerated ? ' · ИИ' : ''}
        </Text>
      </View>
      {(!item._shared || isOwner) && (
        <>
          <Pressable onPress={() => setEditingFood(item)} hitSlop={8} style={{ padding: 6 }}>
            <Ionicons name="pencil-outline" size={18} color={t.textMuted} />
          </Pressable>
          <Pressable onPress={() => confirmDelete(item)} hitSlop={8} style={{ padding: 6 }}>
            <Ionicons name="trash-outline" size={18} color={t.danger} />
          </Pressable>
        </>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bgDeep }}>
      <View style={styles.header}>
        <Input
          placeholder="Поиск по базе…"
          value={search}
          onChangeText={setSearch}
          style={{ flex: 1 }}
        />
        <Button title="Цели" small variant="secondary" onPress={() => setShowGoalsModal(true)} style={{ marginLeft: 8 }} />
        <Button title="+" small onPress={() => setShowAddModal(true)} style={{ marginLeft: 8, paddingHorizontal: 16 }} />
      </View>
      <FlatList
        data={sortedFoods}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={{ color: t.textMuted, textAlign: 'center', marginTop: 32 }}>
            {search ? 'Ничего не найдено' : 'База продуктов пуста'}
          </Text>
        }
      />
      <AddFoodModal visible={showAddModal} onClose={() => setShowAddModal(false)} addFood={addFood} />
      <EditFoodModal food={editingFood} onClose={() => setEditingFood(null)} updateFoodBase={updateFoodBase} />
      <GoalsModal visible={showGoalsModal} onClose={() => setShowGoalsModal(false)} />
    </View>
  );
}

function AddFoodModal({ visible, onClose, addFood }) {
  const [draft, setDraft] = useState({ name: '', cals: '', pro: '', fat: '', carb: '' });
  const set = (key) => (v) => setDraft((d) => ({ ...d, [key]: v }));

  const submit = () => {
    if (!draft.name.trim()) return;
    addFood(draft);
    setDraft({ name: '', cals: '', pro: '', fat: '', carb: '' });
    onClose();
  };

  return (
    <AppModal visible={visible} title="Новый продукт (на 100 г)" onClose={onClose}>
      <Label>Название</Label>
      <Input value={draft.name} onChangeText={set('name')} placeholder="Например: Гречка вареная" style={styles.modalInput} />
      <View style={styles.grid}>
        <NumField label="Ккал" value={draft.cals} onChange={set('cals')} />
        <NumField label="Белки" value={draft.pro} onChange={set('pro')} />
        <NumField label="Жиры" value={draft.fat} onChange={set('fat')} />
        <NumField label="Углеводы" value={draft.carb} onChange={set('carb')} />
      </View>
      <Button title="Добавить в базу" onPress={submit} style={{ marginTop: 12 }} />
    </AppModal>
  );
}

function EditFoodModal({ food, onClose, updateFoodBase }) {
  const [draft, setDraft] = useState(null);
  React.useEffect(() => {
    if (food) {
      setDraft({
        name: food.name,
        calories: String(food.calories ?? ''),
        protein: String(food.protein ?? ''),
        fats: String(food.fats ?? ''),
        carbs: String(food.carbs ?? ''),
      });
    }
  }, [food]);
  if (!food || !draft) return null;
  const set = (key) => (v) => setDraft((d) => ({ ...d, [key]: v }));

  const submit = () => {
    updateFoodBase(food.id, draft);
    onClose();
  };

  return (
    <AppModal visible title={`Изменить: ${food.name}`} onClose={onClose}>
      <Label>Название</Label>
      <Input value={draft.name} onChangeText={set('name')} style={styles.modalInput} />
      <View style={styles.grid}>
        <NumField label="Ккал" value={draft.calories} onChange={set('calories')} />
        <NumField label="Белки" value={draft.protein} onChange={set('protein')} />
        <NumField label="Жиры" value={draft.fats} onChange={set('fats')} />
        <NumField label="Углеводы" value={draft.carbs} onChange={set('carbs')} />
      </View>
      <Button title="Сохранить" onPress={submit} style={{ marginTop: 12 }} />
    </AppModal>
  );
}

function NumField({ label, value, onChange }) {
  return (
    <View style={styles.gridItem}>
      <Label>{label}</Label>
      <Input keyboardType="numeric" value={value} onChangeText={onChange} placeholder="0" />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalInput: {
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridItem: {
    width: '47%',
  },
});
