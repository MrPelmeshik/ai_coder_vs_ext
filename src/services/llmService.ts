import * as vscode from 'vscode';
import { OllamaProvider } from '../providers/ollamaProvider';
import { OpenAiCompatibleProvider } from '../providers/openAiCompatibleProvider';
import { LLMConfig, LLMProvider } from '../types/llm';

import { STORAGE_KEYS, CONFIG_KEYS, API_TYPES } from '../constants';
import { ConfigError } from '../errors';

// Реэкспорт типов для обратной совместимости импортов
export type { LLMConfig, LLMProvider } from '../types/llm';

const API_KEY_SECRET_KEY = STORAGE_KEYS.API_KEY;

/**
 * Сервис для работы с LLM (Large Language Models)
 * 
 * Этот класс представляет архитектурную основу для будущей интеграции
 * различных LLM провайдеров (OpenAI, Anthropic, локальные модели и т.д.)
 */
export class LLMService {
    private _context: vscode.ExtensionContext;
    private _config: LLMConfig;
    private _configChangeListener: vscode.Disposable | undefined;
    private _providers: Map<string, LLMProvider>;

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
        this._config = this._loadConfigSync();
        
        // Инициализация провайдеров
        this._providers = new Map();
        this._providers.set('ollama', new OllamaProvider());
        // OpenAI-совместимый провайдер (работает с локальными и облачными моделями автоматически)
        this._providers.set('openai', new OpenAiCompatibleProvider());
        
        // Асинхронная загрузка конфигурации с API ключом
        this._loadConfig().then(config => {
            this._config = config;
        });
        
        // Подписка на изменения конфигурации
        this._configChangeListener = vscode.workspace.onDidChangeConfiguration(async (e) => {
            if (e.affectsConfiguration('aiCoder')) {
                await this._reloadConfig();
            }
        });
    }

    /**
     * Потоковая генерация кода на основе промпта
     * 
     * @param prompt - Текстовый запрос пользователя
     * @returns Асинхронный итератор для получения частей ответа
     */
    public async *streamGenerateCode(prompt: string): AsyncIterable<string> {
        const config = await this.getConfig();
        const provider = this._providers.get(config.provider);
        
        if (!provider) {
            // Если провайдер не найден, пробуем использовать openai как fallback
            if (config.provider === 'anthropic') {
                // Для облачных провайдеров пока используем обычную генерацию
                const result = await this.generateCode(prompt);
                yield result;
                return;
            } else {
                const openaiProvider = this._providers.get('openai');
                if (openaiProvider && openaiProvider.stream) {
                    yield* openaiProvider.stream(prompt, config);
                    return;
                }
            }
        }
        
        if (provider && provider.stream) {
            yield* provider.stream(prompt, config);
        } else {
            // Если streaming не поддерживается, используем обычную генерацию
            const result = await this.generateCode(prompt);
            yield result;
        }
    }

    /**
     * Генерация кода на основе промпта
     * 
     * @param prompt - Текстовый запрос пользователя
     * @returns Сгенерированный код
     */
    public async generateCode(prompt: string): Promise<string> {
        // Загружаем актуальную конфигурацию
        const config = await this.getConfig();
        
        // Получаем провайдер
        const provider = this._providers.get(config.provider);
        
        if (!provider) {
            // Если провайдер не найден, пробуем использовать openai как fallback
            if (config.provider === 'anthropic') {
                // Для облачных провайдеров пока используем заглушку
                return this._mockGenerateCode(prompt);
            } else {
                // Для неизвестных провайдеров пробуем openai
                const openaiProvider = this._providers.get('openai');
                if (openaiProvider) {
                    return await openaiProvider.generate(prompt, config);
                }
                return this._mockGenerateCode(prompt);
            }
        }
        
        try {
            return await provider.generate(prompt, config);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
            throw new Error(`Ошибка генерации через ${config.provider}: ${errorMessage}`);
        }
    }

    /**
     * Чтение и валидация обязательных полей конфигурации из VS Code Configuration API.
     * Общая логика для синхронной и асинхронной загрузки.
     */
    private _readConfigFields(): Omit<LLMConfig, 'apiKey'> {
        const config = vscode.workspace.getConfiguration('aiCoder');
        
        const provider = config.get<string>(CONFIG_KEYS.LLM.PROVIDER);
        if (!provider) {
            throw new ConfigError('Провайдер LLM не указан в настройках');
        }
        
        const model = config.get<string>(CONFIG_KEYS.LLM.MODEL);
        if (!model) {
            throw new ConfigError('Модель LLM не указана в настройках');
        }
        
        const temperature = config.get<number>(CONFIG_KEYS.LLM.TEMPERATURE);
        if (temperature === undefined || temperature === null) {
            throw new ConfigError('Температура не задана в настройках');
        }
        
        const maxTokens = config.get<number>(CONFIG_KEYS.LLM.MAX_TOKENS);
        if (maxTokens === undefined || maxTokens === null) {
            throw new ConfigError('maxTokens не задан в настройках');
        }
        
        const localUrl = config.get<string>(CONFIG_KEYS.LLM.LOCAL_URL);
        if (!localUrl) {
            throw new ConfigError('localUrl не указан в настройках');
        }
        
        const timeout = config.get<number>(CONFIG_KEYS.LLM.TIMEOUT);
        if (timeout === undefined || timeout === null) {
            throw new ConfigError('timeout не задан в настройках');
        }
        
        const apiType = config.get<string>(CONFIG_KEYS.LLM.API_TYPE);
        if (!apiType) {
            throw new ConfigError('apiType не указан в настройках');
        }
        
        return {
            provider,
            model,
            embedderModel: config.get<string>(CONFIG_KEYS.LLM.EMBEDDER_MODEL),
            temperature,
            maxTokens,
            baseUrl: config.get<string>(CONFIG_KEYS.LLM.BASE_URL),
            systemPrompt: config.get<string>(CONFIG_KEYS.LLM.SYSTEM_PROMPT),
            localUrl,
            timeout,
            apiType
        };
    }

    /**
     * Асинхронная загрузка конфигурации из настроек VS Code.
     * Включает загрузку API ключа из SecretStorage.
     */
    private async _loadConfig(): Promise<LLMConfig> {
        const fields = this._readConfigFields();
        const apiKey = await this._getApiKey();
        return { ...fields, apiKey: apiKey || '' };
    }

    /**
     * Синхронная загрузка конфигурации (для совместимости).
     * API ключ будет загружен позже асинхронно.
     */
    private _loadConfigSync(): LLMConfig {
        const fields = this._readConfigFields();
        return { ...fields, apiKey: '' };
    }

    /**
     * Перезагрузка конфигурации
     */
    private async _reloadConfig(): Promise<void> {
        this._config = await this._loadConfig();
    }

    /**
     * Получение API ключа из SecretStorage
     */
    private async _getApiKey(): Promise<string | undefined> {
        try {
            return await this._context.secrets.get(API_KEY_SECRET_KEY);
        } catch (error) {
            return undefined;
        }
    }

    /**
     * Сохранение API ключа в SecretStorage
     */
    public async setApiKey(apiKey: string): Promise<void> {
        try {
            if (apiKey && apiKey.trim().length > 0) {
                await this._context.secrets.store(API_KEY_SECRET_KEY, apiKey);
                await this._reloadConfig();
            } else {
                await this._context.secrets.delete(API_KEY_SECRET_KEY);
                await this._reloadConfig();
            }
        } catch (error) {
            throw error;
        }
    }

    /**
     * Проверка наличия API ключа
     */
    public async hasApiKey(): Promise<boolean> {
        const apiKey = await this._getApiKey();
        return !!apiKey && apiKey.trim().length > 0;
    }

    /**
     * Временная заглушка для генерации кода
     * В будущем будет заменена на реальный вызов LLM API
     */
    private async _mockGenerateCode(prompt: string): Promise<string> {
        // Получаем задержку для mock генерации из настроек
        const config = vscode.workspace.getConfiguration('aiCoder');
        const mockDelay = config.get<number>(CONFIG_KEYS.PROVIDERS.MOCK_DELAY) ?? 1500;
        // Имитация задержки API
        await new Promise(resolve => setTimeout(resolve, mockDelay));

        // Простая заглушка результата
        return `// Сгенерированный код на основе запроса: "${prompt}"
// TODO: Заменить на реальную генерацию через LLM API

function generatedCode() {
    // Здесь будет реальный сгенерированный код
    return 'Результат';
}`;
    }

    /**
     * Обновление конфигурации
     */
    public async updateConfig(config: Partial<LLMConfig>): Promise<void> {
        const workspaceConfig = vscode.workspace.getConfiguration('aiCoder');
        
        // Обновление настроек через VS Code Configuration API
        if (config.provider !== undefined) {
            await workspaceConfig.update(CONFIG_KEYS.LLM.PROVIDER, config.provider, vscode.ConfigurationTarget.Global);
        }
        if (config.model !== undefined) {
            await workspaceConfig.update(CONFIG_KEYS.LLM.MODEL, config.model, vscode.ConfigurationTarget.Global);
        }
        if (config.embedderModel !== undefined) {
            await workspaceConfig.update(CONFIG_KEYS.LLM.EMBEDDER_MODEL, config.embedderModel, vscode.ConfigurationTarget.Global);
        }
        if (config.temperature !== undefined) {
            await workspaceConfig.update(CONFIG_KEYS.LLM.TEMPERATURE, config.temperature, vscode.ConfigurationTarget.Global);
        }
        if (config.maxTokens !== undefined) {
            await workspaceConfig.update(CONFIG_KEYS.LLM.MAX_TOKENS, config.maxTokens, vscode.ConfigurationTarget.Global);
        }
        if (config.baseUrl !== undefined) {
            await workspaceConfig.update(CONFIG_KEYS.LLM.BASE_URL, config.baseUrl, vscode.ConfigurationTarget.Global);
        }
        if (config.localUrl !== undefined) {
            await workspaceConfig.update(CONFIG_KEYS.LLM.LOCAL_URL, config.localUrl, vscode.ConfigurationTarget.Global);
        }
        if (config.timeout !== undefined) {
            await workspaceConfig.update(CONFIG_KEYS.LLM.TIMEOUT, config.timeout, vscode.ConfigurationTarget.Global);
        }
        if (config.apiType !== undefined) {
            await workspaceConfig.update(CONFIG_KEYS.LLM.API_TYPE, config.apiType, vscode.ConfigurationTarget.Global);
        }
        if (config.systemPrompt !== undefined) {
            await workspaceConfig.update(CONFIG_KEYS.LLM.SYSTEM_PROMPT, config.systemPrompt, vscode.ConfigurationTarget.Global);
        }
        
        // API ключ сохраняется отдельно через SecretStorage
        if (config.apiKey !== undefined) {
            await this.setApiKey(config.apiKey);
        }
        
        await this._reloadConfig();
    }

    /**
     * Получение текущей конфигурации
     */
    public async getConfig(): Promise<LLMConfig> {
        // Убеждаемся, что конфигурация актуальна
        await this._reloadConfig();
        return { ...this._config };
    }

    /**
     * Получение текущей конфигурации (синхронная версия)
     * Использует кэшированную конфигурацию
     */
    public getConfigSync(): LLMConfig {
        return { ...this._config };
    }

    /**
     * Проверка доступности локального сервера
     */
    public async checkLocalServerAvailability(): Promise<boolean> {
        const config = await this.getConfig();
        
        if (config.provider === 'ollama') {
            const provider = this._providers.get('ollama') as OllamaProvider;
            if (provider && typeof (provider as any).checkAvailability === 'function') {
                if (!config.localUrl) {
                    throw new ConfigError('localUrl не указан в настройках для провайдера ollama');
                }
                const url = config.baseUrl || config.localUrl;
                return await (provider as any).checkAvailability(url);
            }
        } else if (config.provider === 'openai') {
            const provider = this._providers.get('openai') as OpenAiCompatibleProvider;
            if (provider && typeof (provider as any).checkAvailability === 'function') {
                // Для OpenAI: если указан baseUrl/localUrl - проверяем его, иначе проверяем стандартный OpenAI API
                if (!config.baseUrl && !config.localUrl) {
                    throw new ConfigError('baseUrl или localUrl должны быть указаны в настройках для провайдера openai');
                }
                const url = config.baseUrl || config.localUrl!;
                return await (provider as any).checkAvailability(url);
            }
        }
        
        return false;
    }

    /**
     * Получение списка доступных моделей
     */
    public async listLocalModels(): Promise<string[]> {
        const config = await this.getConfig();
        
        if (config.provider === 'ollama') {
            const provider = this._providers.get('ollama') as OllamaProvider;
            if (provider && typeof (provider as any).listModels === 'function') {
                if (!config.localUrl) {
                    throw new ConfigError('localUrl не указан в настройках для провайдера ollama');
                }
                const url = config.baseUrl || config.localUrl;
                return await (provider as any).listModels(url);
            }
        } else if (config.provider === 'openai') {
            const provider = this._providers.get('openai') as OpenAiCompatibleProvider;
            if (provider && typeof (provider as any).listModels === 'function') {
                // Для OpenAI: если указан baseUrl/localUrl - используем его, иначе стандартный OpenAI API
                if (!config.baseUrl && !config.localUrl) {
                    throw new ConfigError('baseUrl или localUrl должны быть указаны в настройках для провайдера openai');
                }
                const url = config.baseUrl || config.localUrl!;
                return await (provider as any).listModels(url, config.apiKey);
            }
        }
        
        return [];
    }

    /**
     * Очистка ресурсов
     */
    public dispose(): void {
        if (this._configChangeListener) {
            this._configChangeListener.dispose();
        }
    }
}


