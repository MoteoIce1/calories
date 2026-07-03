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

export { BODY_MEASURE_FIELDS, EMPTY_BODY_MEASURES, BODY_PHOTO_LABELS };
