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
    }

    /**
     * Векторизация всех необработанных файлов и директорий
     * Обработка идет от элементов с максимальной вложенностью к корню дерева
     */
    async vectorizeAllUnprocessed(workspaceFolder?: vscode.WorkspaceFolder): Promise<{ processed: number; errors: number }> {
        if (this._isProcessing) {
            throw new VectorizationError('Векторизация уже выполняется');
        }

        this._isProcessing = true;
        let processed = 0;
        let errors = 0;

        try {
            const folder = workspaceFolder || vscode.workspace.workspaceFolders?.[0];
            if (!folder) {
                throw new VectorizationError('Не открыта рабочая область');
            }

            const rootPath = folder.uri.fsPath;
            
            // Получаем конфигурацию для модели эмбеддинга
            const config = await this._llmService.getConfig();
            ConfigValidator.validateEmbeddingConfig(config);

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
            await this._collectItems(rootPath, null, 0, itemsToProcess);

            // Сортируем по глубине: сначала самые глубокие (максимальная вложенность)
            itemsToProcess.sort((a, b) => b.depth - a.depth);

            // Обрабатываем элементы в порядке от максимальной вложенности к корню
            for (const item of itemsToProcess) {
                try {
                    // Пропускаем корневую директорию
                    if (item.type === 'directory' && item.depth === 0) {
                        continue;
                    }

                    // Находим parentId
                    let parentId: string | null = null;
                    if (item.parentPath) {
                        const parentItems = await this._storage.getByPath(item.parentPath);
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
                } catch (error) {
                    errors++;
                    Logger.error(`Ошибка обработки ${item.type} ${item.path}`, error as Error);
                }
            }

        } finally {
            this._isProcessing = false;
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
            const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const itemPath = path.join(dirPath, entry.name);
                
                if (entry.isFile()) {
                    items.push({
                        path: itemPath,
                        type: 'file',
                        depth: depth,
                        parentPath: parentPath
                    });
                } else if (entry.isDirectory()) {
                    // Пропускаем служебные директории
                    if (entry.name.startsWith('.') || entry.name === 'node_modules') {
                        continue;
                    }
                    
                    // Добавляем директорию в список
                    items.push({
                        path: itemPath,
                        type: 'directory',
                        depth: depth,
                        parentPath: parentPath
                    });
                    
                    // Рекурсивно собираем элементы из поддиректории
                    await this._collectItems(itemPath, itemPath, depth + 1, items);
                }
            }
        } catch (error) {
            Logger.error(`Ошибка сбора элементов из ${dirPath}`, error as Error);
        }
    }

    /**
     * Векторизация конкретного файла
     */
    async vectorizeFile(fileUri: vscode.Uri, kind?: string): Promise<string> {
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

