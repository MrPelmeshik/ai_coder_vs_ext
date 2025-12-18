import { LLMConfig } from '../llmService';
import { CONFIG_KEYS } from '../../constants';
import { ApiErrorHandler } from '../../utils/errorHandler';
import { Logger } from '../../utils/logger';
import { EmbeddingError, ConfigError } from '../../errors';
import { ConfigValidator } from '../../utils/validators';
import { ConfigReader } from '../../utils/configReader';
import * as vscode from 'vscode';

/**
 * Интерфейс провайдера эмбеддингов
 * Определяет метод получения векторного представления текста
 */
export interface EmbeddingProvider {
    /**
     * Получение векторного представления текста
     * 
     * @param text - Текст для векторизации
     * @param config - Конфигурация LLM
     * @returns Массив чисел (вектор)
     */
    getEmbedding(text: string, config: LLMConfig): Promise<number[]>;
}

/**
 * Провайдер эмбеддингов через Ollama
 * Использует локальный Ollama API для получения векторных представлений
 */
export class OllamaEmbeddingProvider implements EmbeddingProvider {
    /**
     * Получение эмбеддинга через Ollama API
     * 
     * @param text - Текст для векторизации
     * @param config - Конфигурация LLM (должен содержать localUrl и embedderModel)
     * @returns Векторное представление текста
     */
    async getEmbedding(text: string, config: LLMConfig): Promise<number[]> {
        if (!config.localUrl) {
            throw new ConfigError('localUrl не указан в настройках для провайдера ollama');
        }
        const localUrl = config.localUrl;
        if (!config.embedderModel) {
            throw new ConfigError('Модель эмбеддинга не указана в настройках');
        }
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
            Logger.error('Ошибка получения эмбеддинга через Ollama', error as Error, { url, model });
            const timeout = ConfigValidator.validateTimeout(config.timeout);
            ApiErrorHandler.handle(error, 'Ollama', timeout, localUrl);
            throw new EmbeddingError('Не удалось получить эмбеддинг через Ollama', error as Error);
        }
    }
}

/**
 * Провайдер эмбеддингов через OpenAI-совместимый API
 * Работает с локальными и облачными моделями автоматически
 * Поддерживает формат API: /v1/embeddings
 */
export class CustomEmbeddingProvider implements EmbeddingProvider {
    /**
     * Получение эмбеддинга через OpenAI-совместимый API
     * 
     * @param text - Текст для векторизации
     * @param config - Конфигурация LLM (должен содержать baseUrl/localUrl и embedderModel)
     * @returns Векторное представление текста
     */
    async getEmbedding(text: string, config: LLMConfig): Promise<number[]> {
        if (!config.baseUrl && !config.localUrl) {
            throw new ConfigError('baseUrl или localUrl должны быть указаны в настройках');
        }
        const baseUrl = config.baseUrl || config.localUrl!;
        if (!config.embedderModel) {
            throw new ConfigError('Модель эмбеддинга не указана в настройках');
        }
        const model = config.embedderModel;
        const apiKey = config.apiKey || ConfigReader.getApiKeyNotNeeded();
        const timeout = ConfigValidator.validateTimeout(config.timeout);
        
        const url = `${baseUrl}/v1/embeddings`;

        const fetch = (await import('node-fetch')).default;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            };

            if (apiKey && apiKey.trim() && apiKey !== ConfigReader.getApiKeyNotNeeded()) {
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
                throw new Error(`OpenAI-compatible embeddings API error (${response.status}): ${errorText}`);
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
 * Создает соответствующий провайдер на основе конфигурации
 */
export class EmbeddingProviderFactory {
    /**
     * Создание провайдера эмбеддингов на основе конфигурации
     * 
     * @param config - Конфигурация LLM
     * @returns Провайдер эмбеддингов
     */
    static create(config: LLMConfig): EmbeddingProvider {
        // Ollama провайдер использует OllamaEmbeddingProvider
        if (config.provider === 'ollama') {
            return new OllamaEmbeddingProvider();
        }

        // OpenAI-совместимый провайдер использует CustomEmbeddingProvider
        // который работает с OpenAI-совместимым API форматом
        if (config.provider === 'openai') {
            return new CustomEmbeddingProvider();
        }

        // По умолчанию используем OpenAI-совместимый провайдер
        return new CustomEmbeddingProvider();
    }
}

