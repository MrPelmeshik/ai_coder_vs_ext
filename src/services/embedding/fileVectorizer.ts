import * as vscode from 'vscode';
import * as fs from 'fs';
import { VectorStorage, EmbeddingItem } from '../../storage/interfaces/vectorStorage';
import { FileStatusService, FileStatus } from '../fileStatusService';
import { LLMService, LLMConfig } from '../llmService';
import { EmbeddingProvider } from './embeddingProvider';
import { TextSummarizer } from './textSummarizer';
import { generateGuid } from '../../utils/guid';
import { Logger } from '../../utils/logger';
import { VectorizationError } from '../../errors';

/**
 * Сервис векторизации файлов
 */
export class FileVectorizer {
    constructor(
        private embeddingProvider: EmbeddingProvider,
        private textSummarizer: TextSummarizer,
        private storage: VectorStorage,
        private fileStatusService: FileStatusService,
        private llmService: LLMService
    ) {}

    /**
     * Векторизация файла
     */
    async vectorizeFile(
        filePath: string,
        parentId: string | null,
        config: {
            embedderModel: string;
            enableOrigin: boolean;
            enableSummarize: boolean;
            summarizePrompt?: string;
        }
    ): Promise<{ processed: number; errors: number }> {
        Logger.info(`[FileVectorizer] Начало векторизации файла: ${filePath}`);
        
        const fileUri = vscode.Uri.file(filePath);
        const currentStatus = await this.fileStatusService.getFileStatus(fileUri);
        
        // Пропускаем исключенные файлы
        if (currentStatus === FileStatus.EXCLUDED) {
            Logger.info(`[FileVectorizer] Файл ${filePath} исключен из обработки, пропускаем`);
            return { processed: 0, errors: 0 };
        }

        // Получаем все существующие записи один раз
        const existingItems = await this.storage.getByPath(filePath);
        const hasOrigin = existingItems.some((i: EmbeddingItem) => i.kind === 'origin');
        const hasSummarize = existingItems.some((i: EmbeddingItem) => i.kind === 'summarize');
        
        const needsOrigin = config.enableOrigin && !hasOrigin;
        const needsSummarize = config.enableSummarize && !hasSummarize;
        
        Logger.info(`[FileVectorizer] Файл ${filePath}: enableOrigin=${config.enableOrigin}, hasOrigin=${hasOrigin}, needsOrigin=${needsOrigin}`);
        Logger.info(`[FileVectorizer] Файл ${filePath}: enableSummarize=${config.enableSummarize}, hasSummarize=${hasSummarize}, needsSummarize=${needsSummarize}`);
        
        // Если все необходимые векторы уже созданы и не нужно удалять отключенные, пропускаем
        if (!needsOrigin && !needsSummarize) {
            const hasItemsToDelete = existingItems.some(item => 
                (!config.enableOrigin && item.kind === 'origin') ||
                (!config.enableSummarize && item.kind === 'summarize')
            );
            if (!hasItemsToDelete) {
                Logger.info(`[FileVectorizer] Файл ${filePath} уже обработан, все необходимые векторы созданы, пропускаем`);
                return { processed: 0, errors: 0 };
            }
        }

        // Удаляем векторы, которые нужно пересоздать или которые отключены
        for (const item of existingItems) {
            if ((needsOrigin && item.kind === 'origin') ||
                (needsSummarize && item.kind === 'summarize') ||
                (!config.enableOrigin && item.kind === 'origin') ||
                (!config.enableSummarize && item.kind === 'summarize')) {
                await this.storage.deleteEmbedding(item.id);
            }
        }

        // Помечаем файл как обрабатывается
        this.fileStatusService.setFileStatus(fileUri, FileStatus.PROCESSING);

        try {
            let content: string;
            try {
                content = await fs.promises.readFile(filePath, 'utf-8');
            } catch (readError) {
                // Ошибка чтения файла - возможно, это бинарный файл или файл с неподдерживаемой кодировкой
                this.fileStatusService.clearProcessingStatus(fileUri);
                const errorMessage = readError instanceof Error ? readError.message : String(readError);
                Logger.warn(`Не удалось прочитать файл ${filePath}: ${errorMessage}. Возможно, это бинарный файл.`);
                return { processed: 0, errors: 1 };
            }

            let processedCount = 0;
            let errorCount = 0;

            // Создаем вектор по оригинальному тексту
            if (needsOrigin) {
                try {
                    await this._createOriginVector(filePath, content, parentId);
                    processedCount++;
                    Logger.info(`Создан origin вектор для файла ${filePath}`);
                } catch (error) {
                    errorCount++;
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    const errorStack = error instanceof Error ? error.stack : undefined;
                    Logger.error(`Ошибка создания origin вектора для файла ${filePath}: ${errorMessage}`, error as Error);
                    if (errorStack) {
                        Logger.error(`Стек ошибки: ${errorStack}`, error as Error);
                    }
                }
            }

            // Создаем вектор по суммаризации (независимо от результата создания origin)
            if (needsSummarize) {
                try {
                    await this._createSummarizeVector(filePath, content, parentId, config.summarizePrompt);
                    processedCount++;
                    Logger.info(`Создан summarize вектор для файла ${filePath}`);
                } catch (error) {
                    errorCount++;
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    const errorStack = error instanceof Error ? error.stack : undefined;
                    Logger.error(`Ошибка создания summarize вектора для файла ${filePath}: ${errorMessage}`, error as Error);
                    if (errorStack) {
                        Logger.error(`Стек ошибки: ${errorStack}`, error as Error);
                    }
                }
            }
            
            this.fileStatusService.clearProcessingStatus(fileUri);
            return { processed: processedCount, errors: errorCount };
        } catch (error) {
            this.fileStatusService.clearProcessingStatus(fileUri);
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            Logger.error(`Критическая ошибка векторизации файла ${filePath}: ${errorMessage}`, error as Error);
            if (errorStack) {
                Logger.error(`Стек ошибки: ${errorStack}`, error as Error);
            }
            // Не выбрасываем исключение, а возвращаем ошибку, чтобы обработка других файлов продолжалась
            return { processed: 0, errors: 1 };
        }
    }

    /**
     * Создание вектора по оригинальному тексту
     */
    private async _createOriginVector(
        filePath: string,
        content: string,
        parentId: string | null
    ): Promise<void> {
        try {
            const llmConfig = await this._getLLMConfig();
            Logger.debug(`[FileVectorizer] Получение эмбеддинга для файла ${filePath}, модель: ${llmConfig.embedderModel}, провайдер: ${llmConfig.provider}`);
            
            const originVector = await this.embeddingProvider.getEmbedding(content, llmConfig);
            
            if (!originVector || !Array.isArray(originVector) || originVector.length === 0) {
                throw new Error('Провайдер вернул пустой или неверный вектор');
            }
            
            Logger.debug(`[FileVectorizer] Получен вектор размерности ${originVector.length} для файла ${filePath}`);
            
            const originItem: EmbeddingItem = {
                id: generateGuid(),
                type: 'file',
                parent: parentId,
                childs: [],
                path: filePath,
                kind: 'origin',
                raw: content,
                vector: originVector
            };

            await this.storage.addEmbedding(originItem);
            Logger.debug(`[FileVectorizer] Вектор успешно сохранен в хранилище для файла ${filePath}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            Logger.error(`[FileVectorizer] Ошибка в _createOriginVector для файла ${filePath}: ${errorMessage}`, error as Error);
            throw error;
        }
    }

    /**
     * Создание вектора по суммаризации
     */
    private async _createSummarizeVector(
        filePath: string,
        content: string,
        parentId: string | null,
        summarizePrompt?: string
    ): Promise<void> {
        try {
            Logger.debug(`[FileVectorizer] Создание суммаризации для файла ${filePath}`);
            const summary = await this.textSummarizer.summarize(content, summarizePrompt);
            Logger.debug(`[FileVectorizer] Суммаризация создана, длина: ${summary.length} символов`);
            
            const llmConfig = await this._getLLMConfig();
            Logger.debug(`[FileVectorizer] Получение эмбеддинга для суммаризации файла ${filePath}, модель: ${llmConfig.embedderModel}, провайдер: ${llmConfig.provider}`);
            
            const summarizeVector = await this.embeddingProvider.getEmbedding(summary, llmConfig);
            
            if (!summarizeVector || !Array.isArray(summarizeVector) || summarizeVector.length === 0) {
                throw new Error('Провайдер вернул пустой или неверный вектор для суммаризации');
            }
            
            Logger.debug(`[FileVectorizer] Получен вектор размерности ${summarizeVector.length} для суммаризации файла ${filePath}`);
            
            const summarizeItem: EmbeddingItem = {
                id: generateGuid(),
                type: 'file',
                parent: parentId,
                childs: [],
                path: filePath,
                kind: 'summarize',
                raw: summary,
                vector: summarizeVector
            };

            await this.storage.addEmbedding(summarizeItem);
            Logger.debug(`[FileVectorizer] Вектор суммаризации успешно сохранен в хранилище для файла ${filePath}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            Logger.error(`[FileVectorizer] Ошибка в _createSummarizeVector для файла ${filePath}: ${errorMessage}`, error as Error);
            throw error;
        }
    }

    /**
     * Получение конфигурации LLM
     */
    private async _getLLMConfig(): Promise<LLMConfig> {
        return await this.llmService.getConfig();
    }
}

