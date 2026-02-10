/**
 * Компонент для рендеринга моделей сервера LLM.
 * Отвечает за построение HTML моделей в режимах просмотра и редактирования,
 * а также за прикрепление обработчиков событий.
 */
class ModelRenderer {
    /**
     * @param {Object} messageBus - Шина сообщений для взаимодействия с бэкендом
     */
    constructor(messageBus) {
        this.messageBus = messageBus;
    }

    /**
     * Рендеринг моделей сервера в DOM
     * @param {HTMLElement} serversList - Контейнер списка серверов
     * @param {string} serverId - ID сервера
     * @param {Array} models - Массив моделей
     * @param {boolean} editMode - Режим редактирования
     * @param {Object} options - Дополнительные опции
     * @param {string|null} options.addingModelServerId - ID сервера, для которого открыта форма добавления
     * @param {boolean} options.addModelFormVisible - Флаг видимости формы добавления
     * @param {Function} options.getServers - Функция для получения списка серверов
     */
    renderServerModels(serversList, serverId, models, editMode = false, options = {}) {
        const serverItem = serversList?.querySelector(`[data-server-id="${serverId}"]`);
        const modelsList = serverItem?.querySelector('.server-models-list');
        if (!modelsList) return;
        
        const editBtn = serverItem.querySelector('.edit-models-mode-btn');
        const viewBtn = serverItem.querySelector('.view-models-mode-btn');
        
        if (editMode) {
            if (editBtn) editBtn.style.display = 'none';
            if (viewBtn) viewBtn.style.display = 'inline-block';
        } else {
            if (editBtn) editBtn.style.display = 'inline-block';
            if (viewBtn) viewBtn.style.display = 'none';
        }
        
        // Показываем форму добавления модели, если она открыта
        if (options.addingModelServerId === serverId && options.addModelFormVisible) {
            return;
        }
        
        if (models.length === 0) {
            modelsList.innerHTML = '<div class="empty-servers-message">Модели не добавлены</div>';
            return;
        }
        
        if (editMode) {
            modelsList.innerHTML = models.map((model, index) => 
                this._buildModelEditHTML(serverId, model, index)
            ).join('');
            this._attachModelEditHandlers(serversList, serverId, options.getServers);
        } else {
            modelsList.innerHTML = models.map((model, index) => 
                this._buildModelViewHTML(serverId, model, index)
            ).join('');
            this._attachModelViewHandlers(serversList, serverId);
        }
    }

    /**
     * Построение HTML для модели в режиме редактирования
     */
    _buildModelEditHTML(serverId, model, index) {
        const modelId = model.id || `model-${index}`;
        const isModelActive = model.active !== false;
        
        return `
            <div class="model-item ${!isModelActive ? 'model-inactive' : ''}" data-model-id="${modelId}">
                <div class="model-info" style="display: flex; align-items: center; gap: 12px;">
                    <label class="model-active-toggle" style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" class="model-active-checkbox" data-server-id="${serverId}" data-model-id="${modelId}" ${isModelActive ? 'checked' : ''} style="margin-right: 8px; cursor: pointer;">
                        <span style="font-size: 11px; color: var(--vscode-foreground);">Активна</span>
                    </label>
                    <div style="flex: 1;">
                        <div class="setting-group" style="margin-bottom: 8px;">
                            <label style="display: block; margin-bottom: 4px; font-size: 11px;">Пользовательское наименование:</label>
                            <input 
                                type="text" 
                                class="model-display-name-input setting-input" 
                                data-model-id="${modelId}"
                                value="${model.displayName || ''}"
                                placeholder="${(window.escapeHtml || escapeHtml)(model.name)}"
                                style="width: 100%;"
                            />
                        </div>
                        <div style="font-size: 10px; color: var(--vscode-descriptionForeground);">
                            Оригинальное имя: ${(window.escapeHtml || escapeHtml)(model.name)}
                        </div>
                    </div>
                </div>
                <div class="model-settings">
                    <div class="settings-grid" style="margin-top: 12px;">
                        <div class="setting-group">
                            <label>Температура:</label>
                            <input 
                                type="number" 
                                class="model-temperature-input setting-input" 
                                data-model-id="${modelId}"
                                min="0" 
                                max="2" 
                                step="0.1" 
                                value="${model.temperature !== undefined ? model.temperature : ''}"
                                placeholder="0.7"
                            />
                        </div>
                        <div class="setting-group">
                            <label>Максимум токенов:</label>
                            <input 
                                type="number" 
                                class="model-max-tokens-input setting-input" 
                                data-model-id="${modelId}"
                                min="100" 
                                max="8000" 
                                value="${model.maxTokens !== undefined ? model.maxTokens : ''}"
                                placeholder="2000"
                            />
                        </div>
                    </div>
                    <div class="setting-group" style="margin-top: 8px;">
                        <label>Системный промпт:</label>
                        <textarea 
                            class="model-system-prompt-input setting-input" 
                            data-model-id="${modelId}"
                            rows="3"
                            placeholder="Оставьте пустым для использования значения по умолчанию"
                        >${model.systemPrompt || ''}</textarea>
                    </div>
                    <div class="button-section" style="margin-top: 12px;">
                        <button class="server-action-btn save-model-btn" data-server-id="${serverId}" data-model-id="${modelId}">
                            Сохранить настройки
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Построение HTML для модели в режиме просмотра
     */
    _buildModelViewHTML(serverId, model, index) {
        const modelId = model.id || `model-${index}`;
        const isModelActive = model.active !== false;
        const displayName = model.displayName || model.name;
        const settings = [];
        
        if (model.temperature !== undefined) {
            settings.push(`Температура: ${model.temperature}`);
        }
        if (model.maxTokens !== undefined) {
            settings.push(`Макс. токенов: ${model.maxTokens}`);
        }
        if (model.systemPrompt) {
            settings.push(`Системный промпт: ${model.systemPrompt.substring(0, 50)}${model.systemPrompt.length > 50 ? '...' : ''}`);
        }
        
        return `
            <div class="model-item ${!isModelActive ? 'model-inactive' : ''}" data-model-id="${modelId}">
                <div class="model-info" style="display: flex; align-items: center; gap: 12px;">
                    <label class="model-active-toggle" style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" class="model-active-checkbox" data-server-id="${serverId}" data-model-id="${modelId}" ${isModelActive ? 'checked' : ''} style="margin-right: 8px; cursor: pointer;">
                        <span style="font-size: 11px; color: var(--vscode-foreground);">Активна</span>
                    </label>
                    <div style="flex: 1;">
                        <div class="model-name">${(window.escapeHtml || escapeHtml)(displayName)}</div>
                        ${model.displayName ? `<div style="font-size: 10px; color: var(--vscode-descriptionForeground); margin-top: 2px;">${(window.escapeHtml || escapeHtml)(model.name)}</div>` : ''}
                        ${settings.length > 0 ? `<div class="model-settings-preview" style="font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 4px;">${settings.join(' • ')}</div>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Прикрепление обработчиков для режима редактирования моделей
     */
    _attachModelEditHandlers(serversList, serverId, getServers) {
        const serverItem = serversList?.querySelector(`[data-server-id="${serverId}"]`);
        const modelsList = serverItem?.querySelector('.server-models-list');
        if (!modelsList) return;
        
        // Сохранение настроек модели
        modelsList.querySelectorAll('.save-model-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const modelId = e.target.getAttribute('data-model-id');
                const modelItem = modelsList.querySelector(`[data-model-id="${modelId}"]`);
                if (!modelItem) return;
                
                const servers = getServers ? getServers() : [];
                const server = servers.find(s => s.id === serverId);
                const model = server?.models?.find(m => m.id === modelId || m.name === modelId);
                if (!model) return;
                
                const displayNameInput = modelItem.querySelector('.model-display-name-input');
                const temperatureInput = modelItem.querySelector('.model-temperature-input');
                const maxTokensInput = modelItem.querySelector('.model-max-tokens-input');
                const systemPromptInput = modelItem.querySelector('.model-system-prompt-input');
                
                const displayName = displayNameInput ? displayNameInput.value.trim() : undefined;
                const temperature = temperatureInput && temperatureInput.value ? 
                    parseFloat(temperatureInput.value) : undefined;
                const maxTokens = maxTokensInput && maxTokensInput.value ? 
                    parseInt(maxTokensInput.value) : undefined;
                const systemPrompt = systemPromptInput ? systemPromptInput.value.trim() : undefined;
                
                this.messageBus.send('updateServerModel', {
                    serverId: serverId,
                    model: {
                        id: modelId,
                        name: model.name,
                        displayName: displayName || undefined,
                        temperature: temperature,
                        maxTokens: maxTokens,
                        systemPrompt: systemPrompt
                    }
                });
            });
        });
        
        // Активность модели
        this._attachModelActiveHandlers(modelsList, serverId);
    }

    /**
     * Прикрепление обработчиков для режима просмотра моделей
     */
    _attachModelViewHandlers(serversList, serverId) {
        const serverItem = serversList?.querySelector(`[data-server-id="${serverId}"]`);
        const modelsList = serverItem?.querySelector('.server-models-list');
        if (!modelsList) return;
        
        this._attachModelActiveHandlers(modelsList, serverId);
    }

    /**
     * Прикрепление обработчиков переключения активности моделей
     */
    _attachModelActiveHandlers(modelsList, serverId) {
        modelsList.querySelectorAll('.model-active-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const modelId = e.target.getAttribute('data-model-id');
                const isActive = e.target.checked;
                this.messageBus.send('toggleModelActive', {
                    serverId: serverId,
                    modelId: modelId,
                    active: isActive
                });
            });
        });
    }
}
