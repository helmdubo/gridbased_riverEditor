# Source 2 Style Hotspotting Toolkit — Production Assessment

## Контекст

Этот обзор основан на переданном коде `hotspotingUV_mesh_decals_UI.py` (v18.0, `bl_info.version=(1,4,0)`) и целевом направлении: production-инструмент для Level Art pipeline в стиле Source 2.

## Сильные стороны текущего решения

- Архитектура уже разделена на логические блоки: анализ геометрии, UV, chaining, генераторы декалей, UI/операторы.
- Есть стабильные ключевые алгоритмы, которые нельзя ломать без миграционного плана:
  - `get_edge_chains()` для непрерывных лент,
  - адаптивный corner/seam генератор,
  - классификация стен/пола/потолка,
  - hybrid unroll для curved islands.
- UX уже production-friendly: единая панель, сохранение параметров через `PropertyGroup`, частично non-destructive подход для decal-геометрии.

## Критические слабые места

### 1) Глобальное состояние через module-level константы

Функция `_apply_settings_to_globals()` мутирует глобальные значения (`UV_SCALE`, `DECAL_OFFSET`, и т.д.).

**Риски:**
- Скрытые сайд-эффекты между операторами.
- Сложно тестировать изолированно.
- Потенциальные race-like эффекты при последовательных вызовах разных операторов в одной сессии.

**Рекомендация:** перейти на явный объект конфигурации `ToolConfig` и передавать его в функции/генераторы.

### 2) Слабая формализация numeric tolerances

В коде одновременно используются жёсткие пороги: `0.98`, `0.99`, `1e-6`, `1e-5`, `DIR_THRESHOLD`, `NOISE_THRESHOLD`.

**Риски:**
- Нестабильность на разных масштабах сцены и разной плотности сетки.
- Непредсказуемые переключения corner/seam классификации.

**Рекомендация:** централизовать tolerances в `NumericsPolicy` + нормализовать часть порогов через scale-aware метрики (например, относительно median edge length island-а).

### 3) Неполный контроль вырожденной геометрии

Есть несколько мест, где `.normalized()` вызывается после потенциально нулевого вектора (например, усреднение нормалей/битангентов, cross-products).

**Риски:**
- Runtime исключения на проблемных мешах.
- Локальные разрывы/инверсии decal-лент.

**Рекомендация:** внедрить `safe_normalize(v, fallback)` + метрики ошибок в debug-лог.

### 4) Graph traversal на list.pop(0)

В `apply_rigid_unroll()` и `stitch_islands()` используется очередь через list с `pop(0)`.

**Риски:**
- O(n²) при крупных селекциях.

**Рекомендация:** заменить на `collections.deque`.

### 5) Простая normalize-упаковка UV вместо atlas packing

`normalize_islands_to_origin()` только сдвигает острова, но не решает задачу оптимальной укладки в атлас.

**Риски:**
- Низкая утилизация UV пространства.
- Трудно управлять deterministic layout для библиотек модульных ассетов.

**Рекомендация:** добавить этап `pack_islands_best_fit()` с policy-параметрами (rotation set, padding, priority by area/semantic class).

### 6) Перекрестки trim-лент (без miter strategy)

На сложных junctions (3+ стены) текущая геометрия может самопересекаться.

**Риски:**
- Z-fighting и визуальные артефакты.
- Нестабильность baking/normal transfer.

**Рекомендация:** отдельный intersection solver:
- detect junction node degree,
- строить miter/bevel join по углу,
- ограничивать длину miter (miter limit), fallback на bevel.

### 7) Низкая testability (монолитный файл)

Алгоритмы и Blender API связаны в одном модуле.

**Риски:**
- Нельзя быстро гонять unit-tests без Blender runtime.
- Регрессии фиксируются вручную.

**Рекомендация:** выделить чистое ядро:
- `core_math.py` (vector/graph/polygon logic),
- `core_uv.py`,
- `core_decals.py`,
- адаптер `blender_io.py`.

## Архитектурные возможности улучшения

### A. Ввести контракты данных между этапами

Предлагаемые структуры:
- `IslandDescriptor` (type, curvature class, basis quality, boundary loops),
- `ChainDescriptor` (verts, length, continuity score, junction tags),
- `DecalStripPlan` (profile type, width profile, UV lane, join strategy).

Это снизит связность и позволит внедрять оптимизации без риска поломки Chain Builder.

### B. Атлас-пэкинг как отдельный pipeline stage

План:
1. Сбор AABB/OBB островов в UV-space.
2. Rotation candidates: 0/90 (+ optional 180/270).
3. Shelf/MaxRects heuristic.
4. Deterministic sorting (area desc + stable id).
5. Пост-валидатор overlap + padding compliance.

### C. Intersection-aware trim generation

План:
1. Построить graph лент: вершина = стык, ребро = segment.
2. Для junction degree >= 3 вычислять join-solution.
3. Генерировать cap-геометрию на концах открытых лент.

### D. Наблюдаемость и диагностируемость

Добавить debug mode уровней:
- level 0: silent,
- level 1: counters (islands, chains, rejected edges),
- level 2: timing по стадиям,
- level 3: export debug mesh/markers.

## Роадмап (без риска сломать базу)

### Phase 1 — Hardening (низкий риск)

- `safe_normalize`, `epsilon` политика,
- `deque` для BFS,
- устранение глобальных мутаций конфигурации.

### Phase 2 — Atlas Packing MVP (средний риск)

- Новый модуль пэкинга и feature-flag в UI,
- fallback на старый `normalize_islands_to_origin()`.

### Phase 3 — Junction Solver (средний/высокий риск)

- Miter/bevel caps для trim chains,
- regression-набор сцен: L-corner, T-junction, 4-way, curved-wall-to-flat.

## Production KPI для валидации

- **Stability:** 0 crash на наборе regression meshes.
- **Determinism:** одинаковый mesh output при повторном запуске на одной сцене.
- **UV Efficiency:** +20–35% packing utilization против baseline normalize.
- **Artist Time:** снижение ручных правок trim intersections минимум на 50%.

## Короткий actionable backlog (следующий спринт)

1. Вынести numerics+config в отдельный слой (без изменения геометрических алгоритмов).
2. Внедрить `deque` и `safe_normalize` в hot paths.
3. Прототип `pack_islands_best_fit()` с feature toggle.
4. Добавить junction detector и аналитический отчёт о проблемных узлах (пока без генерации miter).

## UX: что улучшить в инструменте для production Level Art

Ниже — улучшения именно с позиции художника окружения (минимум кликов, предсказуемость, быстрый фидбек).

### 1) Режимы работы как явные workflows

- **Analyze**: только диагностика (islands, problem junctions, texel heatmap), без модификации меша.
- **Preview**: ghost overlay будущих UV/decal лент до применения.
- **Apply**: фактическая запись UV/создание decal mesh.

Почему важно: снижает страх «сломать» рабочий ассет и даёт быстрый цикл проверки.

### 2) Ясная визуальная диагностика проблем

- Подсветка «почему edge отклонён» (noise threshold, non-wall type, ambiguity of orientation).
- Цветовая маркировка chain качества:
  - зелёный — непрерывная цепь,
  - жёлтый — потенциальный разрыв,
  - красный — junction конфликт/самопересечение.
- UV density heatmap в viewport (до/после).

### 3) Предсказуемые пресеты под пайплайн

- Presets: `Alyx_Interior_Default`, `Industrial_Wide_Trims`, `Narrow_Corridor`.
- Пресеты должны фиксировать: texel density, trim widths, seam width, padding policy.
- Заблокированные параметры для junior artists (чтобы не ломали scale consistency).

### 4) Фичи безопасности (anti-destructive UX)

- Кнопка **Create Backup UV Set** перед unwrap.
- Dry-run отчёт: сколько islands/chains изменится, сколько проблем найдено.
- Post-apply лог с кнопкой «Select Problem Faces». 

### 5) Производственные мелочи, которые сильно экономят время

- Batch processing нескольких объектов за один запуск.
- Правильная работа с mirrored/negative scale трансформами.
- Re-apply last settings hotkey.
- Автопроверка naming conventions для decal-объектов/коллекций.

## Какие ситуации обязательно обрабатывать (edge-case matrix)

### Геометрия

- T-junction и X-junction (3/4 стены в одной точке).
- Криволинейная стена, переходящая в плоскую.
- Очень короткие сегменты («ступеньки»/шум после boolean).
- Non-manifold участки и внутренние дубли.
- Длинные коридоры с накоплением ошибки UV.

### UV/Atlas

- Смешанные крупные и очень мелкие islands (packing fragmentation).
- Ограничение rotation policy (только 90° vs arbitrary).
- Padding при разных mip-уровнях.
- Повторяемость (deterministic packing при одинаковом входе).

### Декали

- Самопересечение лент на внутреннем угле.
- Обрыв ленты при микро-разрыве топологии.
- Стабильная ширина ленты на кривых и на резких изломах.
- Корректный cap на открытых концах.

### UX/операторский контур

- Понятные сообщения ошибок (не «Nothing generated», а причина + действие).
- Возможность частичного применения (только Top/Bottom/Corner с preview).
- Undo-safe операции и идемпотентный повтор команды.

## Что известно о похожем workflow Valve / Source 2 (Hammer)

В публично наблюдаемом workflow Source 2 (в т.ч. по материалам комьюнити вокруг HL:Alyx) ценится следующий подход:

1. **Consistency first**: единая texel density и предсказуемое поведение hotspot/trim по всей сцене.
2. **Быстрая итерация**: инструменты дают почти мгновенный preview, чтобы художник принимал решение «на глаз + по метрикам».
3. **Модульность**: повторно используемые trim/decal паттерны и библиотечные решения, а не ручная подгонка каждого угла.
4. **Стабильность pipeline**: детерминированный результат важнее «магии», иначе ломаются bake/lighting/командная синхронизация.

Для вашего аддона это значит:
- делать акцент на deterministic atlas packing;
- добавить junction solver с явной стратегией (miter/bevel + miter limit);
- расширить preview/debug слой, чтобы артист понимал решения алгоритма;
- держать результат воспроизводимым между машинами и запусками.
