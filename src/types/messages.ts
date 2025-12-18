import { LLMConfig } from '../services/llmService';

/**
 * Команды Webview
 */
export type WebviewCommand = 
    | 'generate'
    | 'getConfig'
    | 'updateConfig'
    | 'resetConfig'
    | 'requestResetConfig'
    | 'checkLocalServer'
    | 'vectorizeAll'
    | 'search'
    | 'getAllItems'
    | 'openFile'
    | 'clearStorage'
    | 'getStorageCount'
    | 'alert'
    | 'showNotification'
    | 'requestCloseSettings'
    | 'getServers'
    | 'addServer'
    | 'updateServer'
    | 'deleteServer'
    | 'checkServer'
    | 'getServerModels'
    | 'updateServerModel';

/**
 * Базовое сообщение Webview
 */
export interface BaseWebviewMessage {
    command: WebviewCommand;
}

/**
 * Сообщение генерации кода
 */
export interface GenerateMessage extends BaseWebviewMessage {
    command: 'generate';
    text: string;
}

/**
 * Сообщение обновления конфигурации
 */
export interface UpdateConfigMessage extends BaseWebviewMessage {
    command: 'updateConfig';
    config: Partial<LLMConfig & {
        summarizePrompt: string;
        enableOrigin: boolean;
        enableSummarize: boolean;
        enableVsOrigin: boolean;
        enableVsSummarize: boolean;
    }>;
}

/**
 * Сообщение проверки локального сервера
 */
export interface CheckLocalServerMessage extends BaseWebviewMessage {
    command: 'checkLocalServer';
    url: string;
    provider: string;
}

/**
 * Сообщение поиска
 */
export interface SearchMessage extends BaseWebviewMessage {
    command: 'search';
    query: string;
    limit?: number;
}

/**
 * Сообщение получения всех элементов
 */
export interface GetAllItemsMessage extends BaseWebviewMessage {
    command: 'getAllItems';
    limit?: number;
}

/**
 * Сообщение открытия файла
 */
export interface OpenFileMessage extends BaseWebviewMessage {
    command: 'openFile';
    path: string;
}

/**
 * Сообщение alert
 */
export interface AlertMessage extends BaseWebviewMessage {
    command: 'alert';
    text: string;
}

/**
 * Сообщение показа уведомления
 */
export interface ShowNotificationMessage extends BaseWebviewMessage {
    command: 'showNotification';
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
}

/**
 * Сообщение получения количества записей
 */
export interface GetStorageCountMessage extends BaseWebviewMessage {
    command: 'getStorageCount';
}

/**
 * Сообщение очистки хранилища
 */
export interface ClearStorageMessage extends BaseWebviewMessage {
    command: 'clearStorage';
}

/**
 * Сообщение векторизации всех файлов
 */
export interface VectorizeAllMessage extends BaseWebviewMessage {
    command: 'vectorizeAll';
}

/**
 * Сообщение запроса на закрытие настроек с проверкой изменений
 */
export interface RequestCloseSettingsMessage extends BaseWebviewMessage {
    command: 'requestCloseSettings';
    hasChanges: boolean;
}

/**
 * Сообщение получения списка серверов
 */
export interface GetServersMessage extends BaseWebviewMessage {
    command: 'getServers';
}

/**
 * Сообщение добавления сервера
 */
export interface AddServerMessage extends BaseWebviewMessage {
    command: 'addServer';
    server: {
        name: string;
        url: string;
        apiKey?: string;
    };
}

/**
 * Сообщение обновления сервера
 */
export interface UpdateServerMessage extends BaseWebviewMessage {
    command: 'updateServer';
    serverId: string;
    server: {
        name: string;
        url: string;
        apiKey?: string;
    };
}

/**
 * Сообщение удаления сервера
 */
export interface DeleteServerMessage extends BaseWebviewMessage {
    command: 'deleteServer';
    serverId: string;
}

/**
 * Сообщение проверки сервера
 */
export interface CheckServerMessage extends BaseWebviewMessage {
    command: 'checkServer';
    serverId: string;
    url: string;
    apiKey?: string;
}

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
 * Сообщение обновления настроек модели сервера
 */
export interface UpdateServerModelMessage extends BaseWebviewMessage {
    command: 'updateServerModel';
    serverId: string;
    model: {
        id?: string;
        name: string;
        temperature?: number;
        maxTokens?: number;
        systemPrompt?: string;
    };
}

/**
 * Объединенный тип всех сообщений Webview
 */
export type WebviewMessage = 
    | GenerateMessage
    | UpdateConfigMessage
    | CheckLocalServerMessage
    | SearchMessage
    | GetAllItemsMessage
    | OpenFileMessage
    | AlertMessage
    | ShowNotificationMessage
    | GetStorageCountMessage
    | ClearStorageMessage
    | VectorizeAllMessage
    | RequestCloseSettingsMessage
    | GetServersMessage
    | AddServerMessage
    | UpdateServerMessage
    | DeleteServerMessage
    | CheckServerMessage
    | GetServerModelsMessage
    | UpdateServerModelMessage
    | BaseWebviewMessage;

