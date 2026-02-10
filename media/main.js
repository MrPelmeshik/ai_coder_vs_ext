// @ts-nocheck
/* eslint-disable no-undef */

/**
 * Главный скрипт webview панели AI Coder.
 * Инициализирует MessageBus и все компоненты.
 */
(function () {
    'use strict';

    // Получаем VS Code API
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    // Инициализация шины сообщений
    const messageBus = new MessageBus(vscode);

    // Инициализация компонентов
    const codeGenerationComponent = new CodeGenerationComponent(messageBus, vscode);
    const searchComponent = new SearchComponent(messageBus);
    const settingsComponent = new SettingsComponent(messageBus);
    const serverManagementComponent = new ServerManagementComponent(messageBus);
    
    // Экспортируем для доступа из других компонентов
    window.serverManagementComponent = serverManagementComponent;

    // Инициализация вкладок
    const mainTabs = new Tabs('.container', {
        tabButtonSelector: '.tabs .tab-button',
        tabContentSelector: '.tab-content',
        dataAttribute: 'data-tab'
    });

    // Обработка уведомлений
    messageBus.subscribe('showNotification', (message) => {
        const text = message.message || message.text;
        if (text) {
            vscode.postMessage({
                command: 'showNotification',
                message: text,
                type: message.type || 'info'
            });
        }
    });

    // Запрос конфигурации при инициализации
    messageBus.send('getConfig');
    
    // Запрос сохраненных моделей
    messageBus.send('getSelectedModels');

    // Восстановление состояния
    const previousState = vscode.getState();
    if (previousState) {
        if (typeof codeGenerationComponent.restoreState === 'function') {
            codeGenerationComponent.restoreState(previousState);
        }
    }
})();
