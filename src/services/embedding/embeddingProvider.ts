import { LLMConfig } from '../llmService';
import { DEFAULT_OLLAMA_URL, DEFAULT_LOCAL_API_URL, DEFAULT_TIMEOUT } from '../../constants';
import { ApiErrorHandler } from '../../utils/errorHandler';
import { Logger } from '../../utils/logger';
import { EmbeddingError } from '../../errors';

/**
 * Интерфейс провайдера эмбеддингов
 */
export interface EmbeddingProvider {
    getEmbedding(text: string, config: LLMConfig): Promise<number[]>;
}

/**
 * Провайдер эмбеддингов через Ollama
 */
export class OllamaEmbeddingProvider implements EmbeddingProvider {
    async getEmbedding(text: string, config: LLMConfig): Promise<number[]> {
        const localUrl = config.localUrl || DEFAULT_OLLAMA_URL;
        const model = config.embedderModel || '';
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
            Logger.error('Ошибка получения эмбеддинга через Ollama', error as Error, { url, model });
            ApiErrorHandler.handle(error, 'Ollama', config.timeout || DEFAULT_TIMEOUT, localUrl);
            throw new EmbeddingError('Не удалось получить эмбеддинг через Ollama', error as Error);
        }
    }
}

/**
 * Провайдер эмбеддингов через кастомный API (OpenAI-совместимый)
 */
export class CustomEmbeddingProvider implements EmbeddingProvider {
    async getEmbedding(text: string, config: LLMConfig): Promise<number[]> {
        const baseUrl = config.baseUrl || config.localUrl || DEFAULT_LOCAL_API_URL;
        const model = config.embedderModel || '';
        const apiKey = config.apiKey || 'not-needed';
        const timeout = config.timeout || DEFAULT_TIMEOUT;
        
        const url = `${baseUrl}/v1/embeddings`;

        const fetch = (await import('node-fetch')).default;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            };

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
            
            if (data.data && data.data[0] && Array.isArray(data.data[0].embedding)) {
                return data.data[0].embedding;
            }
            
            if (data.embedding && Array.isArray(data.embedding)) {
                return data.embedding;
            }
            
            throw new Error('Кастомный провайдер вернул неверный формат эмбеддинга');
        } catch (error) {
            Logger.error('Ошибка получения эмбеддинга через кастомный провайдер', error as Error, { url, model });
            ApiErrorHandler.handle(error, 'кастомный провайдер', timeout, baseUrl);
            throw new EmbeddingError('Не удалось получить эмбеддинг через кастомный провайдер', error as Error);
        }
    }
}

/**
 * Фабрика провайдеров эмбеддингов
 */
export class EmbeddingProviderFactory {
    static create(config: LLMConfig): EmbeddingProvider {
        if (config.provider === 'ollama') {
            return new OllamaEmbeddingProvider();
        }

        if (config.provider === 'custom' || config.provider === 'local') {
            const apiType = config.apiType || 'openai';
            if (apiType === 'ollama') {
                return new OllamaEmbeddingProvider();
            } else {
                return new CustomEmbeddingProvider();
            }
        }

        // По умолчанию используем кастомный провайдер
        return new CustomEmbeddingProvider();
    }
}

