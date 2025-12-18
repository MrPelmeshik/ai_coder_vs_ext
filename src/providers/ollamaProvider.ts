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
 * Провайдер для работы с Ollama (локальные модели)
 * 
 * Ollama - это инструмент для запуска больших языковых моделей локально.
 * Поддерживает множество моделей: llama2, codellama, mistral, phi и др.
 */
export class OllamaProvider implements LLMProvider {
    /**
     * Генерация кода через Ollama API
     */
    async generate(prompt: string, config: LLMConfig): Promise<string> {
        if (!config.localUrl) {
            throw new ConfigError('localUrl не указан в настройках для провайдера ollama');
        }
        const localUrl = config.localUrl;
        const model = ConfigValidator.validateModel(config.model);
        const timeout = ConfigValidator.validateTimeout(config.timeout);

        // Формируем URL для Ollama API
        const url = `${localUrl}/api/generate`;

        // Подготовка промпта для генерации кода
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
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Ollama API error (${response.status}): ${errorText}`);
            }

            const data = await response.json();
            
            if (!data.response) {
                throw new Error('Ollama API вернул пустой ответ');
            }

            return data.response.trim();
        } catch (error) {
            Logger.error('Ошибка генерации через Ollama', error as Error, { url, model });
            ApiErrorHandler.handle(error, 'Ollama', timeout, localUrl);
            throw error;
        }
    }

    /**
     * Потоковая генерация кода через Ollama API
     */
    async *stream(prompt: string, config: LLMConfig): AsyncIterable<string> {
        if (!config.localUrl) {
            throw new ConfigError('localUrl не указан в настройках для провайдера ollama');
        }
        const localUrl = config.localUrl;
        const model = ConfigValidator.validateModel(config.model);
        const timeout = ConfigValidator.validateTimeout(config.timeout);

        const url = `${localUrl}/api/generate`;

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
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Ollama API error (${response.status}): ${errorText}`);
            }

            if (!response.body) {
                throw new Error('Ollama API не вернул поток данных');
            }

            // В Node.js с node-fetch response.body - это Node.js stream
            // Используем события для чтения потока
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
            Logger.error('Ошибка потоковой генерации через Ollama', error as Error, { url, model });
            ApiErrorHandler.handle(error, 'Ollama', timeout, localUrl);
            throw error;
        }
    }

    /**
     * Проверка доступности Ollama сервера
     */
    async checkAvailability(localUrl: string): Promise<boolean> {
        try {
            const url = `${localUrl}/api/tags`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), ConfigReader.getAvailabilityCheckTimeoutOllama());
            
            const response = await fetch(url, {
                method: 'GET',
                signal: controller.signal as any
            });
            
            clearTimeout(timeoutId);
            return response.ok;
        } catch {
            return false;
        }
    }

    /**
     * Получение списка доступных моделей
     */
    async listModels(localUrl: string): Promise<string[]> {
        try {
            const url = `${localUrl}/api/tags`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), ConfigReader.getAvailabilityCheckTimeoutOllama());
            
            const response = await fetch(url, {
                method: 'GET',
                signal: controller.signal as any
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                return [];
            }

            const data = await response.json();
            if (data.models && Array.isArray(data.models)) {
                return data.models.map((model: any) => model.name || model.model);
            }

            return [];
        } catch {
            return [];
        }
    }
}

