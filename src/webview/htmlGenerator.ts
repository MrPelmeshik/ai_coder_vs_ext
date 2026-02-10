import * as vscode from 'vscode';
import { CONFIG_KEYS } from '../constants';

/**
 * Генерация nonce для Content Security Policy.
 * Длина nonce берётся из настроек расширения.
 */
function getNonce(): string {
    const config = vscode.workspace.getConfiguration('aiCoder');
    const nonceLength = config.get<number>(CONFIG_KEYS.UI.NONCE_LENGTH) ?? 32;
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < nonceLength; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

/**
 * Вспомогательная функция для получения URI скрипта/стиля из media/.
 */
function getMediaUri(webview: vscode.Webview, extensionUri: vscode.Uri, ...pathSegments: string[]): vscode.Uri {
    return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', ...pathSegments));
}

/**
 * Описание скриптов, подключаемых к webview.
 * Порядок важен: утилиты -> UI компоненты -> подкомпоненты -> функциональные компоненты -> main.
 */
const SCRIPT_PATHS: string[][] = [
    // Утилиты
    ['utils', 'domUtils.js'],
    ['utils', 'MessageBus.js'],
    // UI компоненты
    ['components', 'ui', 'Button.js'],
    ['components', 'ui', 'Select.js'],
    ['components', 'ui', 'Input.js'],
    ['components', 'ui', 'Modal.js'],
    ['components', 'ui', 'Tabs.js'],
    ['components', 'ui', 'StatusMessage.js'],
    // Подкомпоненты управления серверами
    ['components', 'features', 'ServerRenderer.js'],
    ['components', 'features', 'ModelRenderer.js'],
    ['components', 'features', 'ModelFormHandler.js'],
    // Функциональные компоненты
    ['components', 'features', 'CodeGenerationComponent.js'],
    ['components', 'features', 'SearchComponent.js'],
    ['components', 'features', 'VectorizationSettingsComponent.js'],
    ['components', 'features', 'StorageManagementComponent.js'],
    ['components', 'features', 'SettingsComponent.js'],
    ['components', 'features', 'ServerManagementComponent.js'],
    // Главный скрипт
    ['main.js'],
];

/**
 * Генерация тегов <script> для всех скриптов.
 */
function generateScriptTags(webview: vscode.Webview, extensionUri: vscode.Uri, nonce: string): string {
    return SCRIPT_PATHS
        .map(segments => {
            const uri = getMediaUri(webview, extensionUri, ...segments);
            return `<script nonce="${nonce}" src="${uri}"></script>`;
        })
        .join('\n                ');
}

/**
 * Генерация полного HTML для webview панели.
 * Подключает все стили, утилиты, UI-компоненты и функциональные компоненты.
 */
export function getHtmlForWebview(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const styleUri = getMediaUri(webview, extensionUri, 'main.css');
    const nonce = getNonce();
    const scripts = generateScriptTags(webview, extensionUri, nonce);

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
                            <label for="generation-model-select-main">Модель для генерации:</label>
                            <select id="generation-model-select-main" class="setting-input" style="margin-bottom: 12px;">
                                <option value="">Выберите модель...</option>
                            </select>
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
                            <div class="modal-tabs">
                                <button class="modal-tab-button active" data-settings-tab="general">Общие</button>
                                <button class="modal-tab-button" data-settings-tab="models">Подключения</button>
                            </div>
                            <div class="modal-body">
                                <!-- Вкладка "Общие" -->
                                <div class="settings-tab-content active" id="settings-tab-general">
                                    <h2>Выбор моделей</h2>
                                    
                                    <div class="setting-group">
                                        <label for="generation-model-select">Модель для генерации текста:</label>
                                        <select id="generation-model-select" class="setting-input">
                                            <option value="">Выберите модель...</option>
                                        </select>
                                        <small class="setting-hint">Модель из активных подключений для генерации кода</small>
                                    </div>

                                <div style="margin-top: 24px; padding-top: 16px; border-top: 2px solid var(--vscode-panel-border);">
                                    <h2>Настройки векторизации</h2>
                                    
                                    <div class="setting-group">
                                        <label for="embedder-model-select">Модель эмбеддинга:</label>
                                        <select id="embedder-model-select" class="setting-input">
                                            <option value="">Выберите модель...</option>
                                        </select>
                                        <small class="setting-hint">Модель из активных подключений для создания векторных представлений текста</small>
                                    </div>
                                    
                                    <div class="setting-group" id="summarize-model-group" style="display: none;">
                                        <label for="summarize-model-select">Модель для суммаризации:</label>
                                        <select id="summarize-model-select" class="setting-input">
                                            <option value="">Выберите модель...</option>
                                        </select>
                                        <small class="setting-hint">Модель из активных подключений для суммаризации файлов при векторизации</small>
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

                                <!-- Вкладка "Подключения" -->
                                <div class="settings-tab-content" id="settings-tab-models">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                                        <h2 style="margin: 0;">Управление серверами LLM</h2>
                                        <button id="add-server-btn" class="generate-button" style="margin: 0;">+ Добавить сервер</button>
                                    </div>
                                    
                                    <div id="servers-list" class="servers-list">
                                        <!-- Серверы будут добавлены динамически -->
                                    </div>
                                    
                                    <!-- Форма создания/редактирования сервера (скрыта по умолчанию) -->
                                    <div id="server-form-card" class="server-item server-form-card" style="display: none;">
                                        <div class="server-info" style="flex: 1;">
                                            <div style="display: flex; flex-direction: column; gap: 8px;">
                                                <input 
                                                    type="text" 
                                                    id="server-name-input" 
                                                    class="setting-input"
                                                    placeholder="Наименование сервера"
                                                    style="font-weight: 600; font-size: 13px;"
                                                />
                                                <input 
                                                    type="text" 
                                                    id="server-url-input" 
                                                    class="setting-input"
                                                    placeholder="URL сервера (например: http://localhost:1234/v1)"
                                                    style="font-size: 11px; font-family: var(--vscode-editor-font-family);"
                                                />
                                                <input 
                                                    type="password" 
                                                    id="server-api-key-input" 
                                                    class="setting-input"
                                                    placeholder="API ключ (опционально)"
                                                    style="font-size: 11px;"
                                                />
                                            </div>
                                        </div>
                                        <div class="server-actions">
                                            <button id="save-server-btn" type="button" class="server-action-btn">Сохранить</button>
                                            <button id="cancel-server-btn" type="button" class="server-action-btn">Отмена</button>
                                        </div>
                                    </div>
                                    
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                ${scripts}
            </body>
            </html>`;
}
