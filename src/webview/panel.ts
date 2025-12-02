import * as vscode from 'vscode';
import * as path from 'path';
import { LLMService } from '../services/llmService';
import { OllamaProvider } from '../providers/ollamaProvider';
import { LocalApiProvider } from '../providers/localApiProvider';

/**
 * Класс для управления Webview панелью AI Coder
 */
export class AICoderPanel {
    public static currentPanel: AICoderPanel | undefined;
    public static readonly viewType = 'aiCoderPanel';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _llmService: LLMService;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, llmService: LLMService) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._llmService = llmService;

        // Установка начального содержимого webview
        this._update();

        // Отправка начальной конфигурации в webview
        this._sendConfigToWebview();

        // Обработка сообщений от webview
        this._panel.webview.onDidReceiveMessage(
            (message: any) => {
                switch (message.command) {
                    case 'generate':
                        this._handleGenerate(message.text);
                        return;
                    case 'getConfig':
                        this._sendConfigToWebview();
                        return;
                    case 'updateConfig':
                        this._handleUpdateConfig(message.config);
                        return;
                    case 'checkLocalServer':
                        this._handleCheckLocalServer(message.url, message.provider);
                        return;
                    case 'alert':
                        vscode.window.showInformationMessage(message.text);
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
    public static createOrShow(extensionUri: vscode.Uri, llmService: LLMService) {
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

        AICoderPanel.currentPanel = new AICoderPanel(panel, extensionUri, llmService);
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
        const config = await this._llmService.getConfig();
        // Не отправляем API ключ в webview по соображениям безопасности
        const safeConfig = {
            ...config,
            apiKey: config.apiKey ? '***' : '',
            hasApiKey: await this._llmService.hasApiKey(),
            localUrl: config.localUrl || 'http://localhost:11434'
        };
        
        this._panel.webview.postMessage({
            command: 'config',
            config: safeConfig
        });
    }

    /**
     * Обработка обновления конфигурации
     */
    private async _handleUpdateConfig(config: any) {
        try {
            await this._llmService.updateConfig(config);
            await this._sendConfigToWebview();
            vscode.window.showInformationMessage('Настройки успешно сохранены');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
            vscode.window.showErrorMessage(`Ошибка сохранения настроек: ${errorMessage}`);
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
            } else if (provider === 'custom') {
                const providerInstance = new LocalApiProvider();
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
                // Задел на будущее: вызов LLM сервиса
                const result = await this._llmService.generateCode(text);
                
                progress.report({ increment: 100, message: "Готово!" });
                
                // Отправка результата обратно в webview
                this._panel.webview.postMessage({
                    command: 'generated',
                    result: result
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
                        <div class="tabs">
                            <button class="tab-button active" data-tab="generate">Генерация</button>
                            <button class="tab-button" data-tab="settings">Настройки</button>
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
                            <h2>Результат:</h2>
                            <pre id="result-content"></pre>
                        </div>
                        <div class="status-section" id="status-section"></div>
                    </div>

                    <!-- Вкладка настроек -->
                    <div class="tab-content" id="tab-settings">
                        <div class="settings-section">
                            <h2>Настройки LLM</h2>
                            
                            <div class="setting-group">
                                <label for="provider-select">Провайдер:</label>
                                <select id="provider-select" class="setting-input">
                                    <option value="openai">OpenAI</option>
                                    <option value="anthropic">Anthropic Claude</option>
                                    <option value="ollama">Ollama</option>
                                    <option value="custom">Кастомный</option>
                                </select>
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

                            <div class="setting-group">
                                <label for="model-input">Модель:</label>
                                <input 
                                    type="text" 
                                    id="model-input" 
                                    class="setting-input"
                                    placeholder="gpt-4, gpt-3.5-turbo, claude-3-opus..."
                                />
                                <small class="setting-hint">Название модели вашего провайдера</small>
                            </div>

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
                                <label for="base-url-input">Базовый URL:</label>
                                <input 
                                    type="text" 
                                    id="base-url-input" 
                                    class="setting-input"
                                    placeholder="http://localhost:1234/v1"
                                />
                                <small class="setting-hint">URL для кастомного провайдера или LM Studio (например: http://localhost:1234/v1)</small>
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

                            <div class="setting-group" id="local-check-group" style="display: none;">
                                <button id="check-local-btn" class="secondary-button">Проверить подключение</button>
                                <div id="local-status" class="local-status"></div>
                            </div>

                            <div class="button-section">
                                <button id="save-settings-btn" class="generate-button">Сохранить настройки</button>
                                <button id="reset-settings-btn" class="secondary-button">Сбросить</button>
                            </div>

                            <div class="status-section" id="settings-status-section"></div>
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
 */
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

