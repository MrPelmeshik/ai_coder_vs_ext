import { LLMProvider, LLMConfig } from '../services/llmService';
import fetch from 'node-fetch';
import { CONFIG_KEYS } from '../constants';
import { ApiErrorHandler } from '../utils/errorHandler';
import { Logger } from '../utils/logger';
import { ConfigValidator } from '../utils/validators';
import { ConfigReader } from '../utils/configReader';
import { ConfigError } from '../errors';
import * as vscode from 'vscode';

/**
 * Получение URL облачного OpenAI API из настроек
 */
function getOpenAiApiUrl(): string {
    const config = vscode.workspace.getConfiguration('aiCoder');
    return config.get<string>(CONFIG_KEYS.PROVIDERS.OPENAI_API_URL) ?? 'https://api.openai.com';
}

/**
 * Провайдер для работы с OpenAI-совместимыми API
 * 
 * Автоматически определяет локальную или облачную модель:
 * - Если указан baseUrl/localUrl - работает с локальной моделью (LM Studio, LocalAI и т.д.)
 * - Если указан только apiKey без baseUrl - работает с облачным OpenAI API
 * - Если указаны и baseUrl и apiKey - работает с локальной моделью по указанному адресу
 * 
 * Работает с форматом API: /v1/chat/completions
 */
export class OpenAiCompatibleProvider implements LLMProvider {
    /**
     * Генерация кода через OpenAI-совместимый API
     * Автоматически определяет локальную или облачную модель на основе baseUrl и apiKey
     */
    async generate(prompt: string, config: LLMConfig): Promise<string> {
        // Определяем URL: если указан baseUrl/localUrl - используем его (локальная модель),
        // иначе если есть apiKey - используем стандартный OpenAI API (облачная модель),
        // иначе выбрасываем исключение
        const openAiApiUrl = getOpenAiApiUrl();
        let baseUrl: string;
        if (config.baseUrl || config.localUrl) {
            baseUrl = config.baseUrl || config.localUrl!;
        } else if (config.apiKey && config.apiKey.trim() && config.apiKey !== ConfigReader.getApiKeyNotNeeded()) {
            baseUrl = openAiApiUrl;
        } else {
            throw new ConfigError('baseUrl или localUrl должны быть указаны в настройках, либо должен быть указан apiKey для использования облачного API');
        }
        
        const model = ConfigValidator.validateModel(config.model);
        // Для локального API apiKey может быть не нужен
        // Для облачного API apiKey обязателен
        if (baseUrl === openAiApiUrl) {
            if (!config.apiKey || config.apiKey.trim().length === 0 || config.apiKey === ConfigReader.getApiKeyNotNeeded()) {
                throw new ConfigError('apiKey не указан в настройках для облачного API');
            }
        }
        const apiKey = config.apiKey || ConfigReader.getApiKeyNotNeeded();
        const timeout = ConfigValidator.validateTimeout(config.timeout);

        // Используем OpenAI-совместимый формат
        const url = `${baseUrl}/v1/chat/completions`;

        const messages = config.systemPrompt ? [
            {
                role: 'system',
                content: config.systemPrompt
            },
            {
                role: 'user',
                content: prompt
            }
        ] : [
            {
                role: 'user',
                content: prompt
            }
        ];

        const requestBody = {
            model: model,
            messages: messages,
            temperature: ConfigValidator.validateTemperature(config.temperature),
            max_tokens: ConfigValidator.validateMaxTokens(config.maxTokens),
            stream: false
        };

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            };

            // Добавляем API ключ только если он указан и не пустой
            if (apiKey && apiKey.trim() && apiKey !== ConfigReader.getApiKeyNotNeeded()) {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody),
                signal: controller.signal as any
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`OpenAI-compatible API error (${response.status}): ${errorText}`);
            }

            const data = await response.json();
            
            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                throw new Error('OpenAI-compatible API вернул неожиданный формат ответа');
            }

            const content = data.choices[0].message.content;
            if (!content) {
                throw new Error('OpenAI-compatible API вернул пустой ответ');
            }

            return content.trim();
        } catch (error) {
            Logger.error('Ошибка генерации через OpenAI-compatible API', error as Error, { url, model });
            ApiErrorHandler.handle(error, 'OpenAI-compatible API', timeout, baseUrl);
            throw error;
        }
    }

    /**
     * Потоковая генерация кода через OpenAI-совместимый API
     * Автоматически определяет локальную или облачную модель на основе baseUrl и apiKey
     */
    async *stream(prompt: string, config: LLMConfig): AsyncIterable<string> {
        // Определяем URL: если указан baseUrl/localUrl - используем его (локальная модель),
        // иначе если есть apiKey - используем стандартный OpenAI API (облачная модель),
        // иначе выбрасываем исключение
        const openAiApiUrl = getOpenAiApiUrl();
        let baseUrl: string;
        if (config.baseUrl || config.localUrl) {
            baseUrl = config.baseUrl || config.localUrl!;
        } else if (config.apiKey && config.apiKey.trim() && config.apiKey !== ConfigReader.getApiKeyNotNeeded()) {
            baseUrl = openAiApiUrl;
        } else {
            throw new ConfigError('baseUrl или localUrl должны быть указаны в настройках, либо должен быть указан apiKey для использования облачного API');
        }
        
        const model = ConfigValidator.validateModel(config.model);
        // Для локального API apiKey может быть не нужен
        // Для облачного API apiKey обязателен
        if (baseUrl === openAiApiUrl) {
            if (!config.apiKey || config.apiKey.trim().length === 0 || config.apiKey === ConfigReader.getApiKeyNotNeeded()) {
                throw new ConfigError('apiKey не указан в настройках для облачного API');
            }
        }
        const apiKey = config.apiKey || ConfigReader.getApiKeyNotNeeded();
        const timeout = ConfigValidator.validateTimeout(config.timeout);

        const url = `${baseUrl}/v1/chat/completions`;

        const messages = config.systemPrompt ? [
            {
                role: 'system',
                content: config.systemPrompt
            },
            {
                role: 'user',
                content: prompt
            }
        ] : [
            {
                role: 'user',
                content: prompt
            }
        ];

        const requestBody = {
            model: model,
            messages: messages,
            temperature: ConfigValidator.validateTemperature(config.temperature),
            max_tokens: ConfigValidator.validateMaxTokens(config.maxTokens),
            stream: true
        };

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
                body: JSON.stringify(requestBody),
                signal: controller.signal as any
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`OpenAI-compatible API error (${response.status}): ${errorText}`);
            }

            if (!response.body) {
                throw new Error('OpenAI-compatible API не вернул поток данных');
            }

            // В Node.js с node-fetch response.body - это Node.js stream
            const stream = response.body as any;
            let buffer = '';

            // Преобразуем Node.js stream в async iterator
            const chunks: Buffer[] = [];
            let streamEnded = false;
            let streamError: Error | null = null;

            stream.on('data', (chunk: Buffer) => {
                chunks.push(chunk);
            });

            stream.on('end', () => {
                streamEnded = true;
            });

            stream.on('error', (err: Error) => {
                streamError = err;
            });

            // Читаем чанки из потока
            while (!streamEnded || chunks.length > 0) {
                if (streamError) {
                    throw streamError;
                }

                if (chunks.length > 0) {
                    const chunk = chunks.shift()!;
                    buffer += chunk.toString('utf-8');
                    
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        const dataPrefix = ConfigReader.getSseDataPrefix();
                        if (line.trim() && line.startsWith(dataPrefix)) {
                            const dataStr = line.slice(dataPrefix.length);
                            if (dataStr === ConfigReader.getSseDoneMarker()) {
                                continue;
                            }
                            try {
                                const data = JSON.parse(dataStr);
                                if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
                                    yield data.choices[0].delta.content;
                                }
                            } catch {
                                // Игнорируем некорректные JSON строки
                            }
                        }
                    }
                } else {
                    // Ждем новые данные
                    await new Promise(resolve => setTimeout(resolve, ConfigReader.getStreamPollingDelay()));
                }
            }

            // Обрабатываем оставшийся буфер
            const dataPrefix = ConfigReader.getSseDataPrefix();
            if (buffer.trim() && buffer.startsWith(dataPrefix)) {
                const dataStr = buffer.slice(dataPrefix.length);
                if (dataStr !== ConfigReader.getSseDoneMarker()) {
                    try {
                        const data = JSON.parse(dataStr);
                        if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
                            yield data.choices[0].delta.content;
                        }
                    } catch {
                        // Игнорируем некорректный JSON
                    }
                }
            }
        } catch (error) {
            Logger.error('Ошибка потоковой генерации через OpenAI-compatible API', error as Error, { url, model });
            ApiErrorHandler.handle(error, 'OpenAI-compatible API', timeout, baseUrl);
            throw error;
        }
    }

    /**
     * Проверка доступности OpenAI-совместимого API
     */
    async checkAvailability(baseUrl: string): Promise<boolean> {
        try {
            // Пробуем health endpoint
            const healthUrl = `${baseUrl}/health`;
            try {
                const healthController = new AbortController();
                const healthTimeout = setTimeout(() => healthController.abort(), ConfigReader.getAvailabilityCheckTimeoutLocalApi());
                
                const response = await fetch(healthUrl, {
                    method: 'GET',
                    signal: healthController.signal as any
                });
                
                clearTimeout(healthTimeout);
                if (response.ok) {
                    return true;
                }
            } catch {
                // Игнорируем ошибку, пробуем models endpoint
            }

            // Пробуем models endpoint
            const modelsUrl = `${baseUrl}/v1/models`;
            const modelsController = new AbortController();
            const modelsTimeout = setTimeout(() => modelsController.abort(), ConfigReader.getAvailabilityCheckTimeoutLocalApi());
            
            const response = await fetch(modelsUrl, {
                method: 'GET',
                signal: modelsController.signal as any
            });
            
            clearTimeout(modelsTimeout);
            return response.ok;
        } catch {
            return false;
        }
    }

    /**
     * Получение списка доступных моделей
     */
    async listModels(baseUrl: string, apiKey?: string): Promise<string[]> {
        try {
            const modelsUrl = `${baseUrl}/v1/models`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), ConfigReader.getAvailabilityCheckTimeoutLocalApi());
            
            const headers: Record<string, string> = {};
            if (apiKey && apiKey.trim() && apiKey !== ConfigReader.getApiKeyNotNeeded()) {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }
            
            const response = await fetch(modelsUrl, {
                method: 'GET',
                headers: headers,
                signal: controller.signal as any
            });

            clearTimeout(timeout);

            if (!response.ok) {
                return [];
            }

            const data = await response.json();
            if (data.data && Array.isArray(data.data)) {
                return data.data.map((model: any) => model.id || model.name);
            }

            return [];
        } catch {
            return [];
        }
    }
}

