import * as vscode from 'vscode';
import { CONFIG_KEYS, API_TYPES } from '../constants';

/**
 * Класс для чтения настроек из VS Code Configuration
 * Все значения читаются из настроек без дефолтов в коде
 */
export class ConfigReader {
    private static _config: vscode.WorkspaceConfiguration;

    /**
     * Инициализация конфигурации
     */
    static initialize(): void {
        this._config = vscode.workspace.getConfiguration('aiCoder');
    }

    /**
     * Получить конфигурацию (с перезагрузкой)
     */
    static getConfig(): vscode.WorkspaceConfiguration {
        this._config = vscode.workspace.getConfiguration('aiCoder');
        return this._config;
    }

    /**
     * Получить дефолтную модель для OpenAI
     */
    static getDefaultModelOpenai(): string {
        return this.getConfig().get<string>(CONFIG_KEYS.LLM.DEFAULT_MODEL_OPENAI)!;
    }

    /**
     * Получить дефолтную модель для Ollama
     */
    static getDefaultModelOllama(): string {
        return this.getConfig().get<string>(CONFIG_KEYS.LLM.DEFAULT_MODEL_OLLAMA)!;
    }

    /**
     * Получить дефолтную модель для локального API
     */
    static getDefaultModelLocalApi(): string {
        return this.getConfig().get<string>(CONFIG_KEYS.LLM.DEFAULT_MODEL_LOCAL_API)!;
    }

    /**
     * Получить значение API ключа, когда он не требуется
     */
    static getApiKeyNotNeeded(): string {
        return this.getConfig().get<string>(CONFIG_KEYS.LLM.API_KEY_NOT_NEEDED)!;
    }

    /**
     * Получить таймаут проверки доступности локального API
     */
    static getAvailabilityCheckTimeoutLocalApi(): number {
        return this.getConfig().get<number>(CONFIG_KEYS.LLM.AVAILABILITY_CHECK_TIMEOUT_LOCAL_API)!;
    }

    /**
     * Получить таймаут проверки доступности Ollama
     */
    static getAvailabilityCheckTimeoutOllama(): number {
        return this.getConfig().get<number>(CONFIG_KEYS.LLM.AVAILABILITY_CHECK_TIMEOUT_OLLAMA)!;
    }

    /**
     * Получить задержку для stream обработки
     */
    static getStreamPollingDelay(): number {
        return this.getConfig().get<number>(CONFIG_KEYS.LLM.STREAM_POLLING_DELAY)!;
    }

    /**
     * Получить префикс системного промпта для Ollama
     */
    static getPromptFormatOllamaSystemPrefix(): string {
        return this.getConfig().get<string>(CONFIG_KEYS.LLM.PROMPT_FORMAT_OLLAMA_SYSTEM_PREFIX)!;
    }

    /**
     * Получить суффикс промпта генерации кода для Ollama
     */
    static getPromptFormatOllamaCodeSuffix(): string {
        return this.getConfig().get<string>(CONFIG_KEYS.LLM.PROMPT_FORMAT_OLLAMA_CODE_SUFFIX)!;
    }

    /**
     * Сформировать промпт для Ollama с системным промптом
     */
    static formatOllamaPromptWithSystem(systemPrompt: string, userPrompt: string): string {
        const prefix = this.getPromptFormatOllamaSystemPrefix();
        const suffix = this.getPromptFormatOllamaCodeSuffix();
        return `${systemPrompt}${prefix}${userPrompt}${suffix}`;
    }

    /**
     * Сформировать промпт для Ollama без системного промпта
     */
    static formatOllamaPromptWithoutSystem(userPrompt: string): string {
        const suffix = this.getPromptFormatOllamaCodeSuffix();
        return `User request: ${userPrompt}${suffix}`;
    }

    /**
     * Получить префикс данных для SSE
     */
    static getSseDataPrefix(): string {
        return this.getConfig().get<string>(CONFIG_KEYS.LLM.SSE_DATA_PREFIX)!;
    }

    /**
     * Получить маркер завершения SSE потока
     */
    static getSseDoneMarker(): string {
        return this.getConfig().get<string>(CONFIG_KEYS.LLM.SSE_DONE_MARKER)!;
    }

    /**
     * Получить максимальную длину текста для суммаризации
     */
    static getMaxTextLength(): number {
        return this.getConfig().get<number>(CONFIG_KEYS.VECTORIZATION.MAX_TEXT_LENGTH)!;
    }

    /**
     * Получить сообщение об обрезке текста
     */
    static getTruncateMessage(): string {
        return this.getConfig().get<string>(CONFIG_KEYS.VECTORIZATION.TRUNCATE_MESSAGE)!;
    }

    /**
     * Получить тип API (константа)
     */
    static getApiTypeOpenai(): string {
        return API_TYPES.OPENAI;
    }

    /**
     * Получить тип API Ollama (константа)
     */
    static getApiTypeOllama(): string {
        return API_TYPES.OLLAMA;
    }
}

