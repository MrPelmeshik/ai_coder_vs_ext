import { LLMProvider, LLMConfig } from '../services/llmService';
import fetch from 'node-fetch';
import { CONFIG_KEYS } from '../constants';
import { ApiErrorHandler } from '../utils/errorHandler';
import { Logger } from '../utils/logger';
import { ConfigValidator } from '../utils/validators';
import { ConfigReader } from '../utils/configReader';
import * as vscode from 'vscode';

/**
 * Провайдер для работы с локальными API (LM Studio, локальные серверы и т.д.)
 * 
 * Поддерживает разные типы API: OpenAI-совместимый и Ollama-совместимый
 */
export class LocalApiProvider implements LLMProvider {
    /**
     * Генерация кода через локальный API
     */
    async generate(prompt: string, config: LLMConfig): Promise<string> {
        const apiType = config.apiType || ConfigReader.getApiTypeOpenai();
        
        if (apiType === ConfigReader.getApiTypeOllama()) {
            return await this._generateOllamaLike(prompt, config);
        } else {
            return await this._generateOpenAILike(prompt, config);
        }
    }

    /**
     * Генерация через OpenAI-совместимый API
     */
    private async _generateOpenAILike(prompt: string, config: LLMConfig): Promise<string> {
        const vscodeConfig = vscode.workspace.getConfiguration('aiCoder');
        const defaultLocalApiUrl = vscodeConfig.get<string>(CONFIG_KEYS.LLM.LOCAL_URL)!;
        const baseUrl = config.baseUrl || config.localUrl || defaultLocalApiUrl;
        const model = ConfigValidator.validateModel(config.model, ConfigReader.getDefaultModelLocalApi());
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
                throw new Error(`Local API error (${response.status}): ${errorText}`);
            }

            const data = await response.json();
            
            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                throw new Error('Локальный API вернул неожиданный формат ответа');
            }

            const content = data.choices[0].message.content;
            if (!content) {
                throw new Error('Локальный API вернул пустой ответ');
            }

            return content.trim();
        } catch (error) {
            Logger.error('Ошибка генерации через локальный API', error as Error, { url, model });
            ApiErrorHandler.handle(error, 'локальный API', timeout, baseUrl);
            throw error;
        }
    }

    /**
     * Генерация через Ollama-совместимый API
     */
    private async _generateOllamaLike(prompt: string, config: LLMConfig): Promise<string> {
        const vscodeConfig = vscode.workspace.getConfiguration('aiCoder');
        const defaultOllamaUrl = vscodeConfig.get<string>(CONFIG_KEYS.LLM.LOCAL_URL)!;
        const baseUrl = config.baseUrl || config.localUrl || defaultOllamaUrl;
        const model = ConfigValidator.validateModel(config.model, ConfigReader.getDefaultModelOllama());
        const timeout = ConfigValidator.validateTimeout(config.timeout);

        // Используем Ollama-совместимый формат
        const url = `${baseUrl}/api/generate`;

        const systemPrompt = config.systemPrompt || '';
        const fullPrompt = systemPrompt 
            ? ConfigReader.formatOllamaPromptWithSystem(systemPrompt, prompt)
            : ConfigReader.formatOllamaPromptWithoutSystem(prompt);

        const requestBody = {
            model: model,
            prompt: fullPrompt,
            stream: false,
            options: {
                temperature: ConfigValidator.validateTemperature(config.temperature),
                num_predict: ConfigValidator.validateMaxTokens(config.maxTokens)
            }
        };

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal as any
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Ollama-like API error (${response.status}): ${errorText}`);
            }

            const data = await response.json();
            
            if (!data.response) {
                throw new Error('Ollama-like API вернул пустой ответ');
            }

            return data.response.trim();
        } catch (error) {
            Logger.error('Ошибка генерации через Ollama-like API', error as Error, { url, model });
            ApiErrorHandler.handle(error, 'Ollama-like API', timeout, baseUrl);
            throw error;
        }
    }

    /**
     * Потоковая генерация кода через локальный API
     */
    async *stream(prompt: string, config: LLMConfig): AsyncIterable<string> {
        const apiType = config.apiType || ConfigReader.getApiTypeOpenai();
        
        if (apiType === ConfigReader.getApiTypeOllama()) {
            yield* this._streamOllamaLike(prompt, config);
        } else {
            yield* this._streamOpenAILike(prompt, config);
        }
    }

    /**
     * Потоковая генерация через OpenAI-совместимый API
     */
    private async *_streamOpenAILike(prompt: string, config: LLMConfig): AsyncIterable<string> {
        const vscodeConfig = vscode.workspace.getConfiguration('aiCoder');
        const defaultLocalApiUrl = vscodeConfig.get<string>(CONFIG_KEYS.LLM.LOCAL_URL)!;
        const baseUrl = config.baseUrl || config.localUrl || defaultLocalApiUrl;
        const model = ConfigValidator.validateModel(config.model, ConfigReader.getDefaultModelLocalApi());
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
                throw new Error(`Local API error (${response.status}): ${errorText}`);
            }

            if (!response.body) {
                throw new Error('Локальный API не вернул поток данных');
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
            Logger.error('Ошибка потоковой генерации через локальный API', error as Error, { url, model });
            ApiErrorHandler.handle(error, 'локальный API', timeout, baseUrl);
            throw error;
        }
    }

    /**
     * Потоковая генерация через Ollama-совместимый API
     */
    private async *_streamOllamaLike(prompt: string, config: LLMConfig): AsyncIterable<string> {
        const vscodeConfig = vscode.workspace.getConfiguration('aiCoder');
        const defaultOllamaUrl = vscodeConfig.get<string>(CONFIG_KEYS.LLM.LOCAL_URL)!;
        const baseUrl = config.baseUrl || config.localUrl || defaultOllamaUrl;
        const model = ConfigValidator.validateModel(config.model, ConfigReader.getDefaultModelOllama());
        const timeout = ConfigValidator.validateTimeout(config.timeout);

        const url = `${baseUrl}/api/generate`;

        const systemPrompt = config.systemPrompt || '';
        const fullPrompt = systemPrompt 
            ? ConfigReader.formatOllamaPromptWithSystem(systemPrompt, prompt)
            : ConfigReader.formatOllamaPromptWithoutSystem(prompt);

        const requestBody = {
            model: model,
            prompt: fullPrompt,
            stream: true,
            options: {
                temperature: ConfigValidator.validateTemperature(config.temperature),
                num_predict: ConfigValidator.validateMaxTokens(config.maxTokens)
            }
        };

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal as any
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Ollama-like API error (${response.status}): ${errorText}`);
            }

            if (!response.body) {
                throw new Error('Ollama-like API не вернул поток данных');
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
                        if (line.trim()) {
                            try {
                                const data = JSON.parse(line);
                                if (data.response) {
                                    yield data.response;
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
            if (buffer.trim()) {
                try {
                    const data = JSON.parse(buffer);
                    if (data.response) {
                        yield data.response;
                    }
                } catch {
                    // Игнорируем некорректный JSON
                }
            }
        } catch (error) {
            Logger.error('Ошибка потоковой генерации через Ollama-like API', error as Error, { url, model });
            ApiErrorHandler.handle(error, 'Ollama-like API', timeout, baseUrl);
            throw error;
        }
    }

    /**
     * Проверка доступности локального API
     */
    async checkAvailability(baseUrl: string, apiType?: string): Promise<boolean> {
        const type = apiType || ConfigReader.getApiTypeOpenai();
        
        try {
            if (type === ConfigReader.getApiTypeOllama()) {
                // Для Ollama проверяем /api/tags
                const tagsUrl = `${baseUrl}/api/tags`;
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), ConfigReader.getAvailabilityCheckTimeoutOllama());
                
                try {
                    const response = await fetch(tagsUrl, {
                        method: 'GET',
                        signal: controller.signal as any
                    });
                    clearTimeout(timeout);
                    return response.ok;
                } catch {
                    clearTimeout(timeout);
                    return false;
                }
            } else {
                // Для OpenAI проверяем /v1/models или /health
                const healthUrl = `${baseUrl}/health`;
                const modelsUrl = `${baseUrl}/v1/models`;
                
                // Пробуем health endpoint
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
                const modelsController = new AbortController();
                const modelsTimeout = setTimeout(() => modelsController.abort(), ConfigReader.getAvailabilityCheckTimeoutLocalApi());
                
                const response = await fetch(modelsUrl, {
                    method: 'GET',
                    signal: modelsController.signal as any
                });
                
                clearTimeout(modelsTimeout);
                return response.ok;
            }
        } catch {
            return false;
        }
    }
}

