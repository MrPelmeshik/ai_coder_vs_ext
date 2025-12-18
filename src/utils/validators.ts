import { LLMConfig } from '../services/llmService';
import { ConfigError } from '../errors';
import { ConfigReader } from './configReader';
import { CONFIG_KEYS } from '../constants';
import * as vscode from 'vscode';

/**
 * Валидация конфигурации
 * Все граничные значения берутся из настроек VS Code
 */
export class ConfigValidator {
    /**
     * Получение граничных значений для валидации из настроек
     */
    private static _getValidationLimits() {
        const config = vscode.workspace.getConfiguration('aiCoder');
        return {
            temperatureMin: config.get<number>(CONFIG_KEYS.VALIDATION.TEMPERATURE_MIN) ?? 0,
            temperatureMax: config.get<number>(CONFIG_KEYS.VALIDATION.TEMPERATURE_MAX) ?? 2,
            maxTokensMin: config.get<number>(CONFIG_KEYS.VALIDATION.MAX_TOKENS_MIN) ?? 100,
            maxTokensMax: config.get<number>(CONFIG_KEYS.VALIDATION.MAX_TOKENS_MAX) ?? 8000,
            timeoutMin: config.get<number>(CONFIG_KEYS.VALIDATION.TIMEOUT_MIN) ?? 5000,
            timeoutMax: config.get<number>(CONFIG_KEYS.VALIDATION.TIMEOUT_MAX) ?? 300000
        };
    }

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

        // Получаем граничные значения из настроек
        const limits = this._getValidationLimits();

        // Валидация температуры (значение должно быть из настроек)
        if (config.temperature === undefined || config.temperature === null) {
            throw new ConfigError('Температура не задана в настройках');
        }
        if (config.temperature < limits.temperatureMin || config.temperature > limits.temperatureMax) {
            throw new ConfigError(`Температура должна быть от ${limits.temperatureMin} до ${limits.temperatureMax}`);
        }

        // Валидация maxTokens (значение должно быть из настроек)
        if (config.maxTokens === undefined || config.maxTokens === null) {
            throw new ConfigError('maxTokens не задан в настройках');
        }
        if (config.maxTokens < limits.maxTokensMin || config.maxTokens > limits.maxTokensMax) {
            throw new ConfigError(`maxTokens должен быть от ${limits.maxTokensMin} до ${limits.maxTokensMax}`);
        }

        // Валидация timeout (значение должно быть из настроек)
        if (config.timeout === undefined || config.timeout === null) {
            throw new ConfigError('timeout не задан в настройках');
        }
        if (config.timeout < limits.timeoutMin || config.timeout > limits.timeoutMax) {
            throw new ConfigError(`timeout должен быть от ${limits.timeoutMin} до ${limits.timeoutMax} мс`);
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
     * Бросает исключение, если модель не указана
     */
    static validateModel(model: string | undefined): string {
        if (!model || model.trim().length === 0) {
            throw new ConfigError('Модель LLM не указана в настройках');
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
        const limits = this._getValidationLimits();
        if (temperature < limits.temperatureMin || temperature > limits.temperatureMax) {
            throw new ConfigError(`Температура должна быть от ${limits.temperatureMin} до ${limits.temperatureMax}`);
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
        const limits = this._getValidationLimits();
        if (maxTokens < limits.maxTokensMin || maxTokens > limits.maxTokensMax) {
            throw new ConfigError(`maxTokens должен быть от ${limits.maxTokensMin} до ${limits.maxTokensMax}`);
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
        const limits = this._getValidationLimits();
        if (timeout < limits.timeoutMin || timeout > limits.timeoutMax) {
            throw new ConfigError(`timeout должен быть от ${limits.timeoutMin} до ${limits.timeoutMax} мс`);
        }
        return timeout;
    }
}

