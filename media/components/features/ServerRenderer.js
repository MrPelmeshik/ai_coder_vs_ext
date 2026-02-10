/**
 * Компонент для рендеринга списка серверов LLM.
 * Отвечает за построение HTML серверов и прикрепление обработчиков событий.
 */
class ServerRenderer {
    /**
     * @param {Object} callbacks - Колбэки для обработки событий серверов
     * @param {Function} callbacks.onCheckServer - Проверка подключения к серверу
     * @param {Function} callbacks.onEditServer - Редактирование сервера
     * @param {Function} callbacks.onDeleteServer - Удаление сервера
     * @param {Function} callbacks.onToggleModels - Переключение видимости моделей
     * @param {Function} callbacks.onAddModel - Добавление модели
     * @param {Function} callbacks.onEditModelsMode - Включение режима редактирования моделей
     * @param {Function} callbacks.onViewModelsMode - Включение режима просмотра моделей
     * @param {Function} callbacks.onToggleServerActive - Переключение активности сервера
     */
    constructor(callbacks) {
        this.callbacks = callbacks;
    }

    /**
     * Построение HTML для одного сервера
     * @param {Object} server - Данные сервера
     * @returns {string} HTML-строка
     */
    buildServerHTML(server) {
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
     * Рендеринг списка серверов в DOM
     * @param {HTMLElement} serversList - Контейнер списка серверов
     * @param {Array} servers - Массив серверов
     * @param {HTMLElement|null} serverFormCard - Элемент формы сервера (для сохранения при перерисовке)
     */
    renderServers(serversList, servers, serverFormCard) {
        if (!serversList) {
            return;
        }
        
        // Сохраняем форму
        const formWasInList = serverFormCard && serverFormCard.parentNode === serversList;
        const formWasVisible = serverFormCard && serverFormCard.style.display !== 'none';
        
        if (servers.length === 0) {
            serversList.innerHTML = '<div class="empty-servers-message">Серверы не добавлены</div>';
            
            if (formWasInList && serverFormCard) {
                serversList.insertBefore(serverFormCard, serversList.firstChild);
                serverFormCard.style.display = 'none';
            }
            return;
        }
        
        let html;
        try {
            html = servers.map(server => this.buildServerHTML(server)).join('');
        } catch (error) {
            return;
        }
        
        serversList.innerHTML = html;
        
        // Восстанавливаем форму в начало списка после рендеринга
        if (serverFormCard) {
            if (!formWasInList || serverFormCard.parentNode !== serversList) {
                serversList.insertBefore(serverFormCard, serversList.firstChild);
            } else if (serversList.firstChild !== serverFormCard) {
                serversList.insertBefore(serverFormCard, serversList.firstChild);
            }
            if (!formWasVisible) {
                serverFormCard.style.display = 'none';
            }
        }
        
        this.attachServerHandlers(serversList);
    }

    /**
     * Прикрепление обработчиков событий к элементам серверов
     * @param {HTMLElement} serversList - Контейнер списка серверов
     */
    attachServerHandlers(serversList) {
        if (!serversList) return;
        
        // Проверка сервера
        serversList.querySelectorAll('.check-server-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const serverId = e.target.getAttribute('data-server-id');
                this.callbacks.onCheckServer(serverId);
            });
        });
        
        // Редактирование сервера
        serversList.querySelectorAll('.edit-server-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const serverId = e.target.getAttribute('data-server-id');
                this.callbacks.onEditServer(serverId);
            });
        });
        
        // Переключение моделей
        serversList.querySelectorAll('.toggle-models-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const serverId = e.target.closest('[data-server-id]')?.getAttribute('data-server-id') || 
                                e.target.getAttribute('data-server-id');
                this.callbacks.onToggleModels(serverId);
            });
        });
        
        // Добавление модели
        serversList.querySelectorAll('.add-model-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const serverId = e.target.getAttribute('data-server-id');
                this.callbacks.onAddModel(serverId);
            });
        });
        
        // Режим редактирования моделей
        serversList.querySelectorAll('.edit-models-mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const serverId = e.target.getAttribute('data-server-id');
                this.callbacks.onEditModelsMode(serverId);
            });
        });
        
        // Режим просмотра моделей
        serversList.querySelectorAll('.view-models-mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const serverId = e.target.getAttribute('data-server-id');
                this.callbacks.onViewModelsMode(serverId);
            });
        });
        
        // Удаление сервера
        serversList.querySelectorAll('.delete-server-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const serverId = e.target.getAttribute('data-server-id');
                this.callbacks.onDeleteServer(serverId);
            });
        });
        
        // Активность сервера
        serversList.querySelectorAll('.server-active-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const serverId = e.target.getAttribute('data-server-id');
                const isActive = e.target.checked;
                this.callbacks.onToggleServerActive(serverId, isActive);
            });
        });
    }

    /**
     * Переключение видимости контейнера моделей сервера
     * @param {HTMLElement} serversList - Контейнер списка серверов
     * @param {string} serverId - ID сервера
     */
    toggleServerModels(serversList, serverId) {
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
}
