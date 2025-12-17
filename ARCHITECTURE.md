# Архитектура расширения AI Coder

## Обзор

Расширение спроектировано с учетом будущего развития и интеграции различных LLM провайдеров. Архитектура следует принципам разделения ответственности и расширяемости.

## Структура компонентов

### 1. Extension Layer (extension.ts)

**Ответственность:**
- Активация и деактивация расширения
- Регистрация команд VS Code
- Инициализация сервисов
- Управление жизненным циклом расширения

**Ключевые функции:**
- `activate()` - точка входа при активации расширения
- `deactivate()` - очистка ресурсов при деактивации

### 2. Webview Layer (webview/panel.ts)

**Ответственность:**
- Управление Webview панелью
- Коммуникация между UI и расширением
- Обработка пользовательских действий
- Отображение результатов

**Паттерны:**
- Singleton для управления единственной панелью
- Message passing между Webview и Extension Host
- Сохранение состояния панели

**Ключевые методы:**
- `createOrShow()` - создание или показ панели
- `_handleGenerate()` - обработка запроса генерации
- `_update()` - обновление содержимого Webview

### 3. Service Layer (services/llmService.ts)

**Ответственность:**
- Абстракция работы с LLM провайдерами
- Управление конфигурацией
- Обработка запросов и ответов
- Кэширование (будущее)

**Архитектурные решения:**

#### Интерфейс LLMProvider
```typescript
interface LLMProvider {
    generate(prompt: string, config: LLMConfig): Promise<string>;
    stream?(prompt: string, config: LLMConfig): AsyncIterable<string>;
}
```

Этот интерфейс позволяет легко добавлять новые провайдеры:
- OpenAI
- Anthropic Claude
- Локальные модели (Ollama, LM Studio)
- Другие провайдеры

#### Конфигурация
Конфигурация загружается из VS Code Settings и может быть расширена:
- Провайдер
- API ключи
- Параметры модели (temperature, maxTokens)
- Дополнительные настройки

### 4. UI Layer (media/main.js, main.css)

**Ответственность:**
- Пользовательский интерфейс
- Взаимодействие с пользователем
- Отображение результатов
- Обработка событий

**Особенности:**
- Использование VS Code CSS переменных для темизации
- Сохранение состояния через `vscode.getState()`
- Асинхронная коммуникация с Extension Host

## Поток данных

```
User Input (Webview)
    ↓
main.js (postMessage)
    ↓
panel.ts (onDidReceiveMessage)
    ↓
llmService.generateCode()
    ↓
LLM Provider (будущее)
    ↓
Response
    ↓
panel.ts (postMessage)
    ↓
main.js (displayResult)
    ↓
User sees result
```

## Расширяемость

### Добавление нового LLM провайдера

1. Создать класс, реализующий `LLMProvider`:
```typescript
class OpenAIProvider implements LLMProvider {
    async generate(prompt: string, config: LLMConfig): Promise<string> {
        // Реализация вызова OpenAI API
    }
}
```

2. Добавить провайдер в `LLMService`:
```typescript
private _providers: Map<string, LLMProvider> = new Map();

constructor() {
    this._providers.set('openai', new OpenAIProvider());
    this._providers.set('anthropic', new AnthropicProvider());
}
```

3. Использовать в `generateCode()`:
```typescript
const provider = this._providers.get(this._config.provider);
return await provider.generate(prompt, this._config);
```

### Добавление новых функций UI

1. Добавить элементы в `media/main.html` (или генерировать в `panel.ts`)
2. Добавить обработчики в `media/main.js`
3. Добавить обработку сообщений в `panel.ts`
4. При необходимости расширить `LLMService`

### Добавление настроек

1. Добавить в `package.json` в секцию `contributes.configuration`:
```json
"configuration": {
    "title": "AI Coder",
    "properties": {
        "aiCoder.llm.provider": {
            "type": "string",
            "enum": ["openai", "anthropic", "ollama"],
            "default": "openai"
        }
    }
}
```

2. Использовать в `LLMService._loadConfig()`

## Будущие улучшения

### Планируемые компоненты

1. **CacheService** - кэширование запросов и ответов
2. **ContextService** - извлечение контекста из открытых файлов
3. **HistoryService** - сохранение истории запросов
4. **StreamService** - обработка стриминговых ответов
5. **CodeInsertionService** - вставка кода в редактор

### Паттерны для реализации

- **Strategy Pattern** - для различных LLM провайдеров
- **Observer Pattern** - для уведомлений о статусе генерации
- **Factory Pattern** - для создания провайдеров
- **Repository Pattern** - для работы с историей и кэшем

## Безопасность

- Использование nonce для CSP в Webview
- Безопасное хранение API ключей через VS Code Secret Storage
- Валидация входных данных
- Обработка ошибок и таймаутов

## Производительность

- Ленивая загрузка провайдеров
- Кэширование конфигурации
- Оптимизация Webview (retainContextWhenHidden)
- Асинхронная обработка запросов

