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
