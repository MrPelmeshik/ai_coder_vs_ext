import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { VectorStorage, EmbeddingItem, EmbeddingType, EmbeddingKind } from '../storage/interfaces/vectorStorage';
import { LanceDbStorage } from '../storage/implementations/lanceDbStorage';
import { LLMService } from './llmService';
import { FileStatusService, FileStatus } from './fileStatusService';

/**
 * Сервис для работы с эмбеддингами файлов
 */
export class EmbeddingService {
    private _storage: VectorStorage;
    private _llmService: LLMService;
    private _fileStatusService: FileStatusService;
    private _context: vscode.ExtensionContext;
    private _isProcessing: boolean = false;

    constructor(context: vscode.ExtensionContext, llmService: LLMService, fileStatusService: FileStatusService) {
        this._context = context;
        this._llmService = llmService;
        this._fileStatusService = fileStatusService;
        
        // Инициализация хранилища (можно легко заменить на другую реализацию)
        this._storage = new LanceDbStorage(context);
        
        // Передаем хранилище в FileStatusService для проверки реального состояния
        this._fileStatusService.setStorage(this._storage);
    }

    /**
     * Инициализация сервиса
     */
    async initialize(): Promise<void> {
        await this._storage.initialize();
        // Убеждаемся, что FileStatusService имеет доступ к хранилищу
        this._fileStatusService.setStorage(this._storage);
    }

    /**
     * Векторизация всех необработанных файлов и директорий
     * Обработка идет от элементов с максимальной вложенностью к корню дерева
     */
    async vectorizeAllUnprocessed(workspaceFolder?: vscode.WorkspaceFolder): Promise<{ processed: number; errors: number }> {
        if (this._isProcessing) {
            throw new Error('Векторизация уже выполняется');
        }

        this._isProcessing = true;
        let processed = 0;
        let errors = 0;

        try {
            const folder = workspaceFolder || vscode.workspace.workspaceFolders?.[0];
            if (!folder) {
                throw new Error('Не открыта рабочая область');
            }

            const rootPath = folder.uri.fsPath;
            
            // Получаем конфигурацию для модели эмбеддинга
            const config = await this._llmService.getConfig();
            if (!config.embedderModel) {
                throw new Error('Модель эмбеддинга не настроена. Укажите модель в настройках.');
            }

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
                    // Пропускаем корневую директорию (depth === 0 и type === 'directory')
                    if (item.type === 'directory' && item.depth === 0) {
                        continue;
                    }

                    if (item.type === 'file') {
                        await this._processFileItem(item.path, item.parentPath, config.embedderModel, folder, (processedCount: number, errorCount: number) => {
                            processed += processedCount;
                            errors += errorCount;
                        });
                    } else {
                        await this._processDirectoryItem(item.path, item.parentPath, config.embedderModel, folder, (processedCount: number, errorCount: number) => {
                            processed += processedCount;
                            errors += errorCount;
                        });
                    }
                } catch (error) {
                    errors++;
                    console.error(`Ошибка обработки ${item.type} ${item.path}:`, error);
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
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            
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
            console.error(`Ошибка сбора элементов из ${dirPath}:`, error);
        }
    }

    /**
     * Обработка отдельного файла
     * Создает два вектора: по оригинальному тексту и по суммаризации
     */
    private async _processFileItem(
        filePath: string,
        parentPath: string | null,
        embedderModel: string,
        workspaceFolder: vscode.WorkspaceFolder,
        onProgress: (processed: number, errors: number) => void
    ): Promise<void> {
        const fileUri = vscode.Uri.file(filePath);
        const currentStatus = await this._fileStatusService.getFileStatus(fileUri);
        
        // Пропускаем исключенные файлы
        if (currentStatus === FileStatus.EXCLUDED) {
            return;
        }

        // Получаем настройки включения/отключения типов векторов
        const config = vscode.workspace.getConfiguration('aiCoder');
        const enableOrigin = config.get<boolean>('vectorization.enableOrigin', true);
        const enableSummarize = config.get<boolean>('vectorization.enableSummarize', true);

        // Проверяем, какие векторы уже существуют
        const hasOrigin = await this._storage.exists(filePath, 'origin');
        const hasSummarize = await this._storage.exists(filePath, 'summarize');
        
        // Определяем, какие векторы нужно создать
        const needsOrigin = enableOrigin && !hasOrigin;
        const needsSummarize = enableSummarize && !hasSummarize;
        
        // Если все необходимые векторы уже созданы и не нужно удалять отключенные, пропускаем
        if (!needsOrigin && !needsSummarize) {
            // Проверяем, нужно ли удалить векторы, для которых флаги выключены
            const existingItems = await this._storage.getByPath(filePath);
            let hasItemsToDelete = false;
            for (const item of existingItems) {
                if ((!enableOrigin && item.kind === 'origin') ||
                    (!enableSummarize && item.kind === 'summarize')) {
                    hasItemsToDelete = true;
                    break;
                }
            }
            if (!hasItemsToDelete) {
                return;
            }
        }

        // Находим parentId по parentPath
        let parentId: string | null = null;
        if (parentPath) {
            const parentItems = await this._storage.getByPath(parentPath);
            if (parentItems.length > 0) {
                parentId = parentItems[0].id;
            }
        }

        // Удаляем векторы, которые нужно пересоздать или которые отключены
        const existingItems = await this._storage.getByPath(filePath);
        for (const item of existingItems) {
            // Удаляем, если нужно пересоздать (флаг включен, но вектора нет или нужно обновить)
            // ИЛИ если флаг выключен, но вектор существует
            if ((needsOrigin && item.kind === 'origin') ||
                (needsSummarize && item.kind === 'summarize') ||
                (!enableOrigin && item.kind === 'origin') ||
                (!enableSummarize && item.kind === 'summarize')) {
                await this._storage.deleteEmbedding(item.id);
            }
        }

        // Помечаем файл как обрабатывается (временно)
        this._fileStatusService.setFileStatus(fileUri, FileStatus.PROCESSING);

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            let processedCount = 0;

            // 1. Создаем вектор по оригинальному тексту (если enableOrigin включен)
            if (needsOrigin) {
                const originVector = await this._getEmbedding(content);
                
                const originItem: EmbeddingItem = {
                    id: this._generateGuid(),
                    type: 'file',
                    parent: parentId,
                    childs: [],
                    path: filePath,
                    kind: 'origin',
                    raw: content,
                    vector: originVector
                };

                await this._storage.addEmbedding(originItem);
                processedCount++;
            }

            // 2. Создаем вектор по суммаризации текста (если enableSummarize включен)
            if (needsSummarize) {
                const summary = await this._summarizeText(content);
                const summarizeVector = await this._getEmbedding(summary);
                
                const summarizeItem: EmbeddingItem = {
                    id: this._generateGuid(),
                    type: 'file',
                    parent: parentId,
                    childs: [],
                    path: filePath,
                    kind: 'summarize',
                    raw: summary,
                    vector: summarizeVector
                };

                await this._storage.addEmbedding(summarizeItem);
                processedCount++;
            }
            
            // Убираем статус PROCESSING
            this._fileStatusService.clearProcessingStatus(fileUri);
            onProgress(processedCount, 0);
        } catch (error) {
            this._fileStatusService.clearProcessingStatus(fileUri);
            throw error;
        }
    }

    /**
     * Суммаризация текста через LLM
     */
    private async _summarizeText(text: string): Promise<string> {
        // Ограничиваем длину текста для суммаризации (чтобы не превышать лимиты токенов)
        const maxLength = 10000; // Примерно 2500-3000 токенов
        const textToSummarize = text.length > maxLength 
            ? text.substring(0, maxLength) + '\n\n[...текст обрезан для суммаризации...]'
            : text;

        // Получаем промпт для суммаризации из настроек
        const config = vscode.workspace.getConfiguration('aiCoder');
        const summarizePromptTemplate = config.get<string>('vectorization.summarizePrompt', '');

        const prompt = `${summarizePromptTemplate}\n\n${textToSummarize}`;

        try {
            const summary = await this._llmService.generateCode(prompt);
            return summary.trim();
        } catch (error) {
            // Если суммаризация не удалась, используем оригинальный текст
            console.warn(`Не удалось создать суммаризацию, используется оригинальный текст:`, error);
            return textToSummarize;
        }
    }

    /**
     * Суммирование векторов
     */
    private _sumVectors(vectors: number[][]): number[] {
        if (vectors.length === 0) {
            return [];
        }

        const dimension = vectors[0].length;
        const sum = new Array(dimension).fill(0);

        for (const vector of vectors) {
            if (vector.length !== dimension) {
                console.warn(`Размерность вектора не совпадает: ожидается ${dimension}, получено ${vector.length}`);
                continue;
            }
            for (let i = 0; i < dimension; i++) {
                sum[i] += vector[i];
            }
        }

        return sum;
    }

    /**
     * Получение всех вложенных элементов директории (рекурсивно)
     */
    private async _getNestedItems(dirPath: string): Promise<EmbeddingItem[]> {
        const nestedItems: EmbeddingItem[] = [];
        const normalizedDirPath = path.normalize(dirPath);

        try {
            // Рекурсивно обходим все файлы и директории
            const walkDir = async (currentPath: string) => {
                try {
                    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
                    
                    for (const entry of entries) {
                        const fullPath = path.join(currentPath, entry.name);
                        const normalizedFullPath = path.normalize(fullPath);
                        
                        // Пропускаем служебные директории
                        if (entry.isDirectory() && (entry.name.startsWith('.') || entry.name === 'node_modules')) {
                            continue;
                        }

                        // Исключаем саму директорию (на случай, если она попала в обход)
                        if (normalizedFullPath === normalizedDirPath) {
                            continue;
                        }

                        // Получаем все векторы для этого элемента из БД
                        const items = await this._storage.getByPath(fullPath);
                        if (items.length > 0) {
                            nestedItems.push(...items);
                        }

                        // Рекурсивно обходим поддиректории
                        if (entry.isDirectory()) {
                            await walkDir(fullPath);
                        }
                    }
                } catch (error) {
                    console.warn(`Ошибка при обходе директории ${currentPath}:`, error);
                }
            };

            await walkDir(dirPath);
        } catch (error) {
            console.warn(`Ошибка при получении вложенных элементов для ${dirPath}:`, error);
        }

        return nestedItems;
    }

    /**
     * Обработка отдельной директории
     */
    private async _processDirectoryItem(
        dirPath: string,
        parentPath: string | null,
        embedderModel: string,
        workspaceFolder: vscode.WorkspaceFolder,
        onProgress: (processed: number, errors: number) => void
    ): Promise<void> {
        const dirUri = vscode.Uri.file(dirPath);
        const currentStatus = await this._fileStatusService.getFileStatus(dirUri);
        
        // Пропускаем исключенные директории
        if (currentStatus === FileStatus.EXCLUDED) {
            return;
        }

        // Находим parentId по parentPath
        let parentId: string | null = null;
        if (parentPath) {
            const parentItems = await this._storage.getByPath(parentPath);
            if (parentItems.length > 0) {
                parentId = parentItems[0].id;
            }
        }

        // Получаем настройки включения/отключения типов векторов
        const config = vscode.workspace.getConfiguration('aiCoder');
        const enableOrigin = config.get<boolean>('vectorization.enableOrigin', true);
        const enableSummarize = config.get<boolean>('vectorization.enableSummarize', true);
        const enableVsOrigin = config.get<boolean>('vectorization.enableVsOrigin', true);
        const enableVsSummarize = config.get<boolean>('vectorization.enableVsSummarize', true);

        // Проверяем, какие векторы уже существуют
        const hasOrigin = await this._storage.exists(dirPath, 'origin');
        const hasVsOrigin = await this._storage.exists(dirPath, 'vs_origin');
        const hasVsSummarize = await this._storage.exists(dirPath, 'vs_summarize');

        // Определяем, какие векторы нужно создать
        const needsOrigin = enableOrigin && !hasOrigin;
        const needsVsOrigin = enableVsOrigin && !hasVsOrigin;
        const needsVsSummarize = enableVsSummarize && !hasVsSummarize;

        // Если все необходимые векторы уже созданы и не нужно удалять отключенные, пропускаем
        if (!needsOrigin && !needsVsOrigin && !needsVsSummarize) {
            // Проверяем, нужно ли удалить векторы, для которых флаги выключены
            const existingItems = await this._storage.getByPath(dirPath);
            let hasItemsToDelete = false;
            for (const item of existingItems) {
                if ((!enableOrigin && item.kind === 'origin') ||
                    (!enableVsOrigin && item.kind === 'vs_origin') ||
                    (!enableVsSummarize && item.kind === 'vs_summarize')) {
                    hasItemsToDelete = true;
                    break;
                }
            }
            if (!hasItemsToDelete) {
                return;
            }
        }

        // Удаляем векторы, которые нужно пересоздать или которые отключены
        const existingItems = await this._storage.getByPath(dirPath);
        for (const item of existingItems) {
            // Удаляем, если нужно пересоздать (флаг включен, но вектора нет)
            // ИЛИ если флаг выключен, но вектор существует
            if ((needsOrigin && item.kind === 'origin') ||
                (needsVsOrigin && item.kind === 'vs_origin') ||
                (needsVsSummarize && item.kind === 'vs_summarize') ||
                (!enableOrigin && item.kind === 'origin') ||
                (!enableVsOrigin && item.kind === 'vs_origin') ||
                (!enableVsSummarize && item.kind === 'vs_summarize')) {
                await this._storage.deleteEmbedding(item.id);
            }
        }

        // Помечаем директорию как обрабатывается (временно)
        this._fileStatusService.setFileStatus(dirUri, FileStatus.PROCESSING);

        try {
            let processedCount = 0;

            // 1. Создаем запись для директории (origin)
            if (needsOrigin) {
                const files = fs.readdirSync(dirPath, { withFileTypes: true });
                const fileNames = files.filter(f => f.isFile()).map(f => f.name);
                const description = `Директория содержит ${fileNames.length} файлов: ${fileNames.join(', ')}`;
                
                const vector = await this._getEmbedding(description);
                
                const dirItem: EmbeddingItem = {
                    id: this._generateGuid(),
                    type: 'directory',
                    parent: parentId,
                    childs: [],
                    path: dirPath,
                    kind: 'origin',
                    raw: { description, files: fileNames },
                    vector: vector
                };

                await this._storage.addEmbedding(dirItem);
                processedCount++;
            }

            // 2. Создаем вектор vs_origin (сумма всех origin векторов вложений: файлов и директорий)
            if (needsVsOrigin) {
                // Получаем все вложенные элементы
                const nestedItems = await this._getNestedItems(dirPath);
                
                // Фильтруем векторы: origin для файлов и vs_origin для директорий (исключаем саму директорию)
                const normalizedDirPath = path.normalize(dirPath);
                const filteredItems = nestedItems.filter(item => {
                    const normalizedItemPath = path.normalize(item.path);
                    
                    // Исключаем саму директорию
                    if (normalizedItemPath === normalizedDirPath) {
                        return false;
                    }
                    
                    // Проверяем, что элемент действительно вложен в эту директорию
                    if (!normalizedItemPath.startsWith(normalizedDirPath + path.sep)) {
                        return false;
                    }
                    
                    // Для файлов берем origin, для директорий берем vs_origin
                    if (item.type === 'file') {
                        return item.kind === 'origin';
                    } else if (item.type === 'directory') {
                        return item.kind === 'vs_origin';
                    }
                    return false;
                });

                // Извлекаем векторы
                const vectors = filteredItems.map((item: EmbeddingItem) => {
                    const vector = item.vector;
                    if (!vector || !Array.isArray(vector) || vector.length === 0) {
                        return null;
                    }
                    return vector;
                });

                const originVectors = vectors.filter((v: number[] | null): v is number[] => v !== null && v.length > 0);

                if (originVectors.length > 0) {
                    // Суммируем векторы
                    const sumVector = this._sumVectors(originVectors);
                    
                    const vsOriginItem: EmbeddingItem = {
                        id: this._generateGuid(),
                        type: 'directory',
                        parent: parentId,
                        childs: [],
                        path: dirPath,
                        kind: 'vs_origin',
                        raw: { 
                            description: `Сумма ${originVectors.length} векторов: origin файлов и vs_origin директорий`,
                            count: originVectors.length
                        },
                        vector: sumVector
                    };

                    await this._storage.addEmbedding(vsOriginItem);
                    processedCount++;
                } else if (nestedItems.length > 0) {
                    console.warn(`[vs_origin] Нет вложенных элементов с векторами origin/vs_origin для директории ${dirPath}`);
                }
            }

            // 3. Создаем вектор vs_summarize (сумма всех summarize векторов вложений: файлов и директорий)
            if (needsVsSummarize) {
                // Получаем все вложенные элементы
                const nestedItems = await this._getNestedItems(dirPath);
                
                // Фильтруем векторы: summarize для файлов и vs_summarize для директорий (исключаем саму директорию)
                const normalizedDirPath2 = path.normalize(dirPath);
                const filteredItems2 = nestedItems.filter(item => {
                    const normalizedItemPath = path.normalize(item.path);
                    
                    // Исключаем саму директорию
                    if (normalizedItemPath === normalizedDirPath2) {
                        return false;
                    }
                    
                    // Проверяем, что элемент действительно вложен в эту директорию
                    if (!normalizedItemPath.startsWith(normalizedDirPath2 + path.sep)) {
                        return false;
                    }
                    
                    // Для файлов берем summarize, для директорий берем vs_summarize
                    if (item.type === 'file') {
                        return item.kind === 'summarize';
                    } else if (item.type === 'directory') {
                        return item.kind === 'vs_summarize';
                    }
                    return false;
                });

                // Извлекаем векторы
                const vectors2 = filteredItems2.map((item: EmbeddingItem) => {
                    const vector = item.vector;
                    if (!vector || !Array.isArray(vector) || vector.length === 0) {
                        return null;
                    }
                    return vector;
                });

                const summarizeVectors = vectors2.filter((v: number[] | null): v is number[] => v !== null && v.length > 0);

                if (summarizeVectors.length > 0) {
                    // Суммируем векторы
                    const sumVector = this._sumVectors(summarizeVectors);
                    
                    const vsSummarizeItem: EmbeddingItem = {
                        id: this._generateGuid(),
                        type: 'directory',
                        parent: parentId,
                        childs: [],
                        path: dirPath,
                        kind: 'vs_summarize',
                        raw: { 
                            description: `Сумма ${summarizeVectors.length} векторов: summarize файлов и vs_summarize директорий`,
                            count: summarizeVectors.length
                        },
                        vector: sumVector
                    };

                    await this._storage.addEmbedding(vsSummarizeItem);
                    processedCount++;
                } else if (nestedItems.length > 0) {
                    console.warn(`[vs_summarize] Нет вложенных элементов с векторами summarize/vs_summarize для директории ${dirPath}`);
                }
            }
            
            // Убираем статус PROCESSING
            this._fileStatusService.clearProcessingStatus(dirUri);
            onProgress(processedCount, 0);
        } catch (error) {
            this._fileStatusService.clearProcessingStatus(dirUri);
            throw error;
        }
    }

    /**
     * Векторизация конкретного файла
     * Создает оба вектора (origin и summarize), если kind не указан
     */
    async vectorizeFile(fileUri: vscode.Uri, kind?: EmbeddingKind): Promise<string> {
        const filePath = fileUri.fsPath;
        const currentStatus = await this._fileStatusService.getFileStatus(fileUri);
        
        // Пропускаем исключенные файлы
        if (currentStatus === FileStatus.EXCLUDED) {
            throw new Error(`Файл ${filePath} исключен из обработки`);
        }

        // Если kind не указан, создаем оба вектора
        if (!kind) {
            const content = fs.readFileSync(filePath, 'utf-8');
            
            // Проверяем, какие векторы уже существуют
            const hasOrigin = await this._storage.exists(filePath, 'origin');
            const hasSummarize = await this._storage.exists(filePath, 'summarize');
            
            // Удаляем старые записи из БД перед обработкой
            const existingItems = await this._storage.getByPath(filePath);
            for (const item of existingItems) {
                await this._storage.deleteEmbedding(item.id);
            }

            // Помечаем файл как обрабатывается (временно)
            this._fileStatusService.setFileStatus(fileUri, FileStatus.PROCESSING);

            try {
                let lastItemId: string | null = null;

                // Получаем настройки включения/отключения типов векторов
                const vscodeConfig = vscode.workspace.getConfiguration('aiCoder');
                const enableOrigin = vscodeConfig.get<boolean>('vectorization.enableOrigin', true);
                const enableSummarize = vscodeConfig.get<boolean>('vectorization.enableSummarize', true);

                // Создаем вектор по оригинальному тексту
                if (enableOrigin && !hasOrigin) {
                    const originVector = await this._getEmbedding(content);
                    
                    const originItem: EmbeddingItem = {
                        id: this._generateGuid(),
                        type: 'file',
                        parent: null,
                        childs: [],
                        path: filePath,
                        kind: 'origin',
                        raw: content,
                        vector: originVector
                    };

                    lastItemId = await this._storage.addEmbedding(originItem);
                }

                // Создаем вектор по суммаризации
                if (enableSummarize && !hasSummarize) {
                    const summary = await this._summarizeText(content);
                    const summarizeVector = await this._getEmbedding(summary);
                    
                    const summarizeItem: EmbeddingItem = {
                        id: this._generateGuid(),
                        type: 'file',
                        parent: null,
                        childs: [],
                        path: filePath,
                        kind: 'summarize',
                        raw: summary,
                        vector: summarizeVector
                    };

                    lastItemId = await this._storage.addEmbedding(summarizeItem);
                }

                // vs_origin и vs_summarize актуальны только для директорий, не для файлов

                // Убираем статус PROCESSING
                this._fileStatusService.clearProcessingStatus(fileUri);
                return lastItemId || '';
            } catch (error) {
                this._fileStatusService.clearProcessingStatus(fileUri);
                throw error;
            }
        } else {
            // Если kind указан, создаем только один вектор указанного типа
            if (await this._storage.exists(filePath, kind)) {
                throw new Error(`Файл ${filePath} уже обработан (kind: ${kind})`);
            }

            // Удаляем старые записи указанного kind из БД перед обработкой
            const existingItems = await this._storage.getByPath(filePath);
            for (const item of existingItems) {
                if (item.kind === kind) {
                    await this._storage.deleteEmbedding(item.id);
                }
            }

            // Помечаем файл как обрабатывается (временно)
            this._fileStatusService.setFileStatus(fileUri, FileStatus.PROCESSING);

            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                let textToEmbed = content;
                
                // Если нужна суммаризация, создаем её
                if (kind === 'summarize') {
                    textToEmbed = await this._summarizeText(content);
                }
                
                const vector = await this._getEmbedding(textToEmbed);
                
                const item: EmbeddingItem = {
                    id: this._generateGuid(),
                    type: 'file',
                    parent: null,
                    childs: [],
                    path: filePath,
                    kind: kind,
                    raw: textToEmbed,
                    vector: vector
                };

                const itemId = await this._storage.addEmbedding(item);
                
                // Убираем статус PROCESSING
                this._fileStatusService.clearProcessingStatus(fileUri);
                return itemId;
            } catch (error) {
                this._fileStatusService.clearProcessingStatus(fileUri);
                throw error;
            }
        }
    }

    /**
     * Векторизация директории
     */
    async vectorizeDirectory(dirUri: vscode.Uri, kind: EmbeddingKind = 'origin'): Promise<string> {
        const dirPath = dirUri.fsPath;
        const currentStatus = await this._fileStatusService.getFileStatus(dirUri);
        
        // Пропускаем исключенные директории
        if (currentStatus === FileStatus.EXCLUDED) {
            throw new Error(`Директория ${dirPath} исключена из обработки`);
        }

        // Проверяем, не обработана ли уже директория
        if (await this._storage.exists(dirPath, kind)) {
            // Директория уже обработана и есть в БД
            throw new Error(`Директория ${dirPath} уже обработана (kind: ${kind})`);
        }

        // Удаляем старые записи из БД перед обработкой
        const existingItems = await this._storage.getByPath(dirPath);
        for (const item of existingItems) {
            await this._storage.deleteEmbedding(item.id);
        }

        // Помечаем директорию как обрабатывается (временно)
        this._fileStatusService.setFileStatus(dirUri, FileStatus.PROCESSING);

        try {
            // Получаем список файлов в директории
            const files = fs.readdirSync(dirPath, { withFileTypes: true });
            const fileNames = files.filter(f => f.isFile()).map(f => f.name);
            
            // Создаем описание директории
            const description = `Директория содержит ${fileNames.length} файлов: ${fileNames.join(', ')}`;
            
            // Получаем эмбеддинг
            const vector = await this._getEmbedding(description);
            
            // Создаем элемент
            const item: EmbeddingItem = {
                id: this._generateGuid(),
                type: 'directory',
                parent: null,
                childs: [],
                path: dirPath,
                kind: kind,
                raw: { description, files: fileNames },
                vector: vector
            };

            await this._storage.addEmbedding(item);
            
            // Убираем статус PROCESSING - теперь статус будет определяться автоматически из БД
            this._fileStatusService.clearProcessingStatus(dirUri);
            return item.id;
        } catch (error) {
            // При ошибке убираем статус PROCESSING
            this._fileStatusService.clearProcessingStatus(dirUri);
            throw error;
        }
    }

    /**
     * Поиск похожих файлов по запросу
     */
    async searchSimilar(query: string, limit: number = 5): Promise<any[]> {
        // Получаем эмбеддинг запроса
        const queryVector = await this._getEmbedding(query);
        
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
            similarity: 1.0, // Для всех записей similarity = 1.0 (100%)
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
        // Уведомляем об изменении статусов всех файлов в workspace
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders) {
            for (const folder of workspaceFolders) {
                // Обновляем декорации для всех файлов в workspace
                // Используем undefined чтобы обновить все декорации
                this._fileStatusService.notifyAllStatusesChanged();
            }
        }
    }

    /**
     * Очистка ресурсов
     */
    async dispose(): Promise<void> {
        await this._storage.dispose();
    }

    /**
     * Рекурсивная обработка директории
     */
    private async _processDirectory(
        dirPath: string,
        parentId: string | null,
        embedderModel: string,
        workspaceFolder: vscode.WorkspaceFolder,
        onProgress: (processed: number, errors: number) => void
    ): Promise<void> {
        let processed = 0;
        let errors = 0;

        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            
            // Обрабатываем файлы
            for (const entry of entries) {
                if (entry.isFile()) {
                    const filePath = path.join(dirPath, entry.name);
                    const fileUri = vscode.Uri.file(filePath);
                    const currentStatus = await this._fileStatusService.getFileStatus(fileUri);
                    
                    try {
                        // Пропускаем исключенные файлы
                        if (currentStatus === FileStatus.EXCLUDED) {
                            continue;
                        }

                        // Проверяем, обработан ли уже файл
                        if (await this._storage.exists(filePath, 'origin')) {
                            // Файл уже обработан и есть в БД - пропускаем
                            continue;
                        }

                        // Удаляем старые записи из БД перед обработкой
                        const existingItems = await this._storage.getByPath(filePath);
                        for (const item of existingItems) {
                            await this._storage.deleteEmbedding(item.id);
                        }

                        // Помечаем файл как обрабатывается (временно)
                        this._fileStatusService.setFileStatus(fileUri, FileStatus.PROCESSING);

                        const content = fs.readFileSync(filePath, 'utf-8');
                        const vector = await this._getEmbedding(content);
                        
                        const item: EmbeddingItem = {
                            id: this._generateGuid(),
                            type: 'file',
                            parent: parentId,
                            childs: [],
                            path: filePath,
                            kind: 'origin',
                            raw: content,
                            vector: vector
                        };

                        await this._storage.addEmbedding(item);
                        
                        // Убираем статус PROCESSING - теперь статус будет определяться автоматически из БД
                        this._fileStatusService.clearProcessingStatus(fileUri);
                        processed++;
                        onProgress(processed, errors);
                    } catch (error) {
                        errors++;
                        console.error(`Ошибка обработки файла ${entry.name}:`, error);
                        // При ошибке убираем статус PROCESSING
                        this._fileStatusService.clearProcessingStatus(fileUri);
                        onProgress(processed, errors);
                    }
                } else if (entry.isDirectory()) {
                    // Пропускаем node_modules, .git и другие служебные директории
                    if (entry.name.startsWith('.') || entry.name === 'node_modules') {
                        continue;
                    }

                    const subDirPath = path.join(dirPath, entry.name);
                    const dirUri = vscode.Uri.file(subDirPath);
                    const currentStatus = await this._fileStatusService.getFileStatus(dirUri);
                    
                    // Пропускаем исключенные директории
                    if (currentStatus === FileStatus.EXCLUDED) {
                        continue;
                    }

                    // Проверяем, обработана ли уже директория
                    if (await this._storage.exists(subDirPath, 'origin')) {
                        // Директория уже обработана и есть в БД - пропускаем
                        continue;
                    }

                    // Удаляем старые записи из БД перед обработкой
                    const existingItems = await this._storage.getByPath(subDirPath);
                    for (const item of existingItems) {
                        await this._storage.deleteEmbedding(item.id);
                    }

                    try {
                        // Помечаем директорию как обрабатывается (временно)
                        this._fileStatusService.setFileStatus(dirUri, FileStatus.PROCESSING);
                        
                        // Создаем запись для директории
                        const files = fs.readdirSync(subDirPath, { withFileTypes: true });
                        const fileNames = files.filter(f => f.isFile()).map(f => f.name);
                        const description = `Директория содержит ${fileNames.length} файлов: ${fileNames.join(', ')}`;
                        
                        const vector = await this._getEmbedding(description);
                        
                        const dirItem: EmbeddingItem = {
                            id: this._generateGuid(),
                            type: 'directory',
                            parent: parentId,
                            childs: [],
                            path: subDirPath,
                            kind: 'origin',
                            raw: { description, files: fileNames },
                            vector: vector
                        };

                        const dirId = await this._storage.addEmbedding(dirItem);
                        
                        // Убираем статус PROCESSING - теперь статус будет определяться автоматически из БД
                        this._fileStatusService.clearProcessingStatus(dirUri);
                        processed++;
                        onProgress(processed, errors);

                        // Рекурсивно обрабатываем поддиректории
                        await this._processDirectory(subDirPath, dirId, embedderModel, workspaceFolder, onProgress);
                    } catch (error) {
                        errors++;
                        console.error(`Ошибка обработки директории ${entry.name}:`, error);
                        // При ошибке убираем статус PROCESSING
                        this._fileStatusService.clearProcessingStatus(dirUri);
                        onProgress(processed, errors);
                    }
                }
            }
        } catch (error) {
            console.error(`Ошибка обработки директории ${dirPath}:`, error);
            errors++;
            onProgress(processed, errors);
        }
    }

    /**
     * Получение эмбеддинга текста
     */
    private async _getEmbedding(text: string): Promise<number[]> {
        const config = await this._llmService.getConfig();
        
        if (!config.embedderModel) {
            throw new Error('Модель эмбеддинга не настроена');
        }

        // Используем Ollama для получения эмбеддинга
        if (config.provider === 'ollama') {
            return await this._getOllamaEmbedding(text, config);
        }

        // Используем кастомный провайдер
        if (config.provider === 'custom' || config.provider === 'local') {
            const apiType = config.apiType || 'openai';
            if (apiType === 'ollama') {
                return await this._getOllamaEmbedding(text, config);
            } else {
                return await this._getCustomProviderEmbedding(text, config);
            }
        }

        // Для других провайдеров можно добавить поддержку
        throw new Error(`Получение эмбеддингов для провайдера ${config.provider} пока не поддерживается`);
    }

    /**
     * Получение эмбеддинга через Ollama
     */
    private async _getOllamaEmbedding(text: string, config: any): Promise<number[]> {
        const localUrl = config.localUrl || 'http://localhost:11434';
        const model = config.embedderModel;
        const url = `${localUrl}/api/embeddings`;

        const fetch = (await import('node-fetch')).default;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    prompt: text
                })
            });

            if (!response.ok) {
                throw new Error(`Ollama embeddings API error (${response.status})`);
            }

            const data = await response.json();
            
            if (!data.embedding || !Array.isArray(data.embedding)) {
                throw new Error('Ollama вернул неверный формат эмбеддинга');
            }

            return data.embedding;
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Ошибка получения эмбеддинга: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * Получение эмбеддинга через кастомный провайдер (OpenAI-совместимый API)
     */
    private async _getCustomProviderEmbedding(text: string, config: any): Promise<number[]> {
        const baseUrl = config.baseUrl || config.localUrl || 'http://localhost:1234';
        const model = config.embedderModel;
        const apiKey = config.apiKey || 'not-needed';
        const timeout = config.timeout || 30000;
        
        // Используем OpenAI-совместимый endpoint для эмбеддингов
        const url = `${baseUrl}/v1/embeddings`;

        const fetch = (await import('node-fetch')).default;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            };

            // Добавляем API ключ только если он указан и не пустой
            if (apiKey && apiKey.trim() && apiKey !== 'not-needed') {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    model: model,
                    input: text
                }),
                signal: controller.signal as any
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Custom provider embeddings API error (${response.status}): ${errorText}`);
            }

            const data = await response.json();
            
            // OpenAI-совместимый формат: { data: [{ embedding: [...] }] }
            if (data.data && data.data[0] && Array.isArray(data.data[0].embedding)) {
                return data.data[0].embedding;
            }
            
            // Альтернативный формат: { embedding: [...] }
            if (data.embedding && Array.isArray(data.embedding)) {
                return data.embedding;
            }
            
            throw new Error('Кастомный провайдер вернул неверный формат эмбеддинга');
        } catch (error) {
            if (error instanceof Error) {
                if (error.name === 'AbortError') {
                    throw new Error(`Таймаут запроса к кастомному провайдеру (${timeout}ms). Убедитесь, что сервер запущен и доступен по адресу ${baseUrl}`);
                }
                if (error.message.includes('fetch')) {
                    throw new Error(`Не удалось подключиться к кастомному провайдеру по адресу ${baseUrl}. Убедитесь, что сервер запущен.`);
                }
                throw new Error(`Ошибка получения эмбеддинга: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * Генерация GUID
     */
    private _generateGuid(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
}

