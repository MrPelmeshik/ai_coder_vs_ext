import { LLMConfig } from '../services/llmService';
import { ConfigError } from '../errors';

/**
 * Валидация конфигурации
 */
export class ConfigValidator {
    /**
     * Валидация конфигурации LLM
     */
    static validateLLMConfig(config: LLMConfig): void {
        if (!config.provider) {
            throw new ConfigError('Провайдер LLM не указан');
        }

        if (!config.model) {
            throw new ConfigError('Модель LLM не указана');
        }

        if (config.temperature < 0 || config.temperature > 2) {
            throw new ConfigError('Температура должна быть от 0 до 2');
        }

        if (config.maxTokens < 100 || config.maxTokens > 8000) {
            throw new ConfigError('maxTokens должен быть от 100 до 8000');
        }

        if (config.timeout && (config.timeout < 5000 || config.timeout > 300000)) {
            throw new ConfigError('timeout должен быть от 5000 до 300000 мс');
        }

        if (config.provider === 'openai' || config.provider === 'anthropic') {
            if (!config.apiKey || config.apiKey.trim().length === 0) {
                throw new ConfigError('API ключ не указан для облачного провайдера');
            }
        }
    }

    /**
     * Валидация конфигурации эмбеддингов
     */
    static validateEmbeddingConfig(config: LLMConfig): void {
        if (!config.embedderModel || config.embedderModel.trim().length === 0) {
            throw new ConfigError(
                'Модель эмбеддинга не настроена. Укажите модель в настройках.'
            );
        }
    }
}

