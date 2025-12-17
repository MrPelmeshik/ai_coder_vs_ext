import * as vscode from 'vscode';
import { OllamaProvider } from '../providers/ollamaProvider';
import { LocalApiProvider } from '../providers/localApiProvider';

import { STORAGE_KEYS } from '../constants';

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
        this._providers.set('custom', new LocalApiProvider());
        // Для локальных API также используем LocalApiProvider
        this._providers.set('local', new LocalApiProvider());
        
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
            if (config.provider === 'openai' || config.provider === 'anthropic') {
                // Для облачных провайдеров пока используем обычную генерацию
                const result = await this.generateCode(prompt);
                yield result;
                return;
            } else {
                const localProvider = this._providers.get('local');
                if (localProvider && localProvider.stream) {
                    yield* localProvider.stream(prompt, config);
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
            // Если провайдер не найден, используем заглушку или пробуем локальный API
            if (config.provider === 'openai' || config.provider === 'anthropic') {
                // Для облачных провайдеров пока используем заглушку
                return this._mockGenerateCode(prompt);
            } else {
                // Для неизвестных провайдеров пробуем локальный API
                const localProvider = this._providers.get('local');
                if (localProvider) {
                    return await localProvider.generate(prompt, config);
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
     * Загрузка конфигурации из настроек VS Code
     */
    private async _loadConfig(): Promise<LLMConfig> {
        const config = vscode.workspace.getConfiguration('aiCoder');
        
        // Загрузка API ключа из SecretStorage
        const apiKey = await this._getApiKey();
        
        return {
            provider: config.get<string>('llm.provider', 'openai'),
            apiKey: apiKey || '',
            model: config.get<string>('llm.model', 'gpt-4'),
            embedderModel: config.get<string>('llm.embedderModel', ''),
            temperature: config.get<number>('llm.temperature', 0.7),
            maxTokens: config.get<number>('llm.maxTokens', 2000),
            baseUrl: config.get<string>('llm.baseUrl', ''),
            systemPrompt: config.get<string>('llm.systemPrompt', ''),
            localUrl: config.get<string>('llm.localUrl', 'http://localhost:11434'),
            timeout: config.get<number>('llm.timeout', 30000),
            apiType: config.get<string>('llm.apiType', 'openai')
        };
    }

    /**
     * Синхронная загрузка конфигурации (для совместимости)
     */
    private _loadConfigSync(): LLMConfig {
        const config = vscode.workspace.getConfiguration('aiCoder');
        
        return {
            provider: config.get<string>('llm.provider', 'openai'),
            apiKey: '', // Будет загружен асинхронно
            model: config.get<string>('llm.model', 'gpt-4'),
            embedderModel: config.get<string>('llm.embedderModel', ''),
            temperature: config.get<number>('llm.temperature', 0.7),
            maxTokens: config.get<number>('llm.maxTokens', 2000),
            baseUrl: config.get<string>('llm.baseUrl', ''),
            localUrl: config.get<string>('llm.localUrl', 'http://localhost:11434'),
            timeout: config.get<number>('llm.timeout', 30000),
            apiType: config.get<string>('llm.apiType', 'openai'),
            systemPrompt: config.get<string>('llm.systemPrompt', '')
        };
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
            // Logger может быть не инициализирован на этом этапе
            console.error('Ошибка получения API ключа:', error);
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
            // Logger может быть не инициализирован на этом этапе
            console.error('Ошибка сохранения API ключа:', error);
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
        // Имитация задержки API
        await new Promise(resolve => setTimeout(resolve, 1500));

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
            await workspaceConfig.update('llm.provider', config.provider, vscode.ConfigurationTarget.Global);
        }
        if (config.model !== undefined) {
            await workspaceConfig.update('llm.model', config.model, vscode.ConfigurationTarget.Global);
        }
        if (config.embedderModel !== undefined) {
            await workspaceConfig.update('llm.embedderModel', config.embedderModel, vscode.ConfigurationTarget.Global);
        }
        if (config.temperature !== undefined) {
            await workspaceConfig.update('llm.temperature', config.temperature, vscode.ConfigurationTarget.Global);
        }
        if (config.maxTokens !== undefined) {
            await workspaceConfig.update('llm.maxTokens', config.maxTokens, vscode.ConfigurationTarget.Global);
        }
        if (config.baseUrl !== undefined) {
            await workspaceConfig.update('llm.baseUrl', config.baseUrl, vscode.ConfigurationTarget.Global);
        }
        if (config.localUrl !== undefined) {
            await workspaceConfig.update('llm.localUrl', config.localUrl, vscode.ConfigurationTarget.Global);
        }
        if (config.timeout !== undefined) {
            await workspaceConfig.update('llm.timeout', config.timeout, vscode.ConfigurationTarget.Global);
        }
        if (config.apiType !== undefined) {
            await workspaceConfig.update('llm.apiType', config.apiType, vscode.ConfigurationTarget.Global);
        }
        if (config.systemPrompt !== undefined) {
            await workspaceConfig.update('llm.systemPrompt', config.systemPrompt, vscode.ConfigurationTarget.Global);
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
                return await (provider as any).checkAvailability(config.localUrl || 'http://localhost:11434');
            }
        } else if (config.provider === 'custom' || config.provider === 'local') {
            const provider = this._providers.get('local') as LocalApiProvider;
            if (provider && typeof (provider as any).checkAvailability === 'function') {
                const url = config.baseUrl || config.localUrl || 'http://localhost:1234';
                return await (provider as any).checkAvailability(url);
            }
        }
        
        return false;
    }

    /**
     * Получение списка доступных моделей (для Ollama)
     */
    public async listLocalModels(): Promise<string[]> {
        const config = await this.getConfig();
        
        if (config.provider === 'ollama') {
            const provider = this._providers.get('ollama') as OllamaProvider;
            if (provider && typeof (provider as any).listModels === 'function') {
                return await (provider as any).listModels(config.localUrl || 'http://localhost:11434');
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

/**
 * Интерфейс конфигурации LLM
 */
export interface LLMConfig {
    provider: string;
    apiKey: string;
    model: string;
    embedderModel?: string;
    temperature: number;
    maxTokens: number;
    baseUrl?: string;
    localUrl?: string;
    timeout?: number;
    apiType?: string; // Тип API для кастомного провайдера: 'openai' | 'ollama'
    systemPrompt?: string; // Системный промпт для LLM
}

/**
 * Интерфейс для провайдеров LLM
 * Задел на будущее: различные реализации для разных провайдеров
 */
export interface LLMProvider {
    generate(prompt: string, config: LLMConfig): Promise<string>;
    stream?(prompt: string, config: LLMConfig): AsyncIterable<string>;
}

