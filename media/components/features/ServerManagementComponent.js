/**
 * Компонент управления серверами LLM
 */
class ServerManagementComponent {
    constructor(messageBus) {
        this.messageBus = messageBus;
        this.servers = [];
        this.editingServerId = null;
        this.modelsEditMode = {};
        this._addingModelServerId = null;
        this._addModelFormVisible = false;
        
        // Убеждаемся, что escapeHtml доступна (fallback если не загружена)
        if (typeof escapeHtml === 'undefined' && typeof window.escapeHtml === 'function') {
            window.escapeHtml = window.escapeHtml;
        } else if (typeof escapeHtml === 'undefined' && typeof window.escapeHtml === 'undefined') {
            // Создаем fallback функцию если escapeHtml не определена
            window.escapeHtml = function(text) {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            };
        }
        
        // Инициализация элементов - используем ленивую инициализацию, так как элементы могут быть в модальном окне
        this._initializeElements();
        
        // Убеждаемся, что форма скрыта при инициализации
        this._hideServerForm();
        
        this._initializeEventListeners();
        this._subscribeToMessages();
    }
    
    /**
     * Инициализация элементов DOM (ленивая инициализация)
     */
    _initializeElements() {
        // Кнопки - пересоздаем только если элемент найден и объект еще не создан или элемент изменился
        const addServerBtnElement = document.getElementById('add-server-btn');
        if (addServerBtnElement) {
            const wasRecreated = !this.addServerBtn || this.addServerBtn.element !== addServerBtnElement;
            const computedStyle = window.getComputedStyle(addServerBtnElement);
            
            if (wasRecreated) {
                this.addServerBtn = new Button(addServerBtnElement);
            }
            // Всегда переприкрепляем обработчик, чтобы убедиться, что он работает
            // (на случай, если обработчик был потерян)
            // Используем именованную функцию для возможности удаления
            if (!this._addServerHandler) {
                this._addServerHandler = () => {
                    this._showServerForm();
                };
            }
            this.addServerBtn.onClick(this._addServerHandler);
        }
        
        const saveServerBtnElement = document.getElementById('save-server-btn');
        if (saveServerBtnElement) {
            if (!this.saveServerBtn || this.saveServerBtn.element !== saveServerBtnElement) {
                this.saveServerBtn = new Button(saveServerBtnElement);
            }
            this.saveServerBtn.onClick(() => this._handleSaveServer());
        }
        
        const cancelServerBtnElement = document.getElementById('cancel-server-btn');
        if (cancelServerBtnElement) {
            if (!this.cancelServerBtn || this.cancelServerBtn.element !== cancelServerBtnElement) {
                this.cancelServerBtn = new Button(cancelServerBtnElement);
            }
            this.cancelServerBtn.onClick(() => this._hideServerForm());
        }
        
        // Элементы формы
        this.serverFormCard = document.getElementById('server-form-card');
        this.serversList = document.getElementById('servers-list');
        
        // Поля формы - пересоздаем только если элемент найден и объект еще не создан или элемент изменился
        const serverNameInputElement = document.getElementById('server-name-input');
        if (serverNameInputElement) {
            if (!this.serverNameInput || this.serverNameInput.element !== serverNameInputElement) {
                this.serverNameInput = new Input(serverNameInputElement);
            }
        }
        
        const serverUrlInputElement = document.getElementById('server-url-input');
        if (serverUrlInputElement) {
            if (!this.serverUrlInput || this.serverUrlInput.element !== serverUrlInputElement) {
                this.serverUrlInput = new Input(serverUrlInputElement);
            }
        }
        
        const serverApiKeyInputElement = document.getElementById('server-api-key-input');
        if (serverApiKeyInputElement) {
            if (!this.serverApiKeyInput || this.serverApiKeyInput.element !== serverApiKeyInputElement) {
                this.serverApiKeyInput = new Input(serverApiKeyInputElement);
            }
        }
    }
    
    /**
     * Получение элемента списка серверов (с проверкой)
     */
    _getServersList() {
        if (!this.serversList) {
            this.serversList = document.getElementById('servers-list');
        }
        return this.serversList;
    }
    
    /**
     * Инициализация обработчиков событий
     */
    _initializeEventListeners() {
        // Добавление сервера
        // Обработчик уже прикреплен в _initializeElements(), но прикрепляем еще раз для надежности
        if (this.addServerBtn && this.addServerBtn.element) {
            if (!this._addServerHandler) {
                this._addServerHandler = () => {
                    this._showServerForm();
                };
            }
            this.addServerBtn.onClick(this._addServerHandler);
        }
        
        // Сохранение сервера
        if (this.saveServerBtn && this.saveServerBtn.element) {
            if (!this._saveServerHandler) {
                this._saveServerHandler = () => this._handleSaveServer();
            }
            this.saveServerBtn.onClick(this._saveServerHandler);
        }
        
        // Отмена
        if (this.cancelServerBtn && this.cancelServerBtn.element) {
            if (!this._cancelServerHandler) {
                this._cancelServerHandler = () => this._hideServerForm();
            }
            this.cancelServerBtn.onClick(this._cancelServerHandler);
        }
    }
    
    /**
     * Подписка на сообщения
     */
    _subscribeToMessages() {
        // Список серверов
        this.messageBus.subscribe('serversList', (message) => {
            // Переинициализируем элементы перед рендерингом
            this._initializeElements();
            
            // Обновляем список серверов (это источник истины)
            this.servers = message.servers || [];
            
            // Всегда перерисовываем при получении актуального списка
            // Используем небольшую задержку, чтобы убедиться, что DOM готов
            setTimeout(() => {
                this._renderServers();
            }, 50);
            
            this.messageBus.send('getActiveModels');
        });
        
        // Модели сервера (для обратной совместимости, если где-то еще используется)
        this.messageBus.subscribe('serverModelsList', (message) => {
            const server = this.servers.find(s => s.id === message.serverId);
            if (server) {
                server.models = message.models || [];
                const editMode = this.modelsEditMode[message.serverId] || false;
                this._renderServerModels(message.serverId, message.models || [], editMode);
            }
        });
        
        // Список доступных моделей с сервера (для выбора при добавлении)
        this.messageBus.subscribe('availableModelsList', (message) => {
            if (this._addingModelServerId === message.serverId) {
                this._showAddModelFormWithModels(message.serverId, message.models || []);
            }
        });
        
        // Ошибка получения доступных моделей
        this.messageBus.subscribe('availableModelsListError', (message) => {
            if (this._addingModelServerId === message.serverId) {
                this.messageBus.send('showNotification', {
                    message: `Ошибка получения списка моделей: ${message.error}`,
                    type: 'error'
                });
                this._addingModelServerId = null;
            }
        });
        
        // Результат проверки сервера
        this.messageBus.subscribe('serverCheckResult', (message) => {
            const server = this.servers.find(s => s.id === message.serverId);
            if (server) {
                server.status = message.available ? 'available' : 'unavailable';
                this._renderServers();
            }
        });
        
        // Ошибка проверки сервера
        this.messageBus.subscribe('serverCheckError', (message) => {
            const server = this.servers.find(s => s.id === message.serverId);
            if (server) {
                server.status = 'unavailable';
                this._renderServers();
            }
        });
        
        // Модель добавлена
        this.messageBus.subscribe('serverModelAdded', (message) => {
            const server = this.servers.find(s => s.id === message.serverId);
            if (server) {
                if (!server.models) {
                    server.models = [];
                }
                // Добавляем модель (разрешаем добавлять одну и ту же модель несколько раз)
                server.models.push(message.model);
                const editMode = this.modelsEditMode[message.serverId] || false;
                this._renderServerModels(message.serverId, server.models, editMode);
            }
        });
        
        // Ошибка добавления модели
        this.messageBus.subscribe('serverModelAddError', (message) => {
            this.messageBus.send('showNotification', {
                message: `Ошибка добавления модели: ${message.error}`,
                type: 'error'
            });
            this._hideAddModelForm(message.serverId);
        });
        
        // Ошибка обновления модели
        this.messageBus.subscribe('serverModelUpdateError', (message) => {
            this.messageBus.send('showNotification', {
                message: `Ошибка обновления модели: ${message.error}`,
                type: 'error'
            });
        });
        
        // Обновление модели сервера
        this.messageBus.subscribe('serverModelUpdated', (message) => {
            const server = this.servers.find(s => s.id === message.serverId);
            if (server) {
                if (!server.models) {
                    server.models = [];
                }
                const modelIndex = server.models.findIndex(m => 
                    (m.id && m.id === message.model.id) || m.name === message.model.name
                );
                if (modelIndex !== -1) {
                    server.models[modelIndex] = message.model;
                } else {
                    server.models.push(message.model);
                }
                const editMode = this.modelsEditMode[message.serverId] || false;
                this._renderServerModels(message.serverId, server.models, editMode);
            }
        });
        
        // Обновление активности сервера
        this.messageBus.subscribe('serverActiveToggled', (message) => {
            const server = this.servers.find(s => s.id === message.serverId);
            if (server) {
                server.active = message.active;
                this._renderServers();
            }
        });
        
        // Обновление активности модели
        this.messageBus.subscribe('modelActiveToggled', (message) => {
            const server = this.servers.find(s => s.id === message.serverId);
            if (server && server.models) {
                const model = server.models.find(m => 
                    m.id === message.modelId || m.name === message.modelId
                );
                if (model) {
                    model.active = message.active;
                    const editMode = this.modelsEditMode[message.serverId] || false;
                    this._renderServerModels(message.serverId, server.models, editMode);
                }
            }
        });
        
        // Сервер добавлен
        this.messageBus.subscribe('serverAdded', (message) => {
            // Скрываем форму перед обновлением списка
            this._hideServerForm();
            
            // Переинициализируем элементы (на случай, если модальное окно было закрыто)
            this._initializeElements();
            
            // Проверяем, что элемент доступен
            const serversList = this._getServersList();
            if (serversList && message.server) {
                // Добавляем новый сервер в локальный список сразу для мгновенного обновления
                // Проверяем, нет ли уже такого сервера (на случай дублирования событий)
                const exists = this.servers.find(s => s.id === message.server.id);
                if (!exists) {
                    this.servers.push(message.server);
                    this._renderServers();
                }
            }
            
            // Не запрашиваем getServers, так как panel.ts уже отправит serversList
            // Это предотвращает двойное обновление и возможные гонки
        });
        
        // Ошибка добавления сервера
        this.messageBus.subscribe('serverAddError', (message) => {
            this.messageBus.send('showNotification', {
                message: `Ошибка добавления сервера: ${message.error}`,
                type: 'error'
            });
        });
        
        // Сервер обновлен
        this.messageBus.subscribe('serverUpdated', (message) => {
            this._hideServerForm();
            
            // Переинициализируем элементы
            this._initializeElements();
            
            // Обновляем сервер в локальном списке
            if (message.server) {
                const index = this.servers.findIndex(s => s.id === message.server.id);
                if (index !== -1) {
                    this.servers[index] = message.server;
                    this._renderServers();
                } else {
                    // Если сервер не найден, добавляем его
                    this.servers.push(message.server);
                    this._renderServers();
                }
            }
            
            // Не запрашиваем getServers, так как panel.ts уже отправит serversList
        });
        
        // Ошибка обновления сервера
        this.messageBus.subscribe('serverUpdateError', (message) => {
            this.messageBus.send('showNotification', {
                message: `Ошибка обновления сервера: ${message.error}`,
                type: 'error'
            });
        });
        
        // Сервер удален
        this.messageBus.subscribe('serverDeleted', (message) => {
            // Переинициализируем элементы
            this._initializeElements();
            
            // Удаляем сервер из локального списка
            if (message.serverId) {
                this.servers = this.servers.filter(s => s.id !== message.serverId);
                this._renderServers();
            }
            
            // Не запрашиваем getServers, так как panel.ts уже отправит serversList
        });
        
        // Ошибка удаления сервера
        this.messageBus.subscribe('serverDeleteError', (message) => {
            this.messageBus.send('showNotification', {
                message: `Ошибка удаления сервера: ${message.error}`,
                type: 'error'
            });
        });
        
        // Активность сервера изменена
        this.messageBus.subscribe('serverActiveToggled', () => {
            this.messageBus.send('getActiveModels');
        });
        
        // Активность модели изменена
        this.messageBus.subscribe('modelActiveToggled', () => {
            this.messageBus.send('getActiveModels');
        });
    }
    
    /**
     * Отображение списка серверов
     */
    _renderServers() {
        // Получаем элемент списка с проверкой
        let serversList = this._getServersList();
        if (!serversList) {
            // Пытаемся переинициализировать элементы
            this._initializeElements();
            serversList = this._getServersList();
            if (!serversList) {
                // Пробуем найти элемент напрямую
                const directElement = document.getElementById('servers-list');
                if (directElement) {
                    this.serversList = directElement;
                    serversList = directElement;
                } else {
                    // НЕ возвращаемся - сохраняем данные для последующего рендеринга
                    return;
                }
            }
        }
        
        // Сохраняем форму, если она находится в списке, чтобы не потерять её при установке innerHTML
        const formCard = this.serverFormCard;
        const formWasInList = formCard && formCard.parentNode === serversList;
        const formWasVisible = formCard && formCard.style.display !== 'none';
        
        if (this.servers.length === 0) {
            serversList.innerHTML = '<div class="empty-servers-message">Серверы не добавлены</div>';
            
            // Восстанавливаем форму, если она была в списке
            if (formWasInList && formCard) {
                serversList.insertBefore(formCard, serversList.firstChild);
                formCard.style.display = 'none'; // Всегда скрываем при пустом списке
            }
            return;
        }
        
        let html;
        try {
            html = this.servers.map(server => this._buildServerHTML(server)).join('');
        } catch (error) {
            return;
        }
        
        serversList.innerHTML = html;
        
        // Восстанавливаем форму в начало списка после рендеринга
        if (formCard) {
            if (!formWasInList || formCard.parentNode !== serversList) {
                // Если форма не в списке, добавляем её
                serversList.insertBefore(formCard, serversList.firstChild);
            } else if (serversList.firstChild !== formCard) {
                // Если форма в списке, но не в начале, перемещаем её
                serversList.insertBefore(formCard, serversList.firstChild);
            }
            // Убеждаемся, что форма скрыта (если она не была видима до рендеринга)
            if (!formWasVisible) {
                formCard.style.display = 'none';
            }
        }
        
        this._attachServerHandlers();
    }
    
    /**
     * Построение HTML для сервера
     */
    _buildServerHTML(server) {
        const statusClass = server.status === 'checking' ? 'checking' : 
                          server.status === 'available' ? 'available' : 'unavailable';
        const statusText = server.status === 'checking' ? 'Проверка...' :
                          server.status === 'available' ? '✓ Доступен' : '✗ Недоступен';
        const showStatus = server.status === 'checking' || server.status === 'available';
        const isActive = server.active !== false;
        
        return `
            <div class="server-item ${!isActive ? 'server-inactive' : ''}" data-server-id="${server.id}">
                <div class="server-main-content" style="display: flex; align-items: center; gap: 12px; width: 100%;">
                    <label class="server-active-toggle" style="display: flex; align-items: center; cursor: pointer; margin-right: 4px;">
                        <input type="checkbox" class="server-active-checkbox" data-server-id="${server.id}" ${isActive ? 'checked' : ''} style="margin-right: 8px; cursor: pointer;">
                        <span style="font-size: 12px; color: var(--vscode-foreground);">Активен</span>
                    </label>
                    <div class="server-info" style="flex: 1;">
                        <div class="server-name">${(window.escapeHtml || escapeHtml)(server.name)}</div>
                        <div class="server-url">${(window.escapeHtml || escapeHtml)(server.url)}</div>
                    </div>
                    ${showStatus ? `<div class="server-status ${statusClass}">${statusText}</div>` : ''}
                    <div class="server-actions">
                        <button class="server-action-btn check-server-btn" data-server-id="${server.id}" ${server.status === 'checking' ? 'disabled' : ''}>
                            Проверить
                        </button>
                        <button class="server-action-btn toggle-models-btn" data-server-id="${server.id}">
                            <span class="toggle-models-icon">▼</span> Модели
                        </button>
                        <button class="server-action-btn edit-server-btn" data-server-id="${server.id}">
                            Редактировать
                        </button>
                        <button class="server-action-btn danger delete-server-btn" data-server-id="${server.id}">
                            Удалить
                        </button>
                    </div>
                </div>
                <div class="server-models-container" data-server-id="${server.id}" style="display: none; width: 100%; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--vscode-panel-border);">
                    <div class="server-models-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <h4 style="margin: 0; font-size: 13px; font-weight: 600;">Модели сервера</h4>
                        <div style="display: flex; gap: 8px;">
                            <button class="server-action-btn edit-models-mode-btn" data-server-id="${server.id}" style="display: none;">
                                Редактировать
                            </button>
                            <button class="server-action-btn view-models-mode-btn" data-server-id="${server.id}">
                                Просмотр
                            </button>
                            <button class="server-action-btn add-model-btn" data-server-id="${server.id}">
                                + Добавить модель
                            </button>
                        </div>
                    </div>
                    <div class="server-models-list" data-server-id="${server.id}">
                        ${server.models && server.models.length > 0 ? '' : '<div style="text-align: center; padding: 20px; color: var(--vscode-descriptionForeground);">Модели не добавлены</div>'}
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Прикрепление обработчиков к серверам
     */
    _attachServerHandlers() {
        const serversList = this._getServersList();
        if (!serversList) {
            return;
        }
        
        // Проверка сервера
        serversList.querySelectorAll('.check-server-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const serverId = e.target.getAttribute('data-server-id');
                this._checkServer(serverId);
            });
        });
        
        // Редактирование сервера
        serversList.querySelectorAll('.edit-server-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const serverId = e.target.getAttribute('data-server-id');
                this._editServer(serverId);
            });
        });
        
        // Переключение моделей
        serversList.querySelectorAll('.toggle-models-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const serverId = e.target.closest('[data-server-id]')?.getAttribute('data-server-id') || 
                                e.target.getAttribute('data-server-id');
                this._toggleServerModels(serverId);
            });
        });
        
        // Добавление модели
        serversList.querySelectorAll('.add-model-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const serverId = e.target.getAttribute('data-server-id');
                this._showAddModelForm(serverId);
            });
        });
        
        // Режим редактирования моделей
        serversList.querySelectorAll('.edit-models-mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const serverId = e.target.getAttribute('data-server-id');
                this._setModelsEditMode(serverId, true);
            });
        });
        
        // Режим просмотра моделей
        serversList.querySelectorAll('.view-models-mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const serverId = e.target.getAttribute('data-server-id');
                this._setModelsEditMode(serverId, false);
            });
        });
        
        // Удаление сервера
        serversList.querySelectorAll('.delete-server-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const serverId = e.target.getAttribute('data-server-id');
                this._deleteServer(serverId);
            });
        });
        
        // Активность сервера
        serversList.querySelectorAll('.server-active-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const serverId = e.target.getAttribute('data-server-id');
                const isActive = e.target.checked;
                this._toggleServerActive(serverId, isActive);
            });
        });
    }
    
    /**
     * Проверка сервера
     */
    _checkServer(serverId) {
        const server = this.servers.find(s => s.id === serverId);
        if (!server) return;
        
        server.status = 'checking';
        this._renderServers();
        
        this.messageBus.send('checkServer', {
            serverId: serverId,
            url: server.url,
            apiKey: server.apiKey
        });
    }
    
    /**
     * Редактирование сервера
     */
    _editServer(serverId) {
        const server = this.servers.find(s => s.id === serverId);
        if (server) {
            this._showServerForm(server);
        }
    }
    
    /**
     * Удаление сервера
     */
    _deleteServer(serverId) {
        this.messageBus.send('deleteServer', { serverId });
    }
    
    /**
     * Переключение активности сервера
     */
    _toggleServerActive(serverId, active) {
        this.messageBus.send('toggleServerActive', {
            serverId: serverId,
            active: active
        });
    }
    
    /**
     * Переключение видимости моделей
     */
    _toggleServerModels(serverId) {
        const serversList = this._getServersList();
        const serverItem = serversList?.querySelector(`[data-server-id="${serverId}"]`);
        if (!serverItem) return;
        
        const modelsContainer = serverItem.querySelector('.server-models-container');
        const toggleBtn = serverItem.querySelector('.toggle-models-btn');
        const toggleIcon = toggleBtn?.querySelector('.toggle-models-icon');
        
        if (modelsContainer) {
            const isVisible = modelsContainer.style.display !== 'none';
            modelsContainer.style.display = isVisible ? 'none' : 'block';
            if (toggleIcon) {
                toggleIcon.textContent = isVisible ? '▼' : '▲';
            }
        }
    }
    
    /**
     * Показать форму добавления модели
     */
    _showAddModelForm(serverId) {
        const server = this.servers.find(s => s.id === serverId);
        if (!server) return;
        
        // Запрашиваем список доступных моделей с сервера
        this.messageBus.send('getAvailableModels', {
            serverId: serverId,
            url: server.url,
            apiKey: server.apiKey
        });
        
        // Сохраняем serverId для формы
        this._addingModelServerId = serverId;
    }
    
    /**
     * Показать форму добавления модели со списком доступных моделей
     */
    _showAddModelFormWithModels(serverId, availableModels) {
        const serversList = this._getServersList();
        const serverItem = serversList?.querySelector(`[data-server-id="${serverId}"]`);
        const modelsList = serverItem?.querySelector('.server-models-list');
        if (!modelsList) return;
        
        this._addModelFormVisible = true;
        
        // Показываем все доступные модели, включая уже добавленные
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
        
        // Вставляем форму в начало списка моделей
        modelsList.insertAdjacentHTML('afterbegin', formHTML);
        
        // Прикрепляем обработчики
        const saveBtn = modelsList.querySelector(`.save-add-model-btn[data-server-id="${serverId}"]`);
        const cancelBtn = modelsList.querySelector(`.cancel-add-model-btn[data-server-id="${serverId}"]`);
        
        if (saveBtn) {
            saveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._handleSaveAddModel(serverId);
            });
        }
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._hideAddModelForm(serverId);
            });
        }
    }
    
    /**
     * Скрыть форму добавления модели
     */
    _hideAddModelForm(serverId) {
        const serversList = this._getServersList();
        const serverItem = serversList?.querySelector(`[data-server-id="${serverId}"]`);
        const modelsList = serverItem?.querySelector('.server-models-list');
        const form = modelsList?.querySelector('.model-add-form');
        
        if (form) {
            form.remove();
        }
        
        this._addModelFormVisible = false;
        this._addingModelServerId = null;
        
        // Перерисовываем модели
        const server = this.servers.find(s => s.id === serverId);
        if (server) {
            const editMode = this.modelsEditMode[serverId] || false;
            this._renderServerModels(serverId, server.models || [], editMode);
        }
    }
    
    /**
     * Обработка сохранения новой модели
     */
    _handleSaveAddModel(serverId) {
        const serversList = this._getServersList();
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
        
        // Проверка обязательного поля пользовательского наименования
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
        
        // Отправляем запрос на добавление модели
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
        
        // Скрываем форму
        this._hideAddModelForm(serverId);
    }
    
    /**
     * Установка режима редактирования моделей
     */
    _setModelsEditMode(serverId, editMode) {
        this.modelsEditMode[serverId] = editMode;
        const server = this.servers.find(s => s.id === serverId);
        if (!server || !server.models) return;
        
        this._renderServerModels(serverId, server.models, editMode);
    }
    
    /**
     * Отображение моделей сервера
     */
    _renderServerModels(serverId, models, editMode = false) {
        const serversList = this._getServersList();
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
        if (this._addingModelServerId === serverId && this._addModelFormVisible) {
            return; // Форма уже отображается
        }
        
        if (models.length === 0) {
            modelsList.innerHTML = '<div class="empty-servers-message">Модели не добавлены</div>';
            return;
        }
        
        if (editMode) {
            modelsList.innerHTML = models.map((model, index) => 
                this._buildModelEditHTML(serverId, model, index)
            ).join('');
            this._attachModelEditHandlers(serverId);
        } else {
            modelsList.innerHTML = models.map((model, index) => 
                this._buildModelViewHTML(serverId, model, index)
            ).join('');
            this._attachModelViewHandlers(serverId);
        }
    }
    
    /**
     * Построение HTML для редактирования модели
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
     * Построение HTML для просмотра модели
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
     * Прикрепление обработчиков для редактирования моделей
     */
    _attachModelEditHandlers(serverId) {
        const serversList = this._getServersList();
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
                
                // Находим модель в списке для получения оригинального имени
                const server = this.servers.find(s => s.id === serverId);
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
                        name: model.name, // Сохраняем оригинальное имя
                        displayName: displayName || undefined,
                        temperature: temperature,
                        maxTokens: maxTokens,
                        systemPrompt: systemPrompt
                    }
                });
            });
        });
        
        // Активность модели
        modelsList.querySelectorAll('.model-active-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const modelId = e.target.getAttribute('data-model-id');
                const isActive = e.target.checked;
                this._toggleModelActive(serverId, modelId, isActive);
            });
        });
    }
    
    /**
     * Прикрепление обработчиков для просмотра моделей
     */
    _attachModelViewHandlers(serverId) {
        const serversList = this._getServersList();
        const serverItem = serversList?.querySelector(`[data-server-id="${serverId}"]`);
        const modelsList = serverItem?.querySelector('.server-models-list');
        if (!modelsList) return;
        
        // Активность модели
        modelsList.querySelectorAll('.model-active-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const modelId = e.target.getAttribute('data-model-id');
                const isActive = e.target.checked;
                this._toggleModelActive(serverId, modelId, isActive);
            });
        });
    }
    
    /**
     * Переключение активности модели
     */
    _toggleModelActive(serverId, modelId, active) {
        this.messageBus.send('toggleModelActive', {
            serverId: serverId,
            modelId: modelId,
            active: active
        });
    }
    
    /**
     * Показать форму сервера
     */
    _showServerForm(server = null) {
        if (!this.serverFormCard) {
            return;
        }
        
        this.editingServerId = server ? server.id : null;
        
        if (server) {
            this.serverNameInput.setValue(server.name || '');
            this.serverUrlInput.setValue(server.url || '');
            this.serverApiKeyInput.setValue(server.apiKey || '');
        } else {
            this.serverNameInput.clear();
            this.serverUrlInput.clear();
            this.serverApiKeyInput.clear();
        }
        
        // Перемещаем форму в начало списка перед показом
        const serversList = this._getServersList();
        if (serversList && this.serverFormCard.parentNode !== serversList) {
            // Если форма не в списке, добавляем её
            serversList.insertBefore(this.serverFormCard, serversList.firstChild);
        } else if (serversList && this.serverFormCard.parentNode === serversList) {
            // Если форма уже в списке, перемещаем её в начало
            if (this.serverFormCard !== serversList.firstChild) {
                serversList.insertBefore(this.serverFormCard, serversList.firstChild);
            }
        }
        
        // Показываем форму
        this.serverFormCard.style.display = 'flex';
        
        setTimeout(() => this.serverNameInput.focus(), 100);
    }
    
    /**
     * Скрыть форму сервера
     */
    _hideServerForm() {
        if (!this.serverFormCard) return;
        this.serverFormCard.style.display = 'none';
        this.editingServerId = null;
    }
    
    /**
     * Обработка сохранения сервера
     */
    _handleSaveServer() {
        const name = this.serverNameInput.getValue();
        const url = this.serverUrlInput.getValue();
        const apiKey = this.serverApiKeyInput.getValue();
        
        if (!name) {
            this.messageBus.send('showNotification', {
                message: 'Пожалуйста, укажите наименование сервера',
                type: 'error'
            });
            return;
        }
        
        if (!url) {
            this.messageBus.send('showNotification', {
                message: 'Пожалуйста, укажите URL сервера',
                type: 'error'
            });
            return;
        }
        
        // Валидация URL
        try {
            new URL(url);
        } catch (e) {
            this.messageBus.send('showNotification', {
                message: 'Некорректный URL сервера',
                type: 'error'
            });
            return;
        }
        
        if (this.editingServerId) {
            this.messageBus.send('updateServer', {
                serverId: this.editingServerId,
                server: {
                    name: name,
                    url: url,
                    apiKey: apiKey
                }
            });
            this._hideServerForm();
        } else {
            this.messageBus.send('addServer', {
                server: {
                    name: name,
                    url: url,
                    apiKey: apiKey
                }
            });
        }
    }
}

