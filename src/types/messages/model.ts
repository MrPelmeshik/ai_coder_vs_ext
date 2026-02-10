import { BaseWebviewMessage } from './base';

/**
 * Сообщение получения списка моделей сервера
 */
export interface GetServerModelsMessage extends BaseWebviewMessage {
    command: 'getServerModels';
    serverId: string;
    url: string;
    apiKey?: string;
}

/**
 * Сообщение получения списка доступных моделей с сервера (без сохранения)
 */
export interface GetAvailableModelsMessage extends BaseWebviewMessage {
    command: 'getAvailableModels';
    serverId: string;
    url: string;
    apiKey?: string;
}

/**
 * Сообщение добавления модели к серверу
 */
export interface AddServerModelMessage extends BaseWebviewMessage {
    command: 'addServerModel';
    serverId: string;
    model: {
        name: string;
        displayName?: string;
        temperature?: number;
        maxTokens?: number;
        systemPrompt?: string;
        active?: boolean;
    };
}

/**
 * Сообщение обновления настроек модели сервера
 */
export interface UpdateServerModelMessage extends BaseWebviewMessage {
    command: 'updateServerModel';
    serverId: string;
    model: {
        id?: string;
        name: string;
        displayName?: string;
        temperature?: number;
        maxTokens?: number;
        systemPrompt?: string;
    };
}

/**
 * Сообщение переключения активности модели сервера
 */
export interface ToggleModelActiveMessage extends BaseWebviewMessage {
    command: 'toggleModelActive';
    serverId: string;
    modelId: string;
    active: boolean;
}

/**
 * Сообщение сохранения выбранных моделей
 */
export interface SaveSelectedModelsMessage extends BaseWebviewMessage {
    command: 'saveSelectedModels';
    selections: {
        generationModel?: string;
        embedderModel?: string;
        summarizeModel?: string;
    };
}

/**
 * Сообщение получения сохраненных выбранных моделей
 */
export interface GetSelectedModelsMessage extends BaseWebviewMessage {
    command: 'getSelectedModels';
}
