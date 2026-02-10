import * as vscode from 'vscode';
import { LLMService } from '../services/llmService';
import { EmbeddingService } from '../services/embedding/embeddingService';
import {
    WebviewMessage, UpdateConfigMessage, CheckLocalServerMessage,
    SearchMessage, GetAllItemsMessage, OpenFileMessage, ShowNotificationMessage,
    RequestCloseSettingsMessage, VectorizeAllMessage
} from '../types/messages';
import { Logger } from '../utils/logger';
import { PanelContext } from './panelContext';
import { getHtmlForWebview } from './htmlGenerator';

// Обработчики сообщений
import { handleSendConfig, handleUpdateConfig, handleRequestResetConfig, handleRequestCloseSettings } from './handlers/configHandlers';
import { handleGetServers, handleAddServer, handleUpdateServer, handleDeleteServer, handleCheckServer, handleCheckLocalServer, handleToggleServerActive } from './handlers/serverHandlers';
import { handleGetActiveModels, handleGetAvailableModels, handleGetServerModels, handleAddServerModel, handleUpdateServerModel, handleToggleModelActive, handleSaveSelectedModels, handleGetSelectedModels } from './handlers/modelHandlers';
import { handleVectorizeAll, handleSearch, handleGetAllItems, handleOpenFile, handleClearStorage, handleGetStorageCount } from './handlers/embeddingHandlers';
import { handleGenerate } from './handlers/generationHandler';

/**
 * Класс для управления Webview панелью AI Coder.
 * Отвечает за жизненный цикл панели и маршрутизацию сообщений
 * к соответствующим обработчикам.
 */
export class AICoderPanel {
    public static currentPanel: AICoderPanel | undefined;
    public static readonly viewType = 'aiCoderPanel';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _ctx: PanelContext;
    private _disposables: vscode.Disposable[] = [];

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        llmService: LLMService,
        embeddingService: EmbeddingService,
        context: vscode.ExtensionContext
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        // Создаём контекст панели для передачи в обработчики
        this._ctx = {
            panel: this._panel,
            extensionUri: this._extensionUri,
            llmService,
            embeddingService,
            extensionContext: context
        };

        // Установка начального содержимого webview
        this._update();

        // Отправка начальной конфигурации в webview
        handleSendConfig(this._ctx);

        // Обработка сообщений от webview
        this._panel.webview.onDidReceiveMessage(
            (message: WebviewMessage) => this._routeMessage(message),
            null,
            this._disposables
        );

        // Очистка при закрытии панели
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    /**
     * Создание или показ существующей панели
     */
    public static createOrShow(
        extensionUri: vscode.Uri,
        llmService: LLMService,
        embeddingService: EmbeddingService,
        context: vscode.ExtensionContext
    ) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (AICoderPanel.currentPanel) {
            AICoderPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            AICoderPanel.viewType,
            'AI Coder',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media')
                ],
                retainContextWhenHidden: true
            }
        );

        AICoderPanel.currentPanel = new AICoderPanel(panel, extensionUri, llmService, embeddingService, context);
    }

    /**
     * Маршрутизация входящих сообщений от webview к соответствующим обработчикам
     */
    private _routeMessage(message: WebviewMessage): void {
        switch (message.command) {
            // --- Генерация ---
            case 'generate': {
                const msg = message as any;
                handleGenerate(this._ctx, msg.text, msg.model);
                return;
            }

            // --- Конфигурация ---
            case 'getConfig':
                handleSendConfig(this._ctx);
                return;
            case 'updateConfig':
                handleUpdateConfig(this._ctx, (message as UpdateConfigMessage).config);
                return;
            case 'resetConfig':
            case 'requestResetConfig':
                handleRequestResetConfig(this._ctx);
                return;
            case 'requestCloseSettings':
                handleRequestCloseSettings(this._ctx, (message as RequestCloseSettingsMessage).hasChanges);
                return;

            // --- Уведомления ---
            case 'alert':
                vscode.window.showInformationMessage((message as any).text);
                return;
            case 'showNotification': {
                const notificationMsg = message as ShowNotificationMessage;
                if (notificationMsg.type === 'error') {
                    vscode.window.showErrorMessage(notificationMsg.message);
                } else if (notificationMsg.type === 'warning') {
                    vscode.window.showWarningMessage(notificationMsg.message);
                } else {
                    vscode.window.showInformationMessage(notificationMsg.message);
                }
                return;
            }

            // --- Серверы ---
            case 'checkLocalServer': {
                const checkMsg = message as CheckLocalServerMessage;
                handleCheckLocalServer(this._ctx, checkMsg.url, checkMsg.provider);
                return;
            }
            case 'getServers':
                handleGetServers(this._ctx);
                return;
            case 'addServer': {
                const addServerMsg = message as any;
                Logger.info('Получена команда addServer', { server: addServerMsg.server });
                handleAddServer(this._ctx, addServerMsg.server).catch(error => {
                    Logger.error('Ошибка в handleAddServer', error as Error);
                });
                return;
            }
            case 'deleteServer':
                handleDeleteServer(this._ctx, (message as any).serverId);
                return;
            case 'checkServer': {
                const checkServerMsg = message as any;
                handleCheckServer(this._ctx, checkServerMsg.serverId, checkServerMsg.url, checkServerMsg.apiKey);
                return;
            }
            case 'updateServer': {
                const updateServerMsg = message as any;
                handleUpdateServer(this._ctx, updateServerMsg.serverId, updateServerMsg.server);
                return;
            }
            case 'toggleServerActive': {
                const toggleServerMsg = message as any;
                handleToggleServerActive(this._ctx, toggleServerMsg.serverId, toggleServerMsg.active);
                return;
            }

            // --- Модели ---
            case 'getActiveModels':
                handleGetActiveModels(this._ctx);
                return;
            case 'getServerModels': {
                const getModelsMsg = message as any;
                handleGetServerModels(this._ctx, getModelsMsg.serverId, getModelsMsg.url, getModelsMsg.apiKey);
                return;
            }
            case 'getAvailableModels': {
                const getAvailableMsg = message as any;
                handleGetAvailableModels(this._ctx, getAvailableMsg.serverId, getAvailableMsg.url, getAvailableMsg.apiKey);
                return;
            }
            case 'addServerModel': {
                const addModelMsg = message as any;
                handleAddServerModel(this._ctx, addModelMsg.serverId, addModelMsg.model);
                return;
            }
            case 'updateServerModel': {
                const updateModelMsg = message as any;
                handleUpdateServerModel(this._ctx, updateModelMsg.serverId, updateModelMsg.model);
                return;
            }
            case 'toggleModelActive': {
                const toggleModelMsg = message as any;
                handleToggleModelActive(this._ctx, toggleModelMsg.serverId, toggleModelMsg.modelId, toggleModelMsg.active);
                return;
            }
            case 'saveSelectedModels':
                handleSaveSelectedModels(this._ctx, (message as any).selections);
                return;
            case 'getSelectedModels':
                handleGetSelectedModels(this._ctx);
                return;

            // --- Эмбеддинги / Поиск / Хранилище ---
            case 'vectorizeAll':
                handleVectorizeAll(this._ctx, message as VectorizeAllMessage);
                return;
            case 'search': {
                const searchMsg = message as SearchMessage;
                handleSearch(this._ctx, searchMsg.query, searchMsg.limit);
                return;
            }
            case 'getAllItems':
                handleGetAllItems(this._ctx, (message as GetAllItemsMessage).limit);
                return;
            case 'openFile':
                handleOpenFile((message as OpenFileMessage).path);
                return;
            case 'clearStorage':
                handleClearStorage(this._ctx);
                return;
            case 'getStorageCount':
                handleGetStorageCount(this._ctx);
                return;
        }
    }

    /**
     * Обновление содержимого webview
     */
    private _update() {
        this._panel.webview.html = getHtmlForWebview(this._panel.webview, this._extensionUri);
    }

    /**
     * Очистка ресурсов
     */
    public dispose() {
        AICoderPanel.currentPanel = undefined;

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}
