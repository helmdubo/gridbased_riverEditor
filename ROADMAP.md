# 🗺️ River Editor - Development Roadmap

## 📋 Статус проекта

**Текущая фаза:** Рефакторинг на Node-Edge архитектуру + P0 багфиксы

**Финальная цель:** Прототип для миграции в UE5.6 Scriptable Tools

**Дата последнего обновления:** 2025-01-11

---

## 🎯 Общий прогресс

- [x] **Фаза 1:** Core модуль (Node-Edge граф + операции)
- [ ] **Фаза 2:** Геометрия и кэширование
- [ ] **Фаза 3:** UI интеграция
- [ ] **Фаза 4:** Оптимизации (опционально)
- [ ] **Фаза 5:** Полировка и документация

---

## 📦 Фаза 1: Core модуль (Node-Edge граф)

**Цель:** Создать UE-Ready модель данных и чистые функции для операций

### 1.1 Типы данных (Node-Edge)

- [x] Создать `src/core/graph/types.ts`
  - [x] `NodeId`, `EdgeId` типы
  - [x] `Node` интерфейс `{ id, x, y }`
  - [x] `WidthAbs` и `WidthRel` для ширины
  - [x] `Edge` интерфейс `{ id, kind, nodeIds, widthMode, flowSign, parentJunction, isDetached }`
  - [x] `RiverGraphV2` интерфейс `{ nodes, edges, mainEdgeId }`
  - [x] `FlowSign` type (`1 | -1`)

### 1.2 Валидация графа

- [x] Создать `src/core/graph/validation.ts`
  - [x] `isValidGraph()` - проверка инвариантов
  - [x] `isJunctionNode()` - узел с ≥2 edges
  - [x] `canAttachToNode()` - правила присоединения притока
  - [x] `findJunctionNodes()` - поиск всех узлов-пересечений
  - [x] `validateEdge()` - валидация рёбра (nodeIds не пустой, все nodes существуют)

### 1.3 Операции на графе (чистые функции)

- [x] Создать `src/core/graph/operations.ts`
  - [x] `addNode(graph, x, y)` → `{ graph, nodeId }`
  - [x] `deleteNode(graph, nodeId)` → `graph`
  - [x] `moveNode(graph, nodeId, x, y)` → `graph`
  - [x] `createEdge(graph, kind, nodeIds, width)` → `{ graph, edgeId }`
  - [x] `splitEdge(graph, edgeId, newNodeId, atIndex)` → `graph`
  - [x] `deleteEdge(graph, edgeId)` → `graph`
  - [x] `attachTributary(graph, tribEdgeId, junctionNodeId)` → `graph`
  - [x] `detachTributary(graph, tribEdgeId)` → `graph`
  - [x] `updateEdgeWidth(graph, edgeId, width)` → `graph`

**Критерии завершения фазы 1:**
- ✅ Все типы определены
- ✅ Функции валидации работают
- ✅ Операции чистые (pure functions)
- ✅ Каждая функция задокументирована с `@ue_equivalent`

---

## 🔧 Фаза 2: Геометрия и кэширование

**Цель:** Геометрические алгоритмы + кэш с segIndexAt для snap

### 2.1 Базовая геометрия

- [ ] Создать `src/core/geometry/geometry.ts`
  - [ ] `distance(p1, p2)` - расстояние между точками
  - [ ] `distanceToSegment(px, py, x1, y1, x2, y2)` - расстояние до отрезка
  - [ ] `generateId()` - генератор UUID

### 2.2 Кривые с segIndexAt (P0 багфикс)

- [ ] Создать `src/core/geometry/curves.ts`
  - [ ] `getCurvePoints(controlPoints)` → `{ points, segIndexAt }`
    - Catmull-Rom интерполяция
    - `segIndexAt[i]` = индекс контрольного сегмента для sample `i`
    - Формула: `segIndexAt[k] = Math.min(Math.floor((k - 1) / curveSegments), controlPoints.length - 2)`
  - [ ] `buildCurveCache(controlPoints)` → `CurveCache`
    - Возвращает `{ points, tangents, normals, curvature, segIndexAt }`

### 2.3 Frames (tangents, normals, curvature)

- [ ] Создать `src/core/geometry/frames.ts`
  - [ ] `computeTangents(points)` → `{vx, vy}[]`
  - [ ] `computeNormals(tangents)` → `{x, y}[]`
  - [ ] `computeCurvature(points)` → `number[]`
  - [ ] `computeFrames(points)` → `{ tangents, normals, curvature }`

### 2.4 Кэширование

- [ ] Создать `src/core/geometry/cache.ts`
  - [ ] `CurveCache` интерфейс
  - [ ] `buildEdgeCache(graph)` → `Record<EdgeId, CurveCache>`
    - Пересчитывает кэш для всех edges
    - Вызывается один раз при изменении графа

**Критерии завершения фазы 2:**
- ✅ getCurvePoints возвращает segIndexAt
- ✅ Snap работает корректно (без off-by-one)
- ✅ Кэш пересчитывается только при изменении графа
- ✅ Все функции задокументированы

---

## 🎨 Фаза 3: UI интеграция

**Цель:** Подключить Node-Edge граф к существующему UI

### 3.1 Адаптер GraphService

- [ ] Создать `src/services/GraphService.ts`
  - Обёртка над `core/graph/operations`
  - Методы возвращают новый граф (immutable)
  - Без stateful логики (чистые функции)

### 3.2 Hook useRiverGraph (обновление)

- [ ] Обновить `src/hooks/useRiverGraph.ts`
  - [ ] State: `riverGraph: RiverGraphV2`
  - [ ] State: `activeEdgeId: EdgeId | null`
  - [ ] State: `selectedNodeId: NodeId | null`
  - [ ] Методы используют GraphService
  - [ ] Простой кэш без сложных useMemo (см. фазу 4)

### 3.3 Обновление RenderService

- [ ] Обновить `src/services/RenderService.ts`
  - [ ] `buildCurveData()` работает с edges вместо mainRiver/tributaries
  - [ ] Использует кэш из `core/geometry/cache`
  - [ ] FlowSign используется явно (не через isMain)

### 3.4 Обновление FlowService

- [ ] Обновить `src/services/FlowService.ts`
  - [ ] Использует `edge.flowSign` вместо `isMain ? -1 : -1`
  - [ ] Фикс направления потока (P0)
  - [ ] Опционально: `widthFromMask` (быстрая версия, см. фазу 4)

### 3.5 Обновление компонентов

- [ ] Обновить `RiverEditor.tsx`
  - [ ] Работает с `RiverGraphV2`
  - [ ] `activeEdgeId` вместо `activeSplineId`
  - [ ] `selectedNodeId` вместо `selectedPointId`
- [ ] Обновить `RiverOverlay.tsx`
  - [ ] Рендерит nodes из графа
  - [ ] Pointer capture (P0 багфикс)
  - [ ] `setPointerCapture()` / `releasePointerCapture()`
- [ ] Обновить `RiverCanvas.tsx`
  - [ ] devicePixelRatio (P0 багфикс)
  - [ ] `canvas.width = cols * gridSize * dpr`
  - [ ] `ctx.scale(dpr, dpr)`

**Критерии завершения фазы 3:**
- ✅ Приложение работает с Node-Edge графом
- ✅ Все P0 багфиксы внедрены:
  - ✅ FlowSign явный
  - ✅ segIndexAt для snap
  - ✅ Pointer capture
  - ✅ devicePixelRatio
- ✅ Можно добавлять/удалять/перемещать nodes
- ✅ Можно создавать/присоединять притоки
- ✅ Flow map отображается корректно

---

## ⚡ Фаза 4: Оптимизации (опционально)

**Цель:** Базовые оптимизации для комфортного тестирования

### 4.1 Простое кэширование

- [ ] Обновить `useRiverRenderer.ts`
  - [ ] Кэш edge curves: пересчёт только при изменении графа
  - [ ] Кэш flow field: пересчёт только при изменении параметров потока
  - [ ] Dirty flags вместо сложных useMemo

### 4.2 rAF scheduling

- [ ] Создать `src/core/scheduling.ts`
  - [ ] `scheduleRender(callback)` - coalescing в rAF
  - [ ] Максимум 1 перерисовка/кадр
- [ ] Интегрировать в `useRiverRenderer`

### 4.3 widthFromMask (быстрая версия)

- [ ] Создать `src/core/flow/widthMask.ts`
  - [ ] `widthFromMask(waterMask, cx, cy, normal, gridSize)`
  - [ ] Семплирует waterMask вместо distanceToCurve
  - [ ] x10 быстрее чем `widthAlongNormal_precise`
- [ ] Добавить feature flag для переключения

**Критерии завершения фазы 4:**
- ✅ Плавная работа на сетке 30×30
- ✅ Slider изменения не тормозят
- ✅ Drag плавный даже с flow map

---

## 🎨 Фаза 5: Полировка (опционально)

**Цель:** UX улучшения для удобства использования

### 5.1 Расширенные интеракции

- [ ] Shift+click для вставки в любой сегмент
- [ ] Визуализация forbidden zones при drag
- [ ] Status bar с информацией о графе

### 5.2 Документация

- [ ] Обновить README с новыми инструкциями
- [ ] Скриншоты/GIF демонстрация
- [ ] Комментарии к сложным функциям

### 5.3 Экспорт (когда придёт время миграции)

- [ ] JSON export графа
- [ ] UE5-совместимый формат
- [ ] Blueprint импорт код (C++ пример)

---

## 🐛 Известные проблемы (TODO)

### Критические (блокируют работу)
- Нет критических проблем на данный момент

### Важные (мешают UX)
- [ ] Нет Undo/Redo (можно добавить на основе истории графа)
- [ ] Нет keyboard shortcuts (Delete для удаления node)

### Приятные улучшения
- [ ] Анимированные flow arrows
- [ ] Touch support для планшетов
- [ ] Множественный выбор nodes

---

## 📊 Метрики успеха

### Функциональные
- ✅ Можно создать главную реку с 5+ точками
- ✅ Можно добавить 3+ притока
- ✅ Snap к точкам работает
- ✅ Snap к сплайну работает корректно
- ✅ Drag стабилен на всех устройствах (включая Safari)
- ✅ Flow map показывает правильное направление

### Технические
- ✅ TypeScript без ошибок (`npm run type-check`)
- ✅ Build успешен (`npm run build`)
- ✅ Код соответствует UE-Ready принципам
- ✅ Все core функции задокументированы

### Производительность (опционально)
- [ ] Плавная работа на сетке 40×40
- [ ] <100ms на перерисовку кадра
- [ ] <50ms на пересчёт flow field

---

## 🔄 История изменений

### 2025-01-11 - Фаза 1 завершена
- ✅ Создан `src/core/graph/types.ts` с полной системой типов Node-Edge
- ✅ Создан `src/core/graph/validation.ts` с функциями валидации графа
- ✅ Создан `src/core/graph/operations.ts` с чистыми функциями операций
- ✅ Все функции задокументированы с `@ue_equivalent` тегами

### 2025-01-11 - Создание roadmap
- ✅ Определена Node-Edge архитектура
- ✅ Зафиксированы P0 багфиксы
- ✅ Составлен план из 5 фаз

---

## 📝 Примечания

### Для AI агентов
При продолжении работы над проектом:
1. Проверьте чекбоксы в этом файле
2. Продолжайте с незавершённых задач
3. Обновляйте чекбоксы по мере выполнения
4. Коммитьте изменения в roadmap вместе с кодом

### Для разработчика
- Этот roadmap - "живой документ"
- Обновляйте его при изменении приоритетов
- Используйте для синхронизации между сессиями
- Все функции в `core/` должны быть готовы к UE миграции

---

## 🎯 Следующий шаг

**Фаза 2.1:** Создание базовой геометрии (`src/core/geometry/geometry.ts`)
