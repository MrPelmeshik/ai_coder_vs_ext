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

        // Проверяем, обработан ли уже файл
        if (await this._storage.exists(filePath, 'origin')) {
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

        // Удаляем старые записи из БД перед обработкой
        const existingItems = await this._storage.getByPath(filePath);
        for (const item of existingItems) {
            await this._storage.deleteEmbedding(item.id);
        }

        // Помечаем файл как обрабатывается (временно)
        this._fileStatusService.setFileStatus(fileUri, FileStatus.PROCESSING);

        try {
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
            
            // Убираем статус PROCESSING
            this._fileStatusService.clearProcessingStatus(fileUri);
            onProgress(1, 0);
        } catch (error) {
            this._fileStatusService.clearProcessingStatus(fileUri);
            throw error;
        }
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

        // Проверяем, обработана ли уже директория
        if (await this._storage.exists(dirPath, 'origin')) {
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

        // Удаляем старые записи из БД перед обработкой
        const existingItems = await this._storage.getByPath(dirPath);
        for (const item of existingItems) {
            await this._storage.deleteEmbedding(item.id);
        }

        // Помечаем директорию как обрабатывается (временно)
        this._fileStatusService.setFileStatus(dirUri, FileStatus.PROCESSING);

        try {
            // Создаем запись для директории
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
            
            // Убираем статус PROCESSING
            this._fileStatusService.clearProcessingStatus(dirUri);
            onProgress(1, 0);
        } catch (error) {
            this._fileStatusService.clearProcessingStatus(dirUri);
            throw error;
        }
    }

    /**
     * Векторизация конкретного файла
     */
    async vectorizeFile(fileUri: vscode.Uri, kind: EmbeddingKind = 'origin'): Promise<string> {
        const filePath = fileUri.fsPath;
        const currentStatus = await this._fileStatusService.getFileStatus(fileUri);
        
        // Пропускаем исключенные файлы
        if (currentStatus === FileStatus.EXCLUDED) {
            throw new Error(`Файл ${filePath} исключен из обработки`);
        }

        // Проверяем, не обработан ли уже файл
        if (await this._storage.exists(filePath, kind)) {
            // Файл уже обработан и есть в БД
            throw new Error(`Файл ${filePath} уже обработан (kind: ${kind})`);
        }

        // Удаляем старые записи из БД перед обработкой
        const existingItems = await this._storage.getByPath(filePath);
        for (const item of existingItems) {
            await this._storage.deleteEmbedding(item.id);
        }

        // Помечаем файл как обрабатывается (временно)
        this._fileStatusService.setFileStatus(fileUri, FileStatus.PROCESSING);

        try {
            // Читаем содержимое файла
            const content = fs.readFileSync(filePath, 'utf-8');
            
            // Получаем эмбеддинг
            const vector = await this._getEmbedding(content);
            
            // Создаем элемент
            const item: EmbeddingItem = {
                id: this._generateGuid(),
                type: 'file',
                parent: null,
                childs: [],
                path: filePath,
                kind: kind,
                raw: content,
                vector: vector
            };

            await this._storage.addEmbedding(item);
            
            // Убираем статус PROCESSING - теперь статус будет определяться автоматически из БД
            this._fileStatusService.clearProcessingStatus(fileUri);
            return item.id;
        } catch (error) {
            // При ошибке убираем статус PROCESSING
            this._fileStatusService.clearProcessingStatus(fileUri);
            throw error;
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
            kind: r.item.kind
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

