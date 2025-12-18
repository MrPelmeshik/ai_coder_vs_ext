import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { VectorStorage, EmbeddingItem } from '../../storage/interfaces/vectorStorage';
import { FileStatusService, FileStatus } from '../fileStatusService';
import { LLMService, LLMConfig } from '../llmService';
import { EmbeddingProvider } from './embeddingProvider';
import { generateGuid } from '../../utils/guid';
import { Logger } from '../../utils/logger';
import { VectorizationError } from '../../errors';

/**
 * Сервис векторизации директорий
 */
export class DirectoryVectorizer {
    constructor(
        private embeddingProvider: EmbeddingProvider,
        private storage: VectorStorage,
        private fileStatusService: FileStatusService,
        private llmService: LLMService
    ) {}

    /**
     * Векторизация директории
     */
    async vectorizeDirectory(
        dirPath: string,
        parentId: string | null,
        config: {
            embedderModel: string;
            enableOrigin: boolean;
            enableVsOrigin: boolean;
            enableVsSummarize: boolean;
        }
    ): Promise<{ processed: number; errors: number }> {
        // Нормализуем путь для единообразия
        const normalizedPath = path.normalize(dirPath);
        Logger.info(`[DirectoryVectorizer] Начало векторизации директории: ${normalizedPath}`);
        
        const dirUri = vscode.Uri.file(normalizedPath);
        const currentStatus = await this.fileStatusService.getFileStatus(dirUri);
        
        // Пропускаем исключенные директории
        if (currentStatus === FileStatus.EXCLUDED) {
            Logger.info(`[DirectoryVectorizer] Директория ${normalizedPath} исключена из обработки, пропускаем`);
            return { processed: 0, errors: 0 };
        }

        // Получаем все существующие записи один раз
        const existingItems = await this.storage.getByPath(normalizedPath);
        const hasOrigin = existingItems.some((i: EmbeddingItem) => i.kind === 'origin');
        const hasVsOrigin = existingItems.some((i: EmbeddingItem) => i.kind === 'vs_origin');
        const hasVsSummarize = existingItems.some((i: EmbeddingItem) => i.kind === 'vs_summarize');

        const needsOrigin = config.enableOrigin && !hasOrigin;
        const needsVsOrigin = config.enableVsOrigin && !hasVsOrigin;
        const needsVsSummarize = config.enableVsSummarize && !hasVsSummarize;

        // Если все необходимые векторы уже созданы и не нужно удалять отключенные, пропускаем
        if (!needsOrigin && !needsVsOrigin && !needsVsSummarize) {
            const hasItemsToDelete = existingItems.some((item: EmbeddingItem) => 
                (!config.enableOrigin && item.kind === 'origin') ||
                (!config.enableVsOrigin && item.kind === 'vs_origin') ||
                (!config.enableVsSummarize && item.kind === 'vs_summarize')
            );
            if (!hasItemsToDelete) {
                return { processed: 0, errors: 0 };
            }
        }

        // Удаляем векторы, которые нужно пересоздать или которые отключены
        for (const item of existingItems) {
            if ((needsOrigin && item.kind === 'origin') ||
                (needsVsOrigin && item.kind === 'vs_origin') ||
                (needsVsSummarize && item.kind === 'vs_summarize') ||
                (!config.enableOrigin && item.kind === 'origin') ||
                (!config.enableVsOrigin && item.kind === 'vs_origin') ||
                (!config.enableVsSummarize && item.kind === 'vs_summarize')) {
                await this.storage.deleteEmbedding(item.id);
            }
        }

        // Помечаем директорию как обрабатывается
        this.fileStatusService.setFileStatus(dirUri, FileStatus.PROCESSING);

        let processedCount = 0;
        let errorCount = 0;

        try {

            // Создаем запись для директории (origin)
            if (needsOrigin) {
                try {
                    await this._createOriginVector(normalizedPath, parentId);
                    processedCount++;
                    Logger.info(`Создан origin вектор для директории ${normalizedPath}`);
                } catch (error) {
                    errorCount++;
                    Logger.error(`Ошибка создания origin вектора для директории ${normalizedPath}`, error as Error);
                }
            }

            // Создаем вектор vs_origin (сумма всех origin векторов вложений)
            if (needsVsOrigin) {
                try {
                    const created = await this._createVectorSum(
                        normalizedPath,
                        parentId,
                        'vs_origin',
                        'origin',
                        'vs_origin'
                    );
                    if (created) {
                        processedCount++;
                        Logger.info(`Создан vs_origin вектор для директории ${normalizedPath}`);
                    } else {
                        Logger.warn(`Не удалось создать vs_origin вектор для директории ${normalizedPath} - нет вложенных векторов`);
                    }
                } catch (error) {
                    errorCount++;
                    Logger.error(`Ошибка создания vs_origin вектора для директории ${normalizedPath}`, error as Error);
                }
            }

            // Создаем вектор vs_summarize (сумма всех summarize векторов вложений)
            if (needsVsSummarize) {
                try {
                    const created = await this._createVectorSum(
                        normalizedPath,
                        parentId,
                        'vs_summarize',
                        'summarize',
                        'vs_summarize'
                    );
                    if (created) {
                        processedCount++;
                        Logger.info(`Создан vs_summarize вектор для директории ${normalizedPath}`);
                    } else {
                        Logger.warn(`Не удалось создать vs_summarize вектор для директории ${normalizedPath} - нет вложенных векторов`);
                    }
                } catch (error) {
                    errorCount++;
                    Logger.error(`Ошибка создания vs_summarize вектора для директории ${normalizedPath}`, error as Error);
                }
            }
            
            this.fileStatusService.clearProcessingStatus(dirUri);
            return { processed: processedCount, errors: errorCount };
        } catch (error) {
            this.fileStatusService.clearProcessingStatus(dirUri);
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            Logger.error(`Критическая ошибка векторизации директории ${normalizedPath}: ${errorMessage}`, error as Error);
            if (errorStack) {
                Logger.error(`Стек ошибки: ${errorStack}`, error as Error);
            }
            // Не выбрасываем исключение, а возвращаем ошибку, чтобы обработка других элементов продолжалась
            return { processed: processedCount, errors: errorCount + 1 };
        }
    }

    /**
     * Создание вектора origin для директории
     */
    private async _createOriginVector(dirPath: string, parentId: string | null): Promise<void> {
        try {
            const files = await fs.promises.readdir(dirPath, { withFileTypes: true });
            const fileNames = files.filter(f => f.isFile()).map(f => f.name);
            const description = `Директория содержит ${fileNames.length} файлов: ${fileNames.join(', ')}`;
            
            const llmConfig = await this._getLLMConfig();
            const vector = await this.embeddingProvider.getEmbedding(description, llmConfig);
            
            if (!vector || !Array.isArray(vector) || vector.length === 0) {
                throw new Error('Провайдер вернул пустой или неверный вектор');
            }
            
            const dirItem: EmbeddingItem = {
                id: generateGuid(),
                type: 'directory',
                parent: parentId,
                childs: [],
                path: dirPath,
                kind: 'origin',
                raw: { description, files: fileNames },
                vector: vector
            };

            await this.storage.addEmbedding(dirItem);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            Logger.error(`[DirectoryVectorizer] Ошибка в _createOriginVector для директории ${dirPath}: ${errorMessage}`, error as Error);
            throw error;
        }
    }

    /**
     * Создание вектора суммы (vs_origin или vs_summarize)
     */
    private async _createVectorSum(
        dirPath: string,
        parentId: string | null,
        kind: 'vs_origin' | 'vs_summarize',
        fileKind: 'origin' | 'summarize',
        dirKind: 'vs_origin' | 'vs_summarize'
    ): Promise<boolean> {
        const nestedItems = await this._getNestedItems(dirPath);
        const normalizedDirPath = path.normalize(dirPath);
        
        // Фильтруем векторы: для файлов берем fileKind, для директорий берем dirKind
        const filteredItems = nestedItems.filter(item => {
            const normalizedItemPath = path.normalize(item.path);
            
            // Исключаем саму директорию
            if (normalizedItemPath === normalizedDirPath) {
                return false;
            }
            
            // Проверяем, что элемент действительно вложен в эту директорию
            const dirPathWithSep = normalizedDirPath + path.sep;
            if (!normalizedItemPath.startsWith(dirPathWithSep)) {
                return false;
            }
            
            // Для файлов берем fileKind, для директорий берем dirKind
            if (item.type === 'file') {
                return item.kind === fileKind;
            } else if (item.type === 'directory') {
                return item.kind === dirKind;
            }
            return false;
        });

        // Извлекаем векторы
        const vectors = filteredItems
            .map(item => item.vector)
            .filter((v): v is number[] => v !== null && Array.isArray(v) && v.length > 0);

        if (vectors.length > 0) {
            const sumVector = this._sumVectors(vectors);
            
            const item: EmbeddingItem = {
                id: generateGuid(),
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

            await this.storage.addEmbedding(item);
            return true;
        } else {
            if (nestedItems.length > 0) {
                Logger.warn(
                    `[${kind}] Нет вложенных элементов с векторами ${fileKind}/${dirKind} для директории ${dirPath}. Найдено всего элементов: ${nestedItems.length}`
                );
            } else {
                Logger.warn(
                    `[${kind}] Нет вложенных элементов для директории ${dirPath}`
                );
            }
        }
        
        return false;
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
                Logger.warn(
                    `Размерность вектора не совпадает: ожидается ${dimension}, получено ${vector.length}`
                );
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
            const walkDir = async (currentPath: string) => {
                try {
                    // Нормализуем текущий путь
                    const normalizedCurrentPath = path.normalize(currentPath);
                    const entries = await fs.promises.readdir(normalizedCurrentPath, { withFileTypes: true });
                    
                    for (const entry of entries) {
                        const fullPath = path.join(normalizedCurrentPath, entry.name);
                        const normalizedFullPath = path.normalize(fullPath);
                        
                        // Пропускаем служебные директории
                        if (entry.isDirectory() && (entry.name.startsWith('.') || entry.name === 'node_modules')) {
                            continue;
                        }

                        // Исключаем саму директорию
                        if (normalizedFullPath === normalizedDirPath) {
                            continue;
                        }

                        // Получаем все векторы для этого элемента из БД
                        // Используем нормализованный путь для поиска
                        const items = await this.storage.getByPath(normalizedFullPath);
                        if (items.length > 0) {
                            nestedItems.push(...items);
                        }

                        // Рекурсивно обходим поддиректории
                        if (entry.isDirectory()) {
                            await walkDir(normalizedFullPath);
                        }
                    }
                } catch (error) {
                    Logger.warn(`Ошибка при обходе директории ${currentPath}`, error as Error);
                }
            };

            await walkDir(dirPath);
        } catch (error) {
            Logger.warn(`Ошибка при получении вложенных элементов для ${dirPath}`, error as Error);
        }

        return nestedItems;
    }

    /**
     * Получение конфигурации LLM
     */
    private async _getLLMConfig(): Promise<LLMConfig> {
        return await this.llmService.getConfig();
    }
}

