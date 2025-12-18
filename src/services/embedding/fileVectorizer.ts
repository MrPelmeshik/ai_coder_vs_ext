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
        const fileUri = vscode.Uri.file(filePath);
        const currentStatus = await this.fileStatusService.getFileStatus(fileUri);
        
        // Пропускаем исключенные файлы
        if (currentStatus === FileStatus.EXCLUDED) {
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
            const content = await fs.promises.readFile(filePath, 'utf-8');
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
                    Logger.error(`Ошибка создания origin вектора для файла ${filePath}`, error as Error);
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
                    Logger.error(`Ошибка создания summarize вектора для файла ${filePath}`, error as Error);
                }
            }
            
            this.fileStatusService.clearProcessingStatus(fileUri);
            return { processed: processedCount, errors: errorCount };
        } catch (error) {
            this.fileStatusService.clearProcessingStatus(fileUri);
            Logger.error(`Ошибка векторизации файла ${filePath}`, error as Error);
            throw new VectorizationError(
                `Не удалось векторизовать файл ${filePath}`,
                filePath,
                error as Error
            );
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
        const llmConfig = await this._getLLMConfig();
        const originVector = await this.embeddingProvider.getEmbedding(content, llmConfig);
        
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
        const summary = await this.textSummarizer.summarize(content, summarizePrompt);
        const llmConfig = await this._getLLMConfig();
        const summarizeVector = await this.embeddingProvider.getEmbedding(summary, llmConfig);
        
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
    }

    /**
     * Получение конфигурации LLM
     */
    private async _getLLMConfig(): Promise<LLMConfig> {
        return await this.llmService.getConfig();
    }
}

