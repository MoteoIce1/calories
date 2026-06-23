    const getLocalDateString = (dateObj) => {
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const getDefaultStartDate = () => {
      const d = new Date();
      d.setMonth(d.getMonth() - 1);
      return getLocalDateString(d);
    };

    const getDefaultExportEndDate = () => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return getLocalDateString(d);
    };

    const displayDate = (dateString) => {
      const [year, month, day] = dateString.split('-');
      const d = new Date(year, month - 1, day);
      const todayStr = getLocalDateString(new Date());
      if (dateString === todayStr) return 'Сегодня';
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (dateString === getLocalDateString(yesterday)) return 'Вчера';
      return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    };

export { getLocalDateString, getDefaultStartDate, getDefaultExportEndDate, displayDate };
