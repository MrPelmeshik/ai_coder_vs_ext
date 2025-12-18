import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { VectorStorage } from '../../storage/interfaces/vectorStorage';
import { LLMService } from '../llmService';
import { FileStatusService, FileStatus } from '../fileStatusService';
import { EmbeddingProviderFactory } from './embeddingProvider';
import { TextSummarizer } from './textSummarizer';
import { FileVectorizer } from './fileVectorizer';
import { DirectoryVectorizer } from './directoryVectorizer';
import { ConfigValidator } from '../../utils/validators';
import { Logger } from '../../utils/logger';
import { VectorizationError, ConfigError } from '../../errors';
import { CONFIG_KEYS } from '../../constants';

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
            Logger.info('[EmbeddingService] Сервис не инициализирован, выполняется инициализация...');
            try {
                await this.initialize();
                Logger.info('[EmbeddingService] Инициализация завершена успешно');
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
        Logger.info('[EmbeddingService] Проверка инициализации сервиса...');
        try {
            await this._ensureInitialized();
            Logger.info('[EmbeddingService] Сервис инициализирован');
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
            Logger.info(`[EmbeddingService] Корневой путь: ${rootPath}`);
            
            // Получаем конфигурацию для модели эмбеддинга
            Logger.info('[EmbeddingService] Получение конфигурации LLM...');
            const config = await this._llmService.getConfig();
            Logger.info(`[EmbeddingService] Конфигурация получена: provider=${config.provider}, embedderModel=${config.embedderModel}`);
            
            Logger.info('[EmbeddingService] Валидация конфигурации эмбеддинга...');
            ConfigValidator.validateEmbeddingConfig(config);
            Logger.info('[EmbeddingService] Конфигурация валидна');

            // Получаем настройки векторизации
            const vscodeConfig = vscode.workspace.getConfiguration('aiCoder');
            const enableOrigin = vscodeConfig.get<boolean>(CONFIG_KEYS.VECTORIZATION.ENABLE_ORIGIN);
            if (enableOrigin === undefined) {
                throw new ConfigError('vectorization.enableOrigin не задан в настройках');
            }
            const enableSummarize = vscodeConfig.get<boolean>(CONFIG_KEYS.VECTORIZATION.ENABLE_SUMMARIZE);
            if (enableSummarize === undefined) {
                throw new ConfigError('vectorization.enableSummarize не задан в настройках');
            }
            const enableVsOrigin = vscodeConfig.get<boolean>(CONFIG_KEYS.VECTORIZATION.ENABLE_VS_ORIGIN);
            if (enableVsOrigin === undefined) {
                throw new ConfigError('vectorization.enableVsOrigin не задан в настройках');
            }
            const enableVsSummarize = vscodeConfig.get<boolean>(CONFIG_KEYS.VECTORIZATION.ENABLE_VS_SUMMARIZE);
            if (enableVsSummarize === undefined) {
                throw new ConfigError('vectorization.enableVsSummarize не задан в настройках');
            }
            const summarizePrompt = vscodeConfig.get<string>(CONFIG_KEYS.VECTORIZATION.SUMMARIZE_PROMPT);
            if (!summarizePrompt) {
                throw new ConfigError('vectorization.summarizePrompt не указан в настройках');
            }
            const vectorizationConfig = {
                embedderModel: config.embedderModel!,
                enableOrigin,
                enableSummarize,
                enableVsOrigin,
                enableVsSummarize,
                summarizePrompt
            };
            
            Logger.info(`[EmbeddingService] Конфигурация векторизации: enableOrigin=${vectorizationConfig.enableOrigin}, enableSummarize=${vectorizationConfig.enableSummarize}, enableVsOrigin=${vectorizationConfig.enableVsOrigin}, enableVsSummarize=${vectorizationConfig.enableVsSummarize}`);

            // Собираем все элементы с их глубиной вложенности
            const itemsToProcess: Array<{
                path: string;
                type: 'file' | 'directory';
                depth: number;
                parentPath: string | null;
            }> = [];

            // Рекурсивно собираем все файлы и директории
            Logger.info('[EmbeddingService] Сбор файлов и директорий...');
            await this._collectItems(rootPath, null, 0, itemsToProcess);
            Logger.info(`[EmbeddingService] Собрано элементов для обработки: ${itemsToProcess.length}`);

            // Сортируем по глубине: сначала самые глубокие (максимальная вложенность)
            itemsToProcess.sort((a, b) => b.depth - a.depth);
            Logger.info('[EmbeddingService] Начало обработки элементов...');

            // Обрабатываем элементы в порядке от максимальной вложенности к корню
            Logger.info(`[EmbeddingService] Начинаем обработку ${itemsToProcess.length} элементов`);
            
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
                        Logger.info(`[EmbeddingService] Вызов vectorizeFile для: ${item.path}`);
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
                        Logger.info(`[EmbeddingService] Результат vectorizeFile для ${item.path}: processed=${result.processed}, errors=${result.errors}`);
                        processed += result.processed;
                        errors += result.errors;
                    } else {
                        Logger.info(`[EmbeddingService] Вызов vectorizeDirectory для: ${item.path}`);
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
                        Logger.info(`[EmbeddingService] Результат vectorizeDirectory для ${item.path}: processed=${result.processed}, errors=${result.errors}`);
                        processed += result.processed;
                        errors += result.errors;
                    }
                } catch (error) {
                    errors++;
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    const errorStack = error instanceof Error ? error.stack : undefined;
                    Logger.error(`Ошибка обработки ${item.type} ${item.path}: ${errorMessage}`, error as Error);
                    if (errorStack) {
                        Logger.error(`Стек ошибки для ${item.path}: ${errorStack}`, error as Error);
                    }
                }
            }

            Logger.info(`[EmbeddingService] Векторизация завершена. Обработано: ${processed}, Ошибок: ${errors}`);

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
            Logger.info('[EmbeddingService] Флаг обработки сброшен');
        }

        return { processed, errors };
    }

    /**
     * Рекурсивный сбор всех файлов и директорий с их глубиной вложенности
     */
    private async _collectItems(
        dirPath: string,
        parentPath: string | null,
        depth: number,
        items: Array<{ path: string; type: 'file' | 'directory'; depth: number; parentPath: string | null }>
    ): Promise<void> {
        try {
            Logger.debug(`[EmbeddingService] Сбор элементов из директории: ${dirPath} (глубина: ${depth})`);
            const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
            Logger.debug(`[EmbeddingService] Найдено записей в ${dirPath}: ${entries.length}`);
            
            for (const entry of entries) {
                const itemPath = path.normalize(path.join(dirPath, entry.name));
                
                if (entry.isFile()) {
                    items.push({
                        path: itemPath,
                        type: 'file',
                        depth: depth,
                        parentPath: parentPath ? path.normalize(parentPath) : null
                    });
                    Logger.debug(`[EmbeddingService] Добавлен файл: ${itemPath}`);
                } else if (entry.isDirectory()) {
                    // Пропускаем служебные директории
                    if (entry.name.startsWith('.') || entry.name === 'node_modules') {
                        Logger.debug(`[EmbeddingService] Пропущена служебная директория: ${itemPath}`);
                        continue;
                    }
                    
                    // Добавляем директорию в список
                    items.push({
                        path: itemPath,
                        type: 'directory',
                        depth: depth,
                        parentPath: parentPath ? path.normalize(parentPath) : null
                    });
                    Logger.debug(`[EmbeddingService] Добавлена директория: ${itemPath}`);
                    
                    // Рекурсивно собираем элементы из поддиректории
                    await this._collectItems(itemPath, itemPath, depth + 1, items);
                }
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            Logger.error(`[EmbeddingService] Ошибка сбора элементов из ${dirPath}: ${errorMessage}`, error as Error);
        }
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
        
        const vscodeConfig = vscode.workspace.getConfiguration('aiCoder');
        const enableOrigin = vscodeConfig.get<boolean>(CONFIG_KEYS.VECTORIZATION.ENABLE_ORIGIN);
        if (enableOrigin === undefined) {
            throw new ConfigError('vectorization.enableOrigin не задан в настройках');
        }
        const enableSummarize = vscodeConfig.get<boolean>(CONFIG_KEYS.VECTORIZATION.ENABLE_SUMMARIZE);
        if (enableSummarize === undefined) {
            throw new ConfigError('vectorization.enableSummarize не задан в настройках');
        }
        const summarizePrompt = vscodeConfig.get<string>(CONFIG_KEYS.VECTORIZATION.SUMMARIZE_PROMPT);
        if (!summarizePrompt) {
            throw new ConfigError('vectorization.summarizePrompt не указан в настройках');
        }
        const vectorizationConfig = {
            embedderModel: config.embedderModel!,
            enableOrigin,
            enableSummarize,
            summarizePrompt
        };

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

