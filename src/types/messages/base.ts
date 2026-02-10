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
    | 'getAvailableModels'
    | 'addServerModel'
    | 'updateServerModel'
    | 'toggleServerActive'
    | 'toggleModelActive'
    | 'getActiveModels'
    | 'saveSelectedModels'
    | 'getSelectedModels';

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
