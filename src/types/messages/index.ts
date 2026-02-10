/**
 * Реэкспорт всех типов сообщений Webview
 */
export * from './base';
export * from './config';
export * from './server';
export * from './model';
export * from './embedding';

// Импорт всех типов для объединённого union type
import { BaseWebviewMessage, GenerateMessage, AlertMessage, ShowNotificationMessage } from './base';
import { UpdateConfigMessage, RequestCloseSettingsMessage } from './config';
import {
    CheckLocalServerMessage, GetServersMessage, AddServerMessage,
    UpdateServerMessage, DeleteServerMessage, CheckServerMessage,
    ToggleServerActiveMessage
} from './server';
import {
    GetServerModelsMessage, GetAvailableModelsMessage, AddServerModelMessage,
    UpdateServerModelMessage, ToggleModelActiveMessage, SaveSelectedModelsMessage,
    GetSelectedModelsMessage
} from './model';
import {
    SearchMessage, GetAllItemsMessage, OpenFileMessage,
    GetStorageCountMessage, ClearStorageMessage, VectorizeAllMessage
} from './embedding';

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
    | GetAvailableModelsMessage
    | AddServerModelMessage
    | UpdateServerModelMessage
    | ToggleServerActiveMessage
    | ToggleModelActiveMessage
    | SaveSelectedModelsMessage
    | GetSelectedModelsMessage
    | BaseWebviewMessage;
