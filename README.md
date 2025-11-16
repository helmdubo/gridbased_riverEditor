# Grid-Based River Editor

Интерактивный редактор речных систем на основе сетки с поддержкой притоков и визуализацией потоков воды.

## 🌊 Возможности

### Core Features
- ✅ **Node-Edge архитектура** - UE5.6-готовая модель данных
- ✅ Создание речных систем с явными вершинами и ребрами
- ✅ Extend upstream/downstream - расширение реки от концов
- ✅ Mid-node insertion - вставка вершин между существующими
- ✅ Comprehensive debugger - полная информация о структуре графа

### Visualization & Interaction
- ✅ Интерполяция кривых (Catmull-Rom сплайны)
- ✅ Визуализация потоков воды с направлением и скоростью
- ✅ Разные типы рек (стоячая вода, равнинная, горная, бурный поток)
- ✅ Marching Squares для отрисовки контуров
- ✅ Интерактивное перетаскивание вершин и притоков
- ✅ Retina display support (devicePixelRatio fix)
- ✅ Multi-river режим: несколько независимых рек с притоками

### In Development
- 🚧 GraphAdapter 2.0 — прямой рендеринг `RiverGraphV2` без legacy-структур
- 🚧 FlowService на Node-Edge модели
- 🚧 Расширенная поддержка pointer capture и stylus/pen устройств

## 🏗️ Архитектура

### Node-Edge Graph Model с 3-уровневой иерархией

Проект использует **Node-Edge архитектуру** с поддержкой 3-уровневой DAG иерархии, готовую к портированию в UE5.6:

```typescript
// Граф речной системы
interface RiverGraphV2 {
  nodes: Record<NodeId, Node>;        // Вершины (control points)
  splines: Record<SplineId, Spline>;  // Сплайны (river + tributary + stream)
}

// Сплайн (река, приток или ручей)
interface Spline {
  id: SplineId;
  kind: 'river' | 'tributary' | 'stream';  // 3 уровня иерархии
  nodeIds: string[];                // Порядок = направление течения
  parentId: SplineId | null;        // Родитель (null для river)
  parentJunction: NodeId | null;    // Узел присоединения к родителю
  width: Width;                     // Ширина
  children: SplineId[];             // Дочерние сплайны
}
```

**3-Level DAG Hierarchy (depth ≤ 2):**
```
River (level 0)
  ├─→ Tributary (level 1)
  │     └─→ Stream (level 2) [max depth]
  └─→ Tributary (level 1)
```

**Инварианты I1-I5:** Явные правила топологии обеспечивают корректность DAG структуры (см. `ARCHITECTURE.md`).

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
- I1-I5 invariants - строгие правила топологии DAG
- 3-level hierarchy - River → Tributary → Stream (depth ≤ 2)
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

## 🤖 Agent Handoff (2025-11-16)

**Состояние редактора**

- ✅ **3-Level DAG Hierarchy:** River → Tributary → Stream с depth ≤ 2
- ✅ **Инварианты I1-I5:** Явная валидация топологии (parentId, acyclic, bidirectional, parentJunction, depth)
- ✅ **Stream behavior fixes:** Stream больше не ведет себя как независимая река
- ✅ **Auto-refresh kind:** `refreshAllSplineKinds()` после топологических изменений
- ✅ **Multiple roles solution:** `getNodeRoles()` для узлов с несколькими ролями (source + mouth + junction)
- ✅ **Comprehensive logging:** Все cascade deletions (splines, nodes) логируются
- ✅ **Tributary new_branch:** Inner nodes притоков могут создавать streams
- ✅ **Grid density 3x:** 60x36 (вместо 20x12) для более точного редактирования

**Ключевые файлы с последними изменениями:**

1. `src/core/graph/nodeKinds.ts` - getNodeRoles(), computeNodeKind() refactored
2. `src/core/graph/operations.ts` - refreshAllSplineKinds(), detachTributary() supports stream
3. `src/core/graph/validation.ts` - canAttachToNode() enforces I5 (depth ≤ 2)
4. `src/hooks/useRiverGraphV2.ts` - fixed attached children logic, comprehensive auto-deletion logging
5. `src/domain/constants/riverConstants.ts` - grid density 60x36

**Критические коммиты этой сессии:**

- `32bbb83` - fix: Stream splines now behave correctly as attached children
- `5889340` - feat: Prevent stream children and add comprehensive auto-deletion logging
- `bb4585f` - feat: Add getNodeRoles() to solve "multiple roles" problem
- `e4b2245` - fix: Allow new_branch creation from inner nodes of tributaries
- `f7bf917` - feat: Increase grid density to 3x3 cells
- `4363657` - fix: Correct grid density to 3x (20x12 → 60x36)

**Рекомендации для следующего агента**

1. **Прочитайте ARCHITECTURE.md** - там описаны инварианты I1-I5, Multiple Roles Problem, все критические багфиксы
2. **Прочитайте AGENTS.md** - полный handoff guide с ключевыми концепциями
3. **Проверьте grid density** - убедитесь что сетка 60x36 работает корректно
4. **Тестируйте 3-level hierarchy** - создайте River → Tributary → Stream, проверьте что Stream не может иметь детей
5. **Проверьте getNodeRoles()** - при удалении узлов убедитесь что роли определяются правильно
6. **Следующие задачи:** GraphAdapter 2.0, FlowService refactoring, pointer capture

Тестовые проверки: `npm run type-check`, `npm run build`, `npm run dev`

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
