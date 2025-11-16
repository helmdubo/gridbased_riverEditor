# 🤖 AGENTS.md - AI Agent Handoff Guide

**Последнее обновление:** 2025-11-16
**Текущая фаза:** 3-Level DAG Hierarchy реализована - Stream behavior fixes завершены
**Статус:** ✅ Stable - готово к тестированию и дальнейшей разработке

---

## 📋 Краткое описание проекта

**Grid-Based River Editor** - интерактивный редактор речных систем на основе сетки для UE5.6 Scriptable Tools.

**Цель:** Создать прототип на React + Canvas, который будет портирован в Unreal Engine 5.6 с использованием Scriptable Tools framework.

**Текущее состояние:**
- ✅ Node-Edge архитектура полностью реализована
- ✅ **3-Level DAG Hierarchy:** River → Tributary → Stream с depth ≤ 2
- ✅ **Инварианты I1-I5:** Явная валидация топологии
- ✅ Core модуль (types, operations, validation, geometry) работает
- ✅ UI интеграция завершена (useRiverGraphV2, GraphService, GraphAdapter)
- ✅ Базовые операции: создание реки, добавление/удаление/перемещение вершин
- ✅ Extend upstream/downstream работают корректно
- ✅ **Stream behavior fixes:** Stream больше не ведет себя как независимая река
- ✅ **Multiple roles solution:** getNodeRoles() для узлов с несколькими ролями
- ✅ **Auto-refresh kind:** refreshAllSplineKinds() после топологических изменений
- ✅ **Comprehensive logging:** Все cascade deletions логируются
- ✅ **Tributary new_branch:** Inner nodes притоков могут создавать streams
- ✅ **Grid density 3x:** 60x36 для более точного редактирования
- ✅ Comprehensive debugger показывает полную структуру графа
- ✅ **Echo Log система для отладки** (Maya-style action logging)
- 🚧 Multi-river support (в разработке)
- 🚧 Tributary creation/attachment (требует тестирования)

---

## 🏗️ Архитектура

### Многослойная архитектура:

```
┌─────────────────────────────────────────┐
│  Presentation Layer                     │
│  src/components/                        │
│  - RiverEditorDemo.tsx                  │
│  - RiverCanvas.tsx, RiverOverlay.tsx    │
│  - ActionLog/ActionLogPanel.tsx (NEW!)  │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  Hooks Layer                            │
│  src/hooks/                             │
│  - useRiverGraphV2.ts (graph state)     │
│  - useRiverRendererV2.ts (rendering)    │
│  - useActionLog.ts (log panel) (NEW!)   │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  Service Layer + Middleware             │
│  src/services/                          │
│  - ActionDispatcher.ts (NEW! logging middleware)│
│  - GraphService.ts (adapter)            │
│  - GraphAdapter.ts (V2 → legacy)        │
│  - RenderService.ts (rendering)         │
│  - FlowService.ts (flow calculations)   │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  Core Layer (UE-Ready)                  │
│  src/core/                              │
│  - graph/ (types, operations, validation)│
│  - geometry/ (curves, frames, cache)    │
│  - actions/ (NEW! types, logger) ─────> ActionLogger (singleton)
└─────────────────────────────────────────┘
```

### Принцип UE-Ready:
- Все функции в `src/core/` - pure functions (immutable)
- Документация с `@ue_equivalent` тегами
- Типы данных совместимы с UE Blueprints/C++
- Нет React-специфичной логики в core

---

## 🔑 Ключевые концепции

### 1. Node-Edge Graph Model

**RiverGraphV2:**
```typescript
interface RiverGraphV2 {
  nodes: Record<NodeId, Node>;        // Все вершины на карте
  splines: Record<SplineId, Spline>;  // Все сплайны (river + tributary + stream)
}
```

**Node:**
```typescript
interface Node {
  id: NodeId;    // UUID
  x: number;     // Координаты в пикселях
  y: number;
}
```

**Spline (3-Level Hierarchy):**
```typescript
interface Spline {
  id: SplineId;
  kind: 'river' | 'tributary' | 'stream';  // 3 уровня иерархии
  nodeIds: string[];                // Порядок определяет направление течения
  parentId: SplineId | null;        // ID родителя (null для river)
  parentJunction: NodeId | null;    // Узел присоединения к родителю
  width: Width;                     // Ширина
  children: SplineId[];             // ID дочерних сплайнов
}
```

**3-Level DAG Hierarchy:**
```
River (level 0)
  ├─→ Tributary (level 1)
  │     └─→ Stream (level 2) [max depth]
  └─→ Tributary (level 1)
```

**Правила иерархии:**
- **River**: `parentId = null`, может иметь children
- **Tributary**: `parentId = River`, может иметь children (streams)
- **Stream**: `parentId = Tributary`, **НЕ может** иметь children (max depth)

**Width:**
```typescript
interface Width {
  kind: 'px' | 'relative';   // Абсолютная или относительная ширина
  value: number;             // Значение в пикселях или процентах
}
```

### 2. I1-I5 Инварианты (DAG Topology Rules)

**ВАЖНО:** Эти инварианты должны соблюдаться во всех операциях!

- **I1 (Валидация parentId):** `spline.parentId !== null` ⇒ `graph.splines[spline.parentId] !== undefined`
- **I2 (Ациклический граф):** Граф должен быть DAG - никаких циклов. Проверка: `traverseUp(spline)` никогда не возвращается к начальному spline
- **I3 (Двунаправленная консистентность):** Если A - родитель B, то B - в children A:
  - `spline.parentId === parentId` ⇒ `parent.children.includes(spline.id)`
  - `spline.id ∈ parent.children` ⇒ `spline.parentId === parent.id`
- **I4 (Валидация parentJunction):** Junction должен быть в nodeIds родителя (НЕ в истоке):
  - `spline.parentJunction !== null` ⇒ `parent.nodeIds.includes(spline.parentJunction)`
  - `parent.nodeIds.indexOf(spline.parentJunction) > 0`
- **I5 (Ограничение глубины ≤ 2):** Максимальная глубина дерева = 2:
  - River (level 0) → Tributary (level 1) → Stream (level 2)
  - `spline.kind === 'stream'` ⇒ `spline.children.length === 0`
  - Stream НЕ может иметь детей (нарушило бы depth > 2)

### 3. Направление течения (Flow Direction)

**До рефакторинга:** Использовался `FlowSign` (1 или -1)
**После рефакторинга:** Направление определяется порядком `nodeIds`

- **nodeIds[0]** = источник (source)
- **nodeIds[last]** = устье (mouth)
- Течение всегда от nodeIds[0] → nodeIds[last]
- Для изменения направления: `reverseEdge()` - разворачивает массив nodeIds

### 4. Multiple Roles Problem и getNodeRoles()

**Проблема:** Узел может одновременно быть source, mouth и junction.

**Пример:**
```typescript
// До удаления n1:
River A: [n1] → [n2] → [n3]
Tributary: [n4] → [n1]  // n1 = junction

// После удаления n1:
River A: [n2] → [n3]     // n2 теперь source
Tributary: [n4] → [n2]   // n2 теперь mouth (и junction)

// n2 имеет ТРИ роли одновременно:
// - source для River A
// - mouth для Tributary
// - junction (т.к. в n2 сходятся River A и Tributary)
```

**Решение - getNodeRoles():**
```typescript
interface NodeRoles {
  primary: NodeKind;           // Приоритизированная роль
  isJunction: boolean;         // Узел-пересечение
  asSourceOf: SplineId[];      // Является истоком для...
  asMouthOf: SplineId[];       // Является устьем для...
  asInnerOf: SplineId[];       // Является внутренней точкой для...
}

// Использование:
const roles = getNodeRoles(graph, nodeId);
// roles.asSourceOf = [riverA_id]
// roles.asMouthOf = [tributary_id]
// roles.isJunction = true
// roles.primary = 'junction' (highest priority)
```

**Приоритет определения primary:**
1. Junction (несколько сплайнов) - высший приоритет
2. Source (исток)
3. Mouth (устье)
4. Inner (внутренняя точка)

### 5. Производные свойства (Derived Properties)

Эти свойства **НЕ хранятся** в Spline, а вычисляются:

```typescript
// isDetached - вычисляется из parentId
const isDetached = spline.parentId === null;

// isSource - первая вершина
const isSource = (nodeId: NodeId) => spline.nodeIds[0] === nodeId;

// isMouth - последняя вершина
const isMouth = (nodeId: NodeId) =>
  spline.nodeIds[spline.nodeIds.length - 1] === nodeId;

// isJunction - есть дети
const isJunction = (nodeId: NodeId) =>
  spline.children.length > 0 && spline.nodeIds.includes(nodeId);
```

---

## 📁 Важные файлы

### Core Layer (UE-Ready, Pure Functions)

#### `src/core/graph/types.ts`
**Назначение:** Определение всех типов данных Node-Edge модели с 3-level hierarchy

**Ключевые экспорты:**
- `NodeId`, `SplineId` - строковые UUID типы
- `Node`, `Spline`, `RiverGraphV2` - основные интерфейсы
- `SplineKind` = `'river' | 'tributary' | 'stream'` - 3 уровня иерархии
- `Width`, `NodeKind` - вспомогательные типы
- `makeWidthPx()`, `makeWidthRelative()` - конструкторы Width
- `isWidthRelative()` - type guard

**I1-I5 инварианты задокументированы в JSDoc!**

#### `src/core/graph/nodeKinds.ts`
**Назначение:** Определение ролей узлов и топологии

**Ключевые функции:**
- `getNodeRoles(graph, nodeId)` → `NodeRoles` - **НОВОЕ!** Возвращает все роли узла
  - `asSourceOf: SplineId[]` - списки сплайнов для каждой роли
  - `asMouthOf: SplineId[]`
  - `asInnerOf: SplineId[]`
  - `isJunction: boolean`
  - `primary: NodeKind` - приоритизированная роль
- `computeNodeKind(graph, nodeId)` → `NodeKind` - использует getNodeRoles(), возвращает primary
- `canDeleteNode(graph, nodeId)` - проверка возможности удаления
- `findSplinesContainingNode(graph, nodeId)` - поиск всех сплайнов содержащих узел

#### `src/core/graph/operations.ts`
**Назначение:** Все операции на графе (pure functions, immutable)

**Ключевые функции:**
- `addNode(graph, x, y)` → `{ graph, nodeId }`
- `deleteNode(graph, nodeId)` → `graph` - **ОБНОВЛЕНО:** поддерживает отсоединение stream
- `moveNode(graph, nodeId, x, y)` → `graph`
- `createSpline(graph, kind, nodeIds, width)` → `{ graph, splineId }`
- `attachTributary(graph, childSplineId, parentSplineId, junctionNodeId)` → `graph`
  - **Валидирует I1-I5!**
- `detachTributary(graph, tribSplineId)` → `graph` - **ОБНОВЛЕНО:** поддерживает stream
- `reverseSpline(graph, splineId)` → `graph` - разворачивает nodeIds
- `extendUpstream(graph, splineId, x, y)` → `{ graph, nodeId }` - prepend к source
- `extendDownstream(graph, splineId, x, y)` → `{ graph, nodeId }` - append к mouth
- `insertNodeAfter(graph, splineId, afterIndex, x, y)` → `{ graph, nodeId }`
- `refreshAllSplineKinds(graph)` → `void` - **НОВОЕ!** Автоматически обновляет kind всех сплайнов
  - Вызывается после: deleteNode, detachTributary, mergeSplines
  - Использует determineSplineKind() для каждого сплайна
- `determineSplineKind(graph, splineId)` → `SplineKind` - **НОВОЕ!** Вычисляет корректный kind

**Важно:** Все функции возвращают новый граф (immutable pattern).

#### `src/core/graph/validation.ts`
**Назначение:** Валидация графа и правил присоединения

**Ключевые функции:**
- `assertNetworkValid(graph)` - проверка I1-I5 инвариантов
- `canAttachToNode(graph, nodeId)` - **ОБНОВЛЕНО:** проверяет depth ≤ 2
  - Проверяет level родительского сплайна
  - Level 2 (stream) НЕ может иметь детей (нарушило бы I5)
  - Запрещает присоединение к истоку (source)
- `isJunctionNode(graph, nodeId)` - узел с детьми
- `findJunctionNodes(graph)` - поиск всех junction узлов

#### `src/core/geometry/curves.ts` (150 строк)
**Назначение:** Catmull-Rom интерполяция кривых

**Ключевая функция:**
```typescript
getCurvePoints(controlPoints: Point[]): {
  points: Point[],
  segIndexAt: number[]
}
```

**segIndexAt** - критично для snap! Для каждой точки кривой хранит индекс контрольного сегмента.

#### `src/core/geometry/cache.ts` (80 строк)
**Назначение:** Кэширование геометрии edges

```typescript
interface CurveCache {
  points: Point[];
  tangents: { vx: number; vy: number }[];
  normals: { x: number; y: number }[];
  curvature: number[];
  segIndexAt: number[];
}

buildEdgeCache(graph: RiverGraphV2): Record<EdgeId, CurveCache>
```

### Service Layer

#### `src/services/GraphService.ts` (425 строк)
**Назначение:** Adapter между UI и core operations

**Важные методы:**
- `createMainRiver(graph, nodeIds, widthPixels)` - создает river с kind='river'
- `createTributary(graph, nodeIds, widthPercent)` - создает tributary
- `createTributaryFromJunction(graph, parentEdgeId, junctionNodeId, x, y, widthPercent)` - создает приток от узла
- `reverseEdge(graph, edgeId)` - разворачивает направление
- `extendUpstream/Downstream(graph, edgeId, x, y)` - расширение от концов
- `insertNodeAfter(graph, edgeId, afterNodeId, x, y)` - вставка между
- `canAttachToNode(graph, nodeId)` - проверка возможности attachment

#### `src/services/GraphAdapter.ts` (98 строк)
**Назначение:** Конвертация RiverGraphV2 → legacy формат для RenderService

**Зачем:** RenderService еще не полностью переписан, работает со старым форматом.

### Hooks Layer

#### `src/hooks/useRiverGraphV2.ts`
**Назначение:** React hook для управления состоянием графа

**State:**
- `riverGraph: RiverGraphV2`
- `activeSplineId: SplineId | null`
- `selectedNodeId: NodeId | null`

**Ключевая логика:**
- Обработка кликов на canvas (добавление вершин)
- Определение endpoint nodes (source/mouth) vs mid-nodes
- Extend upstream/downstream от концов
- Insert между вершинами
- Создание tributaries от junction nodes
- **НОВОЕ:** Comprehensive auto-deletion logging
- **ИСПРАВЛЕНО:** Attached children logic (`parentId !== null` вместо `kind === 'tributary'`)

**Критические изменения:**

1. **Fixed attached children logic:**
```typescript
// Было: const isAttachedChild = activeSpline.kind === 'tributary';
// Стало:
const isAttachedChild = activeSpline.parentId !== null;
// Теперь работает для tributary И stream!
```

2. **Comprehensive auto-deletion logging:**
```typescript
const deleteNode = useCallback((nodeId: NodeId) => {
  const beforeSplineIds = new Set(Object.keys(riverGraph.splines));
  const beforeNodeIds = new Set(Object.keys(riverGraph.nodes));

  let newGraph = GraphService.deleteNode(riverGraph, nodeId);

  const afterSplineIds = new Set(Object.keys(newGraph.splines));
  const afterNodeIds = new Set(Object.keys(newGraph.nodes));

  // Log all auto-deleted splines and nodes
  deletedSplines.forEach(splineId => {
    actionLogger.log('DELETE_SPLINE', `Spline ${splineId.slice(0, 8)}... auto-deleted`, ...);
  });

  deletedNodes.forEach(nodeId => {
    actionLogger.log('DELETE_NODE', `Node ${nodeId.slice(0, 8)}... auto-deleted`, ...);
  });
}, [riverGraph]);
```

3. **Tributary new_branch от inner nodes:**
```typescript
if (isAttachedChild) {
  // ... source/mouth logic

  // Mid-node (inner): check if can create new branch
  const canAttach = GraphService.canAttachToNode(riverGraph, selectedNodeId);
  if (canAttach.valid) {
    // Create new branch (tributary → stream, stream → blocked)
    const result = GraphService.createTributaryFromJunction(...);
  }
}
```

#### `src/hooks/useRiverRendererV2.ts` (200 строк)
**Назначение:** Рендеринг графа на Canvas с P0 DPR bugfix

**Важные фиксы:**
- `devicePixelRatio` для четкого рендеринга на Retina
- Использует GraphAdapter для конвертации в legacy формат

### Presentation Layer

#### `src/components/RiverEditorDemo.tsx` (1043 строки)
**Назначение:** Демо приложение с полным UI

**Новые фичи (2025-11-12):**
- **Comprehensive Debugger** (строки 44-82):
  - Показывает Graph State (nodes, edges, main river)
  - Показывает Selected Node Info (ID, type, position)
  - Показывает Edge Info (ID, kind, nodes, width, parent, children)
  - Показывает список Tributaries
- **New River Button** (строки 48-53):
  - Зеленая кнопка в правом верхнем углу
  - Пока вызывает `clearAll()` (TODO: multi-river support)

**Обновления (2025-11-16):**
- **Echo Log Button** (строки 875-894):
  - Кнопка "📋 Echo Log" для открытия панели логов
  - Синяя кнопка рядом с "New River"
  - Переключает видимость ActionLogPanel
- **ActionLogPanel интеграция** (строки 1011-1016):
  - Панель логов появляется при нажатии кнопки
  - Показывает все операции с графом в реальном времени

### Echo Log система (добавлена 2025-11-16)

**Назначение:** Maya-style логирование всех операций с графом для отладки и Undo/Redo.

#### `src/core/actions/types.ts` (220 строк)
**Назначение:** Типы для системы логирования действий

**Ключевые экспорты:**
- `RiverActionType` - union тип всех действий (20+ типов):
  - Node operations: ADD_NODE, MOVE_NODE, DELETE_NODE, MERGE_NODES
  - Spline operations: CREATE_SPLINE, DELETE_SPLINE, REVERSE_SPLINE, UPDATE_SPLINE_WIDTH
  - Tributary operations: ATTACH_TRIBUTARY, DETACH_TRIBUTARY, ATTACH_AS_TRIBUTARY
  - Merge operations: MERGE_SPLINES
  - Graph operations: CLEAR_GRAPH
  - Edge operations: ADD_EDGE, DELETE_EDGE, etc.

- `RiverAction` - полный контекст действия:
  ```typescript
  interface RiverAction {
    id: string;                  // UUID
    type: RiverActionType;
    payload: ActionPayload;      // Параметры операции
    timestamp: number;           // Unix timestamp
    before: GraphSnapshot;       // Состояние ДО
    after: GraphSnapshot;        // Состояние ПОСЛЕ
    duration: number;            // Время выполнения (мс)
    error?: {
      message: string;
      stack?: string;
    };
    description: string;         // Человекочитаемое описание
  }
  ```

- `GraphSnapshot` - легковесный снимок графа:
  ```typescript
  interface GraphSnapshot {
    nodeCount: number;
    splineCount: number;
    rootCount: number;           // Количество независимых рек
    splineIds: string[];
    nodeIds: string[];
    isValid: boolean;
    validationError?: string;
  }
  ```

**UE-Ready:** ✅ Да - типы подходят для Undo/Redo системы в UE

#### `src/core/actions/logger.ts` (350 строк)
**Назначение:** Singleton сервис для логирования действий

**Класс ActionLogger:**
```typescript
class ActionLogger {
  private actions: RiverAction[];            // Циркулярный буфер (500)
  private maxActions: number = 500;

  log(type, payload, before, after, duration, error?): RiverAction
  getActions(): RiverAction[]
  getErrors(): RiverAction[]
  getActionById(id: string): RiverAction | undefined
  clear(): void

  // Фильтрация
  filterByType(types: RiverActionType[]): RiverAction[]
  filterByTimeRange(start, end): RiverAction[]

  // Экспорт
  exportToJSON(): string                    // Для replay
  exportAsCommands(): string                // Maya-style команды

  // Статистика
  getStats(): {
    totalActions: number;
    totalErrors: number;
    averageDuration: number;
    actionsByType: Record<RiverActionType, number>;
  }
}

export const actionLogger = new ActionLogger();  // Singleton
```

**Функции генерации:**
- `createSnapshot(graph, options?)` - создает GraphSnapshot
- `generateDescription(payload)` - генерирует человекочитаемое описание:
  - "Add node at (125, 340)"
  - "Attach tributary t3 to river main at node n7"
  - "Merge splines river2 → river1"

**UE-Ready:** ✅ Да - можно использовать для Undo/Redo стека

#### `src/core/actions/index.ts` (7 строк)
**Назначение:** Barrel export для action системы

**Экспорты:**
```typescript
export * from './types';
export * from './logger';
```

#### `src/services/ActionDispatcher.ts` (365 строк)
**Назначение:** Middleware обертка для всех операций GraphService

**Паттерн:**
```typescript
class ActionDispatcher {
  private static dispatch<T>(
    graph: RiverGraphV2,
    payload: T,
    executor: (graph) => RiverGraphV2 | { graph, ... }
  ): DispatchResult {
    // 1. Snapshot before
    // 2. Execute operation
    // 3. Catch errors
    // 4. Snapshot after
    // 5. Log action
    // 6. Return result
  }

  // Все операции обернуты:
  static addNode(graph, x, y): DispatchResult & { nodeId? }
  static moveNode(graph, nodeId, toX, toY): DispatchResult
  static deleteNode(graph, nodeId): DispatchResult
  static mergeNodes(graph, dragged, target, survivor): DispatchResult

  static createSpline(graph, kind, nodeIds, width): DispatchResult & { splineId? }
  static deleteSpline(graph, splineId): DispatchResult
  static reverseSpline(graph, splineId): DispatchResult
  static updateSplineWidth(graph, splineId, newWidth): DispatchResult

  static attachTributary(graph, child, parent, junction): DispatchResult
  static detachTributary(graph, tribId, createNewMouth?): DispatchResult & { newNodeId? }

  static mergeSplines(graph, draggedNode, targetNode): DispatchResult
  static attachSplineAsTributary(graph, draggedNode, targetNode): DispatchResult

  static clearGraph(graph): DispatchResult
}

interface DispatchResult {
  graph: RiverGraphV2;          // Новый граф (или оригинал при ошибке)
  actionId: string;             // ID записи в логе
  success: boolean;             // true если нет ошибок
  error?: Error;                // Ошибка если есть
}
```

**Интеграция с useRiverGraphV2:**
Все операции в хуке теперь используют ActionDispatcher вместо прямого вызова GraphService:
```typescript
// Пример из useRiverGraphV2.ts:292-299
const moveNode = useCallback(
  (nodeId: NodeId, x: number, y: number) => {
    const result = ActionDispatcher.moveNode(riverGraph, nodeId, x, y);
    if (result.success) {
      setRiverGraph(result.graph);
    }
  },
  [riverGraph]
);
```

**UE-Ready:** 🔄 Частично - логика полезна для Undo/Redo, но класс придется адаптировать

#### `src/hooks/useActionLog.ts` (60 строк)
**Назначение:** React hook для управления видимостью ActionLogPanel

**API:**
```typescript
interface UseActionLogResult {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useActionLog = (initialOpen = false): UseActionLogResult
```

**Использование:**
```typescript
const actionLog = useActionLog(false);

<button onClick={actionLog.toggle}>
  {actionLog.isOpen ? '❌ Close' : '📋'} Echo Log
</button>

<ActionLogPanel
  isOpen={actionLog.isOpen}
  onClose={actionLog.close}
/>
```

**UE-Ready:** ❌ React специфика

#### `src/components/ActionLog/ActionLogPanel.tsx` (350 строк)
**Назначение:** UI панель для отображения логов

**Props:**
```typescript
interface ActionLogPanelProps {
  isOpen: boolean;
  onClose: () => void;
  autoScroll?: boolean;
}
```

**Функции:**
- Темная консольная тема (стиль Maya Echo Command)
- Хронологический список действий с временными метками
- Фильтры:
  - По типам действий (multiselect dropdown)
  - Только ошибки (toggle)
  - Поиск по ID/описанию (text input)
- Экспорт:
  - JSON (для replay/анализа)
  - Commands (Maya-style текст)
- Копирование команд в буфер по клику
- Отображение изменений графа:
  - `nodes: 5 → 6 | splines: 2 → 3`
  - `✓ valid` или `✗ invalid (error message)`
- Подсветка ошибок красным + stack trace
- Автопрокрутка к новым действиям
- Статистика в футере:
  - Среднее время выполнения
  - Количество действий
  - Количество ошибок

**Пример вывода:**
```
[15:24:32.145] ADD_NODE                    +1.2ms
  Add node at (125, 340)
  nodes: 4 → 5 | splines: 1 → 1 | ✓ valid
  [Copy Command]

[15:24:35.892] ATTACH_TRIBUTARY            +3.8ms
  Attach tributary t3 to river main at node n4
  nodes: 5 → 5 | splines: 1 → 2 | ✓ valid
  [Copy Command]

[15:24:41.023] MERGE_SPLINES               +2.1ms  ERROR
  Merge splines river2 → river1
  nodes: 8 → 8 | splines: 2 → 2 | ✗ invalid
  Error: Cannot merge splines: cycle detected
  at mergeSplines (operations.ts:487)
  at ActionDispatcher.dispatch (ActionDispatcher.ts:65)
  ...
  [Copy Command]
```

**UE-Ready:** ❌ Не переносится (будет Slate/UMG в Editor Mode)

---

## 🚨 Известные проблемы и ограничения

### ✅ Исправлено в текущей сессии (2025-11-16)
1. ✅ **Stream behavior** - Stream больше не ведет себя как независимая река
2. ✅ **Stream detachment** - Stream корректно отсоединяется при удалении junction
3. ✅ **Auto-refresh kind** - Kind автоматически обновляется после топологических изменений
4. ✅ **Multiple roles** - getNodeRoles() решает проблему узлов с несколькими ролями
5. ✅ **Auto-deletion logging** - Все cascade deletions логируются
6. ✅ **Tributary new_branch** - Inner nodes притоков могут создавать streams
7. ✅ **Grid density** - 60x36 для более точного редактирования

### Критические (блокируют работу)
- Нет критических проблем

### Важные (мешают UX)
1. **Multi-river support отсутствует** 🚧
   - Кнопка "New River" пока только очищает граф
   - Нужно: поддержка нескольких независимых рек в одном RiverGraphV2
   - Возможное решение: `rivers: SplineId[]` вместо `mainSplineId`

2. **Tributary creation требует тестирования** 🚧
   - Логика реализована в useRiverGraphV2.ts
   - Требует тщательного тестирования с новой attachTributary
   - I1-I5 валидации должны работать

3. **Pointer capture не реализован** (P0 bugfix pending)
   - Drag может терять фокус в некоторых браузерах
   - Решение: `setPointerCapture()` / `releasePointerCapture()` в RiverOverlay

4. **FlowService еще использует старую логику**
   - Зависит от legacy формата
   - Не критично для текущей работы
   - Можно отложить до Фазы 4

### Приятные улучшения
- Нет Undo/Redo (можно добавить стек графов)
- Нет keyboard shortcuts (Delete для удаления node)
- Нет анимированных flow arrows

---

## 🎯 Приоритетные задачи для следующей сессии

**ВАЖНО:** Перед началом работы:
1. Прочитайте ARCHITECTURE.md - новые инварианты I1-I5, Multiple Roles Problem
2. Прочитайте раздел "История изменений" в ROADMAP.md
3. Изучите getNodeRoles() и refreshAllSplineKinds()
4. Протестируйте 3-level hierarchy: создайте River → Tributary → Stream

### 1. Тестирование 3-Level Hierarchy (HIGH PRIORITY)
**Файлы:** `src/core/graph/validation.ts`, `src/hooks/useRiverGraphV2.ts`

**Задача:**
- Протестировать создание River → Tributary → Stream
- Убедиться что Stream НЕ может иметь детей (I5 инвариант)
- Проверить что canAttachToNode блокирует attachment к stream
- Проверить что refreshAllSplineKinds корректно обновляет kind
- Проверить что getNodeRoles возвращает правильные роли для узлов

**Тестовые сценарии:**
1. Создать River с 3 nodes
2. Создать Tributary от junction River (mid-node)
3. Создать Stream от junction Tributary (mid-node)
4. Попытаться создать приток от Stream (должно заблокироваться)
5. Удалить junction и проверить что Stream отсоединяется
6. Проверить логи auto-deletion

**Сложность:** Medium
**Время:** 2-3 часа

### 2. Multi-river Support (HIGH PRIORITY)
**Файлы:** `src/core/graph/types.ts`, `src/hooks/useRiverGraphV2.ts`, `src/components/RiverEditorDemo.tsx`

**Задача:**
- Изменить `RiverGraphV2.mainEdgeId: EdgeId | null` на `rivers: EdgeId[]`
- Обновить GraphService для работы с массивом рек
- Реализовать логику выбора активной реки
- Кнопка "New River" должна создавать новую реку, а не очищать граф

**Сложность:** Medium
**Время:** 2-3 часа

### 2. Tributary Creation Testing (HIGH PRIORITY)
**Файлы:** `src/hooks/useRiverGraphV2.ts`, `src/core/graph/operations.ts`

**Задача:**
- Протестировать создание притоков от junction nodes
- Убедиться что V2-V7 валидации работают
- Проверить edge cases (attach к mouth, attach с уже существующими children)

**Сложность:** Low
**Время:** 1 час

### 3. Tributary Attachment/Detachment with Snapping (MEDIUM PRIORITY)
**Файлы:** `src/hooks/useRiverGraphV2.ts`, `src/components/RiverOverlay.tsx`

**Задача:**
- Восстановить drag-to-attach функциональность
- Point snapping (привязка к существующим вершинам)
- Spline snapping (привязка к кривой)
- Forbidden zones (запрещенные зоны вокруг узлов)

**Сложность:** High
**Время:** 4-5 часов

### 4. Pointer Capture Bugfix (MEDIUM PRIORITY)
**Файлы:** `src/components/RiverOverlay.tsx`

**Задача:**
```typescript
onPointerDown={(e) => {
  e.currentTarget.setPointerCapture(e.pointerId);
  // ... existing logic
}}

onPointerUp={(e) => {
  e.currentTarget.releasePointerCapture(e.pointerId);
  // ... existing logic
}}
```

**Сложность:** Low
**Время:** 30 минут

### 5. FlowService Refactoring (LOW PRIORITY)
**Файлы:** `src/services/FlowService.ts`

**Задача:**
- Убрать зависимость от flowSign
- Использовать порядок nodeIds для определения направления
- Не критично для текущей работы

**Сложность:** Medium
**Время:** 2 часа

---

## 🛠️ Как начать работу

### 1. Проверка окружения
```bash
# Установка зависимостей (если нужно)
npm install

# Проверка типов
npm run type-check

# Запуск dev сервера
npm run dev

# Билд (проверка что все компилируется)
npm run build
```

### 2. Изучение текущего состояния
```bash
# Прочитать ROADMAP.md для понимания прогресса
cat ROADMAP.md

# Прочитать этот файл (AGENTS.md)
cat AGENTS.md

# Посмотреть недавние коммиты
git log --oneline -10

# Проверить текущую ветку
git status
```

### 3. Понимание архитектуры
**Обязательно прочитать:**
1. `src/core/graph/types.ts` - V1-V7 инварианты в JSDoc
2. `src/core/graph/operations.ts` - все операции
3. `src/hooks/useRiverGraphV2.ts` - логика обработки кликов
4. `src/components/RiverEditorDemo.tsx` - UI и debugger

**Порядок чтения кода:**
```
types.ts → operations.ts → GraphService.ts → useRiverGraphV2.ts → RiverEditorDemo.tsx
```

### 4. Тестирование приложения
```bash
npm run dev
# Откройте http://localhost:5173
```

**Что тестировать:**
1. Создание реки (клики на canvas)
2. Выбор вершины source → клик на canvas (extend upstream)
3. Выбор вершины mouth → клик на canvas (extend downstream)
4. Выбор mid-node → клик на canvas (insert between)
5. Drag вершин
6. Double-click для удаления
7. Debugger показывает правильную информацию

### 5. Начало работы над задачей

**Пример: Multi-river support**
```bash
# 1. Создать feature ветку
git checkout -b feature/multi-river-support

# 2. Прочитать текущую реализацию
# src/core/graph/types.ts - RiverGraphV2 интерфейс
# src/hooks/useRiverGraphV2.ts - логика main river

# 3. Спланировать изменения
# - Изменить mainEdgeId на rivers: EdgeId[]
# - Добавить activeRiverId для выбора активной реки
# - Обновить все места где используется mainEdgeId

# 4. Реализовать изменения (TDD approach)
# - Обновить types.ts
# - Обновить operations.ts если нужно
# - Обновить GraphService.ts
# - Обновить useRiverGraphV2.ts
# - Обновить RiverEditorDemo.tsx (кнопка New River)

# 5. Тестировать
npm run dev

# 6. Коммитить
git add .
git commit -m "feat: Add multi-river support with rivers array"

# 7. Обновить AGENTS.md и ROADMAP.md
# - Отметить задачу как выполненную
# - Добавить запись в историю изменений
```

---

## 📝 Правила разработки

### Conventional Commits
```
feat: Add multi-river support
fix: Fix extend upstream prepend logic
refactor: Simplify Width type to single interface
docs: Update AGENTS.md with multi-river task
test: Add tests for attachTributary validation
```

### Git Workflow
- Работать на ветке `claude/refactor-river-editor-architecture-011CV2WYQfi5AfLjGendRaXC`
- Коммитить часто с ясными сообщениями
- Обновлять ROADMAP.md и AGENTS.md после значимых изменений
- Push: `git push -u origin <branch-name>`
- Не коммитить секреты (.env*)

### TypeScript Rules
- Все типы должны быть явно определены
- Использовать `interface` для объектов
- Использовать `type` для union/primitive types
- Документировать публичные функции JSDoc комментариями
- `@ue_equivalent` теги для core функций

### Pure Functions (Core Layer)
```typescript
// ❌ BAD - мутирует граф
function addNode(graph: RiverGraphV2, x: number, y: number) {
  const nodeId = generateId();
  graph.nodes[nodeId] = { id: nodeId, x, y }; // MUTATION!
  return nodeId;
}

// ✅ GOOD - immutable
function addNode(graph: RiverGraphV2, x: number, y: number): AddNodeResult {
  const newGraph = cloneGraph(graph);
  const nodeId = generateId();
  newGraph.nodes[nodeId] = { id: nodeId, x, y };
  return { graph: newGraph, nodeId };
}
```

### Валидация V1-V7
**Всегда проверяйте инварианты в операциях!**

Пример из `attachTributary`:
```typescript
// V3: No nested tributaries
if (childEdge.children.length > 0) {
  throw new Error('Edge has tributaries and cannot be attached as tributary');
}

// V5: Junction must be in parent.nodeIds[1..last] (not source!)
const junctionIndex = parentEdge.nodeIds.indexOf(junctionNodeId as string);
if (junctionIndex < 1) {
  throw new Error('Junction node must not be at source (index 0)');
}

// V7: Width constraints
// ... width validation logic
```

---

## 🔍 Debugging Tips

### Console Logging
Приложение использует эмодзи для легкого поиска в консоли:
- `🔍` - Debug/diagnostic info
- `⬆️` - Extend upstream
- `⬇️` - Extend downstream
- `📌` - Insert node
- `🌿` - Tributary creation
- `✅` - Success
- `⚠️` - Warning
- `🆕` - New river

### React DevTools
Компоненты:
- `RiverEditorDemo` - main component
- `useRiverGraphV2` - graph state hook
- `useRiverRendererV2` - rendering hook

Проверяйте state:
- `riverGraph.nodes` - все вершины
- `riverGraph.edges` - все реки
- `riverGraph.mainEdgeId` - ID главной реки
- `selectedNodeId` - выбранная вершина
- `activeEdgeId` - активная река

### Debugger Component
В RiverEditorDemo есть встроенный debugger (правый нижний угол).
Показывает:
- Graph State (total nodes, edges)
- Selected Node (ID, type: source/mouth/mid/junction, position)
- Edge Info (ID, kind, nodes count, width, parent, children)
- Tributaries list

---

## 📚 Полезные ссылки

### Документация проекта
- `ROADMAP.md` - план разработки и история изменений
- `README.md` - общая информация о проекте
- `AGENTS.md` - этот файл (handoff guide)

### Внешние ресурсы
- [Catmull-Rom Splines](https://en.wikipedia.org/wiki/Centripetal_Catmull%E2%80%93Rom_spline)
- [Marching Squares](https://en.wikipedia.org/wiki/Marching_squares)
- [UE5 Scriptable Tools](https://dev.epicgames.com/documentation/en-us/unreal-engine/scriptable-tools-in-unreal-engine)

### Алгоритмы
- **Catmull-Rom interpolation** в `src/core/geometry/curves.ts`
- **Frenet frames** в `src/core/geometry/frames.ts`
- **Flow calculations** в `src/services/FlowService.ts`

---

## 💡 Частые вопросы (FAQ)

### Q: Почему Edge.kind теперь 'river' а не 'main'?
**A:** Более точная терминология. 'main' подразумевало единственность, но в multi-river контексте у нас может быть несколько независимых рек, все с kind='river'.

### Q: Почему удалили FlowSign?
**A:** Избыточность. Направление течения уже определяется порядком nodeIds. Для изменения направления используется `reverseEdge()`, которая просто разворачивает массив nodeIds.

### Q: Почему Width стал unified interface?
**A:** Упрощение API. Старый вариант (union WidthAbs | WidthRel) требовал type guards везде. Новый вариант { kind, value } проще и понятнее.

### Q: Как работает extendUpstream vs extendDownstream?
**A:**
- `extendUpstream(graph, edgeId, x, y)` - создает новую вершину и **prepend** к началу nodeIds (новая вершина становится истоком)
- `extendDownstream(graph, edgeId, x, y)` - создает новую вершину и **append** к концу nodeIds (новая вершина становится устьем)

### Q: Можно ли присоединить приток к устью (mouth)?
**A:** ДА! V5 инвариант разрешает присоединение к любой вершине кроме истока (source). То есть к узлам с индексом >= 1 в nodeIds.

### Q: Что такое segIndexAt и зачем он нужен?
**A:** segIndexAt[i] хранит индекс контрольного сегмента для i-й точки кривой. Нужен для корректного snap-to-spline и вставки вершин в правильное место. Без него был off-by-one баг.

### Q: Почему GraphAdapter нужен?
**A:** RenderService и FlowService еще не полностью переписаны на Node-Edge модель. GraphAdapter конвертирует RiverGraphV2 в legacy формат (mainRiver, tributaries). Временное решение, в будущем можно отрефакторить эти сервисы.

### Q: Как тестировать изменения?
**A:**
1. `npm run type-check` - проверка типов
2. `npm run build` - проверка компиляции
3. `npm run dev` - ручное тестирование в браузере
4. Проверка debugger - показывает ли правильную информацию
5. Тестирование всех операций (create, extend, insert, delete, drag)

---

## 🎯 Метрики успеха

### Функциональные
- ✅ Можно создать главную реку с 5+ точками
- ✅ Extend upstream/downstream работают корректно
- ✅ Mid-node insertion работает
- 🚧 Можно создать несколько независимых рек (pending)
- 🚧 Можно добавить 3+ притока (требует тестирования)
- 🚧 Snap к точкам работает (pending)
- 🚧 Snap к сплайну работает (pending)
- ✅ Drag стабилен
- ✅ Flow map показывает правильное направление

### Технические
- ✅ TypeScript без ошибок
- ✅ Build успешен
- ✅ Код соответствует UE-Ready принципам
- ✅ V1-V7 инварианты задокументированы
- ✅ Все core функции задокументированы с JSDoc

---

## 🚀 Готовность к работе

**Перед началом работы убедитесь:**
1. ✅ Прочитали этот файл полностью
2. ✅ Прочитали ROADMAP.md
3. ✅ Понимаете V1-V7 инварианты
4. ✅ Понимаете разницу между source/mouth/mid-node
5. ✅ Запустили приложение (`npm run dev`) и протестировали базовые операции
6. ✅ Прочитали код в src/core/graph/types.ts
7. ✅ Выбрали задачу из "Приоритетные задачи"

**Если все пункты выполнены - можно начинать! 🎉**

---

**Удачи в разработке! При вопросах - обращайтесь к этому файлу и ROADMAP.md.**
