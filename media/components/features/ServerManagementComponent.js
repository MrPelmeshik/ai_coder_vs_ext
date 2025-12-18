/**
 * Компонент управления серверами LLM
 */
class ServerManagementComponent {
    constructor(messageBus) {
        this.messageBus = messageBus;
        this.servers = [];
        this.editingServerId = null;
        this.modelsEditMode = {};
        
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
        
        this._initializeEventListeners();
        this._subscribeToMessages();
    }
    
    /**
     * Инициализация элементов DOM (ленивая инициализация)
     */
    _initializeElements() {
        // Кнопки
        this.addServerBtn = new Button(document.getElementById('add-server-btn'));
        this.saveServerBtn = new Button(document.getElementById('save-server-btn'));
        this.cancelServerBtn = new Button(document.getElementById('cancel-server-btn'));
        
        // Элементы формы
        this.serverFormCard = document.getElementById('server-form-card');
        this.serversList = document.getElementById('servers-list');
        
        // Поля формы
        this.serverNameInput = new Input(document.getElementById('server-name-input'));
        this.serverUrlInput = new Input(document.getElementById('server-url-input'));
        this.serverApiKeyInput = new Input(document.getElementById('server-api-key-input'));
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
        this.addServerBtn.onClick(() => this._showServerForm());
        
        // Сохранение сервера
        this.saveServerBtn.onClick(() => this._handleSaveServer());
        
        // Отмена
        this.cancelServerBtn.onClick(() => this._hideServerForm());
    }
    
    /**
     * Подписка на сообщения
     */
    _subscribeToMessages() {
        // Список серверов
        this.messageBus.subscribe('serversList', (message) => {
            console.log('ServerManagementComponent: получен список серверов', message.servers?.length || 0, message);
            // Переинициализируем элементы перед рендерингом
            this._initializeElements();
            
            // Обновляем список серверов (это источник истины)
            const newServers = message.servers || [];
            const beforeCount = this.servers.length;
            this.servers = newServers;
            
            console.log('ServerManagementComponent: серверы установлены в локальный массив:', this.servers.length, `(было: ${beforeCount})`);
            console.log('ServerManagementComponent: детали серверов:', this.servers.map(s => ({ id: s.id, name: s.name, active: s.active, modelsCount: s.models?.length || 0 })));
            
            // Всегда перерисовываем при получении актуального списка
            // Используем небольшую задержку, чтобы убедиться, что DOM готов
            setTimeout(() => {
                this._renderServers();
            }, 50);
            
            this.messageBus.send('getActiveModels');
        });
        
        // Модели сервера
        this.messageBus.subscribe('serverModelsList', (message) => {
            const server = this.servers.find(s => s.id === message.serverId);
            if (server) {
                server.models = message.models || [];
                const editMode = this.modelsEditMode[message.serverId] || false;
                this._renderServerModels(message.serverId, message.models || [], editMode);
            }
        });
        
        // Ошибка загрузки моделей
        this.messageBus.subscribe('serverModelsListError', (message) => {
            const serversList = this._getServersList();
            const serverItem = serversList?.querySelector(`[data-server-id="${message.serverId}"]`);
            const modelsList = serverItem?.querySelector('.server-models-list');
            if (modelsList) {
                modelsList.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--vscode-errorForeground);">Ошибка загрузки моделей: ${(window.escapeHtml || escapeHtml)(message.error)}</div>`;
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
            console.log('ServerManagementComponent: получено сообщение serverAdded', message);
            this._hideServerForm();
            
            // Переинициализируем элементы (на случай, если модальное окно было закрыто)
            this._initializeElements();
            
            // Проверяем, что элемент доступен
            const serversList = this._getServersList();
            if (!serversList) {
                console.warn('ServerManagementComponent: servers-list не найден, возможно вкладка "Подключения" не открыта');
                console.warn('ServerManagementComponent: полагаемся на сообщение serversList для обновления');
            } else {
                // Добавляем новый сервер в локальный список сразу для мгновенного обновления
                if (message.server) {
                    // Проверяем, нет ли уже такого сервера (на случай дублирования событий)
                    const exists = this.servers.find(s => s.id === message.server.id);
                    if (!exists) {
                        this.servers.push(message.server);
                        console.log('ServerManagementComponent: сервер добавлен в локальный список, всего серверов:', this.servers.length);
                        this._renderServers();
                    } else {
                        console.log('ServerManagementComponent: сервер уже существует в списке, пропускаем добавление');
                    }
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
                    console.log('ServerManagementComponent: сервер обновлен в локальном списке');
                    this._renderServers();
                } else {
                    // Если сервер не найден, добавляем его
                    this.servers.push(message.server);
                    console.log('ServerManagementComponent: сервер добавлен в локальный список (при обновлении)');
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
                const beforeCount = this.servers.length;
                this.servers = this.servers.filter(s => s.id !== message.serverId);
                console.log(`ServerManagementComponent: сервер удален из локального списка (было: ${beforeCount}, стало: ${this.servers.length})`);
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
        console.log('ServerManagementComponent: _renderServers вызван, серверов:', this.servers.length);
        console.log('ServerManagementComponent: список серверов:', this.servers.map(s => ({ id: s.id, name: s.name, active: s.active })));
        
        // Получаем элемент списка с проверкой
        let serversList = this._getServersList();
        if (!serversList) {
            console.warn('ServerManagementComponent: serversList элемент не найден, пытаемся найти позже...');
            // Пытаемся переинициализировать элементы
            this._initializeElements();
            serversList = this._getServersList();
            if (!serversList) {
                console.error('ServerManagementComponent: serversList элемент не найден после повторной попытки');
                console.error('ServerManagementComponent: пытаемся найти элемент напрямую...');
                // Пробуем найти элемент напрямую
                const directElement = document.getElementById('servers-list');
                if (directElement) {
                    console.log('ServerManagementComponent: элемент найден напрямую!');
                    this.serversList = directElement;
                    serversList = directElement;
                } else {
                    console.error('ServerManagementComponent: элемент не найден даже напрямую');
                    // НЕ возвращаемся - сохраняем данные для последующего рендеринга
                    console.warn('ServerManagementComponent: данные сохранены, рендеринг будет выполнен при открытии вкладки');
                    return;
                }
            }
        }
        
        // Проверяем, виден ли элемент (его родительская вкладка активна)
        const tabContent = serversList.closest('.settings-tab-content');
        const isVisible = !tabContent || tabContent.classList.contains('active');
        const displayStyle = window.getComputedStyle(serversList).display;
        const parentDisplay = tabContent ? window.getComputedStyle(tabContent).display : 'unknown';
        
        if (!isVisible) {
            console.log('ServerManagementComponent: элемент скрыт (вкладка не активна), но данные будут отрендерены');
            // Продолжаем рендеринг, даже если элемент скрыт - данные должны быть установлены
        }
        
        if (this.servers.length === 0) {
            serversList.innerHTML = '<div class="empty-servers-message">Серверы не добавлены</div>';
            console.log('ServerManagementComponent: отображено сообщение "Серверы не добавлены"');
            console.log('ServerManagementComponent: элемент виден:', isVisible);
            return;
        }
        
        let html;
        try {
            html = this.servers.map(server => this._buildServerHTML(server)).join('');
        } catch (error) {
            console.error('ServerManagementComponent: ошибка при построении HTML:', error);
            return;
        }
        
        serversList.innerHTML = html;
        
        console.log('ServerManagementComponent: серверы отрендерены, HTML длина:', html.length);
        console.log('ServerManagementComponent: HTML превью:', html.substring(0, 200));
        console.log('ServerManagementComponent: элемент виден:', isVisible);
        console.log('ServerManagementComponent: элемент serversList:', serversList);
        console.log('ServerManagementComponent: innerHTML установлен, длина:', serversList.innerHTML.length);
        
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
                            <button class="server-action-btn load-models-btn" data-server-id="${server.id}">
                                Загрузить модели
                            </button>
                        </div>
                    </div>
                    <div class="server-models-list" data-server-id="${server.id}">
                        <div style="text-align: center; padding: 20px; color: var(--vscode-descriptionForeground);">
                            Нажмите "Загрузить модели" для получения списка моделей с сервера
                        </div>
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
            console.warn('ServerManagementComponent: не могу прикрепить обработчики, serversList не найден');
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
        
        // Загрузка моделей
        serversList.querySelectorAll('.load-models-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const serverId = e.target.getAttribute('data-server-id');
                this._loadServerModels(serverId);
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
     * Загрузка моделей сервера
     */
    _loadServerModels(serverId) {
        const server = this.servers.find(s => s.id === serverId);
        if (!server) return;
        
        const serversList = this._getServersList();
        const serverItem = serversList?.querySelector(`[data-server-id="${serverId}"]`);
        const modelsList = serverItem?.querySelector('.server-models-list');
        
        if (modelsList) {
            modelsList.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--vscode-descriptionForeground);">Загрузка моделей...</div>';
        }
        
        this.messageBus.send('getServerModels', {
            serverId: serverId,
            url: server.url,
            apiKey: server.apiKey
        });
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
        
        if (models.length === 0) {
            modelsList.innerHTML = '<div class="empty-servers-message">Модели не найдены</div>';
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
                        <div class="model-name">${(window.escapeHtml || escapeHtml)(model.name)}</div>
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
                        <div class="model-name">${(window.escapeHtml || escapeHtml)(model.name)}</div>
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
                
                const modelName = modelItem.querySelector('.model-name')?.textContent || '';
                const temperatureInput = modelItem.querySelector('.model-temperature-input');
                const maxTokensInput = modelItem.querySelector('.model-max-tokens-input');
                const systemPromptInput = modelItem.querySelector('.model-system-prompt-input');
                
                const temperature = temperatureInput && temperatureInput.value ? 
                    parseFloat(temperatureInput.value) : undefined;
                const maxTokens = maxTokensInput && maxTokensInput.value ? 
                    parseInt(maxTokensInput.value) : undefined;
                const systemPrompt = systemPromptInput ? systemPromptInput.value.trim() : undefined;
                
                this.messageBus.send('updateServerModel', {
                    serverId: serverId,
                    model: {
                        id: modelId,
                        name: modelName,
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
        
        this.serverFormCard.style.display = 'flex';
        const serversList = this._getServersList();
        if (serversList) {
            serversList.insertBefore(this.serverFormCard, serversList.firstChild);
        }
        
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

