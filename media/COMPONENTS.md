# Структура компонентов

## Обзор

Проект разделен на отдельные компоненты для улучшения поддерживаемости и масштабируемости.

## Структура папок

```
media/
├── components/
│   ├── ui/                    # Базовые UI компоненты
│   │   ├── Button.js
│   │   ├── Select.js
│   │   ├── Input.js
│   │   ├── Modal.js
│   │   ├── Tabs.js
│   │   └── StatusMessage.js
│   └── features/              # Функциональные компоненты
│       ├── CodeGenerationComponent.js
│       ├── SearchComponent.js
│       ├── SettingsComponent.js
│       └── ServerManagementComponent.js
├── utils/                     # Утилиты
│   ├── MessageBus.js          # Централизованная коммуникация
│   └── domUtils.js            # Утилиты для работы с DOM
└── main.js                    # Главный файл инициализации
```

## UI компоненты

### Button
Компонент кнопки с поддержкой состояний загрузки.

**Методы:**
- `setLoading(loading)` - установка состояния загрузки
- `setText(text)` - установка текста
- `setEnabled(enabled)` - включение/выключение
- `onClick(handler)` - добавление обработчика клика

### Select
Компонент выпадающего списка.

**Методы:**
- `setOptions(options)` - установка опций
- `getValue()` - получение выбранного значения
- `setValue(value)` - установка значения
- `onChange(handler)` - обработчик изменения

### Input
Компонент поля ввода.

**Методы:**
- `getValue()` - получение значения
- `setValue(value)` - установка значения
- `clear()` - очистка поля
- `onInput(handler)` - обработчик ввода

### Modal
Компонент модального окна.

**Методы:**
- `open()` - открытие модального окна
- `close()` - закрытие модального окна
- `initCloseHandlers()` - инициализация обработчиков закрытия

### Tabs
Компонент вкладок.

**Методы:**
- `switchToTab(tabId)` - переключение на вкладку
- `getCurrentTab()` - получение текущей вкладки
- `onChange(callback)` - обработчик изменения вкладки

## Функциональные компоненты

### CodeGenerationComponent
Компонент генерации кода.

**Подписки:**
- `generationStarted` - начало генерации
- `streamChunk` - стриминг чанков
- `generationComplete` - завершение генерации
- `generated` - результат генерации (обратная совместимость)
- `error` - ошибка генерации
- `activeModelsList` - список активных моделей

### SearchComponent
Компонент поиска файлов.

**Подписки:**
- `searchResults` - результаты поиска
- `searchError` - ошибка поиска

### SettingsComponent
Компонент настроек.

**Подписки:**
- `config` - конфигурация
- `activeModelsList` - список активных моделей
- `vectorizationComplete` - завершение векторизации
- `vectorizationError` - ошибка векторизации
- `storageCount` - количество записей в хранилище
- `storageCleared` - хранилище очищено
- `configReset` - сброс конфигурации

### ServerManagementComponent
Компонент управления серверами LLM.

**Подписки:**
- `serversList` - список серверов
- `serverModelsList` - список моделей сервера
- `serverCheckResult` - результат проверки сервера
- `serverAdded` - сервер добавлен
- `serverUpdated` - сервер обновлен
- `serverDeleted` - сервер удален
- `serverActiveToggled` - активность сервера изменена
- `modelActiveToggled` - активность модели изменена

## MessageBus

Централизованная система коммуникации между компонентами и extension host.

**Методы:**
- `send(command, data)` - отправка сообщения в extension host
- `subscribe(command, callback)` - подписка на сообщения от extension host
- `unsubscribe(command, callback)` - отписка от сообщений

## Порядок загрузки

Скрипты загружаются в следующем порядке (в `panel.ts`):

1. `domUtils.js` - утилиты для работы с DOM
2. `MessageBus.js` - система коммуникации
3. UI компоненты (Button, Select, Input, Modal, Tabs, StatusMessage)
4. Функциональные компоненты (CodeGeneration, Search, Settings, ServerManagement)
5. `main.js` - инициализация всех компонентов

## Добавление нового компонента

1. Создать файл компонента в соответствующей папке (`ui/` или `features/`)
2. Добавить загрузку скрипта в `panel.ts` в правильном порядке
3. Инициализировать компонент в `main.js`
4. Подписаться на нужные сообщения через `MessageBus`

## Пример использования

```javascript
// В компоненте
class MyComponent {
    constructor(messageBus) {
        this.messageBus = messageBus;
        this._subscribeToMessages();
    }
    
    _subscribeToMessages() {
        this.messageBus.subscribe('myCommand', (message) => {
            // Обработка сообщения
        });
    }
    
    _handleAction() {
        this.messageBus.send('myAction', { data: 'value' });
    }
}

// В main.js
const myComponent = new MyComponent(messageBus);
```


