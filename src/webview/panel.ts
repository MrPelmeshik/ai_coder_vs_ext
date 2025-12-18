import * as vscode from 'vscode';
import * as path from 'path';
import { LLMService } from '../services/llmService';
import { EmbeddingService } from '../services/embedding/embeddingService';
import { OllamaProvider } from '../providers/ollamaProvider';
import { OpenAiCompatibleProvider } from '../providers/openAiCompatibleProvider';
import { WebviewMessage, GenerateMessage, UpdateConfigMessage, CheckLocalServerMessage, SearchMessage, GetAllItemsMessage, OpenFileMessage, ShowNotificationMessage, RequestCloseSettingsMessage } from '../types/messages';
import { CONFIG_KEYS } from '../constants';
import { Logger } from '../utils/logger';

/**
 * Класс для управления Webview панелью AI Coder
 */
export class AICoderPanel {
    public static currentPanel: AICoderPanel | undefined;
    public static readonly viewType = 'aiCoderPanel';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _llmService: LLMService;
    private readonly _embeddingService: EmbeddingService;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, llmService: LLMService, embeddingService: EmbeddingService) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._llmService = llmService;
        this._embeddingService = embeddingService;

        // Установка начального содержимого webview
        this._update();

        // Отправка начальной конфигурации в webview
        this._sendConfigToWebview();

        // Обработка сообщений от webview
        this._panel.webview.onDidReceiveMessage(
            (message: WebviewMessage) => {
                switch (message.command) {
                    case 'generate':
                        this._handleGenerate((message as GenerateMessage).text);
                        return;
                    case 'getConfig':
                        this._sendConfigToWebview();
                        return;
                    case 'updateConfig':
                        this._handleUpdateConfig((message as UpdateConfigMessage).config);
                        return;
                    case 'resetConfig':
                        this._handleResetConfig();
                        return;
                    case 'requestResetConfig':
                        this._handleRequestResetConfig();
                        return;
                    case 'checkLocalServer':
                        const checkMsg = message as CheckLocalServerMessage;
                        this._handleCheckLocalServer(checkMsg.url, checkMsg.provider);
                        return;
                    case 'alert':
                        vscode.window.showInformationMessage((message as any).text);
                        return;
                    case 'showNotification':
                        const notificationMsg = message as ShowNotificationMessage;
                        if (notificationMsg.type === 'error') {
                            vscode.window.showErrorMessage(notificationMsg.message);
                        } else if (notificationMsg.type === 'warning') {
                            vscode.window.showWarningMessage(notificationMsg.message);
                        } else {
                            vscode.window.showInformationMessage(notificationMsg.message);
                        }
                        return;
                    case 'vectorizeAll':
                        this._handleVectorizeAll();
                        return;
                    case 'search':
                        const searchMsg = message as SearchMessage;
                        this._handleSearch(searchMsg.query, searchMsg.limit);
                        return;
                    case 'getAllItems':
                        this._handleGetAllItems((message as GetAllItemsMessage).limit);
                        return;
                    case 'openFile':
                        this._handleOpenFile((message as OpenFileMessage).path);
                        return;
                    case 'clearStorage':
                        this._handleClearStorage();
                        return;
                    case 'getStorageCount':
                        this._handleGetStorageCount();
                        return;
                    case 'requestCloseSettings':
                        const closeMsg = message as RequestCloseSettingsMessage;
                        this._handleRequestCloseSettings(closeMsg.hasChanges);
                        return;
                }
            },
            null,
            this._disposables
        );

        // Очистка при закрытии панели
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    /**
     * Создание или показ существующей панели
     */
    public static createOrShow(extensionUri: vscode.Uri, llmService: LLMService, embeddingService: EmbeddingService) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // Если панель уже существует, показываем её
        if (AICoderPanel.currentPanel) {
            AICoderPanel.currentPanel._panel.reveal(column);
            return;
        }

        // Создаём новую панель
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

        AICoderPanel.currentPanel = new AICoderPanel(panel, extensionUri, llmService, embeddingService);
    }

    /**
     * Обновление содержимого webview
     */
    private _update() {
        const webview = this._panel.webview;
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    /**
     * Отправка конфигурации в webview
     */
    private async _sendConfigToWebview() {
        try {
            const config = await this._llmService.getConfig();
            const vscodeConfig = vscode.workspace.getConfiguration('aiCoder');
            
            // Получаем значения с использованием дефолтных значений из package.json
            // VS Code Configuration API автоматически возвращает дефолтные значения,
            // если пользовательские значения не установлены
            const summarizePrompt = vscodeConfig.get<string>(CONFIG_KEYS.VECTORIZATION.SUMMARIZE_PROMPT) || 
                'Суммаризируй следующий код или текст. Создай краткое описание основных функций, классов, методов и их назначения. Сохрани важные детали, но сделай текст более компактным и структурированным.';
            const enableOrigin = vscodeConfig.get<boolean>(CONFIG_KEYS.VECTORIZATION.ENABLE_ORIGIN) ?? true;
            const enableSummarize = vscodeConfig.get<boolean>(CONFIG_KEYS.VECTORIZATION.ENABLE_SUMMARIZE) ?? false;
            const enableVsOrigin = vscodeConfig.get<boolean>(CONFIG_KEYS.VECTORIZATION.ENABLE_VS_ORIGIN) ?? true;
            const enableVsSummarize = vscodeConfig.get<boolean>(CONFIG_KEYS.VECTORIZATION.ENABLE_VS_SUMMARIZE) ?? true;
            
            // Не отправляем API ключ в webview по соображениям безопасности
            const safeConfig = {
                ...config,
                apiKey: config.apiKey ? '***' : '',
                hasApiKey: await this._llmService.hasApiKey(),
                localUrl: config.localUrl,
                summarizePrompt: summarizePrompt,
                enableOrigin: enableOrigin,
                enableSummarize: enableSummarize,
                enableVsOrigin: enableVsOrigin,
                enableVsSummarize: enableVsSummarize
            };
            
            this._panel.webview.postMessage({
                command: 'config',
                config: safeConfig
            });
        } catch (error) {
            // Если произошла ошибка, логируем её, но не показываем пользователю,
            // так как это может быть временная проблема после сброса настроек
            const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
            // Пытаемся отправить конфигурацию с дефолтными значениями
            try {
                const config = await this._llmService.getConfig();
                const vscodeConfig = vscode.workspace.getConfiguration('aiCoder');
                const safeConfig = {
                    ...config,
                    apiKey: config.apiKey ? '***' : '',
                    hasApiKey: await this._llmService.hasApiKey(),
                    localUrl: config.localUrl || '',
                    summarizePrompt: vscodeConfig.get<string>(CONFIG_KEYS.VECTORIZATION.SUMMARIZE_PROMPT) || 
                        'Суммаризируй следующий код или текст. Создай краткое описание основных функций, классов, методов и их назначения. Сохрани важные детали, но сделай текст более компактным и структурированным.',
                    enableOrigin: vscodeConfig.get<boolean>(CONFIG_KEYS.VECTORIZATION.ENABLE_ORIGIN) ?? true,
                    enableSummarize: vscodeConfig.get<boolean>(CONFIG_KEYS.VECTORIZATION.ENABLE_SUMMARIZE) ?? false,
                    enableVsOrigin: vscodeConfig.get<boolean>(CONFIG_KEYS.VECTORIZATION.ENABLE_VS_ORIGIN) ?? true,
                    enableVsSummarize: vscodeConfig.get<boolean>(CONFIG_KEYS.VECTORIZATION.ENABLE_VS_SUMMARIZE) ?? true
                };
                this._panel.webview.postMessage({
                    command: 'config',
                    config: safeConfig
                });
            } catch (fallbackError) {
                vscode.window.showErrorMessage(`Ошибка загрузки конфигурации: ${errorMessage}`);
            }
        }
    }

    /**
     * Обработка обновления конфигурации
     */
    private async _handleUpdateConfig(config: any) {
        try {
            await this._llmService.updateConfig(config);
            
            const vscodeConfig = vscode.workspace.getConfiguration('aiCoder');
            
            // Сохраняем промпт суммаризации отдельно
            if (config.summarizePrompt !== undefined) {
                await vscodeConfig.update(CONFIG_KEYS.VECTORIZATION.SUMMARIZE_PROMPT, config.summarizePrompt, vscode.ConfigurationTarget.Global);
            }
            
            // Сохраняем настройки включения/отключения типов векторов
            if (config.enableOrigin !== undefined) {
                await vscodeConfig.update(CONFIG_KEYS.VECTORIZATION.ENABLE_ORIGIN, config.enableOrigin, vscode.ConfigurationTarget.Global);
            }
            if (config.enableSummarize !== undefined) {
                await vscodeConfig.update(CONFIG_KEYS.VECTORIZATION.ENABLE_SUMMARIZE, config.enableSummarize, vscode.ConfigurationTarget.Global);
            }
            if (config.enableVsOrigin !== undefined) {
                await vscodeConfig.update(CONFIG_KEYS.VECTORIZATION.ENABLE_VS_ORIGIN, config.enableVsOrigin, vscode.ConfigurationTarget.Global);
            }
            if (config.enableVsSummarize !== undefined) {
                await vscodeConfig.update(CONFIG_KEYS.VECTORIZATION.ENABLE_VS_SUMMARIZE, config.enableVsSummarize, vscode.ConfigurationTarget.Global);
            }
            
            await this._sendConfigToWebview();
            vscode.window.showInformationMessage('Настройки успешно сохранены');
            // Явно отправляем сообщение об успешном сохранении для восстановления кнопки
            this._panel.webview.postMessage({
                command: 'configUpdated'
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
            vscode.window.showErrorMessage(`Ошибка сохранения настроек: ${errorMessage}`);
            // Отправляем сообщение об ошибке в webview для восстановления кнопки
            this._panel.webview.postMessage({
                command: 'configUpdateError',
                error: errorMessage
            });
        }
    }

    /**
     * Обработка запроса на сброс настроек (с подтверждением)
     */
    private async _handleRequestResetConfig() {
        const action = await vscode.window.showWarningMessage(
            'Вы уверены, что хотите сбросить настройки к значениям по умолчанию?',
            { modal: true },
            'Да, сбросить',
            'Отмена'
        );

        if (action === 'Да, сбросить') {
            // Блокируем кнопку в webview
            this._panel.webview.postMessage({
                command: 'resetConfigStarted'
            });
            // Выполняем сброс
            await this._handleResetConfig();
        } else {
            // Пользователь отменил, восстанавливаем кнопку
            this._panel.webview.postMessage({
                command: 'resetConfigCancelled'
            });
        }
    }

    /**
     * Обработка сброса настроек к значениям по умолчанию
     * Все значения берутся из package.json через VS Code Configuration API
     */
    private async _handleResetConfig() {
        try {
            const vscodeConfig = vscode.workspace.getConfiguration('aiCoder');
            
            // Сбрасываем все настройки LLM к значениям по умолчанию
            // Используем undefined для удаления пользовательских значений,
            // что вернет дефолтные значения из package.json
            await vscodeConfig.update(CONFIG_KEYS.LLM.PROVIDER, undefined, vscode.ConfigurationTarget.Global);
            await vscodeConfig.update(CONFIG_KEYS.LLM.MODEL, undefined, vscode.ConfigurationTarget.Global);
            await vscodeConfig.update(CONFIG_KEYS.LLM.EMBEDDER_MODEL, undefined, vscode.ConfigurationTarget.Global);
            await vscodeConfig.update(CONFIG_KEYS.LLM.TEMPERATURE, undefined, vscode.ConfigurationTarget.Global);
            await vscodeConfig.update(CONFIG_KEYS.LLM.MAX_TOKENS, undefined, vscode.ConfigurationTarget.Global);
            await vscodeConfig.update(CONFIG_KEYS.LLM.BASE_URL, undefined, vscode.ConfigurationTarget.Global);
            await vscodeConfig.update(CONFIG_KEYS.LLM.API_TYPE, undefined, vscode.ConfigurationTarget.Global);
            await vscodeConfig.update(CONFIG_KEYS.LLM.LOCAL_URL, undefined, vscode.ConfigurationTarget.Global);
            await vscodeConfig.update(CONFIG_KEYS.LLM.TIMEOUT, undefined, vscode.ConfigurationTarget.Global);
            await vscodeConfig.update(CONFIG_KEYS.LLM.SYSTEM_PROMPT, undefined, vscode.ConfigurationTarget.Global);
            
            // Сбрасываем настройки векторизации
            await vscodeConfig.update(CONFIG_KEYS.VECTORIZATION.SUMMARIZE_PROMPT, undefined, vscode.ConfigurationTarget.Global);
            await vscodeConfig.update(CONFIG_KEYS.VECTORIZATION.ENABLE_ORIGIN, undefined, vscode.ConfigurationTarget.Global);
            await vscodeConfig.update(CONFIG_KEYS.VECTORIZATION.ENABLE_SUMMARIZE, undefined, vscode.ConfigurationTarget.Global);
            await vscodeConfig.update(CONFIG_KEYS.VECTORIZATION.ENABLE_VS_ORIGIN, undefined, vscode.ConfigurationTarget.Global);
            await vscodeConfig.update(CONFIG_KEYS.VECTORIZATION.ENABLE_VS_SUMMARIZE, undefined, vscode.ConfigurationTarget.Global);
            
            // Очищаем API ключ из SecretStorage
            await this._llmService.setApiKey('');
            
            // Отправляем обновленную конфигурацию в webview
            await this._sendConfigToWebview();
            vscode.window.showInformationMessage('Настройки сброшены к значениям по умолчанию');
            // Явно отправляем сообщение об успешном сбросе для восстановления кнопки
            this._panel.webview.postMessage({
                command: 'configReset'
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
            vscode.window.showErrorMessage(`Ошибка сброса настроек: ${errorMessage}`);
            // Отправляем сообщение об ошибке в webview для восстановления кнопки
            this._panel.webview.postMessage({
                command: 'configResetError',
                error: errorMessage
            });
        }
    }

    /**
     * Обработка проверки локального сервера
     */
    private async _handleCheckLocalServer(url: string, provider: string) {
        try {
            let available = false;
            if (provider === 'ollama') {
                const providerInstance = new OllamaProvider();
                available = await providerInstance.checkAvailability(url);
            } else if (provider === 'openai') {
                const providerInstance = new OpenAiCompatibleProvider();
                available = await providerInstance.checkAvailability(url);
            }

            this._panel.webview.postMessage({
                command: 'localServerStatus',
                available: available
            });
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'localServerStatus',
                available: false
            });
        }
    }

    /**
     * Обработка команды векторизации всех файлов
     */
    private async _handleVectorizeAll() {
        Logger.info('[AICoderPanel] Начало обработки команды векторизации');
        
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            Logger.error('[AICoderPanel] Не открыта рабочая область');
            vscode.window.showErrorMessage('Не открыта рабочая область');
            return;
        }

        Logger.info(`[AICoderPanel] Рабочая область: ${workspaceFolder.uri.fsPath}`);

        // Запрашиваем подтверждение
        const action = await vscode.window.showWarningMessage(
            'Векторизация может занять длительное время. Продолжить?',
            { modal: true },
            'Да',
            'Нет'
        );

        if (action !== 'Да') {
            Logger.info('[AICoderPanel] Пользователь отменил векторизацию');
            return;
        }

        Logger.info('[AICoderPanel] Пользователь подтвердил векторизацию, запуск процесса...');

        // Показываем прогресс
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Векторизация файлов",
            cancellable: true
        }, async (progress, token) => {
            progress.report({ increment: 0, message: "Начало векторизации..." });
            Logger.info('[AICoderPanel] Прогресс-бар создан, вызов vectorizeAllUnprocessed...');

            try {
                let lastProcessed = 0;
                let lastErrors = 0;

                Logger.info('[AICoderPanel] Вызов embeddingService.vectorizeAllUnprocessed...');
                // Запускаем векторизацию
                const result = await this._embeddingService.vectorizeAllUnprocessed(workspaceFolder);
                Logger.info(`[AICoderPanel] vectorizeAllUnprocessed завершен: processed=${result.processed}, errors=${result.errors}`);

                progress.report({ increment: 100, message: "Готово!" });

                // Отправка результата в webview
                this._panel.webview.postMessage({
                    command: 'vectorizationComplete',
                    result: {
                        processed: result.processed,
                        errors: result.errors
                    }
                });

                Logger.info(`[AICoderPanel] Показ сообщения пользователю: Обработано: ${result.processed}, Ошибок: ${result.errors}`);
                vscode.window.showInformationMessage(
                    `Векторизация завершена. Обработано: ${result.processed}, Ошибок: ${result.errors}`
                );
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
                const errorStack = error instanceof Error ? error.stack : undefined;
                Logger.error(`[AICoderPanel] Ошибка при векторизации: ${errorMessage}`, error as Error);
                if (errorStack) {
                    Logger.error(`[AICoderPanel] Стек ошибки: ${errorStack}`, error as Error);
                }
                vscode.window.showErrorMessage(`Ошибка векторизации: ${errorMessage}`);
                
                this._panel.webview.postMessage({
                    command: 'vectorizationError',
                    error: errorMessage
                });
            }
        });
    }

    /**
     * Обработка команды поиска
     */
    private async _handleSearch(query: string, limit?: number) {
        // Получаем значение по умолчанию из настроек
        if (limit === undefined) {
            const config = vscode.workspace.getConfiguration('aiCoder');
            limit = config.get<number>(CONFIG_KEYS.UI.SEARCH_DEFAULT_LIMIT) ?? 10;
        }
        if (!query || query.trim().length === 0) {
            vscode.window.showWarningMessage('Пожалуйста, введите запрос для поиска');
            return;
        }

        // Показываем индикатор прогресса
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Поиск в хранилище",
            cancellable: false
        }, async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
            progress.report({ increment: 0, message: "Поиск похожих файлов..." });

            try {
                const results = await this._embeddingService.searchSimilar(query, limit);
                
                progress.report({ increment: 100, message: "Готово!" });
                
                // Отправка результата обратно в webview
                this._panel.webview.postMessage({
                    command: 'searchResults',
                    results: results
                });

                if (results.length === 0) {
                    vscode.window.showInformationMessage('Похожие файлы не найдены');
                } else {
                    vscode.window.showInformationMessage(`Найдено файлов: ${results.length}`);
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
                vscode.window.showErrorMessage(`Ошибка поиска: ${errorMessage}`);
                
                this._panel.webview.postMessage({
                    command: 'searchError',
                    error: errorMessage
                });
            }
        });
    }

    /**
     * Обработка получения всех записей
     */
    private async _handleGetAllItems(limit?: number) {
        try {
            const results = await this._embeddingService.getAllItems(limit);
            
            // Отправка результата обратно в webview
            this._panel.webview.postMessage({
                command: 'searchResults',
                results: results
            });

            if (results.length === 0) {
                vscode.window.showInformationMessage('Записи в хранилище отсутствуют');
            } else {
                vscode.window.showInformationMessage(`Загружено записей: ${results.length}`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
            vscode.window.showErrorMessage(`Ошибка загрузки записей: ${errorMessage}`);
            
            this._panel.webview.postMessage({
                command: 'searchError',
                error: errorMessage
            });
        }
    }

    /**
     * Обработка открытия файла
     */
    private async _handleOpenFile(filePath: string) {
        try {
            const uri = vscode.Uri.file(filePath);
            const document = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(document);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
            vscode.window.showErrorMessage(`Не удалось открыть файл ${filePath}: ${errorMessage}`);
        }
    }

    /**
     * Обработка очистки хранилища
     */
    private async _handleClearStorage() {
        // Запрашиваем подтверждение
        const confirm = await vscode.window.showWarningMessage(
            'Вы уверены, что хотите очистить хранилище эмбеддингов? Все векторизованные данные будут удалены.',
            { modal: true },
            'Да, очистить',
            'Отмена'
        );

        if (confirm !== 'Да, очистить') {
            return;
        }

        // Показываем индикатор прогресса
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Очистка хранилища",
            cancellable: false
        }, async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
            progress.report({ increment: 0, message: "Очистка данных..." });

            try {
                await this._embeddingService.clearStorage();
                
                progress.report({ increment: 100, message: "Готово!" });
                
                // Отправка результата обратно в webview
                this._panel.webview.postMessage({
                    command: 'storageCleared'
                });

                vscode.window.showInformationMessage('Хранилище эмбеддингов успешно очищено');
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
                vscode.window.showErrorMessage(`Ошибка очистки хранилища: ${errorMessage}`);
                
                this._panel.webview.postMessage({
                    command: 'storageClearError',
                    error: errorMessage
                });
            }
        });
    }

    /**
     * Обработка получения количества записей в хранилище
     */
    private async _handleGetStorageCount() {
        try {
            const [count, size] = await Promise.all([
                this._embeddingService.getStorageCount(),
                this._embeddingService.getStorageSize()
            ]);
            
            // Отправка результата обратно в webview
            this._panel.webview.postMessage({
                command: 'storageCount',
                count: count,
                size: size
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
            
            this._panel.webview.postMessage({
                command: 'storageCountError',
                error: errorMessage
            });
        }
    }

    /**
     * Обработка запроса на закрытие настроек с проверкой изменений
     */
    private async _handleRequestCloseSettings(hasChanges: boolean) {
        if (!hasChanges) {
            // Нет изменений - просто закрываем
            this._panel.webview.postMessage({
                command: 'closeSettings'
            });
            return;
        }

        // Есть изменения - показываем диалог
        const action = await vscode.window.showWarningMessage(
            'У вас есть несохраненные изменения. Что вы хотите сделать?',
            { modal: true },
            'Выйти с сохранением',
            'Выйти без сохранения'
        );

        if (action === 'Выйти с сохранением') {
            // Сохраняем настройки и закрываем
            this._panel.webview.postMessage({
                command: 'saveAndCloseSettings'
            });
        } else if (action === 'Выйти без сохранения') {
            // Отменяем изменения и закрываем
            this._panel.webview.postMessage({
                command: 'discardAndCloseSettings'
            });
        } else {
            // Пользователь закрыл диалог (нажал Escape или кликнул вне диалога) - отменяем закрытие
            this._panel.webview.postMessage({
                command: 'cancelCloseSettings'
            });
        }
    }

    /**
     * Обработка команды генерации
     */
    private async _handleGenerate(text: string) {
        if (!text || text.trim().length === 0) {
            vscode.window.showWarningMessage('Пожалуйста, введите текст для генерации');
            return;
        }

        // Показываем индикатор прогресса
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Генерация кода",
            cancellable: false
        }, async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
            progress.report({ increment: 0, message: "Обработка запроса..." });

            try {
                // Отправляем команду начала генерации
                this._panel.webview.postMessage({
                    command: 'generationStarted'
                });

                let fullResponse = '';
                let thinkingContent = '';
                let answerContent = '';
                
                // Маркеры для разделения размышлений и ответа
                const thinkingStartMarkers = ['<think>', '<think>', '```thinking', 'thinking:', 'размышление:'];
                const thinkingEndMarkers = ['</think>', '</think>', '```', 'answer:', 'ответ:'];
                
                let inThinkingBlock = false;
                let thinkingStartPos = -1;
                let thinkingEndPos = -1;
                let thinkingStartMarker = '';
                let thinkingEndMarker = '';

                // Используем streaming генерацию
                for await (const chunk of this._llmService.streamGenerateCode(text)) {
                    fullResponse += chunk;
                    
                    // Проверяем начало блока размышлений
                    if (!inThinkingBlock) {
                        for (const marker of thinkingStartMarkers) {
                            // Ищем маркер без учета регистра, но используем реальную позицию
                            const lowerResponse = fullResponse.toLowerCase();
                            const lowerMarker = marker.toLowerCase();
                            const pos = lowerResponse.indexOf(lowerMarker);
                            if (pos !== -1) {
                                inThinkingBlock = true;
                                thinkingStartMarker = marker;
                                // Пропускаем сам маркер - начинаем после него
                                // Используем реальную длину маркера из оригинального текста
                                const actualMarker = fullResponse.substring(pos, pos + marker.length);
                                thinkingStartPos = pos + actualMarker.length;
                                break;
                            }
                        }
                    }
                    
                    // Если мы в блоке размышлений, ищем конец
                    if (inThinkingBlock && thinkingEndPos === -1) {
                        for (const marker of thinkingEndMarkers) {
                            // Ищем маркер без учета регистра, но используем реальную позицию
                            const lowerResponse = fullResponse.toLowerCase();
                            const lowerMarker = marker.toLowerCase();
                            const pos = lowerResponse.indexOf(lowerMarker, thinkingStartPos);
                            if (pos !== -1) {
                                // Нашли конец размышлений
                                thinkingEndPos = pos;
                                thinkingEndMarker = marker;
                                // Используем реальную длину маркера из оригинального текста
                                const actualMarker = fullResponse.substring(pos, pos + marker.length);
                                // Извлекаем содержимое между тегами (без самих тегов)
                                thinkingContent = fullResponse.substring(thinkingStartPos, thinkingEndPos).trim();
                                // Ответ начинается после закрывающего тега
                                answerContent = fullResponse.substring(thinkingEndPos + actualMarker.length).trim();
                                inThinkingBlock = false;
                                break;
                            }
                        }
                    }
                    
                    // Отправляем обновление в реальном времени
                    if (inThinkingBlock && thinkingEndPos === -1) {
                        // Пока в блоке размышлений, показываем накопленный текст как размышления (без открывающего тега)
                        const currentThinking = fullResponse.substring(thinkingStartPos);
                        // Удаляем возможные закрывающие теги из размышлений
                        let cleanThinking = currentThinking;
                        for (const marker of thinkingEndMarkers) {
                            const lowerThinking = cleanThinking.toLowerCase();
                            const lowerMarker = marker.toLowerCase();
                            const markerPos = lowerThinking.indexOf(lowerMarker);
                            if (markerPos !== -1) {
                                // Удаляем тег и все после него из размышлений
                                cleanThinking = cleanThinking.substring(0, markerPos).trim();
                            }
                        }
                        thinkingContent = cleanThinking;
                        
                        this._panel.webview.postMessage({
                            command: 'streamChunk',
                            thinking: thinkingContent,
                            answer: '',
                            isThinking: true
                        });
                    } else if (thinkingEndPos !== -1) {
                        // После конца размышлений показываем ответ (без закрывающего тега)
                        answerContent = fullResponse.substring(thinkingEndPos + thinkingEndMarker.length).trim();
                        
                        this._panel.webview.postMessage({
                            command: 'streamChunk',
                            thinking: thinkingContent,
                            answer: answerContent,
                            isThinking: false
                        });
                    } else {
                        // Если нет блока размышлений, весь текст показываем как размышления в реальном времени
                        // А в конце весь текст будет итоговым ответом
                        thinkingContent = fullResponse;
                        
                        this._panel.webview.postMessage({
                            command: 'streamChunk',
                            thinking: thinkingContent,
                            answer: '',
                            isThinking: true
                        });
                    }
                }

                // Финальная обработка
                if (thinkingEndPos === -1 && thinkingStartPos !== -1) {
                    // Был блок размышлений, но не нашли конец - весь текст после начала = размышления (без открывающего тега)
                    thinkingContent = fullResponse.substring(thinkingStartPos).trim();
                    // Удаляем возможные закрывающие теги
                    for (const marker of thinkingEndMarkers) {
                        const lowerThinking = thinkingContent.toLowerCase();
                        const lowerMarker = marker.toLowerCase();
                        const markerPos = lowerThinking.indexOf(lowerMarker);
                        if (markerPos !== -1) {
                            // Используем реальную длину маркера
                            const actualMarker = thinkingContent.substring(markerPos, markerPos + marker.length);
                            thinkingContent = thinkingContent.substring(0, markerPos).trim();
                            // Ответ начинается после закрывающего тега
                            const answerStartPos = thinkingStartPos + markerPos + actualMarker.length;
                            answerContent = fullResponse.substring(answerStartPos).trim();
                            break;
                        }
                    }
                } else if (thinkingEndPos !== -1) {
                    // Было разделение - извлекаем содержимое без тегов
                    // Используем реальную длину закрывающего маркера
                    const actualEndMarker = fullResponse.substring(thinkingEndPos, thinkingEndPos + thinkingEndMarker.length);
                    thinkingContent = fullResponse.substring(thinkingStartPos, thinkingEndPos).trim();
                    answerContent = fullResponse.substring(thinkingEndPos + actualEndMarker.length).trim();
                } else {
                    // Не было блока размышлений - весь текст = итоговый ответ
                    answerContent = fullResponse;
                    thinkingContent = '';
                }

                progress.report({ increment: 100, message: "Готово!" });
                
                // Отправка финального результата
                this._panel.webview.postMessage({
                    command: 'generationComplete',
                    thinking: thinkingContent,
                    answer: answerContent || fullResponse
                });

                vscode.window.showInformationMessage('Код успешно сгенерирован!');
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
                vscode.window.showErrorMessage(`Ошибка генерации: ${errorMessage}`);
                
                this._panel.webview.postMessage({
                    command: 'error',
                    error: errorMessage
                });
            }
        });
    }

    /**
     * Генерация HTML для webview
     */
    private _getHtmlForWebview(webview: vscode.Webview) {
        // Получение URI для ресурсов
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css')
        );

        // Используем nonce для безопасности
        const nonce = getNonce();

        return `<!DOCTYPE html>
            <html lang="ru">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleUri}" rel="stylesheet">
                <title>AI Coder</title>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>AI Code Generator</h1>
                        <div class="header-actions">
                            <div class="tabs">
                                <button class="tab-button active" data-tab="generate">Генерация</button>
                                <button class="tab-button" data-tab="search">Поиск</button>
                            </div>
                            <button id="settings-btn" class="settings-button" title="Настройки">⚙️</button>
                        </div>
                    </div>

                    <!-- Вкладка генерации -->
                    <div class="tab-content active" id="tab-generate">
                        <div class="input-section">
                            <label for="prompt-input">Введите запрос для генерации кода:</label>
                            <textarea 
                                id="prompt-input" 
                                placeholder="Например: Создай функцию для сортировки массива чисел..."
                                rows="5"
                            ></textarea>
                        </div>
                        <div class="button-section">
                            <button id="generate-btn" class="generate-button">Сгенерировать код</button>
                        </div>
                        <div class="result-section" id="result-section" style="display: none;">
                            <div class="thinking-section" id="thinking-section" style="display: none;">
                                <h3 class="thinking-header">
                                    <button class="collapse-toggle" id="thinking-toggle" title="Свернуть/развернуть">▼</button>
                                    💭 Размышления модели:
                                </h3>
                                <div class="thinking-content-wrapper" id="thinking-content-wrapper">
                                    <div class="thinking-content" id="thinking-content"></div>
                                </div>
                            </div>
                            <div class="answer-section" id="answer-section" style="display: none;">
                                <h3 class="answer-header">✅ Итоговый ответ:</h3>
                                <div class="answer-content-wrapper">
                                    <button class="copy-icon-button" id="copy-answer-btn" title="Копировать код">📋</button>
                                    <pre class="answer-content" id="answer-content"></pre>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Вкладка поиска -->
                    <div class="tab-content" id="tab-search">
                        <div class="input-section">
                            <label for="search-query-input">Поиск похожих файлов по запросу:</label>
                            <textarea 
                                id="search-query-input" 
                                placeholder="Например: функция для работы с файлами, обработка ошибок..."
                                rows="3"
                            ></textarea>
                        </div>
                        <div class="button-section">
                            <button id="search-btn" class="generate-button">Найти похожие файлы</button>
                        </div>
                        <div class="result-section" id="search-result-section" style="display: none;">
                            <h2>Найденные файлы:</h2>
                            <div id="search-results-list"></div>
                        </div>
                    </div>

                    <!-- Модальное окно настроек -->
                    <div id="settings-modal" class="modal-overlay" style="display: none;">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h2>Настройки</h2>
                                <div class="modal-header-actions">
                                    <button id="reset-settings-btn" class="secondary-button">Сбросить</button>
                                    <button id="close-settings-btn" class="modal-close-button" title="Закрыть">×</button>
                                </div>
                            </div>
                            <div class="modal-body">
                                <h2>Настройки LLM</h2>
                                
                                <div class="settings-grid">
                                    <div class="setting-group">
                                        <label for="provider-select">Провайдер:</label>
                                        <select id="provider-select" class="setting-input">
                                            <option value="openai" selected>OpenAI</option>
                                            <option value="anthropic">Anthropic Claude</option>
                                            <option value="ollama">Ollama</option>
                                        </select>
                                    </div>

                                    <div class="setting-group">
                                        <label for="model-input">Модель LLM:</label>
                                        <input 
                                            type="text" 
                                            id="model-input" 
                                            class="setting-input"
                                            placeholder="gpt-4, gpt-3.5-turbo, claude-3-opus..."
                                        />
                                        <small class="setting-hint">Название модели вашего провайдера</small>
                                    </div>
                                </div>

                                <div class="setting-group">
                                    <label for="api-key-input">API Ключ:</label>
                                    <div class="api-key-wrapper">
                                        <input 
                                            type="password" 
                                            id="api-key-input" 
                                            class="setting-input"
                                            placeholder="Введите ваш API ключ"
                                        />
                                        <button id="toggle-api-key" class="toggle-button" title="Показать/скрыть">👁</button>
                                    </div>
                                    <small class="setting-hint">API ключ хранится в безопасном хранилище VS Code</small>
                                </div>

                                <div class="settings-grid">
                                    <div class="setting-group">
                                        <label for="temperature-input">Температура: <span id="temperature-value">0.7</span></label>
                                        <input 
                                            type="range" 
                                            id="temperature-input" 
                                            class="setting-slider"
                                            min="0" 
                                            max="2" 
                                            step="0.1" 
                                            value="0.7"
                                        />
                                        <small class="setting-hint">Контролирует креативность ответов (0 = детерминированный, 2 = очень креативный)</small>
                                    </div>

                                    <div class="setting-group">
                                        <label for="max-tokens-input">Максимум токенов:</label>
                                        <input 
                                            type="number" 
                                            id="max-tokens-input" 
                                            class="setting-input"
                                            min="100" 
                                            max="8000" 
                                            value="2000"
                                        />
                                        <small class="setting-hint">Максимальная длина ответа в токенах</small>
                                    </div>
                                </div>

                                <div class="settings-grid">
                                    <div class="setting-group" id="local-url-group" style="display: none;">
                                        <label for="local-url-input">URL локального сервера:</label>
                                        <input 
                                            type="text" 
                                            id="local-url-input" 
                                            class="setting-input"
                                            placeholder="http://localhost:11434"
                                        />
                                        <small class="setting-hint">URL для Ollama (по умолчанию: http://localhost:11434)</small>
                                    </div>

                                    <div class="setting-group" id="base-url-group" style="display: none;">
                                        <label for="base-url-input">URL сервера (опционально):</label>
                                        <input 
                                            type="text" 
                                            id="base-url-input" 
                                            class="setting-input"
                                            placeholder="http://localhost:1234/v1"
                                        />
                                        <small class="setting-hint">Для локальных моделей (LM Studio, LocalAI и т.д.). Если не указан, используется облачный OpenAI API</small>
                                    </div>

                                    <div class="setting-group">
                                        <label for="timeout-input">Таймаут (мс):</label>
                                        <input 
                                            type="number" 
                                            id="timeout-input" 
                                            class="setting-input"
                                            min="5000" 
                                            max="300000" 
                                            value="30000"
                                        />
                                        <small class="setting-hint">Максимальное время ожидания ответа</small>
                                    </div>
                                </div>

                                <div class="setting-group" id="local-check-group" style="display: none;">
                                    <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                                        <button id="check-local-btn" class="secondary-button" style="margin-left: 0;">Проверить подключение</button>
                                    </div>
                                </div>

                                <div class="setting-group">
                                    <label for="system-prompt-input">Системный промпт:</label>
                                    <textarea 
                                        id="system-prompt-input" 
                                        class="setting-input"
                                        rows="4"
                                        placeholder="Оставьте пустым для использования значения по умолчанию из настроек VS Code"
                                    ></textarea>
                                    <small class="setting-hint">Системный промпт определяет роль и поведение модели. Если не указан, используется значение по умолчанию из настроек.</small>
                                </div>


                                <div style="margin-top: 24px; padding-top: 16px; border-top: 2px solid var(--vscode-panel-border);">
                                    <h2>Настройки векторизации</h2>
                                    
                                    <div class="setting-group">
                                        <label for="embedder-model-input">Модель эмбеддинга:</label>
                                        <input 
                                            type="text" 
                                            id="embedder-model-input" 
                                            class="setting-input"
                                            placeholder="text-embedding-ada-002, nomic-embed-text, all-minilm..."
                                        />
                                        <small class="setting-hint">Модель для создания векторных представлений текста</small>
                                    </div>

                                    <div class="setting-group">
                                        <label for="summarize-prompt-input">Промпт для суммаризации:</label>
                                        <textarea 
                                            id="summarize-prompt-input" 
                                            class="setting-input"
                                            rows="4"
                                            placeholder="Промпт для суммаризации файлов при векторизации"
                                        ></textarea>
                                        <small class="setting-hint">Промпт используется для создания краткого описания содержимого файлов при векторизации</small>
                                    </div>

                                    <div class="setting-group">
                                        <label>Типы векторов для создания:</label>
                                        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
                                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                                <input type="checkbox" id="enable-origin-checkbox" checked>
                                                <span>Оригинальный текст</span>
                                                <small style="color: var(--vscode-descriptionForeground); font-size: 11px; margin-left: auto;">(origin)</small>
                                            </label>
                                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                                <input type="checkbox" id="enable-summarize-checkbox" checked>
                                                <span>Суммаризация по оригинальному тексту</span>
                                                <small style="color: var(--vscode-descriptionForeground); font-size: 11px; margin-left: auto;">(summarize)</small>
                                            </label>
                                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                                <input type="checkbox" id="enable-vs-origin-checkbox" checked>
                                                <span>Сумма векторов по оригинальному тексту вложений</span>
                                                <small style="color: var(--vscode-descriptionForeground); font-size: 11px; margin-left: auto;">(vs_origin)</small>
                                            </label>
                                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                                <input type="checkbox" id="enable-vs-summarize-checkbox" checked>
                                                <span>Сумма векторов по суммаризации вложений</span>
                                                <small style="color: var(--vscode-descriptionForeground); font-size: 11px; margin-left: auto;">(vs_summarize)</small>
                                            </label>
                                        </div>
                                        <small class="setting-hint">Выберите типы векторов, которые будут создаваться при векторизации файлов</small>
                                    </div>

                                    <div class="button-section">
                                        <button id="vectorize-btn" class="generate-button">Векторизовать все файлы</button>
                                    </div>

                                </div>

                                <div style="margin-top: 24px; padding-top: 16px; border-top: 2px solid var(--vscode-panel-border);">
                                    <h2>Хранилище эмбеддингов</h2>
                                    <div class="setting-group storage-status-group">
                                        <div class="storage-status-container">
                                            <div class="storage-status-item">
                                                <div class="storage-status-label">📊 Записей:</div>
                                                <div class="storage-status-value" id="storage-count">—</div>
                                            </div>
                                            <div class="storage-status-item">
                                                <div class="storage-status-label">💾 Размер:</div>
                                                <div class="storage-status-value" id="storage-size">—</div>
                                            </div>
                                        </div>
                                        <div class="storage-actions">
                                            <button id="refresh-storage-count-btn" class="secondary-button">
                                                🔄 Обновить
                                            </button>
                                            <button id="clear-storage-btn" class="secondary-button danger-button">
                                                🗑️ Очистить хранилище
                                            </button>
                                        </div>
                                        <p style="color: var(--vscode-descriptionForeground); margin-top: 10px; font-size: 11px; line-height: 1.4;">
                                            Очистка хранилища удалит все векторизованные данные. 
                                            После очистки необходимо будет заново выполнить векторизацию файлов.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }

    /**
     * Очистка ресурсов
     */
    public dispose() {
        AICoderPanel.currentPanel = undefined;

        // Очистка всех подписок
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}

/**
 * Генерация nonce для безопасности
 * Длина nonce берется из настроек
 */
function getNonce() {
    const config = vscode.workspace.getConfiguration('aiCoder');
    const nonceLength = config.get<number>(CONFIG_KEYS.UI.NONCE_LENGTH) ?? 32;
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < nonceLength; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

