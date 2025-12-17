import { LLMProvider, LLMConfig } from '../services/llmService';
import fetch from 'node-fetch';

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
        const localUrl = config.localUrl || 'http://localhost:11434';
        const model = config.model || 'llama2';
        const timeout = config.timeout || 30000;

        // Формируем URL для Ollama API
        const url = `${localUrl}/api/generate`;

        // Подготовка промпта для генерации кода
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
            if (error instanceof Error) {
                if (error.name === 'AbortError') {
                    throw new Error(`Таймаут запроса к Ollama (${timeout}ms). Убедитесь, что Ollama запущен и доступен по адресу ${localUrl}`);
                }
                if (error.message.includes('fetch')) {
                    throw new Error(`Не удалось подключиться к Ollama по адресу ${localUrl}. Убедитесь, что Ollama запущен.`);
                }
                throw error;
            }
            throw new Error('Неизвестная ошибка при обращении к Ollama');
        }
    }

    /**
     * Потоковая генерация кода через Ollama API
     */
    async *stream(prompt: string, config: LLMConfig): AsyncIterable<string> {
        const localUrl = config.localUrl || 'http://localhost:11434';
        const model = config.model || 'llama2';
        const timeout = config.timeout || 30000;

        const url = `${localUrl}/api/generate`;

        const systemPrompt = `You are a helpful coding assistant. Generate clean, well-commented code based on the user's request.`;
        const fullPrompt = `${systemPrompt}\n\nUser request: ${prompt}\n\nCode:`;

        const requestBody = {
            model: model,
            prompt: fullPrompt,
            stream: true,
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
                    await new Promise(resolve => setTimeout(resolve, 10));
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
            if (error instanceof Error) {
                if (error.name === 'AbortError') {
                    throw new Error(`Таймаут запроса к Ollama (${timeout}ms). Убедитесь, что Ollama запущен и доступен по адресу ${localUrl}`);
                }
                if (error.message.includes('fetch')) {
                    throw new Error(`Не удалось подключиться к Ollama по адресу ${localUrl}. Убедитесь, что Ollama запущен.`);
                }
                throw error;
            }
            throw new Error('Неизвестная ошибка при обращении к Ollama');
        }
    }

    /**
     * Проверка доступности Ollama сервера
     */
    async checkAvailability(localUrl: string): Promise<boolean> {
        try {
            const url = `${localUrl}/api/tags`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
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
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
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

