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

## 🏗️ Архитектура: Node-Edge Graph Model с 3-уровневой иерархией

### Переход от RiverGraph к Node-Edge модели

**Старая модель (до рефакторинга):**
```typescript
interface RiverGraph {
  mainRiver: RiverPoint[];           // полилиния
  tributaries: Map<string, Tributary>; // притоки с parentPointId
}
```

**Новая модель (UE-Ready) с 3-level DAG Hierarchy:**
```typescript
interface RiverGraphV2 {
  nodes: Record<NodeId, Node>;    // все вершины
  splines: Record<SplineId, Spline>; // все сплайны (river + tributary + stream)
}

interface Node {
  id: NodeId;
  x: number;
  y: number;
}

interface Spline {
  id: SplineId;
  kind: 'river' | 'tributary' | 'stream';  // 3 уровня иерархии
  nodeIds: NodeId[];              // путь по узлам (source → mouth)
  width: { kind: 'px' | 'relative'; value: number };
  parentId: SplineId | null;      // null для независимых рек (level 0)
  parentJunction: NodeId | null;  // узел присоединения к родителю
  children: SplineId[];           // дочерние сплайны
}
```

### 3-Level DAG Hierarchy

**Иерархия глубины ≤ 2:**
```
River (level 0)
  ├─→ Tributary (level 1)
  │     └─→ Stream (level 2) [max depth]
  └─→ Tributary (level 1)
```

**Правила:**
- **River** (level 0): `parentId = null`, может иметь children
- **Tributary** (level 1): `parentId = River`, может иметь children (streams)
- **Stream** (level 2): `parentId = Tributary`, **НЕ может** иметь children (max depth)

**Автоматическое определение kind:**
```typescript
function determineSplineKind(graph: RiverGraphV2, splineId: SplineId): SplineKind {
  const spline = graph.splines[splineId];
  if (!spline.parentId) return 'river';

  const parent = graph.splines[spline.parentId];
  if (!parent.parentId) return 'tributary';

  return 'stream';
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
│   └── RenderService.ts          # ❌ НЕ ПЕРЕНОСИТСЯ (UE rendering)
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

## 📐 Инварианты DAG (I1-I5)

**Критические правила топологии, обеспечивающие корректность графа:**

### I1: Валидация parentId
```typescript
// Spline с parentId должен иметь валидного родителя
spline.parentId !== null ⇒ graph.splines[spline.parentId] !== undefined
```

### I2: Ациклический граф (No Cycles)
```typescript
// Граф должен быть DAG - никаких циклов
// Проверка: traverseUp(spline) никогда не возвращается к начальному spline
```

### I3: Двунаправленная консистентность (Parent ⟺ Children)
```typescript
// Если A - родитель B, то B - в children A
spline.parentId === parentId ⇒ parent.children.includes(spline.id)
spline.id ∈ parent.children ⇒ spline.parentId === parent.id
```

### I4: Валидация parentJunction
```typescript
// Junction должен быть в nodeIds родителя (НЕ в истоке)
spline.parentJunction !== null ⇒
  parent.nodeIds.includes(spline.parentJunction) &&
  parent.nodeIds.indexOf(spline.parentJunction) > 0
```

### I5: Ограничение глубины дерева (depth ≤ 2)
```typescript
// Максимальная глубина = 2 (River → Tributary → Stream)
function getDepth(spline: Spline, graph: RiverGraphV2): number {
  let depth = 0;
  let current = spline;
  while (current.parentId !== null) {
    depth++;
    current = graph.splines[current.parentId];
  }
  return depth; // должно быть ≤ 2
}

// Stream (level 2) НЕ может иметь детей
spline.kind === 'stream' ⇒ spline.children.length === 0
```

---

## 🔍 Multiple Roles Problem

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

function getNodeRoles(graph: RiverGraphV2, nodeId: NodeId): NodeRoles {
  const containingSplines = findSplinesContainingNode(graph, nodeId);

  for (const [splineId, spline] of containingSplines) {
    const index = spline.nodeIds.indexOf(nodeId);
    if (index === 0) asSourceOf.push(splineId);
    else if (index === spline.nodeIds.length - 1) asMouthOf.push(splineId);
    else asInnerOf.push(splineId);
  }

  const isJunction = containingSplines.length > 1;
  // ... determine primary based on priority
  return { primary, isJunction, asSourceOf, asMouthOf, asInnerOf };
}
```

**Применение:**
- `computeNodeKind()` → возвращает `primary` (legacy compatibility)
- UI tooltips → показывают все роли для debugging
- Валидация операций → проверяют конкретные роли

---

## 🎯 Критические багфиксы (P0)

Эти баги исправлены в текущей реализации:

### 1. Stream поведение (FIXED)

**Проблема:** Stream вёл себя как самостоятельная река - мог создавать притоки, вставлять точки как river.

**Root Cause:** Логика проверяла `kind === 'tributary'`, пропуская `kind === 'stream'`.

**Решение:**
```typescript
// Было: if (spline.kind === 'tributary') { ... }
// Стало: if (spline.parentId !== null) { ... }

const isAttachedChild = activeSpline.parentId !== null;
```

### 2. Stream не отсоединялся при удалении junction (FIXED)

**Проблема:** `detachTributary()` принимал только `kind === 'tributary'`, бросал ошибку для stream.

**Решение:**
```typescript
// Было: if (spline.kind !== 'tributary') throw new Error(...)
// Стало:
if (spline.kind !== 'tributary' && spline.kind !== 'stream') {
  throw new Error('Spline is not a tributary or stream');
}
```

### 3. Kind не обновлялся автоматически (FIXED)

**Проблема:** После топологических изменений kind оставался старым (tributary мог стать stream).

**Решение - refreshAllSplineKinds():**
```typescript
function refreshAllSplineKinds(graph: RiverGraphV2): void {
  for (const splineId of Object.keys(graph.splines)) {
    const correctKind = determineSplineKind(graph, splineId);
    if (spline.kind !== correctKind) {
      graph.splines[splineId] = { ...spline, kind: correctKind };
    }
  }
}

// Вызывается после: deleteNode, detachTributary, mergeSplines
```

### 4. Отсутствие логов auto-deletion (FIXED)

**Проблема:** Cascade deletions (splines < 2 nodes, orphaned nodes) не логировались.

**Решение:**
```typescript
// Track before/after state
const beforeSplineIds = new Set(Object.keys(riverGraph.splines));
const afterSplineIds = new Set(Object.keys(newGraph.splines));

// Log deleted splines
deletedSplines.forEach(splineId => {
  actionLogger.log('DELETE_SPLINE',
    `Spline ${splineId.slice(0, 8)}... auto-deleted (< 2 nodes)`, ...);
});

// Log deleted nodes
deletedNodes.forEach(nodeId => {
  actionLogger.log('DELETE_NODE',
    `Node ${nodeId.slice(0, 8)}... auto-deleted (orphaned)`, ...);
});
```

### 5. segIndexAt для правильного snap

**Проблема:** `Math.floor(sampleIdx / curveSegments)` давал off-by-one из-за начального push.

**Решение:** Кэш кривой хранит `segIndexAt: Uint16Array` - для каждого sample → индекс контрольного сегмента.

### 6. devicePixelRatio

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

| Компонент | Текущее состояние | UE5.6 эквивалент |
|-----------|-------------------|------------------|
| **Модель данных** | ✅ RiverGraphV2 (nodes+splines, 3-level DAG) | FRiverGraph (TMap) |
| **Иерархия** | ✅ River → Tributary → Stream (depth ≤ 2) | Nested USplineComponents |
| **Операции** | ✅ GraphOperations (pure fn) | URiverGraphLibrary |
| **Инварианты** | ✅ I1-I5 (явная валидация) | Blueprint validators |
| **Геометрия** | ✅ getCurvePoints + cache + segIndexAt | USplineComponent |
| **Node Roles** | ✅ getNodeRoles() (multiple roles) | Blueprint helper functions |
| **Auto-refresh** | ✅ refreshAllSplineKinds() | Blueprint event hooks |
| **Snap** | ✅ segIndexAt в кэше | GetInputKeyClosest |
| **Рендеринг** | Canvas API | Spline Mesh + Landscape |
| **UI** | React components | Slate widgets |

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
