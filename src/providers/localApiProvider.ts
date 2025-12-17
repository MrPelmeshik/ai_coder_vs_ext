import { LLMProvider, LLMConfig } from '../services/llmService';
import fetch from 'node-fetch';

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
        const apiType = config.apiType || 'openai';
        
        if (apiType === 'ollama') {
            return await this._generateOllamaLike(prompt, config);
        } else {
            return await this._generateOpenAILike(prompt, config);
        }
    }

    /**
     * Генерация через OpenAI-совместимый API
     */
    private async _generateOpenAILike(prompt: string, config: LLMConfig): Promise<string> {
        const baseUrl = config.baseUrl || config.localUrl || 'http://localhost:1234';
        const model = config.model || 'local-model';
        const apiKey = config.apiKey || 'not-needed';
        const timeout = config.timeout || 30000;

        // Используем OpenAI-совместимый формат
        const url = `${baseUrl}/v1/chat/completions`;

        const messages = [
            {
                role: 'system',
                content: 'You are a helpful coding assistant. Generate clean, well-commented code based on the user\'s request.'
            },
            {
                role: 'user',
                content: prompt
            }
        ];

        const requestBody = {
            model: model,
            messages: messages,
            temperature: config.temperature || 0.7,
            max_tokens: config.maxTokens || 2000,
            stream: false
        };

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            };

            // Добавляем API ключ только если он указан и не пустой
            if (apiKey && apiKey.trim() && apiKey !== 'not-needed') {
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
            if (error instanceof Error) {
                if (error.name === 'AbortError') {
                    throw new Error(`Таймаут запроса к локальному API (${timeout}ms). Убедитесь, что сервер запущен и доступен по адресу ${baseUrl}`);
                }
                if (error.message.includes('fetch')) {
                    throw new Error(`Не удалось подключиться к локальному API по адресу ${baseUrl}. Убедитесь, что сервер запущен.`);
                }
                throw error;
            }
            throw new Error('Неизвестная ошибка при обращении к локальному API');
        }
    }

    /**
     * Генерация через Ollama-совместимый API
     */
    private async _generateOllamaLike(prompt: string, config: LLMConfig): Promise<string> {
        const baseUrl = config.baseUrl || config.localUrl || 'http://localhost:11434';
        const model = config.model || 'llama2';
        const timeout = config.timeout || 30000;

        // Используем Ollama-совместимый формат
        const url = `${baseUrl}/api/generate`;

        const systemPrompt = `You are a helpful coding assistant. Generate clean, well-commented code based on the user's request.`;
        const fullPrompt = `${systemPrompt}\n\nUser request: ${prompt}\n\nCode:`;

        const requestBody = {
            model: model,
            prompt: fullPrompt,
            stream: false,
            options: {
                temperature: config.temperature || 0.7,
                num_predict: config.maxTokens || 2000
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
            if (error instanceof Error) {
                if (error.name === 'AbortError') {
                    throw new Error(`Таймаут запроса к Ollama-like API (${timeout}ms). Убедитесь, что сервер запущен и доступен по адресу ${baseUrl}`);
                }
                if (error.message.includes('fetch')) {
                    throw new Error(`Не удалось подключиться к Ollama-like API по адресу ${baseUrl}. Убедитесь, что сервер запущен.`);
                }
                throw error;
            }
            throw new Error('Неизвестная ошибка при обращении к Ollama-like API');
        }
    }

    /**
     * Проверка доступности локального API
     */
    async checkAvailability(baseUrl: string, apiType?: string): Promise<boolean> {
        const type = apiType || 'openai';
        
        try {
            if (type === 'ollama') {
                // Для Ollama проверяем /api/tags
                const tagsUrl = `${baseUrl}/api/tags`;
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 3000);
                
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
                    const healthTimeout = setTimeout(() => healthController.abort(), 3000);
                    
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
                const modelsTimeout = setTimeout(() => modelsController.abort(), 3000);
                
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

