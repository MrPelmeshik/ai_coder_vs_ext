/**
 * Компонент настроек
 */
class SettingsComponent {
    constructor(messageBus) {
        this.messageBus = messageBus;
        this.originalSettings = null;
        this.activeModels = [];
        
        // Инициализация элементов
        this.settingsBtn = document.getElementById('settings-btn');
        this.settingsModal = new Modal(document.getElementById('settings-modal'));
        this.closeSettingsBtn = document.getElementById('close-settings-btn');
        
        // Модели
        this.generationModelSelect = new Select(document.getElementById('generation-model-select'));
        this.embedderModelSelect = new Select(document.getElementById('embedder-model-select'));
        this.summarizeModelSelect = new Select(document.getElementById('summarize-model-select'));
        this.summarizeModelGroup = document.getElementById('summarize-model-group');
        this.summarizePromptInput = new Input(document.getElementById('summarize-prompt-input'));
        
        // Чекбоксы
        this.enableOriginCheckbox = document.getElementById('enable-origin-checkbox');
        this.enableSummarizeCheckbox = document.getElementById('enable-summarize-checkbox');
        this.enableVsOriginCheckbox = document.getElementById('enable-vs-origin-checkbox');
        this.enableVsSummarizeCheckbox = document.getElementById('enable-vs-summarize-checkbox');
        
        // Кнопки
        this.vectorizeBtn = new Button(document.getElementById('vectorize-btn'), { loadingText: 'Векторизация...' });
        this.clearStorageBtn = new Button(document.getElementById('clear-storage-btn'), { loadingText: 'Очистка...' });
        this.refreshStorageCountBtn = new Button(document.getElementById('refresh-storage-count-btn'));
        this.resetSettingsBtn = document.getElementById('reset-settings-btn');
        
        // Хранилище
        this.storageCount = document.getElementById('storage-count');
        this.storageSize = document.getElementById('storage-size');
        
        // Вкладки в модальном окне
        // Кнопки находятся в .modal-tabs, контент - в .modal-body
        this.settingsTabs = new Tabs('#settings-modal', {
            tabButtonSelector: '.modal-tab-button',
            tabContentSelector: '.settings-tab-content',
            dataAttribute: 'data-settings-tab'
        });
        
        this._initializeEventListeners();
        this._subscribeToMessages();
    }
    
    /**
     * Инициализация обработчиков событий
     */
    _initializeEventListeners() {
        // Открытие модального окна
        if (this.settingsBtn) {
            this.settingsBtn.addEventListener('click', () => {
                this.settingsModal.open();
                // Переинициализируем элементы ServerManagementComponent при открытии модального окна
                if (window.serverManagementComponent && typeof window.serverManagementComponent._initializeElements === 'function') {
                    window.serverManagementComponent._initializeElements();
                }
                setTimeout(() => {
                    this._saveOriginalSettings();
                }, 100);
                this._requestStorageCount();
                setTimeout(() => {
                    this.messageBus.send('getServers');
                    this.messageBus.send('getActiveModels');
                }, 150);
            });
        }
        
        // Закрытие модального окна
        this.settingsModal.initCloseHandlers(this.closeSettingsBtn);
        this.settingsModal.onClose(() => {
            this._closeWithCheck();
        });
        
        // Векторизация
        this.vectorizeBtn.onClick(() => this._handleVectorize());
        
        // Очистка хранилища
        this.clearStorageBtn.onClick(() => this._handleClearStorage());
        
        // Обновление количества записей
        this.refreshStorageCountBtn.onClick(() => this._requestStorageCount());
        
        // Сброс настроек
        if (this.resetSettingsBtn) {
            this.resetSettingsBtn.addEventListener('click', () => {
                this.resetSettingsBtn.disabled = true;
                this.messageBus.send('requestResetConfig');
            });
        }
        
        // Переключение вкладок настроек
        this.settingsTabs.onChange((tabId) => {
            this._previousTab = tabId;
            
            if (tabId === 'models') {
                // Переинициализируем элементы ServerManagementComponent при открытии вкладки
                // Используем задержку, чтобы убедиться, что DOM обновился и вкладка стала видимой
                setTimeout(() => {
                    if (window.serverManagementComponent && typeof window.serverManagementComponent._initializeElements === 'function') {
                        window.serverManagementComponent._initializeElements();
                        // Также переинициализируем обработчики событий
                        if (typeof window.serverManagementComponent._initializeEventListeners === 'function') {
                            window.serverManagementComponent._initializeEventListeners();
                        }
                        // Принудительно перерисовываем серверы при открытии вкладки
                        if (typeof window.serverManagementComponent._renderServers === 'function') {
                            window.serverManagementComponent._renderServers();
                        }
                    }
                }, 50);
                // Загружаем серверы
                this.messageBus.send('getServers');
            }
        });
        
        // Показ/скрытие группы модели суммаризации
        if (this.enableSummarizeCheckbox && this.summarizeModelGroup) {
            this.enableSummarizeCheckbox.addEventListener('change', () => {
                this.summarizeModelGroup.style.display = 
                    this.enableSummarizeCheckbox.checked ? 'block' : 'none';
            });
        }
    }
    
    /**
     * Подписка на сообщения
     */
    _subscribeToMessages() {
        // Конфигурация
        this.messageBus.subscribe('config', (message) => {
            this._updateUI(message.config);
            if (this.resetSettingsBtn) {
                this.resetSettingsBtn.disabled = false;
            }
            if (this.settingsModal.isOpen) {
                setTimeout(() => {
                    this._saveOriginalSettings();
                }, 100);
            }
            this._requestStorageCount();
        });
        
        // Активные модели
        this.messageBus.subscribe('activeModelsList', (message) => {
            this.activeModels = message.models || [];
            this._updateModelSelects();
        });
        
        // Векторизация
        this.messageBus.subscribe('vectorizationComplete', (message) => {
            this.vectorizeBtn.setLoading(false);
            this.messageBus.send('showNotification', {
                message: `Векторизация завершена. Обработано: ${message.result.processed}, Ошибок: ${message.result.errors}`,
                type: message.result.errors > 0 ? 'warning' : 'success'
            });
            this._requestStorageCount();
        });
        
        this.messageBus.subscribe('vectorizationError', (message) => {
            this.vectorizeBtn.setLoading(false);
            this.messageBus.send('showNotification', {
                message: `Ошибка векторизации: ${message.error}`,
                type: 'error'
            });
        });
        
        // Хранилище
        this.messageBus.subscribe('storageCount', (message) => {
            if (this.storageCount) {
                const count = message.count || 0;
                this.storageCount.textContent = count.toLocaleString('ru-RU');
            }
            if (this.storageSize) {
                const size = message.size || 0;
                try {
                    // formatBytes будет доступен из domUtils.js, но если нет - используем inline функцию
                    let formatBytesFn = window.formatBytes || (typeof formatBytes !== 'undefined' ? formatBytes : null);
                    
                    // Если функция все еще недоступна, создаем inline версию
                    if (!formatBytesFn) {
                        formatBytesFn = (bytes) => {
                            if (bytes === 0) return '0 Б';
                            const k = 1024;
                            const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
                            const i = Math.floor(Math.log(bytes) / Math.log(k));
                            return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
                        };
                    }
                    
                    const formattedSize = formatBytesFn(size);
                    this.storageSize.textContent = formattedSize;
                } catch (error) {
                    // Fallback: просто показываем размер в байтах
                    this.storageSize.textContent = `${size} Б`;
                }
            }
        });
        
        this.messageBus.subscribe('storageCleared', () => {
            this.clearStorageBtn.setLoading(false);
            this.messageBus.send('showNotification', {
                message: 'Хранилище эмбеддингов успешно очищено',
                type: 'success'
            });
            this._requestStorageCount();
        });
        
        this.messageBus.subscribe('storageClearError', (message) => {
            this.clearStorageBtn.setLoading(false);
            this.messageBus.send('showNotification', {
                message: `Ошибка очистки хранилища: ${message.error}`,
                type: 'error'
            });
            this._requestStorageCount();
        });
        
        // Сброс настроек
        this.messageBus.subscribe('resetConfigStarted', () => {
            this.messageBus.send('showNotification', {
                message: 'Сброс настроек...',
                type: 'info'
            });
        });
        
        this.messageBus.subscribe('resetConfigCancelled', () => {
            if (this.resetSettingsBtn) {
                this.resetSettingsBtn.disabled = false;
            }
        });
        
        this.messageBus.subscribe('configReset', () => {
            if (this.resetSettingsBtn) {
                this.resetSettingsBtn.disabled = false;
            }
            setTimeout(() => {
                this._saveOriginalSettings();
            }, 100);
        });
        
        this.messageBus.subscribe('configResetError', (message) => {
            if (this.resetSettingsBtn) {
                this.resetSettingsBtn.disabled = false;
            }
            this.messageBus.send('showNotification', {
                message: `Ошибка сброса настроек: ${message.error}`,
                type: 'error'
            });
        });
    }
    
    /**
     * Обновление UI из конфигурации
     */
    _updateUI(config) {
        // Обновление селектов моделей
        if (config.generationModel) {
            this.generationModelSelect.setValue(config.generationModel);
        }
        if (config.embedderModel) {
            this.embedderModelSelect.setValue(config.embedderModel);
        }
        if (config.summarizeModel) {
            this.summarizeModelSelect.setValue(config.summarizeModel);
        }
        
        // Обновление промпта суммаризации
        if (config.summarizePrompt) {
            this.summarizePromptInput.setValue(config.summarizePrompt);
        }
        
        // Обновление чекбоксов
        if (this.enableOriginCheckbox && config.enableOrigin !== undefined) {
            this.enableOriginCheckbox.checked = config.enableOrigin;
        }
        if (this.enableSummarizeCheckbox && config.enableSummarize !== undefined) {
            this.enableSummarizeCheckbox.checked = config.enableSummarize;
            if (this.summarizeModelGroup) {
                this.summarizeModelGroup.style.display = 
                    config.enableSummarize ? 'block' : 'none';
            }
        }
        if (this.enableVsOriginCheckbox && config.enableVsOrigin !== undefined) {
            this.enableVsOriginCheckbox.checked = config.enableVsOrigin;
        }
        if (this.enableVsSummarizeCheckbox && config.enableVsSummarize !== undefined) {
            this.enableVsSummarizeCheckbox.checked = config.enableVsSummarize;
        }
    }
    
    /**
     * Обновление селектов моделей
     */
    _updateModelSelects() {
        const options = this.activeModels.map(model => ({
            value: `${model.serverId}:${model.modelId}`,
            label: `${model.serverName} - ${model.modelName}`
        }));
        
        const defaultOption = { value: '', label: 'Выберите модель...' };
        
        this.generationModelSelect.setOptions([defaultOption, ...options]);
        this.embedderModelSelect.setOptions([defaultOption, ...options]);
        this.summarizeModelSelect.setOptions([defaultOption, ...options]);
    }
    
    /**
     * Обработка векторизации
     */
    _handleVectorize() {
        const embedderModelValue = this.embedderModelSelect.getValue();
        const summarizeModelValue = this.summarizeModelSelect.getValue();
        const enableSummarize = this.enableSummarizeCheckbox ? 
            this.enableSummarizeCheckbox.checked : false;
        
        if (!embedderModelValue) {
            this.messageBus.send('showNotification', {
                message: 'Пожалуйста, выберите модель эмбеддинга',
                type: 'error'
            });
            return;
        }
        
        if (enableSummarize && !summarizeModelValue) {
            this.messageBus.send('showNotification', {
                message: 'Пожалуйста, выберите модель для суммаризации',
                type: 'error'
            });
            return;
        }
        
        // Находим выбранные модели
        const [embedderServerId, embedderModelId] = embedderModelValue.split(':');
        const embedderModel = this.activeModels.find(m => 
            m.serverId === embedderServerId && m.modelId === embedderModelId
        );
        
        let summarizeModel = null;
        if (enableSummarize && summarizeModelValue) {
            const [summarizeServerId, summarizeModelId] = summarizeModelValue.split(':');
            summarizeModel = this.activeModels.find(m => 
                m.serverId === summarizeServerId && m.modelId === summarizeModelId
            );
        }
        
        if (!embedderModel) {
            this.messageBus.send('showNotification', {
                message: 'Выбранная модель эмбеддинга не найдена',
                type: 'error'
            });
            return;
        }
        
        if (enableSummarize && !summarizeModel) {
            this.messageBus.send('showNotification', {
                message: 'Выбранная модель для суммаризации не найдена',
                type: 'error'
            });
            return;
        }
        
        // Отправка сообщения
        this.messageBus.send('vectorizeAll', {
            embedderModel: {
                serverId: embedderModel.serverId,
                modelId: embedderModel.modelId,
                url: embedderModel.url,
                apiKey: embedderModel.apiKey,
                modelName: embedderModel.modelName
            },
            summarizeModel: summarizeModel ? {
                serverId: summarizeModel.serverId,
                modelId: summarizeModel.modelId,
                url: summarizeModel.url,
                apiKey: summarizeModel.apiKey,
                modelName: summarizeModel.modelName,
                temperature: summarizeModel.temperature,
                maxTokens: summarizeModel.maxTokens,
                systemPrompt: summarizeModel.systemPrompt
            } : null,
            enableOrigin: this.enableOriginCheckbox ? this.enableOriginCheckbox.checked : true,
            enableSummarize: enableSummarize,
            enableVsOrigin: this.enableVsOriginCheckbox ? this.enableVsOriginCheckbox.checked : true,
            enableVsSummarize: this.enableVsSummarizeCheckbox ? this.enableVsSummarizeCheckbox.checked : true,
            summarizePrompt: this.summarizePromptInput.getValue()
        });
        
        this.vectorizeBtn.setLoading(true);
    }
    
    /**
     * Обработка очистки хранилища
     */
    _handleClearStorage() {
        this.messageBus.send('clearStorage');
        this.clearStorageBtn.setLoading(true);
    }
    
    /**
     * Запрос количества записей
     */
    _requestStorageCount() {
        if (this.storageCount) {
            this.storageCount.textContent = '...';
        }
        if (this.storageSize) {
            this.storageSize.textContent = '...';
        }
        this.messageBus.send('getStorageCount');
    }
    
    /**
     * Сохранение исходных значений настроек
     */
    _saveOriginalSettings() {
        this.originalSettings = {
            generationModel: this.generationModelSelect.getValue(),
            embedderModel: this.embedderModelSelect.getValue(),
            summarizeModel: this.summarizeModelSelect.getValue(),
            summarizePrompt: this.summarizePromptInput.getValue(),
            enableOrigin: this.enableOriginCheckbox ? this.enableOriginCheckbox.checked : true,
            enableSummarize: this.enableSummarizeCheckbox ? this.enableSummarizeCheckbox.checked : false,
            enableVsOrigin: this.enableVsOriginCheckbox ? this.enableVsOriginCheckbox.checked : true,
            enableVsSummarize: this.enableVsSummarizeCheckbox ? this.enableVsSummarizeCheckbox.checked : true
        };
    }
    
    /**
     * Проверка изменений настроек
     */
    _hasChanges() {
        if (!this.originalSettings) return false;
        
        return (
            this.generationModelSelect.getValue() !== this.originalSettings.generationModel ||
            this.embedderModelSelect.getValue() !== this.originalSettings.embedderModel ||
            this.summarizeModelSelect.getValue() !== this.originalSettings.summarizeModel ||
            this.summarizePromptInput.getValue() !== this.originalSettings.summarizePrompt ||
            (this.enableOriginCheckbox ? this.enableOriginCheckbox.checked : true) !== this.originalSettings.enableOrigin ||
            (this.enableSummarizeCheckbox ? this.enableSummarizeCheckbox.checked : false) !== this.originalSettings.enableSummarize ||
            (this.enableVsOriginCheckbox ? this.enableVsOriginCheckbox.checked : true) !== this.originalSettings.enableVsOrigin ||
            (this.enableVsSummarizeCheckbox ? this.enableVsSummarizeCheckbox.checked : true) !== this.originalSettings.enableVsSummarize
        );
    }
    
    /**
     * Закрытие с проверкой изменений
     */
    _closeWithCheck() {
        if (this._hasChanges()) {
            this.messageBus.send('requestCloseSettings');
        } else {
            this.settingsModal.close();
            this.originalSettings = null;
        }
    }
}

