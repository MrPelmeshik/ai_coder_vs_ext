/**
 * Компонент настроек (координатор).
 * Управляет модальным окном, вкладками, выбором модели генерации,
 * и делегирует остальную логику подкомпонентам.
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
        
        // Модель генерации (в настройках)
        this.generationModelSelect = new Select(document.getElementById('generation-model-select'));
        
        // Кнопка сброса
        this.resetSettingsBtn = document.getElementById('reset-settings-btn');
        
        // Вкладки в модальном окне
        this.settingsTabs = new Tabs('#settings-modal', {
            tabButtonSelector: '.modal-tab-button',
            tabContentSelector: '.settings-tab-content',
            dataAttribute: 'data-settings-tab'
        });
        
        // Подкомпоненты
        this.vectorizationSettings = new VectorizationSettingsComponent(messageBus);
        this.storageManagement = new StorageManagementComponent(messageBus);
        
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
                if (window.serverManagementComponent && typeof window.serverManagementComponent._initializeElements === 'function') {
                    window.serverManagementComponent._initializeElements();
                }
                setTimeout(() => {
                    this._saveOriginalSettings();
                }, 100);
                this.storageManagement.requestStorageCount();
                setTimeout(() => {
                    this.messageBus.send('getServers');
                    this.messageBus.send('getActiveModels');
                }, 150);
            });
        }
        
        // Закрытие: обрабатываем все триггеры через _closeWithCheck()
        // НЕ используем initCloseHandlers, чтобы избежать рекурсии close() -> onClose -> close()
        if (this.closeSettingsBtn) {
            this.closeSettingsBtn.addEventListener('click', () => {
                this._closeWithCheck();
            });
        }
        
        // Закрытие по клику на оверлей
        if (this.settingsModal.element) {
            this.settingsModal.element.addEventListener('click', (e) => {
                if (e.target === this.settingsModal.element) {
                    this._closeWithCheck();
                }
            });
        }
        
        // Закрытие по Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.settingsModal.isOpen) {
                this._closeWithCheck();
            }
        });
        
        // Сброс настроек
        if (this.resetSettingsBtn) {
            this.resetSettingsBtn.addEventListener('click', () => {
                this.resetSettingsBtn.disabled = true;
                this.messageBus.send('requestResetConfig');
            });
        }
        
        // Переключение вкладок настроек
        this.settingsTabs.onChange((tabId) => {
            if (tabId === 'models') {
                setTimeout(() => {
                    if (window.serverManagementComponent && typeof window.serverManagementComponent._initializeElements === 'function') {
                        window.serverManagementComponent._initializeElements();
                        if (typeof window.serverManagementComponent._initializeEventListeners === 'function') {
                            window.serverManagementComponent._initializeEventListeners();
                        }
                        if (typeof window.serverManagementComponent._renderServers === 'function') {
                            window.serverManagementComponent._renderServers();
                        }
                    }
                }, 50);
                this.messageBus.send('getServers');
            }
        });
        
        // Автосохранение выбранной модели генерации
        this.generationModelSelect.onChange(() => {
            const value = this.generationModelSelect.getValue();
            this._saveModelSelection('generationModel', value);
            window.dispatchEvent(new CustomEvent('generationModelChanged', { detail: { value, source: 'settings' } }));
        });
        
        // Синхронизация с главной страницы
        window.addEventListener('generationModelChanged', (event) => {
            if (event.detail.source !== 'settings') {
                this.generationModelSelect.setValue(event.detail.value);
            }
        });
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
            this.storageManagement.requestStorageCount();
        });
        
        // Активные модели
        this.messageBus.subscribe('activeModelsList', (message) => {
            this.activeModels = message.models || [];
            this._updateGenerationModelSelect();
            this.vectorizationSettings.setActiveModels(this.activeModels);
            
            if (message.savedSelections) {
                this._restoreSavedSelections(message.savedSelections);
            }
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
        
        // Ответы на запрос закрытия настроек
        this.messageBus.subscribe('closeSettings', () => {
            this._forceClose();
        });
        
        this.messageBus.subscribe('saveAndCloseSettings', () => {
            this._saveCurrentConfig();
            this._forceClose();
        });
        
        this.messageBus.subscribe('discardAndCloseSettings', () => {
            this._forceClose();
            // Перезагружаем конфигурацию для отката изменений
            this.messageBus.send('getConfig');
        });
        
        this.messageBus.subscribe('cancelCloseSettings', () => {
            // Пользователь отменил закрытие - ничего не делаем
        });
    }
    
    /**
     * Обновление UI из конфигурации
     */
    _updateUI(config) {
        if (config.generationModel) {
            this.generationModelSelect.setValue(config.generationModel);
        }
        
        // Делегируем обновление подкомпонентам
        this.vectorizationSettings.updateFromConfig(config);
    }
    
    /**
     * Обновление селекта модели генерации
     */
    _updateGenerationModelSelect() {
        const options = this.activeModels.map(model => ({
            value: `${model.serverId}:${model.modelId}`,
            label: `${model.serverName} - ${model.modelName}`
        }));
        
        const defaultOption = { value: '', label: 'Выберите модель...' };
        this.generationModelSelect.setOptions([defaultOption, ...options]);
    }
    
    /**
     * Восстановление сохранённых выбранных моделей
     */
    _restoreSavedSelections(selections) {
        if (selections.generationModel) {
            this.generationModelSelect.setValue(selections.generationModel);
        }
        this.vectorizationSettings.restoreSavedSelections(selections);
    }
    
    /**
     * Сохранение исходных значений настроек
     */
    _saveOriginalSettings() {
        const vectorizationValues = this.vectorizationSettings.getCurrentValues();
        this.originalSettings = {
            generationModel: this.generationModelSelect.getValue(),
            ...vectorizationValues
        };
    }
    
    /**
     * Проверка изменений настроек
     */
    _hasChanges() {
        if (!this.originalSettings) return false;
        
        const current = this.vectorizationSettings.getCurrentValues();
        
        return (
            this.generationModelSelect.getValue() !== this.originalSettings.generationModel ||
            current.embedderModel !== this.originalSettings.embedderModel ||
            current.summarizeModel !== this.originalSettings.summarizeModel ||
            current.summarizePrompt !== this.originalSettings.summarizePrompt ||
            current.enableOrigin !== this.originalSettings.enableOrigin ||
            current.enableSummarize !== this.originalSettings.enableSummarize ||
            current.enableVsOrigin !== this.originalSettings.enableVsOrigin ||
            current.enableVsSummarize !== this.originalSettings.enableVsSummarize
        );
    }
    
    /**
     * Сохранение выбранной модели на бэкенд
     */
    _saveModelSelection(key, value) {
        const selections = {};
        selections[key] = value;
        this.messageBus.send('saveSelectedModels', { selections });
    }
    
    /**
     * Сохранение текущей конфигурации (при «Выйти с сохранением»)
     */
    _saveCurrentConfig() {
        const values = this.vectorizationSettings.getCurrentValues();
        this.messageBus.send('updateConfig', {
            config: {
                summarizePrompt: values.summarizePrompt,
                enableOrigin: values.enableOrigin,
                enableSummarize: values.enableSummarize,
                enableVsOrigin: values.enableVsOrigin,
                enableVsSummarize: values.enableVsSummarize
            }
        });
    }
    
    /**
     * Закрытие с проверкой изменений.
     * Если есть изменения — отправляет запрос на бэкенд для показа диалога.
     * Если нет — закрывает модальное окно напрямую.
     */
    _closeWithCheck() {
        if (this._hasChanges()) {
            this.messageBus.send('requestCloseSettings', { hasChanges: true });
        } else {
            this._forceClose();
        }
    }
    
    /**
     * Принудительное закрытие модального окна без рекурсии.
     * Скрывает элемент напрямую, минуя Modal.close() и его колбэки.
     */
    _forceClose() {
        if (this.settingsModal.element) {
            this.settingsModal.element.style.display = 'none';
            this.settingsModal.isOpen = false;
        }
        this.originalSettings = null;
    }
}
