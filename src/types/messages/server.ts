import { BaseWebviewMessage } from './base';

/**
 * Сообщение проверки локального сервера
 */
export interface CheckLocalServerMessage extends BaseWebviewMessage {
    command: 'checkLocalServer';
    url: string;
    provider: string;
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
 * Сообщение переключения активности сервера
 */
export interface ToggleServerActiveMessage extends BaseWebviewMessage {
    command: 'toggleServerActive';
    serverId: string;
    active: boolean;
}
