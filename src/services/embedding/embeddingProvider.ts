import { LLMConfig } from '../llmService';
import { CONFIG_KEYS } from '../../constants';
import { ApiErrorHandler } from '../../utils/errorHandler';
import { Logger } from '../../utils/logger';
import { EmbeddingError } from '../../errors';
import { ConfigValidator } from '../../utils/validators';
import { ConfigReader } from '../../utils/configReader';
import * as vscode from 'vscode';

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
        const vscodeConfig = vscode.workspace.getConfiguration('aiCoder');
        const defaultOllamaUrl = vscodeConfig.get<string>(CONFIG_KEYS.LLM.LOCAL_URL)!;
        const localUrl = config.localUrl || defaultOllamaUrl;
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
            const timeout = ConfigValidator.validateTimeout(config.timeout);
            ApiErrorHandler.handle(error, 'Ollama', timeout, localUrl);
            throw new EmbeddingError('Не удалось получить эмбеддинг через Ollama', error as Error);
        }
    }
}

/**
 * Провайдер эмбеддингов через кастомный API (OpenAI-совместимый)
 */
export class CustomEmbeddingProvider implements EmbeddingProvider {
    async getEmbedding(text: string, config: LLMConfig): Promise<number[]> {
        const vscodeConfig = vscode.workspace.getConfiguration('aiCoder');
        const defaultLocalApiUrl = vscodeConfig.get<string>(CONFIG_KEYS.LLM.LOCAL_URL)!;
        const baseUrl = config.baseUrl || config.localUrl || defaultLocalApiUrl;
        const model = config.embedderModel || '';
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
            const apiType = config.apiType || ConfigReader.getApiTypeOpenai();
            if (apiType === ConfigReader.getApiTypeOllama()) {
                return new OllamaEmbeddingProvider();
            } else {
                return new CustomEmbeddingProvider();
            }
        }

        // По умолчанию используем кастомный провайдер
        return new CustomEmbeddingProvider();
    }
}

