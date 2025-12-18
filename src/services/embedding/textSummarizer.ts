import { LLMService } from '../llmService';
import { ConfigReader } from '../../utils/configReader';
import { Logger } from '../../utils/logger';
import { VectorizationError } from '../../errors';

/**
 * Сервис суммаризации текста
 * Использует LLM для создания краткого описания содержимого файлов
 */
export class TextSummarizer {
    constructor(private llmService: LLMService) {}

    /**
     * Суммаризация текста через LLM
     * 
     * @param text - Текст для суммаризации
     * @param summarizePrompt - Опциональный промпт для суммаризации (если не указан, используется дефолтный)
     * @returns Суммаризированный текст
     */
    async summarize(text: string, summarizePrompt?: string): Promise<string> {
        // Ограничиваем длину текста для суммаризации (значение берется из настроек)
        const maxLength = ConfigReader.getMaxTextLength();
        const textToSummarize = text.length > maxLength 
            ? text.substring(0, maxLength) + ConfigReader.getTruncateMessage()
            : text;

        // Формируем промпт: используем переданный или дефолтный из настроек
        const prompt = summarizePrompt 
            ? `${summarizePrompt}\n\n${textToSummarize}`
            : `Суммаризируй следующий код или текст. Создай краткое описание основных функций, классов, методов и их назначения. Сохрани важные детали, но сделай текст более компактным и структурированным.\n\n${textToSummarize}`;

        try {
            // Генерируем суммаризацию через LLM
            const summary = await this.llmService.generateCode(prompt);
            return summary.trim();
        } catch (error) {
            // Если суммаризация не удалась, используем оригинальный текст (или обрезанный)
            Logger.warn('Не удалось создать суммаризацию, используется оригинальный текст', error as Error);
            return textToSummarize;
        }
    }
}

