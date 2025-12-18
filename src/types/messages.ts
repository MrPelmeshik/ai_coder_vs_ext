import { LLMConfig } from '../services/llmService';

/**
 * Команды Webview
 */
export type WebviewCommand = 
    | 'generate'
    | 'getConfig'
    | 'updateConfig'
    | 'resetConfig'
    | 'checkLocalServer'
    | 'vectorizeAll'
    | 'search'
    | 'getAllItems'
    | 'openFile'
    | 'clearStorage'
    | 'getStorageCount'
    | 'alert';

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
    | GetStorageCountMessage
    | ClearStorageMessage
    | VectorizeAllMessage
    | BaseWebviewMessage;

