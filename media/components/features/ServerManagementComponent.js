/**
 * Компонент управления серверами LLM.
 * Координирует работу подкомпонентов: ServerRenderer, ModelRenderer, ModelFormHandler.
 * Отвечает за состояние серверов, подписку на сообщения и форму сервера.
 */
class ServerManagementComponent {
    constructor(messageBus) {
        this.messageBus = messageBus;
        this.servers = [];
        this.editingServerId = null;
        this.modelsEditMode = {};
        
        // Убеждаемся, что escapeHtml доступна
        if (typeof escapeHtml === 'undefined' && typeof window.escapeHtml === 'function') {
            window.escapeHtml = window.escapeHtml;
        } else if (typeof escapeHtml === 'undefined' && typeof window.escapeHtml === 'undefined') {
            window.escapeHtml = function(text) {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            };
        }
        
        // Инициализация подкомпонентов
        this.serverRenderer = new ServerRenderer({
            onCheckServer: (serverId) => this._checkServer(serverId),
            onEditServer: (serverId) => this._editServer(serverId),
            onDeleteServer: (serverId) => this._deleteServer(serverId),
            onToggleModels: (serverId) => this._toggleServerModels(serverId),
            onAddModel: (serverId) => this._showAddModelForm(serverId),
            onEditModelsMode: (serverId) => this._setModelsEditMode(serverId, true),
            onViewModelsMode: (serverId) => this._setModelsEditMode(serverId, false),
            onToggleServerActive: (serverId, active) => this._toggleServerActive(serverId, active)
        });
        
        this.modelRenderer = new ModelRenderer(messageBus);
        this.modelFormHandler = new ModelFormHandler(messageBus);
        
        // Инициализация элементов DOM
        this._initializeElements();
        this._hideServerForm();
        this._initializeEventListeners();
        this._subscribeToMessages();
    }
    
    /**
     * Инициализация элементов DOM (ленивая инициализация)
     */
    _initializeElements() {
        const addServerBtnElement = document.getElementById('add-server-btn');
        if (addServerBtnElement) {
            const wasRecreated = !this.addServerBtn || this.addServerBtn.element !== addServerBtnElement;
            if (wasRecreated) {
                this.addServerBtn = new Button(addServerBtnElement);
            }
            if (!this._addServerHandler) {
                this._addServerHandler = () => this._showServerForm();
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
        
        this.serverFormCard = document.getElementById('server-form-card');
        this.serversList = document.getElementById('servers-list');
        
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
        if (this.addServerBtn && this.addServerBtn.element) {
            if (!this._addServerHandler) {
                this._addServerHandler = () => this._showServerForm();
            }
            this.addServerBtn.onClick(this._addServerHandler);
        }
        
        if (this.saveServerBtn && this.saveServerBtn.element) {
            if (!this._saveServerHandler) {
                this._saveServerHandler = () => this._handleSaveServer();
            }
            this.saveServerBtn.onClick(this._saveServerHandler);
        }
        
        if (this.cancelServerBtn && this.cancelServerBtn.element) {
            if (!this._cancelServerHandler) {
                this._cancelServerHandler = () => this._hideServerForm();
            }
            this.cancelServerBtn.onClick(this._cancelServerHandler);
        }
    }
    
    /**
     * Подписка на сообщения от бэкенда
     */
    _subscribeToMessages() {
        // Список серверов
        this.messageBus.subscribe('serversList', (message) => {
            this._initializeElements();
            this.servers = message.servers || [];
            setTimeout(() => this._renderServers(), 50);
            this.messageBus.send('getActiveModels');
        });
        
        // Модели сервера (для обратной совместимости)
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
            if (this.modelFormHandler.addingModelServerId === message.serverId) {
                const serversList = this._getServersList();
                this.modelFormHandler.showAddModelFormWithModels(serversList, message.serverId, message.models || []);
            }
        });
        
        // Ошибка получения доступных моделей
        this.messageBus.subscribe('availableModelsListError', (message) => {
            if (this.modelFormHandler.addingModelServerId === message.serverId) {
                this.messageBus.send('showNotification', {
                    message: `Ошибка получения списка моделей: ${message.error}`,
                    type: 'error'
                });
                this.modelFormHandler.addingModelServerId = null;
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
                if (!server.models) server.models = [];
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
            const serversList = this._getServersList();
            this.modelFormHandler.hideAddModelForm(serversList, message.serverId);
        });
        
        // Ошибка обновления модели
        this.messageBus.subscribe('serverModelUpdateError', (message) => {
            this.messageBus.send('showNotification', {
                message: `Ошибка обновления модели: ${message.error}`,
                type: 'error'
            });
        });
        
        // Обновление модели
        this.messageBus.subscribe('serverModelUpdated', (message) => {
            const server = this.servers.find(s => s.id === message.serverId);
            if (server) {
                if (!server.models) server.models = [];
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
            this.messageBus.send('getActiveModels');
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
            this.messageBus.send('getActiveModels');
        });
        
        // Сервер добавлен
        this.messageBus.subscribe('serverAdded', (message) => {
            this._hideServerForm();
            this._initializeElements();
            
            const serversList = this._getServersList();
            if (serversList && message.server) {
                const exists = this.servers.find(s => s.id === message.server.id);
                if (!exists) {
                    this.servers.push(message.server);
                    this._renderServers();
                }
            }
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
            this._initializeElements();
            
            if (message.server) {
                const index = this.servers.findIndex(s => s.id === message.server.id);
                if (index !== -1) {
                    this.servers[index] = message.server;
                } else {
                    this.servers.push(message.server);
                }
                this._renderServers();
            }
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
            this._initializeElements();
            if (message.serverId) {
                this.servers = this.servers.filter(s => s.id !== message.serverId);
                this._renderServers();
            }
        });
        
        // Ошибка удаления сервера
        this.messageBus.subscribe('serverDeleteError', (message) => {
            this.messageBus.send('showNotification', {
                message: `Ошибка удаления сервера: ${message.error}`,
                type: 'error'
            });
        });
    }
    
    // --- Делегирование к подкомпонентам ---
    
    /**
     * Отображение списка серверов
     */
    _renderServers() {
        let serversList = this._getServersList();
        if (!serversList) {
            this._initializeElements();
            serversList = this._getServersList();
            if (!serversList) {
                const directElement = document.getElementById('servers-list');
                if (directElement) {
                    this.serversList = directElement;
                    serversList = directElement;
                } else {
                    return;
                }
            }
        }
        
        this.serverRenderer.renderServers(serversList, this.servers, this.serverFormCard);
    }
    
    /**
     * Отображение моделей сервера
     */
    _renderServerModels(serverId, models, editMode = false) {
        const serversList = this._getServersList();
        this.modelRenderer.renderServerModels(serversList, serverId, models, editMode, {
            addingModelServerId: this.modelFormHandler.addingModelServerId,
            addModelFormVisible: this.modelFormHandler.addModelFormVisible,
            getServers: () => this.servers
        });
    }
    
    /**
     * Переключение видимости моделей сервера
     */
    _toggleServerModels(serverId) {
        const serversList = this._getServersList();
        this.serverRenderer.toggleServerModels(serversList, serverId);
    }
    
    /**
     * Показать форму добавления модели
     */
    _showAddModelForm(serverId) {
        const server = this.servers.find(s => s.id === serverId);
        this.modelFormHandler.requestAddModelForm(serverId, server);
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
    
    // --- Операции с серверами ---
    
    /**
     * Проверка подключения к серверу
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
    
    // --- Форма сервера ---
    
    /**
     * Показать форму создания/редактирования сервера
     */
    _showServerForm(server = null) {
        if (!this.serverFormCard) return;
        
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
        
        const serversList = this._getServersList();
        if (serversList && this.serverFormCard.parentNode !== serversList) {
            serversList.insertBefore(this.serverFormCard, serversList.firstChild);
        } else if (serversList && this.serverFormCard.parentNode === serversList) {
            if (this.serverFormCard !== serversList.firstChild) {
                serversList.insertBefore(this.serverFormCard, serversList.firstChild);
            }
        }
        
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
                server: { name, url, apiKey }
            });
            this._hideServerForm();
        } else {
            this.messageBus.send('addServer', {
                server: { name, url, apiKey }
            });
        }
    }
}
