/**
 * Компонент настроек векторизации.
 * Управляет чекбоксами типов векторов, промптом суммаризации,
 * выбором моделей эмбеддинга/суммаризации и запуском векторизации.
 */
class VectorizationSettingsComponent {
    constructor(messageBus) {
        this.messageBus = messageBus;
        this.activeModels = [];
        
        // Модели
        this.embedderModelSelect = new Select(document.getElementById('embedder-model-select'));
        this.summarizeModelSelect = new Select(document.getElementById('summarize-model-select'));
        this.summarizeModelGroup = document.getElementById('summarize-model-group');
        this.summarizePromptInput = new Input(document.getElementById('summarize-prompt-input'));
        
        // Чекбоксы
        this.enableOriginCheckbox = document.getElementById('enable-origin-checkbox');
        this.enableSummarizeCheckbox = document.getElementById('enable-summarize-checkbox');
        this.enableVsOriginCheckbox = document.getElementById('enable-vs-origin-checkbox');
        this.enableVsSummarizeCheckbox = document.getElementById('enable-vs-summarize-checkbox');
        
        // Кнопка
        this.vectorizeBtn = new Button(document.getElementById('vectorize-btn'), { loadingText: 'Векторизация...' });
        
        this._initializeEventListeners();
        this._subscribeToMessages();
    }
    
    /**
     * Инициализация обработчиков событий
     */
    _initializeEventListeners() {
        // Векторизация
        this.vectorizeBtn.onClick(() => this._handleVectorize());
        
        // Показ/скрытие группы модели суммаризации
        if (this.enableSummarizeCheckbox && this.summarizeModelGroup) {
            this.enableSummarizeCheckbox.addEventListener('change', () => {
                this.summarizeModelGroup.style.display = 
                    this.enableSummarizeCheckbox.checked ? 'block' : 'none';
            });
        }
        
        // Автосохранение выбранных моделей при изменении
        this.embedderModelSelect.onChange(() => {
            this._saveModelSelection('embedderModel', this.embedderModelSelect.getValue());
        });
        this.summarizeModelSelect.onChange(() => {
            this._saveModelSelection('summarizeModel', this.summarizeModelSelect.getValue());
        });
    }
    
    /**
     * Подписка на сообщения
     */
    _subscribeToMessages() {
        // Векторизация завершена
        this.messageBus.subscribe('vectorizationComplete', (message) => {
            this.vectorizeBtn.setLoading(false);
            this.messageBus.send('showNotification', {
                message: `Векторизация завершена. Обработано: ${message.result.processed}, Ошибок: ${message.result.errors}`,
                type: message.result.errors > 0 ? 'warning' : 'success'
            });
        });
        
        // Ошибка векторизации
        this.messageBus.subscribe('vectorizationError', (message) => {
            this.vectorizeBtn.setLoading(false);
            this.messageBus.send('showNotification', {
                message: `Ошибка векторизации: ${message.error}`,
                type: 'error'
            });
        });
    }
    
    /**
     * Обновление списка активных моделей
     */
    setActiveModels(models) {
        this.activeModels = models || [];
        this._updateModelSelects();
    }
    
    /**
     * Обновление UI из конфигурации
     */
    updateFromConfig(config) {
        if (config.summarizePrompt) {
            this.summarizePromptInput.setValue(config.summarizePrompt);
        }
        
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
     * Восстановление сохранённых выбранных моделей
     */
    restoreSavedSelections(selections) {
        if (selections.embedderModel) {
            this.embedderModelSelect.setValue(selections.embedderModel);
        }
        if (selections.summarizeModel) {
            this.summarizeModelSelect.setValue(selections.summarizeModel);
        }
    }
    
    /**
     * Получение текущих значений для детектирования изменений
     */
    getCurrentValues() {
        return {
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
     * Обновление селектов моделей
     */
    _updateModelSelects() {
        const options = this.activeModels.map(model => ({
            value: `${model.serverId}:${model.modelId}`,
            label: `${model.serverName} - ${model.modelName}`
        }));
        
        const defaultOption = { value: '', label: 'Выберите модель...' };
        
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
     * Сохранение выбранной модели на бэкенд
     */
    _saveModelSelection(key, value) {
        const selections = {};
        selections[key] = value;
        this.messageBus.send('saveSelectedModels', { selections });
    }
}
