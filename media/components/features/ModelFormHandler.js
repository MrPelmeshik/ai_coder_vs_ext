/**
 * Компонент для управления формой добавления модели к серверу.
 * Отвечает за отображение формы с доступными моделями,
 * валидацию и отправку данных.
 */
class ModelFormHandler {
    /**
     * @param {Object} messageBus - Шина сообщений для взаимодействия с бэкендом
     */
    constructor(messageBus) {
        this.messageBus = messageBus;
        /** ID сервера, для которого показывается форма */
        this.addingModelServerId = null;
        /** Флаг видимости формы добавления */
        this.addModelFormVisible = false;
    }

    /**
     * Запуск процесса добавления модели — запрашивает список доступных моделей с сервера
     * @param {string} serverId - ID сервера
     * @param {Object} server - Данные сервера
     */
    requestAddModelForm(serverId, server) {
        if (!server) return;
        
        this.messageBus.send('getAvailableModels', {
            serverId: serverId,
            url: server.url,
            apiKey: server.apiKey
        });
        
        this.addingModelServerId = serverId;
    }

    /**
     * Показать форму добавления модели со списком доступных моделей
     * @param {HTMLElement} serversList - Контейнер списка серверов
     * @param {string} serverId - ID сервера
     * @param {Array<string>} availableModels - Список доступных моделей
     */
    showAddModelFormWithModels(serversList, serverId, availableModels) {
        const serverItem = serversList?.querySelector(`[data-server-id="${serverId}"]`);
        const modelsList = serverItem?.querySelector('.server-models-list');
        if (!modelsList) return;
        
        this.addModelFormVisible = true;
        
        const formHTML = `
            <div class="model-add-form" style="background-color: var(--vscode-textCodeBlock-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 16px; margin-bottom: 12px;">
                <h3 style="margin-top: 0; margin-bottom: 12px; font-size: 14px; font-weight: 600; color: var(--vscode-textLink-foreground);">Добавить модель</h3>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <div class="setting-group">
                        <label for="add-model-select-${serverId}" style="display: block; margin-bottom: 4px; font-size: 12px;">Модель с сервера:</label>
                        <select id="add-model-select-${serverId}" class="setting-input" style="width: 100%;">
                            <option value="">Выберите модель...</option>
                            ${availableModels.map(name => `<option value="${(window.escapeHtml || escapeHtml)(name)}">${(window.escapeHtml || escapeHtml)(name)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="setting-group">
                        <label for="add-model-display-name-${serverId}" style="display: block; margin-bottom: 4px; font-size: 12px;">Пользовательское наименование:</label>
                        <input 
                            type="text" 
                            id="add-model-display-name-${serverId}" 
                            class="setting-input" 
                            placeholder="Например: Основная модель для генерации"
                            required
                            style="width: 100%;"
                        />
                    </div>
                    <div class="settings-grid">
                        <div class="setting-group">
                            <label for="add-model-temperature-${serverId}" style="display: block; margin-bottom: 4px; font-size: 12px;">Температура:</label>
                            <input 
                                type="number" 
                                id="add-model-temperature-${serverId}" 
                                class="setting-input" 
                                min="0" 
                                max="2" 
                                step="0.1" 
                                placeholder="0.7"
                            />
                        </div>
                        <div class="setting-group">
                            <label for="add-model-max-tokens-${serverId}" style="display: block; margin-bottom: 4px; font-size: 12px;">Максимум токенов:</label>
                            <input 
                                type="number" 
                                id="add-model-max-tokens-${serverId}" 
                                class="setting-input" 
                                min="100" 
                                max="8000" 
                                placeholder="2000"
                            />
                        </div>
                    </div>
                    <div class="setting-group">
                        <label for="add-model-system-prompt-${serverId}" style="display: block; margin-bottom: 4px; font-size: 12px;">Системный промпт (необязательно):</label>
                        <textarea 
                            id="add-model-system-prompt-${serverId}" 
                            class="setting-input" 
                            rows="3"
                            placeholder="Оставьте пустым для использования значения по умолчанию"
                            style="width: 100%;"
                        ></textarea>
                    </div>
                    <div style="display: flex; gap: 8px; margin-top: 8px;">
                        <button class="server-action-btn save-add-model-btn" data-server-id="${serverId}" style="flex: 1;">
                            Добавить модель
                        </button>
                        <button class="server-action-btn cancel-add-model-btn" data-server-id="${serverId}">
                            Отмена
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        modelsList.insertAdjacentHTML('afterbegin', formHTML);
        
        // Прикрепляем обработчики
        const saveBtn = modelsList.querySelector(`.save-add-model-btn[data-server-id="${serverId}"]`);
        const cancelBtn = modelsList.querySelector(`.cancel-add-model-btn[data-server-id="${serverId}"]`);
        
        if (saveBtn) {
            saveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleSaveAddModel(serversList, serverId);
            });
        }
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.hideAddModelForm(serversList, serverId);
            });
        }
    }

    /**
     * Скрыть форму добавления модели
     * @param {HTMLElement} serversList - Контейнер списка серверов
     * @param {string} serverId - ID сервера
     */
    hideAddModelForm(serversList, serverId) {
        const serverItem = serversList?.querySelector(`[data-server-id="${serverId}"]`);
        const modelsList = serverItem?.querySelector('.server-models-list');
        const form = modelsList?.querySelector('.model-add-form');
        
        if (form) {
            form.remove();
        }
        
        this.addModelFormVisible = false;
        this.addingModelServerId = null;
    }

    /**
     * Обработка сохранения новой модели
     * @param {HTMLElement} serversList - Контейнер списка серверов
     * @param {string} serverId - ID сервера
     */
    handleSaveAddModel(serversList, serverId) {
        const serverItem = serversList?.querySelector(`[data-server-id="${serverId}"]`);
        const modelsList = serverItem?.querySelector('.server-models-list');
        
        const modelSelect = modelsList?.querySelector(`#add-model-select-${serverId}`);
        const displayNameInput = modelsList?.querySelector(`#add-model-display-name-${serverId}`);
        const temperatureInput = modelsList?.querySelector(`#add-model-temperature-${serverId}`);
        const maxTokensInput = modelsList?.querySelector(`#add-model-max-tokens-${serverId}`);
        const systemPromptInput = modelsList?.querySelector(`#add-model-system-prompt-${serverId}`);
        
        if (!modelSelect || !modelSelect.value) {
            this.messageBus.send('showNotification', {
                message: 'Пожалуйста, выберите модель',
                type: 'error'
            });
            return;
        }
        
        const modelName = modelSelect.value;
        const displayName = displayNameInput?.value.trim() || '';
        
        if (!displayName) {
            this.messageBus.send('showNotification', {
                message: 'Пожалуйста, введите пользовательское наименование модели',
                type: 'error'
            });
            if (displayNameInput) {
                displayNameInput.focus();
            }
            return;
        }
        
        const temperature = temperatureInput?.value ? parseFloat(temperatureInput.value) : undefined;
        const maxTokens = maxTokensInput?.value ? parseInt(maxTokensInput.value) : undefined;
        const systemPrompt = systemPromptInput?.value.trim() || undefined;
        
        this.messageBus.send('addServerModel', {
            serverId: serverId,
            model: {
                name: modelName,
                displayName: displayName,
                temperature: temperature,
                maxTokens: maxTokens,
                systemPrompt: systemPrompt,
                active: true
            }
        });
        
        this.hideAddModelForm(serversList, serverId);
    }
}
