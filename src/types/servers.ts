/**
 * Интерфейс для сервера LLM
 */
export interface LLMServer {
    id: string;
    name: string;
    url: string;
    apiKey?: string;
    status?: 'available' | 'unavailable' | 'checking';
    active?: boolean;
    models?: ServerModel[];
}

/**
 * Интерфейс для модели сервера
 */
export interface ServerModel {
    id: string;
    name: string;
    displayName?: string; // Пользовательское наименование для удобства выбора
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    active?: boolean;
}
