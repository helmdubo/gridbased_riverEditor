# Архитектура проекта: Grid-Based River Editor

## 🎯 Цель проекта

**Web-прототип инструмента редактирования рек для миграции в Unreal Engine 5.6**

Этот проект является прототипом для быстрой итерации с AI. Финальная цель - перенос в UE5.6 как Scriptable Tool на Blueprints.

### Ключевые требования:

✅ **UE-Ready архитектура** - Node-Edge граф, чистые функции
✅ **Минимальные React-зависимости** - легкая миграция
✅ **Простота > Производительность** - это прототип, не production
✅ **Документированность** - каждая функция = будущий Blueprint node

---

## 🏗️ Архитектура: Node-Edge Graph Model

### Переход от RiverGraph к Node-Edge модели

**Старая модель (до рефакторинга):**
```typescript
interface RiverGraph {
  mainRiver: RiverPoint[];           // полилиния
  tributaries: Map<string, Tributary>; // притоки с parentPointId
}
```

**Новая модель (UE-Ready):**
```typescript
interface RiverGraphV2 {
  nodes: Record<NodeId, Node>;    // все вершины
  edges: Record<EdgeId, Edge>;    // все рёбра (main + tributaries)
  mainEdgeId: EdgeId | null;      // ID главной реки
}

interface Node {
  id: NodeId;
  x: number;
  y: number;
}

interface Edge {
  id: EdgeId;
  kind: 'river' | 'tributary';
  nodeIds: NodeId[];              // путь по узлам (source → mouth)
  width: { kind: 'px' | 'relative'; value: number };
  parentId: EdgeId | null;        // null для независимых рек
  parentJunction: NodeId | null;  // узел присоединения (не исток)
  children: EdgeId[];
}
```

### Почему Node-Edge?

| Критерий | Старая модель | Node-Edge модель |
|----------|---------------|------------------|
| **UE5 соответствие** | ❌ Нет | ✅ Прямое (EdGraph) |
| **USplineComponent** | ❌ Переделка | ✅ nodeIds → Spline points |
| **Snap к сплайну** | ❌ Индексы ломаются | ✅ Вставка Node между i и i+1 |
| **Junction точки** | ❌ Неявные (parentPointId) | ✅ Явные (Node с ≥2 edges) |
| **Undo/Redo** | ❌ Сложно | ✅ Стек состояний графа |
| **Валидация** | ❌ Ручная | ✅ Инварианты графа |
| **Multi-river** | ❌ Один main | ✅ Любое число `kind='river'` |

---

### Meta-graph концепция

Каждый сплайн трактуется как «мета-узел», который инкапсулирует свой путь (nodeIds) и список дочерних сплайнов. Притоки образуют иерархию, но при отсоединении становятся новым корневым мета-узлом с теми же атрибутами, что и исходная река. Это упрощает дальнейший перенос в UE, где такие мета-узлы могут отображаться как отдельные `USplineComponent` с собственными детьми.

---

## 📂 Структура проекта

```
src/
├── core/                          # 🎯 ПЕРЕНОСИТСЯ В UE 1:1
│   ├── graph/
│   │   ├── types.ts              # Node, Edge, RiverGraphV2
│   │   ├── operations.ts         # Чистые функции для операций
│   │   └── validation.ts         # Инварианты графа
│   ├── geometry/
│   │   ├── curves.ts             # Catmull-Rom → USplineComponent
│   │   ├── geometry.ts           # Расстояния, проекции
│   │   └── frames.ts             # Tangents, normals, curvature
│   └── flow/
│       ├── flowField.ts          # Расчёт направления/скорости
│       └── sdf.ts                # SDF для ширины русла
│
├── services/                      # 🔄 ЧАСТИЧНО ПЕРЕНОСИТСЯ
│   ├── GraphService.ts           # → Blueprint Function Library
│   ├── FlowService.ts            # → Blueprint Function Library
│   ├── RenderService.ts          # ❌ НЕ ПЕРЕНОСИТСЯ (UE rendering)
│   └── ActionDispatcher.ts       # → Logging middleware для операций
│
├── hooks/                         # ❌ НЕ ПЕРЕНОСИТСЯ
│   └── useRiverGraph.ts          # React специфика
│
└── components/                    # ❌ НЕ ПЕРЕНОСИТСЯ
    └── RiverEditor/              # Будет Slate/UMG в UE
```

### Что переносится в UE5.6?

#### ✅ Core модуль (100% перенос)

**Типы:**
```typescript
// TypeScript → C++/Blueprint
type NodeId = string;          → FGuid
interface Node { x, y }        → FVector(X, Y, 0)
interface Edge { nodeIds[] }   → TArray<FGuid>
```

**Операции:**
```typescript
// TypeScript → Blueprint Function Library
function addNode(graph, x, y): {graph, nodeId}
// ↓
UFUNCTION(BlueprintCallable)
static FRiverGraph AddNode(const FRiverGraph& Graph, FVector Location);
```

**Геометрия:**
```typescript
// TypeScript → UE Native
getCurvePoints() → USplineComponent::GetLocationAtDistanceAlongSpline()
computeCurveFrames() → GetTangent/GetRightVector At SplinePoint
```

#### 🔄 Services (адаптация)

```typescript
// Чистые функции переносятся как Function Library
GraphService::splitEdge() → URiverGraphLibrary::SplitEdge()

// Rendering НЕ переносится - UE делает по-другому
RenderService → Spline Mesh Components + Landscape
```

#### ❌ UI слой (не переносится)

- React hooks → Blueprint variables + events
- Canvas rendering → Spline Meshes + PCG
- SVG overlay → Slate widgets в Editor Mode

---

## 📋 Echo Log система (Debugging & Logging)

### Назначение
Maya-style Echo Command система для отладки операций с графом рек. Записывает полный контекст каждой операции: входные параметры, состояние графа до/после, время выполнения, ошибки.

### Архитектура

```
User Action (UI)
      ↓
useRiverGraphV2 (hook)
      ↓
ActionDispatcher (middleware)  ← перехватывает операцию
      ↓
GraphService operation
      ↓
ActionLogger.log()  ← записывает в лог
      ↓
ActionLogPanel (UI)  ← отображает логи
```

### Компоненты

#### 1. Action Types (`src/core/actions/types.ts`)
**Переносится в UE:** ✅ Частично (для Undo/Redo и отладки)

```typescript
// 20+ типов действий
type RiverActionType =
  | 'ADD_NODE' | 'MOVE_NODE' | 'DELETE_NODE'
  | 'MERGE_NODES' | 'MERGE_SPLINES'
  | 'ATTACH_TRIBUTARY' | 'DETACH_TRIBUTARY'
  | 'CREATE_SPLINE' | 'DELETE_SPLINE'
  // ...

interface RiverAction {
  id: string;
  type: RiverActionType;
  payload: ActionPayload;      // Параметры операции
  timestamp: number;
  before: GraphSnapshot;        // Состояние ДО
  after: GraphSnapshot;         // Состояние ПОСЛЕ
  duration: number;             // Время выполнения (мс)
  error?: ErrorDetails;         // Ошибка + stack trace
  description: string;          // "Attach tributary t3 to river main at node n7"
}

interface GraphSnapshot {
  nodeCount: number;
  splineCount: number;
  rootCount: number;
  splineIds: string[];
  nodeIds: string[];
  isValid: boolean;
  validationError?: string;
}
```

**UE эквивалент:**
```cpp
USTRUCT(BlueprintType)
struct FRiverAction {
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly)
    FGuid ActionID;

    UPROPERTY(BlueprintReadOnly)
    ERiverActionType Type;

    UPROPERTY(BlueprintReadOnly)
    FDateTime Timestamp;

    UPROPERTY(BlueprintReadOnly)
    FRiverGraphSnapshot Before;

    UPROPERTY(BlueprintReadOnly)
    FRiverGraphSnapshot After;
};
```

#### 2. ActionLogger Service (`src/core/actions/logger.ts`)
**Переносится в UE:** ✅ Да (для Undo/Redo)

**Возможности:**
- Циркулярный буфер (500 записей) для экономии памяти
- Фильтрация по типам действий, временным диапазонам, ошибкам
- Экспорт в JSON (для replay/анализа)
- Экспорт в Maya-style commands (для миграции)
- Статистика (средняя длительность, частота ошибок)

**API:**
```typescript
class ActionLogger {
  log(type, payload, before, after, duration, error?): RiverAction
  getActions(): RiverAction[]
  getErrors(): RiverAction[]
  exportToJSON(): string
  exportAsCommands(): string
  getStats(): LogStatistics
}

export const actionLogger = new ActionLogger();  // Singleton
```

**UE эквивалент:**
```cpp
UCLASS()
class URiverActionLogger : public UObject {
    UFUNCTION(BlueprintCallable)
    void LogAction(ERiverActionType Type, const FRiverGraph& Before, const FRiverGraph& After);

    UFUNCTION(BlueprintCallable)
    TArray<FRiverAction> GetActionHistory() const;
};
```

#### 3. ActionDispatcher Middleware (`src/services/ActionDispatcher.ts`)
**Переносится в UE:** 🔄 Частично (логика логирования)

**Паттерн:**
```typescript
class ActionDispatcher {
  private static dispatch<T>(
    graph: RiverGraphV2,
    payload: ActionPayload,
    executor: (graph) => RiverGraphV2
  ): DispatchResult {
    const startTime = performance.now();
    const before = createSnapshot(graph);

    let resultGraph = graph;
    let error: Error | undefined;

    try {
      resultGraph = executor(graph);
    } catch (err) {
      error = err;
      resultGraph = graph;  // Keep original on error
    }

    const duration = performance.now() - startTime;
    const after = createSnapshot(resultGraph, { includeValidation: true });

    const action = actionLogger.log(type, payload, before, after, duration, error);

    return {
      graph: resultGraph,
      actionId: action.id,
      success: !error,
      error,
    };
  }

  // Wrapped operations
  static moveNode(graph, nodeId, x, y): DispatchResult { }
  static deleteNode(graph, nodeId): DispatchResult { }
  static mergeSplines(graph, draggedNodeId, targetNodeId): DispatchResult { }
  // ... all graph operations
}
```

**В UE:** Можно использовать для Undo/Redo стека и отладки Blueprint операций.

#### 4. ActionLogPanel UI (`src/components/ActionLog/ActionLogPanel.tsx`)
**Переносится в UE:** ❌ Не переносится (будет UMG/Slate)

**Функции:**
- Консольный интерфейс с темной темой
- Хронологический список действий
- Фильтры (по типам, только ошибки, поиск)
- Экспорт (JSON, Commands)
- Copy-to-clipboard
- Отображение изменений графа (nodes: 5→6 | splines: 2→3)
- Подсветка ошибок + stack trace
- Автопрокрутка к новым записям
- Статистика (avg duration, total errors)

**UE эквивалент:** Editor Mode Tool с Slate UI или Output Log интеграция.

#### 5. useActionLog Hook (`src/hooks/useActionLog.ts`)
**Переносится в UE:** ❌ React специфика

### Интеграция с useRiverGraphV2

Все операции теперь идут через ActionDispatcher:

```typescript
// BEFORE
const moveNode = (nodeId, x, y) => {
  const newGraph = GraphService.moveNode(riverGraph, nodeId, x, y);
  setRiverGraph(newGraph);
};

// AFTER (with logging)
const moveNode = (nodeId, x, y) => {
  const result = ActionDispatcher.moveNode(riverGraph, nodeId, x, y);
  if (result.success) {
    setRiverGraph(result.graph);
  } else {
    console.error('Failed to move node:', result.error);
  }
};
```

### Преимущества для UE миграции

1. **Undo/Redo готов из коробки**
   - Каждое действие = snapshot графа
   - Можно построить стек для Undo: `history: RiverAction[]`
   - Redo: `future: RiverAction[]`

2. **Отладка операций**
   - Полный лог всех изменений
   - Timing для оптимизации
   - Ошибки с контекстом

3. **Replay система**
   - Экспорт в JSON → воспроизведение сессии
   - Тестирование edge cases

4. **Миграция в UE**
   - Команды экспортируются как текст
   - Можно использовать для автогенерации Blueprint тестов

### Использование

**В UI:**
```tsx
// Кнопка для открытия лога
<button onClick={actionLog.toggle}>
  📋 Echo Log
</button>

// Панель логов
<ActionLogPanel
  isOpen={actionLog.isOpen}
  onClose={actionLog.close}
  autoScroll={true}
/>
```

**Программно:**
```typescript
import { actionLogger } from '@/core/actions';

// Получить все действия
const actions = actionLogger.getActions();

// Получить только ошибки
const errors = actionLogger.getErrors();

// Экспорт в JSON
const json = actionLogger.exportToJSON();
console.log(json);

// Статистика
const stats = actionLogger.getStats();
// { totalActions: 42, totalErrors: 3, averageDuration: 1.5, actionsByType: {...} }
```

### Пример лога

```json
{
  "id": "a7b3c9d2-...",
  "type": "MERGE_SPLINES",
  "timestamp": 1699891234567,
  "duration": 2.3,
  "description": "Merge splines river2 → river1",
  "payload": {
    "draggedSplineId": "river2",
    "targetSplineId": "river1",
    "draggedNodeId": "n5",
    "targetNodeId": "n3"
  },
  "before": {
    "nodeCount": 8,
    "splineCount": 2,
    "rootCount": 2,
    "isValid": true
  },
  "after": {
    "nodeCount": 7,
    "splineCount": 1,
    "rootCount": 1,
    "isValid": true
  }
}
```

---

## 🔧 Принципы разработки (UE-Ready)

### 1. Чистые функции > Stateful логика

**❌ Плохо (не перенесётся):**
```typescript
class GraphManager {
  private graph: RiverGraphV2;

  addNode(x, y) {
    this.graph = { ...this.graph, ... }; // mutating state
  }
}
```

**✅ Хорошо (легко станет Blueprint):**
```typescript
namespace GraphOperations {
  export function addNode(
    graph: RiverGraphV2,
    x: number,
    y: number
  ): { graph: RiverGraphV2; nodeId: NodeId } {
    // pure function, returns new graph
  }
}

// В UE:
// UFUNCTION(BlueprintPure)
// static FRiverGraph AddNode(const FRiverGraph& Graph, FVector Location);
```

### 2. Документация = Blueprint комментарии

**Каждая функция должна иметь:**
```typescript
/**
 * Adds a new node to the graph at specified location
 *
 * @param graph - Current graph state (const)
 * @param x - X coordinate in world space
 * @param y - Y coordinate in world space
 * @returns New graph with added node + new node ID
 *
 * @pure Yes
 * @ue_equivalent URiverGraphLibrary::AddNode
 */
export function addNode(graph: RiverGraphV2, x: number, y: number) { }
```

### 3. Избегать React специфики в core

**❌ Плохо:**
```typescript
const cache = useMemo(() => buildCache(graph), [graph]); // React!
```

**✅ Хорошо:**
```typescript
// Чистая функция, кэш снаружи
function buildCache(graph: RiverGraphV2): CurveCache { }

// В UE: кэш в UPROPERTY, dirty flag для перерасчёта
```

### 4. Типы данных = Blueprint Structs

**TypeScript типы проектируются под USTRUCT:**
```typescript
interface Edge {
  id: EdgeId;                    // FGuid
  kind: 'main' | 'tributary';   // UENUM
  nodeIds: NodeId[];            // TArray<FGuid>
  flowSign: 1 | -1;             // int32
}

// В UE станет:
// USTRUCT(BlueprintType)
// struct FRiverEdge { ... };
```

---

## 🎯 Критические багфиксы (P0)

Эти баги исправляются сразу в Node-Edge структуре:

### 1. FlowSign как явное поле

**Проблема:** Направление потока определялось неявно по порядку точек.

**Решение:** Добавить `flowSign: 1 | -1` в Edge.
- Main edge: `flowSign = 1` (от истока к устью)
- Tributary: `flowSign = -1` (от истока к устью, но устье = junction)

### 2. segIndexAt для правильного snap

**Проблема:** `Math.floor(sampleIdx / curveSegments)` давал off-by-one из-за начального push.

**Решение:** Кэш кривой хранит `segIndexAt: Uint16Array` - для каждого sample → индекс контрольного сегмента.

### 3. Pointer events + capture

**Проблема:** Drag терялся при выходе мыши за canvas (особенно Safari).

**Решение:**
- SVG с `pointerEvents: 'auto'`
- `setPointerCapture()` / `releasePointerCapture()`

### 4. devicePixelRatio

**Проблема:** Размытость на Retina дисплеях.

**Решение:** Масштабировать canvas под DPR.

---

## 🚀 Оптимизации (если нужны для тестирования)

### Кэширование кривых

**Текущая проблема:** getCurvePoints вызывается многократно в каждом кадре.

**Решение:**
```typescript
interface CurveCache {
  points: Point[];
  tangents: {vx, vy}[];
  normals: Point[];
  curvature: number[];
  segIndexAt: Uint16Array; // для snap
}

// Кэш пересчитывается только при изменении графа
const cache = buildCurveCache(graph); // один раз
```

### rAF scheduling

**Проблема:** Slider изменения → 60 setState/сек → 60 перерисовок/сек.

**Решение:** Coalescing в requestAnimationFrame - максимум 1 перерисовка/кадр.

### widthFromMask (быстрая версия SDF)

**Проблема:** widthAlongNormal_precise делает дорогой march с distanceToCurve в цикле.

**Решение:** Семплировать дискретную waterMask вместо вызова distanceToCurve - x10 быстрее.

---

## 🔄 Миграция в UE5.6 (когда придёт время)

### Этап 1: Blueprint Function Library

```cpp
UCLASS()
class URiverGraphLibrary : public UBlueprintFunctionLibrary {
    GENERATED_BODY()

    UFUNCTION(BlueprintCallable, Category="River|Graph")
    static FRiverGraph AddNode(const FRiverGraph& Graph, FVector Location);

    UFUNCTION(BlueprintCallable, Category="River|Graph")
    static FRiverGraph SplitEdge(
        const FRiverGraph& Graph,
        FGuid EdgeID,
        FGuid NewNodeID,
        int32 InsertAtIndex
    );

    // ... все операции из GraphOperations
};
```

### Этап 2: Spline Component интеграция

```cpp
// Конвертация Edge → USplineComponent
USplineComponent* EdgeToSpline(const FRiverEdge& Edge) {
    USplineComponent* Spline = NewObject<USplineComponent>();

    for (const FGuid& NodeID : Edge.NodeIDs) {
        FVector Location = Graph.Nodes[NodeID].Location;
        Spline->AddSplinePoint(Location, ESplineCoordinateSpace::World);
    }

    return Spline;
}
```

### Этап 3: Editor Mode Tool

```cpp
UCLASS()
class URiverEditorMode : public UEdMode {
    // Интерактивное размещение nodes через viewport
    // Snap визуализация
    // Properties panel для настройки
};
```

### Этап 4: PCG Integration

```cpp
UCLASS()
class URiverPCGNode : public UPCGSettings {
    // Input: FRiverGraph
    // Output: PCG Points для generation (камни, растительность вдоль реки)
};
```

---

## 📊 Текущее состояние vs Целевое

| Компонент | Текущее | Целевое (после рефакторинга) | UE5.6 эквивалент |
|-----------|---------|------------------------------|------------------|
| **Модель данных** | RiverGraph (main+tribs) | RiverGraphV2 (nodes+edges) | FRiverGraph (TMap) |
| **Операции** | RiverGraphService (class) | GraphOperations (pure fn) | URiverGraphLibrary |
| **Геометрия** | getCurvePoints (custom) | getCurvePoints + cache | USplineComponent |
| **FlowSign** | ❌ Неявный (порядок точек) | ✅ Явный (flowSign field) | int32 FlowSign |
| **Snap** | ❌ Ломается (off-by-one) | ✅ segIndexAt в кэше | GetInputKeyClosest |
| **Рендеринг** | Canvas API | Canvas API | Spline Mesh + Landscape |
| **UI** | React components | React components | Slate widgets |

---

## 🎓 Философия проекта

**Это не production приложение. Это "executable specification" для UE5.6 tool.**

### Критерии успеха:

✅ Логически корректный (баги исправлены)
✅ Архитектурно простой (Node-Edge + чистые функции)
✅ Хорошо документированный (каждая функция → Blueprint)
❌ ~~Ultra-optimized~~ (UE сделает это за нас)
❌ ~~Production-ready UI~~ (будет Slate в UE)

### Что важно:

- ✅ **Правильность алгоритмов** - они перенесутся
- ✅ **Чистота функций** - они станут Blueprint nodes
- ✅ **Простота кода** - легко понять и переписать
- ❌ **React performance** - не перенесётся
- ❌ **Pixel-perfect UI** - будет другой в UE

---

## 📚 Ссылки

- [UE5 Spline Component](https://docs.unrealengine.com/5.0/en-US/spline-components-in-unreal-engine/)
- [UE5 PCG](https://docs.unrealengine.com/5.0/en-US/procedural-content-generation-overview/)
- [UE5 Scriptable Tools](https://docs.unrealengine.com/5.0/en-US/editor-utility-blueprints/)
- [Blueprint Function Library](https://docs.unrealengine.com/5.0/en-US/blueprint-function-libraries-in-unreal-engine/)
