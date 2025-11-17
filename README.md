# Grid-Based River Editor

Интерактивный редактор речных систем на основе сетки с поддержкой притоков и визуализацией потоков воды.

## 🌊 Возможности

### Core Features
- ✅ **Node-Spline архитектура** - UE5.6-готовая модель данных
- ✅ Создание речных систем с явными вершинами и сплайнами
- ✅ Extend upstream/downstream - расширение реки от концов
- ✅ Mid-node insertion - вставка вершин между существующими
- ✅ Comprehensive debugger - полная информация о структуре графа
- ✅ **Two-level grid system** - 48px (визуализация) + 16px (вычисления)
- ✅ **Stream hierarchy restriction** - level 2 inner nodes не создают точки

### Performance & UX (NEW 2025-11-17)
- ✅ **Incremental geometry updates** - 30x faster drag rendering
- ✅ **Lazy FlowField evaluation** - вычисление по требованию
- ✅ **Drag batching** - плавное перетаскивание без jitter
- ✅ **Clean snap visualization** - zoom effect без артефактов
- ✅ **Merge survivor positioning** - интуитивное поведение при слиянии

### Visualization & Interaction
- ✅ Интерполяция кривых (Catmull-Rom сплайны)
- ✅ Визуализация потоков воды с направлением и скоростью
- ✅ Разные типы рек (стоячая вода, равнинная, горная, бурный поток)
- ✅ Marching Squares для отрисовки контуров (16px precision)
- ✅ Интерактивное перетаскивание вершин и притоков
- ✅ Retina display support (devicePixelRatio fix)
- ✅ Multi-river режим: несколько независимых рек с притоками

## 🏗️ Архитектура

### Node-Edge Graph Model

Проект использует **Node-Edge архитектуру**, готовую к портированию в UE5.6:

```typescript
// Граф речной системы
interface RiverGraphV2 {
  nodes: Record<NodeId, Node>;      // Вершины (control points)
  edges: Record<EdgeId, Edge>;      // Реки (main + tributaries)
  mainEdgeId: EdgeId | null;        // ID главной реки
}

// Ребро (река или приток)
interface Edge {
  id: EdgeId;
  kind: 'river' | 'tributary';
  nodeIds: string[];                // Порядок = направление течения
  parentId: EdgeId | null;          // Родительская река (для притоков)
  parentJunction: NodeId | null;    // Узел присоединения
  width: Width;                     // Ширина
  children: EdgeId[];               // Дочерние притоки
}
```

### Многослойная архитектура

```
Core Layer (UE-Ready, Pure Functions)
  src/core/graph/        - types, operations, validation
  src/core/geometry/     - curves, frames, cache
    ↓
Service Layer (Adapters & Business Logic)
  src/services/          - GraphService, RenderService, FlowService
    ↓
Hooks Layer (React State Management)
  src/hooks/             - useRiverGraphV2, useRiverRendererV2
    ↓
Presentation Layer (UI Components)
  src/components/        - RiverEditorDemo, Canvas, Overlay
```

**Принципы:**
- Core layer - pure functions (immutable)
- V1-V7 invariants - строгие правила топологии
- UE5-compatible types - готово к миграции

Подробнее: [ROADMAP.md](./ROADMAP.md) | [AGENTS.md](./AGENTS.md)

## 📦 Установка

```bash
# Клонировать репозиторий
git clone https://github.com/helmdubo/gridbased_riverEditor.git
cd gridbased_riverEditor

# Установить зависимости
npm install

# Запустить dev сервер
npm run dev
```

## 🎯 Использование

### Базовые операции (2025-12-01 update)

1. **Запуск приложения**:
   ```bash
   npm run dev
   # Откройте http://localhost:5173
   ```

2. **Создание реки**:
   - Кликните на canvas для создания первой вершины
   - Кликните снова для добавления следующих вершин
   - Река создается автоматически

3. **Extend от концов реки**:
   - **Source (исток)**: Выберите первую вершину → клик на canvas
     - Новая вершина становится новым истоком (prepend)
   - **Mouth (устье)**: Выберите последнюю вершину → клик на canvas
     - Новая вершина становится новым устьем (append)

4. **Insert между вершинами**:
   - Выберите любую промежуточную вершину (не исток/устье)
   - Кликните на canvas → новая вершина вставится после выбранной

5. **Перемещение вершин**:
   - Перетащите любую вершину для изменения формы реки
   - Кривая пересчитывается автоматически

6. **Удаление вершин**:
   - Двойной клик по вершине для удаления

7. **Debugger** (правый нижний угол):
   - Graph State - общая информация о графе
   - Selected Node - тип вершины (source/mouth/mid/junction)
   - Edge Info - информация о реке (ID, kind, width, children)
   - Tributaries - список притоков

8. **New River**:
   - Зеленая кнопка в правом верхнем углу
   - Запускает создание новой независимой реки (`kind='river'`)
   - Первые два клика задают источник и устье, далее можно расширять и добавлять притоки

### Параметры

- **River Width**: Ширина активной реки в пикселях. Для притоков ползунок отображает процент от родителя.
- **Trib Width**: Сохраняет последнее выбранное процентное значение для будущих притоков.
- **River Type**: Тип реки, влияет на скорость потока
- **Curve Weight/Scale**: Параметры влияния кривизны на поток
- **Flow Map**: RGB-визуализация (R=Vx, G=Vy, B=Скорость)
- **Flow Arrows**: Стрелки направления потока
- **Debug Zones**: Визуализация запрещённых зон вокруг узлов

## 🔧 Разработка

### Структура проекта

```
src/
├── domain/           # Доменная логика
├── services/         # Сервисы
├── hooks/           # React hooks
└── components/      # UI компоненты
```

### Команды

```bash
npm run dev          # Запуск dev сервера
npm run build        # Сборка для production
npm run preview      # Предпросмотр production сборки
npm run lint         # Проверка кода
npm run type-check   # Проверка типов TypeScript
```

### Технологии

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool & dev server
- **Canvas API** - 2D рендеринг
- **SVG** - Интерактивный overlay

## 📚 Алгоритмы

### 1. Интерполяция кривых
Используется **Catmull-Rom spline** для плавных кривых через контрольные точки.

### 2. Marching Squares
Алгоритм для отрисовки контуров воды/земли на сетке. 16 случаев в зависимости от состояния углов ячейки.

### 3. Расчет потоков
Учитывает:
- Тип реки (базовая скорость)
- Сужение русла (увеличивает скорость)
- Кривизну (внешний поворот быстрее внутреннего)
- Расстояние от центра русла (параболический профиль скорости)

### 4. Снеппинг притоков
- **Point snapping**: привязка к существующим точкам (радиус 25px)
- **Spline snapping**: привязка к линии сплайна (радиус 30px)
- **Forbidden zones**: запрещенные зоны вокруг узлов (радиус = ширина реки)

## 🎨 Цветовая схема

- **Основная река и независимые реки**: Красная (неактивная) / Оранжевая (активная)
- **Приток присоединённый**: Синяя (неактивная) / Голубая (активная)
- **Отделённые притоки**: Сразу становятся независимыми и используют палитру основной реки
- **Узловые точки**: Зелёные
- **Выделенные точки**: Жёлтая обводка
- **Snap highlight**: Золотая подсветка

---

## 🤖 Agent Handoff (2025-11-17)

**Состояние редактора - Production Ready**

- ✅ Node-Spline архитектура полностью реализована и оптимизирована
- ✅ Incremental geometry updates: 30x faster drag rendering
- ✅ Two-level grid system: 48px (middle) + 16px (small) для точности
- ✅ FlowField на мелкой сетке: 9x выше разрешение
- ✅ Lazy FlowField evaluation: вычисление по кнопке "Calculate Flow"
- ✅ Smooth drag без jitter: dragCache + automatic cleanup
- ✅ Clean snap visualization: zoom effect, NO canvas rings
- ✅ Stream hierarchy: level 2 inner nodes не создают точки
- ✅ Merge survivor positioning: интуитивное drag-and-merge
- ✅ Тестовые проверки: `npm run type-check`, `npm run build`

**Ключевые оптимизации**

1. **Drag Performance**: `updateCacheForNodeMove()` пересчитывает только затронутые splines (1-2 вместо всех)
2. **Geometry Cache**: `dragCache` для временного хранения during drag, auto-clear после rebuild
3. **FlowField Resolution**: Small grid (16px) вместо middle grid (48px) = 3x3 = 9x точнее
4. **Visual Feedback**: SVG zoom (8px) для snap targets, NO canvas ring artifacts

**Рекомендации для следующего агента**

1. Прочитайте [AGENTS.md](./AGENTS.md) - там подробная документация всех изменений
2. Изучите секции "Performance Optimizations" и "Two-Level Grid System"
3. Понимайте как работает `dragCache` и `updateCacheForNodeMove()`
4. При тестировании: drag должен быть плавным, snap targets должны "набухать" (zoom)
5. Опционально: удалите debug логи (`🎯 Snap target found...`) после финального тестирования

**Приоритетные задачи**
- Hierarchical FlowField (optional): разное разрешение для main rivers vs tributaries
- Undo/Redo stack (medium priority)
- Keyboard shortcuts (low priority)

Удачи в следующей сессии! 🚀

## 🤝 Contributing

Contributions are welcome! Please read the architecture guide first.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details

## 👨‍💻 Author

Разработано с использованием современных практик архитектуры ПО.

## 🔗 Ссылки

### Документация проекта
- [ROADMAP.md](./ROADMAP.md) - план разработки и история изменений
- [AGENTS.md](./AGENTS.md) - руководство для AI агентов и разработчиков

### Алгоритмы
- [Catmull-Rom Splines](https://en.wikipedia.org/wiki/Centripetal_Catmull%E2%80%93Rom_spline)
- [Marching Squares](https://en.wikipedia.org/wiki/Marching_squares)
- [UE5 Scriptable Tools](https://dev.epicgames.com/documentation/en-us/unreal-engine/scriptable-tools-in-unreal-engine)
