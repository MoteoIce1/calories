    const HARDCODED_FOODS = [
      { id: 'h1', name: 'Котлета (говядина)', calories: 255, protein: 25, fats: 17, carbs: 0, isFavorite: false },
      { id: 'h2', name: 'Котлеты куриные', calories: 160, protein: 16, fats: 9, carbs: 4, isFavorite: false },
      { id: 'h4', name: 'Куриное филе (сырое)', calories: 113, protein: 23.6, fats: 1.9, carbs: 0, isFavorite: false },
      { id: 'h7', name: 'Гречка вареная', calories: 132, protein: 4.5, fats: 1.1, carbs: 26, isFavorite: false },
      { id: 'h13', name: 'Помидор', calories: 19, protein: 1, fats: 0.2, carbs: 4, isFavorite: false },
      { id: 'h14', name: 'Огурец', calories: 15, protein: 1, fats: 0.1, carbs: 3, isFavorite: false },
      { id: 'h18', name: 'Яйцо куриное (на 100г)', calories: 155, protein: 13, fats: 11, carbs: 1, isFavorite: false },
    ];

    const BODY_MEASURE_FIELDS = [
      { key: 'waist', label: 'Талия', unit: 'см' },
      { key: 'chest', label: 'Грудь', unit: 'см' },
      { key: 'neck', label: 'Шея', unit: 'см' },
      { key: 'hips', label: 'Бёдра', unit: 'см' },
      { key: 'bicepsRelaxed', label: 'Бицепс расслабл.', unit: 'см' },
      { key: 'bicepsFlexed', label: 'Бицепс напряж.', unit: 'см' },
      { key: 'thigh', label: 'Бедро (нога)', unit: 'см' },
    ];

    const EMPTY_BODY_MEASURES = BODY_MEASURE_FIELDS.reduce((acc, field) => ({ ...acc, [field.key]: '' }), {});
    const BODY_PHOTO_LABELS = ['Анфас', 'Бок', 'Спина'];

    const INITIAL_BODY_ENTRIES = [
      { id: 'body-2026-03-02', date: '2026-03-02', measures: { waist: 96, chest: 99, neck: 36, hips: 96, bicepsRelaxed: 32, bicepsFlexed: 37, thigh: 52 }, photos: [] },
      { id: 'body-2026-04-15', date: '2026-04-15', measures: { waist: 94, chest: 95, neck: 38, hips: 92, bicepsRelaxed: 34, bicepsFlexed: 37, thigh: 51 }, photos: [] },
      { id: 'body-2026-05-09', date: '2026-05-09', measures: { waist: 91, chest: 94, neck: 36, hips: 94, bicepsRelaxed: 33, bicepsFlexed: 37, thigh: 52 }, photos: [] },
      { id: 'body-2026-05-26', date: '2026-05-26', measures: { waist: 88, chest: 94, neck: 37, hips: 91, bicepsRelaxed: 34, bicepsFlexed: 37, thigh: 56 }, photos: [] },
    ];

export { HARDCODED_FOODS, BODY_MEASURE_FIELDS, EMPTY_BODY_MEASURES, BODY_PHOTO_LABELS, INITIAL_BODY_ENTRIES };
