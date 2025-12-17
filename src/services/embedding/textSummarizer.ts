import { LLMService } from '../llmService';
import { SUMMARIZE } from '../../constants';
import { Logger } from '../../utils/logger';
import { VectorizationError } from '../../errors';

/**
 * Сервис суммаризации текста
 */
export class TextSummarizer {
    constructor(private llmService: LLMService) {}

    /**
     * Суммаризация текста через LLM
     */
    async summarize(text: string, summarizePrompt?: string): Promise<string> {
        // Ограничиваем длину текста для суммаризации
        const textToSummarize = text.length > SUMMARIZE.MAX_TEXT_LENGTH 
            ? text.substring(0, SUMMARIZE.MAX_TEXT_LENGTH) + SUMMARIZE.TRUNCATE_MESSAGE
            : text;

        const prompt = summarizePrompt 
            ? `${summarizePrompt}\n\n${textToSummarize}`
            : `Суммаризируй следующий код или текст. Создай краткое описание основных функций, классов, методов и их назначения. Сохрани важные детали, но сделай текст более компактным и структурированным.\n\n${textToSummarize}`;

        try {
            const summary = await this._llmService.generateCode(prompt);
            return summary.trim();
        } catch (error) {
            // Если суммаризация не удалась, используем оригинальный текст
            Logger.warn('Не удалось создать суммаризацию, используется оригинальный текст', error as Error);
            return textToSummarize;
        }
    }
}

