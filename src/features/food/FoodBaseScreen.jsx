import { IconTarget, IconSave, IconDownload, IconCheck, IconStar, IconTrash, IconSearch, IconClose, IconPlus } from '../../components/Icons.jsx';

// Экран «База»: цели КБЖУ, добавление продукта, база продуктов с избранным и редактированием.
export default function FoodBaseScreen({
  draftGoals,
  handleCaloriesChange,
  handleDeficitChange,
  handleMaintenanceChange,
  handleDraftGoalChange,
  hasUnsavedGoals,
  onOpenGoalModal,
  onOpenAddProduct,
  baseSearch,
  setBaseSearch,
  downloadBackup,
  importBackup,
  importLegacy,
  foods,
  favoriteFoods,
  sortedFoods,
  isReorderingFavorites,
  setIsReorderingFavorites,
  draggingFavoriteId,
  setDraggingFavoriteId,
  moveFavoritePointer,
  editingFoodId,
  setEditingFoodId,
  editValue,
  setEditValue,
  updateFoodBase,
  toggleFavorite,
  deleteFood,
  isOwner,
  publishSharedBase,
}) {
  return (
    <div className="space-y-6">
      <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50">
        <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-2"><IconTarget className="w-4 h-4" /> Ваши цели</h2>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><span className="text-[9px] text-zinc-500 font-bold block mb-1">ККАЛ (ЦЕЛЬ)</span><input type="number" step="0.1" className="w-full bg-[#27272a] rounded-xl p-3 text-emerald-400 font-bold outline-none border border-zinc-700/30 focus:border-indigo-500 transition-colors" value={draftGoals.calories} onChange={(e) => handleCaloriesChange(e.target.value)} onFocus={(e) => e.target.select()} /></div>
          <div><span className="text-[9px] text-zinc-500 font-bold block mb-1">ЖЕЛАЕМЫЙ ДЕФИЦИТ</span><input type="number" className="w-full bg-[#27272a] rounded-xl p-3 text-amber-400 font-bold outline-none border border-zinc-700/30 focus:border-indigo-500 transition-colors" value={draftGoals.deficit} onChange={(e) => handleDeficitChange(e.target.value)} onFocus={(e) => e.target.select()} /></div>
          <div><span className="text-[9px] text-zinc-500 font-bold block mb-1">НОРМА (БЕЗ ДЕФИЦИТА)</span><input type="number" className="w-full bg-[#27272a] rounded-xl p-3 text-white font-bold outline-none border border-zinc-700/30 focus:border-indigo-500 transition-colors" value={draftGoals.maintenance} onChange={(e) => handleMaintenanceChange(e.target.value)} onFocus={(e) => e.target.select()} /></div>
          <div><span className="text-[9px] text-zinc-500 font-bold block mb-1">БАЗА ШАГОВ</span><input type="number" className="w-full bg-[#27272a] rounded-xl p-3 text-zinc-300 font-bold outline-none border border-zinc-700/30 focus:border-indigo-500 transition-colors" value={draftGoals.baseSteps} onChange={(e) => handleDraftGoalChange('baseSteps', e.target.value === '' ? '' : parseInt(e.target.value))} /></div>
          <div><span className="text-[9px] text-zinc-500 font-bold block mb-1">БЕЛОК (Г)</span><input type="number" step="0.1" className="w-full bg-[#27272a] rounded-xl p-3 text-indigo-400 font-bold outline-none border border-zinc-700/30 focus:border-indigo-500 transition-colors" value={draftGoals.protein} onChange={(e) => handleDraftGoalChange('protein', e.target.value === '' ? '' : parseFloat(e.target.value))} /></div>
          <div><span className="text-[9px] text-zinc-500 font-bold block mb-1">ЖИРЫ (Г)</span><input type="number" step="0.1" className="w-full bg-[#27272a] rounded-xl p-3 text-amber-400 font-bold outline-none border border-zinc-700/30 focus:border-indigo-500 transition-colors" value={draftGoals.fats} onChange={(e) => handleDraftGoalChange('fats', e.target.value === '' ? '' : parseFloat(e.target.value))} /></div>
          <div className="col-span-2"><span className="text-[9px] text-zinc-500 font-bold block mb-1">УГЛЕВОДЫ (Г)</span><input type="number" step="0.1" className="w-full bg-[#27272a] rounded-xl p-3 text-blue-400 font-bold outline-none border border-zinc-700/30 focus:border-indigo-500 transition-colors" value={draftGoals.carbs} onChange={(e) => handleDraftGoalChange('carbs', e.target.value === '' ? '' : parseFloat(e.target.value))} /></div>
          <div><span className="text-[9px] text-zinc-500 font-bold block mb-1">ЦЕЛЬ ПО ЖИРУ (%)</span><input type="number" step="0.1" className="w-full bg-[#27272a] rounded-xl p-3 text-amber-400 font-bold outline-none border border-zinc-700/30 focus:border-indigo-500 transition-colors" value={draftGoals.targetFat} onChange={(e) => handleDraftGoalChange('targetFat', e.target.value === '' ? '' : parseFloat(e.target.value))} /></div>
          <div><span className="text-[9px] text-zinc-500 font-bold block mb-1">ВОДА (МЛ)</span><input type="number" className="w-full bg-[#27272a] rounded-xl p-3 text-blue-400 font-bold outline-none border border-zinc-700/30 focus:border-indigo-500 transition-colors" value={draftGoals.waterGoal} onChange={(e) => handleDraftGoalChange('waterGoal', e.target.value === '' ? '' : parseInt(e.target.value))} /></div>
        </div>
        <p className="text-[10px] text-zinc-600 leading-relaxed px-1">Дефицит и цель калорий связаны: цель = норма − дефицит. Измените дефицит — пересчитается цель, и наоборот.</p>
        {hasUnsavedGoals && <button onClick={onOpenGoalModal} className="btn-active w-full bg-indigo-600 text-white p-4 rounded-xl font-bold mt-4 shadow-lg shadow-indigo-900/30 transition-all flex items-center justify-center gap-2"><IconSave className="w-5 h-5" />Сохранить цели</button>}
      </div>

      <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-4">
        <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Добавить продукт</h2>
        <p className="text-[11px] text-zinc-500 leading-relaxed">
          Новый продукт создаётся только здесь. Сначала проверим базу, при необходимости ИИ рассчитает КБЖУ на 100 г.
        </p>
        <button
          type="button"
          onClick={() => onOpenAddProduct?.(baseSearch.trim())}
          className="btn-active w-full bg-emerald-600 text-white rounded-xl p-4 font-bold shadow-lg shadow-emerald-900/20 transition-all flex items-center justify-center gap-2"
        >
          <IconPlus className="w-5 h-5" /> Добавить продукт
        </button>
      </div>

      {false && (
      <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-3">
        <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Резервное копирование</h2>
        <button onClick={downloadBackup} className="btn-active w-full bg-zinc-800 text-zinc-200 rounded-xl p-4 font-bold transition-all flex items-center justify-center gap-2"><IconDownload className="w-5 h-5" /> Скачать бэкап (JSON)</button>
        <label className="btn-active w-full bg-zinc-800 text-zinc-200 rounded-xl p-4 font-bold transition-all flex items-center justify-center gap-2 cursor-pointer">
          ♻️ Восстановить из файла
          <input type="file" accept="application/json,.json" className="hidden" onChange={importBackup} />
        </label>
        <p className="text-[10px] text-zinc-600 leading-relaxed">JSON — полная копия всех данных. Восстановление дополнит/перезапишет данные аккаунта.</p>
        <button onClick={importLegacy} className="btn-active w-full bg-zinc-900 text-zinc-400 rounded-xl p-3 text-sm font-bold transition-all border border-zinc-800">⬆️ Перенести из старой версии</button>
      </div>
      )}

      <div className="space-y-2">
        <p className="text-[11px] text-zinc-500 leading-relaxed px-1 mb-1">
          Отмечайте часто используемые продукты звёздочкой: они появятся в «Избранном» для быстрого выбора в дневнике.
        </p>
        <div className="relative px-1 mb-2">
          <IconSearch aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            placeholder="Поиск в базе"
            className="w-full bg-[#27272a] rounded-2xl py-3 pl-11 pr-14 outline-none text-zinc-200 text-sm border border-zinc-700/30 focus:border-emerald-500"
            value={baseSearch}
            onChange={(e) => setBaseSearch(e.target.value)}
          />
          {baseSearch && (
            <button type="button" onClick={() => setBaseSearch('')} className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 bg-transparent text-zinc-400 flex items-center justify-center active:text-zinc-200" title="Очистить поиск">
              <IconClose className="w-5 h-5" />
            </button>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 px-1 mb-2">
          <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">База продуктов ({sortedFoods.length})</h2>
          {favoriteFoods.length > 1 && (
            <button type="button" onClick={() => { setIsReorderingFavorites(!isReorderingFavorites); setDraggingFavoriteId(null); }} className={`btn-active px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest border transition-all ${isReorderingFavorites ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-zinc-900 text-zinc-400 border-zinc-800'}`}>
              {isReorderingFavorites ? 'Готово' : 'Изменить порядок'}
            </button>
          )}
        </div>
        {isReorderingFavorites && <p className="text-[10px] text-zinc-500 px-1 pb-1">Перетаскивай избранные продукты за ручку ☰. Обычные продукты не двигаются.</p>}
        {sortedFoods.map(f => (
          <div
            key={f.id}
            data-favorite-id={isReorderingFavorites && f.isFavorite ? f.id : undefined}
            className={`card-enter list-item-active reorder-item bg-[#18181b] rounded-xl p-3 border ${isReorderingFavorites ? 'select-none' : ''} ${draggingFavoriteId === f.id ? 'reorder-item-active border-emerald-500/70' : 'border-zinc-800/30'}`}
            style={isReorderingFavorites ? { WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' } : undefined}
          >
            {editingFoodId === f.id ? (
              <div className="space-y-3">
                 <input autoFocus className="w-full bg-zinc-900 rounded-lg p-2 text-sm text-white border border-indigo-500 outline-none" value={editValue.name} onChange={e => setEditValue({...editValue, name: e.target.value})} />
                 <div className="grid grid-cols-2 gap-2">
                    <input type="number" step="0.1" placeholder="Ккал" className="bg-zinc-900 rounded-lg p-2 text-sm text-emerald-400 outline-none text-center" value={editValue.calories} onChange={e => setEditValue({...editValue, calories: e.target.value})} onFocus={(e) => e.target.select()} />
                    <input type="number" step="0.1" placeholder="Белок" className="bg-zinc-900 rounded-lg p-2 text-sm text-indigo-400 outline-none text-center" value={editValue.protein} onChange={e => setEditValue({...editValue, protein: e.target.value})} onFocus={(e) => e.target.select()} />
                    <input type="number" step="0.1" placeholder="Жиры" className="bg-zinc-900 rounded-lg p-2 text-sm text-amber-400 outline-none text-center" value={editValue.fats} onChange={e => setEditValue({...editValue, fats: e.target.value})} onFocus={(e) => e.target.select()} />
                    <input type="number" step="0.1" placeholder="Углев" className="bg-zinc-900 rounded-lg p-2 text-sm text-blue-400 outline-none text-center" value={editValue.carbs} onChange={e => setEditValue({...editValue, carbs: e.target.value})} onFocus={(e) => e.target.select()} />
                 </div>
                 <button onClick={() => updateFoodBase(f.id)} className="btn-active w-full bg-emerald-600 p-2 rounded-lg flex justify-center transition-all"><IconCheck className="w-5 h-5 text-white" /></button>
              </div>
            ) : (
              <div className="flex justify-between items-center cursor-pointer">
                <div className="flex items-center">
                  <button onClick={(e) => toggleFavorite(e, f.id)} className="btn-active p-2 pl-0 transition-colors">
                    <IconStar className={`w-6 h-6 ${f.isFavorite ? 'text-amber-400' : 'text-zinc-700'}`} fill={f.isFavorite ? "currentColor" : "none"} />
                  </button>
                  {isReorderingFavorites && f.isFavorite && (
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      onContextMenu={(e) => e.preventDefault()}
                      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setDraggingFavoriteId(f.id); e.currentTarget.setPointerCapture?.(e.pointerId); }}
                      onPointerMove={(e) => { if (draggingFavoriteId) { e.preventDefault(); moveFavoritePointer(e.clientX, e.clientY); } }}
                      onPointerUp={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.releasePointerCapture?.(e.pointerId); setDraggingFavoriteId(null); }}
                      onPointerCancel={() => setDraggingFavoriteId(null)}
                      className={`btn-active drag-handle mr-2 px-3 py-3 rounded-xl bg-zinc-900 text-zinc-400 active:text-zinc-100 cursor-grab touch-none ${draggingFavoriteId === f.id ? 'drag-handle-active' : ''}`}
                      style={{ WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'none' }}
                      title="Перетащить избранное"
                    >
                      ☰
                    </button>
                  )}
                </div>
                <div className="flex-1" onClick={() => { if (!isReorderingFavorites && (!f._shared || isOwner)) { setEditingFoodId(f.id); setEditValue({ ...f, fats: f.fats || 0, carbs: f.carbs || 0 }); } }}>
                  <span className="text-sm font-medium border-b border-zinc-800/50 pb-0.5">{f.name}{f._shared && <span className="ml-2 text-[9px] text-zinc-600 uppercase tracking-wider">база</span>}</span>
                  <div className="flex gap-3 text-[10px] font-bold uppercase mt-1.5 opacity-80">
                    <span className="text-emerald-500">{f.calories}</span>
                    <span className="text-indigo-500">Б: {f.protein}</span>
                    <span className="text-amber-500">Ж: {f.fats}</span>
                    <span className="text-blue-500">У: {f.carbs}</span>
                  </div>
                </div>
                {(!f._shared || isOwner) && <button onClick={(e) => deleteFood(e, f.id)} className="btn-active text-zinc-800 active:text-red-500 p-2 transition-colors"><IconTrash className="w-5 h-5" /></button>}
              </div>
            )}
          </div>
        ))}
      </div>

      {isOwner && (
        <button type="button" onClick={publishSharedBase} className="btn-active w-full bg-indigo-600/15 text-indigo-300/90 border border-indigo-600/30 rounded-2xl p-3 text-[11px] font-bold uppercase tracking-widest transition-all">
          Опубликовать базу для всех ({foods.length})
        </button>
      )}

    </div>
  );
}
