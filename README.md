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

## 🤖 Agent Handoff (2025-12-01)

**Состояние редактора**

- Поддерживаются независимые реки (`kind='river'`, `parentId=null`) и притоки с наследованием ширины.
- Детач притока автоматически переводит его в режим родительской реки с полной функциональностью и стилями.
- Ползунок ширины синхронизируется с активным сплайном: пиксели для рек, проценты для притоков.
- Тестовые проверки: `npm run type-check`, `npm run build`.

**Рекомендации для следующего агента**

1. Ознакомьтесь с разделом «Следующие шаги» в [ROADMAP.md](./ROADMAP.md).
2. При разработке ориентируйтесь на отказ от legacy-адаптера и перенос FlowService на Node-Edge модель.
3. Перед началом работы запустите `npm run dev` и убедитесь, что многоречные сцены (3+ реки) и цепочки притоков ведут себя корректно.
4. При обновлении логики ширины проверяйте, что новые притоки наследуют процентное значение, а независимые реки сохраняют пиксельное.

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
