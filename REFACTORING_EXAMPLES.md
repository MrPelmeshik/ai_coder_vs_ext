# Примеры рефакторинга

## 1. Разделение EmbeddingService

### До (текущее состояние):
```typescript
// embeddingService.ts - 1203 строки, слишком много ответственности
export class EmbeddingService {
    // Векторизация файлов
    // Векторизация директорий
    // Суммаризация текста
    // Получение эмбеддингов (Ollama, Custom)
    // Управление статусами
    // Рекурсивный обход файловой системы
}
```

### После (рефакторинг):
```typescript
// services/embedding/embeddingService.ts - координатор
export class EmbeddingService {
    constructor(
        private context: vscode.ExtensionContext,
        private llmService: LLMService,
        private fileStatusService: FileStatusService,
        private storage: VectorStorage,
        private fileVectorizer: FileVectorizer,
        private directoryVectorizer: DirectoryVectorizer
    ) {}

    async vectorizeAllUnprocessed(workspaceFolder?: vscode.WorkspaceFolder) {
        // Координация процесса векторизации
    }
}

// services/embedding/fileVectorizer.ts
export class FileVectorizer {
    constructor(
        private embeddingProvider: EmbeddingProvider,
        private textSummarizer: TextSummarizer,
        private storage: VectorStorage
    ) {}

    async vectorizeFile(filePath: string, parentId: string | null): Promise<void> {
        // Только векторизация файлов
    }
}

// services/embedding/directoryVectorizer.ts
export class DirectoryVectorizer {
    constructor(
        private embeddingProvider: EmbeddingProvider,
        private storage: VectorStorage,
        private fileVectorizer: FileVectorizer
    ) {}

    async vectorizeDirectory(dirPath: string, parentId: string | null): Promise<void> {
        // Только векторизация директорий
    }
}

// services/embedding/textSummarizer.ts
export class TextSummarizer {
    constructor(private llmService: LLMService) {}

    async summarize(text: string): Promise<string> {
        // Только суммаризация текста
    }
}

// services/embedding/embeddingProvider.ts
export interface EmbeddingProvider {
    getEmbedding(text: string): Promise<number[]>;
}

// services/embedding/ollamaEmbeddingProvider.ts
export class OllamaEmbeddingProvider implements EmbeddingProvider {
    async getEmbedding(text: string): Promise<number[]> {
        // Получение эмбеддинга через Ollama
    }
}

// services/embedding/customEmbeddingProvider.ts
export class CustomEmbeddingProvider implements EmbeddingProvider {
    async getEmbedding(text: string): Promise<number[]> {
        // Получение эмбеддинга через кастомный API
    }
}
```

---

## 2. Устранение дублирования кода

### До:
```typescript
// В OllamaProvider, LocalApiProvider, EmbeddingService
catch (error) {
    if (error instanceof Error) {
        if (error.name === 'AbortError') {
            throw new Error(`Таймаут запроса к Ollama (${timeout}ms)...`);
        }
        if (error.message.includes('fetch')) {
            throw new Error(`Не удалось подключиться к Ollama...`);
        }
        throw error;
    }
    throw new Error('Неизвестная ошибка...');
}
```

### После:
```typescript
// utils/errorHandler.ts
export class ApiErrorHandler {
    static handle(error: unknown, context: string, timeout: number): never {
        if (error instanceof Error) {
            if (error.name === 'AbortError') {
                throw new Error(
                    `Таймаут запроса к ${context} (${timeout}ms). ` +
                    `Убедитесь, что сервер запущен и доступен.`
                );
            }
            if (error.message.includes('fetch') || error.message.includes('ECONNREFUSED')) {
                throw new Error(
                    `Не удалось подключиться к ${context}. ` +
                    `Убедитесь, что сервер запущен.`
                );
            }
            throw error;
        }
        throw new Error(`Неизвестная ошибка при обращении к ${context}`);
    }
}

// Использование:
try {
    // API call
} catch (error) {
    ApiErrorHandler.handle(error, 'Ollama', timeout);
}
```

---

## 3. Вынос магических значений в константы

### До:
```typescript
// embeddingService.ts
const maxLength = 10000; // Что это за число?
const textToSummarize = text.length > maxLength 
    ? text.substring(0, maxLength) + '\n\n[...текст обрезан...]'
    : text;

// lanceDbStorage.ts
const MIN_RECORDS_FOR_INDEX = 512;
const numSubVectors = 16;

// ollamaProvider.ts
const localUrl = config.localUrl || 'http://localhost:11434';
```

### После:
```typescript
// constants/index.ts
export const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
export const DEFAULT_LOCAL_API_URL = 'http://localhost:1234';
export const DEFAULT_TIMEOUT = 30000;

export const SUMMARIZE = {
    MAX_TEXT_LENGTH: 10000, // ~2500-3000 токенов
    TRUNCATE_MESSAGE: '\n\n[...текст обрезан для суммаризации...]'
} as const;

export const VECTOR_INDEX = {
    MIN_RECORDS: 512,
    UPDATE_INTERVAL: 5000,
    SUB_VECTORS: 16,
    MAX_PARTITIONS: 512
} as const;

// Использование:
import { SUMMARIZE, DEFAULT_OLLAMA_URL } from '../constants';

const textToSummarize = text.length > SUMMARIZE.MAX_TEXT_LENGTH
    ? text.substring(0, SUMMARIZE.MAX_TEXT_LENGTH) + SUMMARIZE.TRUNCATE_MESSAGE
    : text;
```

---

## 4. Устранение дублирования в _processDirectoryItem

### До:
```typescript
// Два почти идентичных блока для vs_origin и vs_summarize
// 1. vs_origin (строки 492-554)
if (needsVsOrigin) {
    const nestedItems = await this._getNestedItems(dirPath);
    const filteredItems = nestedItems.filter(item => {
        // ...фильтрация для origin
        if (item.type === 'file') {
            return item.kind === 'origin';
        } else if (item.type === 'directory') {
            return item.kind === 'vs_origin';
        }
        return false;
    });
    // ...создание вектора
}

// 2. vs_summarize (строки 557-619) - почти идентично
if (needsVsSummarize) {
    const nestedItems = await this._getNestedItems(dirPath);
    const filteredItems = nestedItems.filter(item => {
        // ...фильтрация для summarize
        if (item.type === 'file') {
            return item.kind === 'summarize';
        } else if (item.type === 'directory') {
            return item.kind === 'vs_summarize';
        }
        return false;
    });
    // ...создание вектора
}
```

### После:
```typescript
// Выносим общую логику
private async _createVectorSumForDirectory(
    dirPath: string,
    parentId: string | null,
    kind: 'vs_origin' | 'vs_summarize',
    fileKind: 'origin' | 'summarize',
    dirKind: 'vs_origin' | 'vs_summarize'
): Promise<void> {
    const nestedItems = await this._getNestedItems(dirPath);
    const normalizedDirPath = path.normalize(dirPath);
    
    const filteredItems = nestedItems.filter(item => {
        const normalizedItemPath = path.normalize(item.path);
        
        if (normalizedItemPath === normalizedDirPath) {
            return false;
        }
        
        if (!normalizedItemPath.startsWith(normalizedDirPath + path.sep)) {
            return false;
        }
        
        if (item.type === 'file') {
            return item.kind === fileKind;
        } else if (item.type === 'directory') {
            return item.kind === dirKind;
        }
        return false;
    });

    const vectors = filteredItems
        .map(item => item.vector)
        .filter((v): v is number[] => v !== null && Array.isArray(v) && v.length > 0);

    if (vectors.length > 0) {
        const sumVector = this._sumVectors(vectors);
        
        const item: EmbeddingItem = {
            id: this._generateGuid(),
            type: 'directory',
            parent: parentId,
            childs: [],
            path: dirPath,
            kind: kind,
            raw: {
                description: `Сумма ${vectors.length} векторов: ${fileKind} файлов и ${dirKind} директорий`,
                count: vectors.length
            },
            vector: sumVector
        };

        await this._storage.addEmbedding(item);
    } else if (nestedItems.length > 0) {
        console.warn(`[${kind}] Нет вложенных элементов с векторами ${fileKind}/${dirKind} для директории ${dirPath}`);
    }
}

// Использование:
if (needsVsOrigin) {
    await this._createVectorSumForDirectory(
        dirPath, parentId, 'vs_origin', 'origin', 'vs_origin'
    );
}

if (needsVsSummarize) {
    await this._createVectorSumForDirectory(
        dirPath, parentId, 'vs_summarize', 'summarize', 'vs_summarize'
    );
}
```

---

## 5. Улучшение производительности

### До (синхронные операции):
```typescript
// embeddingService.ts:233
const content = fs.readFileSync(filePath, 'utf-8');

// Множественные проверки
const hasOrigin = await this._storage.exists(filePath, 'origin');
const hasSummarize = await this._storage.exists(filePath, 'summarize');
```

### После (асинхронные операции + оптимизация):
```typescript
// Используем асинхронные операции
const content = await fs.promises.readFile(filePath, 'utf-8');

// Получаем все записи один раз
const existingItems = await this._storage.getByPath(filePath);
const hasOrigin = existingItems.some(i => i.kind === 'origin');
const hasSummarize = existingItems.some(i => i.kind === 'summarize');
const hasVsOrigin = existingItems.some(i => i.kind === 'vs_origin');
const hasVsSummarize = existingItems.some(i => i.kind === 'vs_summarize');
```

---

## 6. Централизованное логирование

### До:
```typescript
// 40+ использований console.log/warn/error по всему проекту
console.error('Ошибка обработки файла:', error);
console.warn('Не удалось создать суммаризацию:', error);
console.log('Таблица создана');
```

### После:
```typescript
// utils/logger.ts
import * as vscode from 'vscode';

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

export class Logger {
    private static outputChannel: vscode.OutputChannel | undefined;
    private static logLevel: LogLevel = LogLevel.INFO;

    static initialize(context: vscode.ExtensionContext) {
        this.outputChannel = vscode.window.createOutputChannel('AI Coder');
        const config = vscode.workspace.getConfiguration('aiCoder');
        this.logLevel = config.get<LogLevel>('logLevel', LogLevel.INFO);
    }

    static debug(message: string, ...args: unknown[]) {
        if (this.logLevel <= LogLevel.DEBUG) {
            this.log('DEBUG', message, args);
        }
    }

    static info(message: string, ...args: unknown[]) {
        if (this.logLevel <= LogLevel.INFO) {
            this.log('INFO', message, args);
        }
    }

    static warn(message: string, ...args: unknown[]) {
        if (this.logLevel <= LogLevel.WARN) {
            this.log('WARN', message, args);
        }
    }

    static error(message: string, error?: Error, ...args: unknown[]) {
        if (this.logLevel <= LogLevel.ERROR) {
            this.log('ERROR', message, args);
            if (error) {
                this.log('ERROR', error.stack || error.message, []);
            }
        }
    }

    private static log(level: string, message: string, args: unknown[]) {
        if (!this.outputChannel) {
            console.log(`[${level}] ${message}`, ...args);
            return;
        }
        
        const timestamp = new Date().toISOString();
        const formattedMessage = args.length > 0 
            ? `${message} ${JSON.stringify(args)}`
            : message;
        
        this.outputChannel.appendLine(`[${timestamp}] [${level}] ${formattedMessage}`);
    }

    static dispose() {
        this.outputChannel?.dispose();
        this.outputChannel = undefined;
    }
}

// Использование:
Logger.info('Таблица embedding_item создана', { dimension: vectorDim });
Logger.error('Ошибка обработки файла', error, { filePath });
Logger.warn('Не удалось создать суммаризацию', error);
```

---

## 7. Улучшение типизации

### До:
```typescript
// panel.ts
this._panel.webview.onDidReceiveMessage((message: any) => {
    switch (message.command) {
        case 'generate':
            this._handleGenerate(message.text);
            break;
    }
});
```

### После:
```typescript
// types/messages.ts
export type WebviewCommand = 
    | 'generate'
    | 'getConfig'
    | 'updateConfig'
    | 'checkLocalServer'
    | 'vectorizeAll'
    | 'search'
    | 'getAllItems'
    | 'openFile'
    | 'clearStorage'
    | 'getStorageCount';

export interface BaseWebviewMessage {
    command: WebviewCommand;
}

export interface GenerateMessage extends BaseWebviewMessage {
    command: 'generate';
    text: string;
}

export interface UpdateConfigMessage extends BaseWebviewMessage {
    command: 'updateConfig';
    config: Partial<LLMConfig & {
        summarizePrompt: string;
        enableOrigin: boolean;
        enableSummarize: boolean;
        enableVsOrigin: boolean;
        enableVsSummarize: boolean;
    }>;
}

export interface SearchMessage extends BaseWebviewMessage {
    command: 'search';
    query: string;
    limit?: number;
}

export type WebviewMessage = 
    | GenerateMessage
    | UpdateConfigMessage
    | SearchMessage
    | BaseWebviewMessage;

// panel.ts
this._panel.webview.onDidReceiveMessage((message: WebviewMessage) => {
    switch (message.command) {
        case 'generate':
            this._handleGenerate((message as GenerateMessage).text);
            break;
        case 'updateConfig':
            this._handleUpdateConfig((message as UpdateConfigMessage).config);
            break;
        // ...
    }
});
```

---

## 8. Dependency Injection

### До:
```typescript
// embeddingService.ts
constructor(context: vscode.ExtensionContext, llmService: LLMService, fileStatusService: FileStatusService) {
    this._storage = new LanceDbStorage(context); // Прямое создание
}
```

### После:
```typescript
// embeddingService.ts
constructor(
    context: vscode.ExtensionContext,
    llmService: LLMService,
    fileStatusService: FileStatusService,
    storage: VectorStorage // Внедряем зависимость
) {
    this._storage = storage;
    this._fileStatusService.setStorage(storage);
}

// extension.ts
export function activate(context: vscode.ExtensionContext) {
    // Создаем зависимости
    const llmService = new LLMService(context);
    const fileStatusService = new FileStatusService(context);
    const storage = new LanceDbStorage(context);
    await storage.initialize();
    
    const embeddingService = new EmbeddingService(
        context,
        llmService,
        fileStatusService,
        storage // Внедряем
    );
}
```

---

## 9. Валидация конфигурации

### До:
```typescript
// Нет валидации, возможны ошибки в runtime
const config = await this._llmService.getConfig();
if (!config.embedderModel) {
    throw new Error('Модель эмбеддинга не настроена');
}
```

### После:
```typescript
// utils/validators.ts
export class ConfigValidator {
    static validateLLMConfig(config: LLMConfig): void {
        if (!config.provider) {
            throw new Error('Провайдер LLM не указан');
        }

        if (!config.model) {
            throw new Error('Модель LLM не указана');
        }

        if (config.temperature < 0 || config.temperature > 2) {
            throw new Error('Температура должна быть от 0 до 2');
        }

        if (config.maxTokens < 100 || config.maxTokens > 8000) {
            throw new Error('maxTokens должен быть от 100 до 8000');
        }

        if (config.timeout && (config.timeout < 5000 || config.timeout > 300000)) {
            throw new Error('timeout должен быть от 5000 до 300000 мс');
        }

        if (config.provider === 'openai' || config.provider === 'anthropic') {
            if (!config.apiKey || config.apiKey.trim().length === 0) {
                throw new Error('API ключ не указан для облачного провайдера');
            }
        }
    }

    static validateEmbeddingConfig(config: LLMConfig): void {
        if (!config.embedderModel || config.embedderModel.trim().length === 0) {
            throw new Error('Модель эмбеддинга не настроена. Укажите модель в настройках.');
        }
    }
}

// Использование:
const config = await this._llmService.getConfig();
ConfigValidator.validateEmbeddingConfig(config);
```

---

## 10. Улучшение обработки ошибок

### До:
```typescript
// Разные способы обработки ошибок в разных местах
try {
    // код
} catch (error) {
    console.error('Ошибка:', error);
    // или
    throw new Error('Ошибка');
    // или
    console.warn('Ошибка:', error);
}
```

### После:
```typescript
// errors/index.ts
export class EmbeddingError extends Error {
    constructor(message: string, public readonly cause?: Error) {
        super(message);
        this.name = 'EmbeddingError';
    }
}

export class VectorizationError extends Error {
    constructor(
        message: string,
        public readonly filePath?: string,
        public readonly cause?: Error
    ) {
        super(message);
        this.name = 'VectorizationError';
    }
}

export class StorageError extends Error {
    constructor(message: string, public readonly cause?: Error) {
        super(message);
        this.name = 'StorageError';
    }
}

// Использование:
try {
    await this._storage.addEmbedding(item);
} catch (error) {
    Logger.error('Ошибка добавления эмбеддинга', error as Error);
    throw new StorageError(
        `Не удалось добавить эмбеддинг для ${item.path}`,
        error as Error
    );
}
```

---

## Итоговые улучшения

После применения всех рефакторингов:

1. ✅ **Размер файлов**: уменьшен с 1203 до ~300-400 строк на файл
2. ✅ **Дублирование**: снижено с ~20% до <5%
3. ✅ **Производительность**: улучшена за счет асинхронных операций и батчинга
4. ✅ **Тестируемость**: улучшена за счет DI и интерфейсов
5. ✅ **Поддерживаемость**: улучшена за счет четкого разделения ответственности
6. ✅ **Типизация**: улучшена, меньше `any`
7. ✅ **Логирование**: централизовано и настраиваемо
8. ✅ **Обработка ошибок**: стандартизирована

