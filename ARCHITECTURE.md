# Архитектура проекта: Grid-Based River Editor

## Обзор

Проект организован по принципу **многослойной архитектуры** (Layered Architecture) с четким разделением ответственности между слоями. Это обеспечивает:

- ✅ **Модульность** - легко заменять и тестировать отдельные компоненты
- ✅ **Переиспользуемость** - логика не привязана к UI
- ✅ **Масштабируемость** - легко добавлять новые функции
- ✅ **Тестируемость** - каждый слой можно тестировать независимо

## Структура проекта

```
src/
├── domain/                    # Доменный слой (Domain Layer)
│   ├── models/               # Модели данных
│   │   ├── types.ts         # Все типы данных
│   │   └── index.ts
│   ├── constants/           # Константы приложения
│   │   ├── riverConstants.ts
│   │   ├── marchingSquares.ts
│   │   └── index.ts
│   └── utils/              # Утилиты для работы с данными
│       ├── geometry.ts     # Геометрические вычисления
│       ├── curves.ts       # Работа с кривыми (сплайны)
│       ├── riverValidation.ts  # Валидация графа реки
│       └── index.ts
│
├── services/               # Сервисный слой (Service Layer)
│   ├── RiverGraphService.ts    # Управление графом реки
│   ├── FlowService.ts          # Расчет потоков воды
│   ├── RenderService.ts        # Рендеринг на canvas
│   └── index.ts
│
├── hooks/                  # Слой React Hooks
│   ├── useRiverGraph.ts        # Управление состоянием графа
│   ├── useRiverInteractions.ts # Обработка взаимодействий
│   ├── useRiverRenderer.ts     # Управление рендерингом
│   └── index.ts
│
├── components/            # UI слой (Presentation Layer)
│   ├── App.tsx           # Главный компонент
│   ├── SetupScreen/      # Экран настройки
│   │   └── SetupScreen.tsx
│   ├── RiverEditor/      # Основной редактор
│   │   ├── RiverEditor.tsx
│   │   ├── RiverCanvas.tsx
│   │   ├── RiverOverlay.tsx
│   │   └── PointMarker.tsx
│   ├── Controls/         # Компоненты управления
│   │   ├── MainControls.tsx
│   │   ├── FlowControls.tsx
│   │   ├── RiverTypeControls.tsx
│   │   └── CurveControls.tsx
│   └── Instructions/     # Инструкции
│       └── Instructions.tsx
│
└── main.tsx              # Точка входа
```

## Слои архитектуры

### 1. Domain Layer (Доменный слой)

**Назначение**: Чистая бизнес-логика без зависимостей от React или UI.

**Содержит**:
- **Models** (`models/types.ts`) - Типы данных:
  - `Point`, `RiverPoint` - точки
  - `Tributary` - притоки
  - `RiverGraph` - граф реки
  - `CurveCache`, `FlowDirection` и др.

- **Constants** - Константы:
  - `riverConstants.ts` - настройки реки (ширина, снеппинг, цвета)
  - `marchingSquares.ts` - таблица Marching Squares для контуров

- **Utils** - Утилиты:
  - `geometry.ts` - геометрические вычисления (расстояния, проекции)
  - `curves.ts` - интерполяция кривых (Catmull-Rom сплайны)
  - `riverValidation.ts` - валидация графа реки

**Принципы**:
- ❌ Нет зависимостей от React
- ❌ Нет работы с DOM/Canvas
- ✅ Чистые функции
- ✅ Типизация TypeScript

### 2. Service Layer (Сервисный слой)

**Назначение**: Бизнес-логика для работы с доменными моделями.

**Содержит**:

- **RiverGraphService** - Управление графом реки:
  - Добавление/удаление точек
  - Создание притоков
  - Перемещение точек
  - Снеппинг притоков
  - Разделение сегментов

- **FlowService** - Расчет потоков воды:
  - Расчет направления потока
  - Расчет скорости
  - Учет кривизны и сужений
  - Сглаживание полей

- **RenderService** - Рендеринг:
  - Отрисовка сетки
  - Marching Squares для контуров
  - Визуализация потоков
  - Отрисовка сплайнов

**Принципы**:
- ❌ Нет прямой работы с React состоянием
- ✅ Статические методы (class-based services)
- ✅ Чистые функции где возможно
- ✅ Использует только Domain Layer

### 3. Hooks Layer (Слой React Hooks)

**Назначение**: Интеграция сервисов с React компонентами.

**Содержит**:

- **useRiverGraph** - Управление состоянием графа:
  - State: `riverGraph`, `activeSplineId`, `selectedPointId`
  - Actions: add/delete/move points, manage tributaries
  - Использует `RiverGraphService`

- **useRiverInteractions** - Обработка взаимодействий:
  - State: hover, drag, snap состояния
  - Logic: обработка наведения, снеппинга, перетаскивания

- **useRiverRenderer** - Управление рендерингом:
  - Ref на canvas
  - Координация `RenderService` и `FlowService`
  - Перерисовка при изменении данных

**Принципы**:
- ✅ Custom React hooks
- ✅ Инкапсуляция логики состояния
- ✅ Использует Service Layer
- ✅ Возвращает состояние и callbacks

### 4. Presentation Layer (UI слой)

**Назначение**: Визуальное представление и пользовательский интерфейс.

**Содержит**:

- **App** - Главный компонент, управление экранами
- **SetupScreen** - Экран настройки размеров сетки
- **RiverEditor** - Основной редактор:
  - Координирует все hooks
  - Обрабатывает события
  - Управляет UI параметрами
- **RiverCanvas** - Canvas для рендеринга
- **RiverOverlay** - SVG overlay для интерактивных элементов
- **PointMarker** - Маркеры точек
- **Controls** - Компоненты управления (слайдеры, чекбоксы)
- **Instructions** - Инструкции

**Принципы**:
- ✅ Presentational components
- ✅ Минимум логики
- ✅ Используют hooks для доступа к данным
- ✅ Event handlers передаются через props

## Поток данных

```
User Interaction (UI Layer)
    ↓
Event Handlers (Presentation Layer)
    ↓
Hooks (Hooks Layer)
    ↓
Services (Service Layer)
    ↓
Domain Models & Utils (Domain Layer)
    ↓
Updated State → Re-render UI
```

## Пример: Добавление точки к реке

```typescript
// 1. User clicks on canvas
<RiverCanvas onClick={handleCanvasClick} />

// 2. Event handler в RiverEditor
const handleCanvasClick = (e) => {
  const { x, y } = getCoordinates(e);
  addPointToActiveSpline(x, y, tributaryWidthPercent);
  //    ↑ hook function
};

// 3. Hook (useRiverGraph)
const addPointToActiveSpline = (x, y, width) => {
  const result = RiverGraphService.addPointToMainRiver(
    riverGraph, x, y, selectedPointId
  );
  //    ↑ service call

  if (result) {
    setRiverGraph(result.graph);  // Update state
    //    ↑ React state update
  }
};

// 4. Service (RiverGraphService)
static addPointToMainRiver(graph, x, y, selectedId) {
  // Business logic
  const newPoint = { x, y, id: generateId() };
  //                              ↑ domain util

  return {
    graph: { ...graph, mainRiver: [...graph.mainRiver, newPoint] },
    newPointId: newPoint.id
  };
}

// 5. State update triggers re-render
// useRiverRenderer hook calls RenderService
// Canvas is updated
```

## Преимущества архитектуры

### 1. Разделение ответственности
- Domain = что
- Services = как
- Hooks = когда
- UI = где/визуально

### 2. Тестируемость
```typescript
// Domain utils - unit tests
test('distanceToCurve calculates correctly', () => {
  const result = distanceToCurve(10, 10, curve);
  expect(result).toBe(5);
});

// Services - integration tests
test('RiverGraphService adds point correctly', () => {
  const result = RiverGraphService.addPointToMainRiver(graph, 10, 20, null);
  expect(result.graph.mainRiver.length).toBe(1);
});

// Hooks - React testing library
test('useRiverGraph manages state', () => {
  const { result } = renderHook(() => useRiverGraph());
  act(() => result.current.addPointToActiveSpline(10, 20, 50));
  expect(result.current.riverGraph.mainRiver.length).toBe(1);
});
```

### 3. Переиспользуемость
- Domain utils можно использовать в других проектах
- Services не зависят от React
- Hooks можно использовать в разных UI компонентах

### 4. Масштабируемость
- Легко добавить новый тип реки → Domain + Service
- Легко добавить новый UI → новый Component
- Легко изменить рендеринг → только RenderService

## Технологии

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Canvas API** - Rendering
- **SVG** - Interactive overlay

## Path Aliases

Проект использует path aliases для чистых импортов:

```typescript
import { Point } from '@domain/models/types';
import { RiverGraphService } from '@services';
import { useRiverGraph } from '@hooks';
import { RiverEditor } from '@components/RiverEditor/RiverEditor';
```

Настройка в `tsconfig.json`:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["src/*"],
      "@domain/*": ["src/domain/*"],
      "@services/*": ["src/services/*"],
      "@hooks/*": ["src/hooks/*"],
      "@components/*": ["src/components/*"]
    }
  }
}
```

## Принципы разработки

### SOLID Principles

1. **Single Responsibility** - каждый модуль отвечает за одну вещь
2. **Open/Closed** - открыт для расширения, закрыт для модификации
3. **Liskov Substitution** - услуги взаимозаменяемы
4. **Interface Segregation** - узкие интерфейсы
5. **Dependency Inversion** - зависимость от абстракций

### Clean Architecture

- Зависимости направлены внутрь (к Domain)
- Domain не зависит ни от чего
- UI зависит от всех слоев, но другие слои не знают о UI

## Расширение функциональности

### Добавление нового типа реки

1. Добавить тип в `domain/models/types.ts`:
```typescript
export type RiverType = '...' | 'Новый тип';
```

2. Добавить константу в `domain/constants/riverConstants.ts`:
```typescript
export const RIVER_TYPES = {
  // ...
  'Новый тип': 3.5
};
```

3. UI автоматически обновится (RiverTypeControls использует `Object.keys(RIVER_TYPES)`)

### Добавление нового алгоритма рендеринга

1. Создать новый метод в `services/RenderService.ts`
2. Вызвать его из `hooks/useRiverRenderer.ts`
3. UI не требует изменений

## Заключение

Эта архитектура обеспечивает:
- ✅ Чистый, поддерживаемый код
- ✅ Легкое тестирование
- ✅ Простое расширение
- ✅ Четкое разделение ответственности
- ✅ Масштабируемость проекта

Следуйте принципам архитектуры при добавлении новой функциональности!
