import { LLMConfig } from '../services/llmService';
import { ConfigError } from '../errors';
import { ConfigReader } from './configReader';
import * as vscode from 'vscode';

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

        // Валидация температуры (значение должно быть из настроек)
        if (config.temperature === undefined || config.temperature === null) {
            throw new ConfigError('Температура не задана в настройках');
        }
        if (config.temperature < 0 || config.temperature > 2) {
            throw new ConfigError('Температура должна быть от 0 до 2');
        }

        // Валидация maxTokens (значение должно быть из настроек)
        if (config.maxTokens === undefined || config.maxTokens === null) {
            throw new ConfigError('maxTokens не задан в настройках');
        }
        if (config.maxTokens < 100 || config.maxTokens > 8000) {
            throw new ConfigError('maxTokens должен быть от 100 до 8000');
        }

        // Валидация timeout (значение должно быть из настроек)
        if (config.timeout === undefined || config.timeout === null) {
            throw new ConfigError('timeout не задан в настройках');
        }
        if (config.timeout < 5000 || config.timeout > 300000) {
            throw new ConfigError('timeout должен быть от 5000 до 300000 мс');
        }

        // Валидация URL
        if (config.baseUrl && !this.isValidUrl(config.baseUrl)) {
            throw new ConfigError('Некорректный baseUrl');
        }

        if (config.localUrl && !this.isValidUrl(config.localUrl)) {
            throw new ConfigError('Некорректный localUrl');
        }

        // Валидация apiType
        if (config.apiType && !this.isValidApiType(config.apiType)) {
            throw new ConfigError(`Некорректный apiType. Допустимые значения: ${ConfigReader.getApiTypeOpenai()}, ${ConfigReader.getApiTypeOllama()}`);
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

    /**
     * Валидация URL
     */
    static isValidUrl(url: string): boolean {
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
            return false;
        }
    }

    /**
     * Валидация типа API
     */
    static isValidApiType(apiType: string): boolean {
        return apiType === ConfigReader.getApiTypeOpenai() || apiType === ConfigReader.getApiTypeOllama();
    }

    /**
     * Валидация модели (базовая проверка на непустую строку)
     */
    static validateModel(model: string | undefined, defaultModel: string): string {
        if (!model || model.trim().length === 0) {
            return defaultModel;
        }
        return model.trim();
    }

    /**
     * Валидация температуры (значение должно быть из настроек)
     */
    static validateTemperature(temperature: number | undefined): number {
        if (temperature === undefined || temperature === null) {
            throw new ConfigError('Температура не задана в настройках');
        }
        if (temperature < 0 || temperature > 2) {
            throw new ConfigError('Температура должна быть от 0 до 2');
        }
        return temperature;
    }

    /**
     * Валидация maxTokens (значение должно быть из настроек)
     */
    static validateMaxTokens(maxTokens: number | undefined): number {
        if (maxTokens === undefined || maxTokens === null) {
            throw new ConfigError('maxTokens не задан в настройках');
        }
        if (maxTokens < 100 || maxTokens > 8000) {
            throw new ConfigError('maxTokens должен быть от 100 до 8000');
        }
        return maxTokens;
    }

    /**
     * Валидация timeout (значение должно быть из настроек)
     */
    static validateTimeout(timeout: number | undefined): number {
        if (timeout === undefined || timeout === null) {
            throw new ConfigError('timeout не задан в настройках');
        }
        if (timeout < 5000 || timeout > 300000) {
            throw new ConfigError('timeout должен быть от 5000 до 300000 мс');
        }
        return timeout;
    }
}

