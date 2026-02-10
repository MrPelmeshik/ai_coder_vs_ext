import * as vscode from 'vscode';
import * as path from 'path';
import { VectorStorage } from '../../storage/interfaces/vectorStorage';
import { LLMService } from '../llmService';
import { FileStatusService, FileStatus } from '../fileStatusService';
import { EmbeddingProviderFactory } from './embeddingProvider';
import { TextSummarizer } from './textSummarizer';
import { FileVectorizer } from './fileVectorizer';
import { DirectoryVectorizer } from './directoryVectorizer';
import { collectItems, CollectedItem } from './itemCollector';
import { isConnectionError, checkEmbeddingServerConnectivity } from './connectivityChecker';
import { loadVectorizationConfig } from './vectorizationConfig';
import { ConfigValidator } from '../../utils/validators';
import { Logger } from '../../utils/logger';
import { VectorizationError } from '../../errors';

/**
 * Сервис для работы с эмбеддингами файлов (координатор)
 */
export class EmbeddingService {
    private _storage: VectorStorage;
    private _llmService: LLMService;
    private _fileStatusService: FileStatusService;
    private _context: vscode.ExtensionContext;
    private _isProcessing: boolean = false;
    private _isInitialized: boolean = false;
    private _initPromise: Promise<void> | null = null; // Кэш промиса инициализации

    private _embeddingProvider: any;
    private _textSummarizer: TextSummarizer;
    private _fileVectorizer!: FileVectorizer;
    private _directoryVectorizer!: DirectoryVectorizer;

    constructor(
        context: vscode.ExtensionContext,
        llmService: LLMService,
        fileStatusService: FileStatusService,
        storage: VectorStorage
    ) {
        this._context = context;
        this._llmService = llmService;
        this._fileStatusService = fileStatusService;
        this._storage = storage;

        // Передаем хранилище в FileStatusService для проверки реального состояния
        this._fileStatusService.setStorage(this._storage);

        // Инициализируем компоненты (провайдер будет создан при первом использовании)
        this._textSummarizer = new TextSummarizer(llmService);
    }

    /**
     * Инициализация сервиса
     */
    async initialize(): Promise<void> {
        if (this._isInitialized) {
            return;
        }

        // Если инициализация уже запущена, ждём её завершения
        if (this._initPromise) {
            return this._initPromise;
        }

        this._initPromise = this._doInitialize();
        try {
            await this._initPromise;
        } catch (error) {
            this._initPromise = null;
            throw error;
        }
    }

    /**
     * Внутренняя логика инициализации
     */
    private async _doInitialize(): Promise<void> {
        await this._storage.initialize();
        this._fileStatusService.setStorage(this._storage);

        // Создаем провайдер эмбеддингов
        const config = await this._llmService.getConfig();
        this._embeddingProvider = EmbeddingProviderFactory.create(config);

        // Инициализируем векторизаторы
        this._fileVectorizer = new FileVectorizer(
            this._embeddingProvider,
            this._textSummarizer,
            this._storage,
            this._fileStatusService,
            this._llmService
        );

        this._directoryVectorizer = new DirectoryVectorizer(
            this._embeddingProvider,
            this._storage,
            this._fileStatusService,
            this._llmService
        );

        this._isInitialized = true;
    }

    /**
     * Проверка инициализации и автоматическая инициализация при необходимости
     */
    private async _ensureInitialized(): Promise<void> {
        Logger.debug(`[EmbeddingService] Проверка инициализации: _isInitialized=${this._isInitialized}, _embeddingProvider=${!!this._embeddingProvider}, _fileVectorizer=${!!this._fileVectorizer}, _directoryVectorizer=${!!this._directoryVectorizer}`);

        if (!this._isInitialized || !this._embeddingProvider || !this._fileVectorizer || !this._directoryVectorizer) {
            try {
                await this.initialize();
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                const errorStack = error instanceof Error ? error.stack : undefined;
                Logger.error(`[EmbeddingService] Ошибка при инициализации: ${errorMessage}`, error as Error);
                if (errorStack) {
                    Logger.error(`[EmbeddingService] Стек ошибки инициализации: ${errorStack}`, error as Error);
                }
                throw error;
            }
        } else {
            Logger.debug('[EmbeddingService] Сервис уже инициализирован');
        }
    }

    /**
     * Векторизация всех необработанных файлов и директорий
     * Обработка идет от элементов с максимальной вложенностью к корню дерева
     */
    async vectorizeAllUnprocessed(workspaceFolder?: vscode.WorkspaceFolder): Promise<{ processed: number; errors: number }> {
        if (this._isProcessing) {
            Logger.warn('[EmbeddingService] Векторизация уже выполняется');
            throw new VectorizationError('Векторизация уже выполняется');
        }

        // Проверяем и инициализируем сервис при необходимости
        try {
            await this._ensureInitialized();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            Logger.error(`[EmbeddingService] Ошибка при инициализации: ${errorMessage}`, error as Error);
            throw error;
        }

        this._isProcessing = true;
        let processed = 0;
        let errors = 0;

        try {
            const folder = workspaceFolder || vscode.workspace.workspaceFolders?.[0];
            if (!folder) {
                Logger.error('[EmbeddingService] Не открыта рабочая область');
                throw new VectorizationError('Не открыта рабочая область');
            }

            const rootPath = folder.uri.fsPath;

            // Получаем конфигурацию для модели эмбеддинга
            const config = await this._llmService.getConfig();

            ConfigValidator.validateEmbeddingConfig(config);

            // Получаем настройки векторизации
            const vectorizationConfig = loadVectorizationConfig(config);

            // Собираем все элементы с их глубиной вложенности
            const itemsToProcess: CollectedItem[] = [];

            // Рекурсивно собираем все файлы и директории
            await collectItems(rootPath, null, 0, itemsToProcess);

            // Сортируем по глубине: сначала самые глубокие (максимальная вложенность)
            itemsToProcess.sort((a, b) => b.depth - a.depth);

            // Проверяем доступность сервера эмбеддингов перед началом обработки
            await checkEmbeddingServerConnectivity(config);

            // Обрабатываем элементы в порядке от максимальной вложенности к корню
            Logger.info(`[EmbeddingService] Начинаем обработку ${itemsToProcess.length} элементов`);

            let consecutiveConnectionErrors = 0;
            const MAX_CONSECUTIVE_CONNECTION_ERRORS = 3;

            for (let i = 0; i < itemsToProcess.length; i++) {
                const item = itemsToProcess[i];
                Logger.info(`[EmbeddingService] [${i + 1}/${itemsToProcess.length}] Обработка ${item.type}: ${item.path} (глубина: ${item.depth})`);

                try {
                    // Пропускаем корневую директорию
                    if (item.type === 'directory' && item.depth === 0) {
                        Logger.info(`[EmbeddingService] Пропуск корневой директории: ${item.path}`);
                        continue;
                    }

                    // Находим parentId
                    let parentId: string | null = null;
                    if (item.parentPath) {
                        const normalizedParentPath = path.normalize(item.parentPath);
                        const parentItems = await this._storage.getByPath(normalizedParentPath);
                        if (parentItems.length > 0) {
                            parentId = parentItems[0].id;
                        }
                    }

                    if (item.type === 'file') {
                        const result = await this._fileVectorizer.vectorizeFile(
                            item.path,
                            parentId,
                            {
                                embedderModel: vectorizationConfig.embedderModel,
                                enableOrigin: vectorizationConfig.enableOrigin,
                                enableSummarize: vectorizationConfig.enableSummarize,
                                summarizePrompt: vectorizationConfig.summarizePrompt
                            }
                        );
                        processed += result.processed;
                        errors += result.errors;
                    } else {
                        const result = await this._directoryVectorizer.vectorizeDirectory(
                            item.path,
                            parentId,
                            {
                                embedderModel: vectorizationConfig.embedderModel,
                                enableOrigin: vectorizationConfig.enableOrigin,
                                enableVsOrigin: vectorizationConfig.enableVsOrigin,
                                enableVsSummarize: vectorizationConfig.enableVsSummarize
                            }
                        );
                        processed += result.processed;
                        errors += result.errors;
                    }
                    // Сброс счётчика последовательных ошибок при успехе
                    consecutiveConnectionErrors = 0;
                } catch (error) {
                    errors++;
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    const errorStack = error instanceof Error ? error.stack : undefined;
                    Logger.error(`Ошибка обработки ${item.type} ${item.path}: ${errorMessage}`, error as Error);
                    if (errorStack) {
                        Logger.error(`Стек ошибки для ${item.path}: ${errorStack}`, error as Error);
                    }

                    // Проверяем, является ли ошибка проблемой подключения
                    if (isConnectionError(error)) {
                        consecutiveConnectionErrors++;
                        if (consecutiveConnectionErrors >= MAX_CONSECUTIVE_CONNECTION_ERRORS) {
                            Logger.error(`[EmbeddingService] Сервер эмбеддингов недоступен после ${MAX_CONSECUTIVE_CONNECTION_ERRORS} последовательных ошибок подключения. Прерываем обработку.`);
                            errors += (itemsToProcess.length - i - 1); // Считаем оставшиеся как ошибки
                            break;
                        }
                    } else {
                        consecutiveConnectionErrors = 0;
                    }
                }
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            Logger.error(`[EmbeddingService] Критическая ошибка при векторизации: ${errorMessage}`, error as Error);
            if (errorStack) {
                Logger.error(`[EmbeddingService] Стек ошибки: ${errorStack}`, error as Error);
            }
            throw error;
        } finally {
            this._isProcessing = false;
        }

        return { processed, errors };
    }

    /**
     * Векторизация конкретного файла
     */
    async vectorizeFile(fileUri: vscode.Uri, kind?: string): Promise<string> {
        // Проверяем и инициализируем сервис при необходимости
        await this._ensureInitialized();

        const filePath = fileUri.fsPath;
        const currentStatus = await this._fileStatusService.getFileStatus(fileUri);

        if (currentStatus === FileStatus.EXCLUDED) {
            throw new VectorizationError(`Файл ${filePath} исключен из обработки`);
        }

        const config = await this._llmService.getConfig();
        ConfigValidator.validateEmbeddingConfig(config);

        const vectorizationConfig = loadVectorizationConfig(config);

        // Удаляем старые записи из БД перед обработкой
        const existingItems = await this._storage.getByPath(filePath);
        for (const item of existingItems) {
            if (!kind || item.kind === kind) {
                await this._storage.deleteEmbedding(item.id);
            }
        }

        const result = await this._fileVectorizer.vectorizeFile(
            filePath,
            null,
            vectorizationConfig
        );

        // Возвращаем ID последней созданной записи
        const items = await this._storage.getByPath(filePath);
        return items.length > 0 ? items[items.length - 1].id : '';
    }

    /**
     * Поиск похожих файлов по запросу
     */
    async searchSimilar(query: string, limit: number = 5): Promise<any[]> {
        // Проверяем и инициализируем сервис при необходимости
        await this._ensureInitialized();

        const config = await this._llmService.getConfig();
        ConfigValidator.validateEmbeddingConfig(config);

        // Получаем эмбеддинг запроса
        const queryVector = await this._embeddingProvider.getEmbedding(query, config);

        // Ищем похожие
        const results = await this._storage.searchSimilar(queryVector, limit);

        return results.map(r => ({
            path: r.item.path,
            type: r.item.type,
            similarity: r.similarity,
            kind: r.item.kind,
            raw: r.item.raw
        }));
    }

    /**
     * Получение всех записей из хранилища
     */
    async getAllItems(limit?: number): Promise<any[]> {
        const items = await this._storage.getAllItems(limit);

        return items.map(item => ({
            path: item.path,
            type: item.type,
            similarity: 1.0,
            kind: item.kind,
            raw: item.raw
        }));
    }

    /**
     * Получение хранилища (для доступа к низкоуровневым операциям)
     */
    getStorage(): VectorStorage {
        return this._storage;
    }

    /**
     * Получение количества записей в хранилище
     */
    async getStorageCount(): Promise<number> {
        return await this._storage.getCount();
    }

    /**
     * Получение размера хранилища в байтах
     */
    async getStorageSize(): Promise<number> {
        return await this._storage.getStorageSize();
    }

    /**
     * Очистка всех данных из хранилища
     */
    async clearStorage(): Promise<void> {
        await this._storage.clear();
        this._fileStatusService.notifyAllStatusesChanged();
    }

    /**
     * Очистка ресурсов
     */
    async dispose(): Promise<void> {
        await this._storage.dispose();
    }
}

