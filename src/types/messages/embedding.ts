import { BaseWebviewMessage } from './base';

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
    embedderModel?: {
        serverId: string;
        modelId: string;
        url: string;
        apiKey?: string;
        modelName: string;
    };
    summarizeModel?: {
        serverId: string;
        modelId: string;
        url: string;
        apiKey?: string;
        modelName: string;
        temperature?: number;
        maxTokens?: number;
        systemPrompt?: string;
    } | null;
    enableOrigin?: boolean;
    enableSummarize?: boolean;
    enableVsOrigin?: boolean;
    enableVsSummarize?: boolean;
    summarizePrompt?: string;
}
