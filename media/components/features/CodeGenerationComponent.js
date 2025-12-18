/**
 * Компонент генерации кода
 */
class CodeGenerationComponent {
    constructor(messageBus, vscode) {
        this.messageBus = messageBus;
        this.vscode = vscode;
        this.activeModels = [];
        
        // Инициализация элементов
        this.promptInput = new Input(document.getElementById('prompt-input'));
        this.generateBtn = new Button(document.getElementById('generate-btn'), { loadingText: 'Генерация...' });
        this.modelSelect = new Select(document.getElementById('generation-model-select-main'));
        
        // DOM элементы для результатов
        this.resultSection = document.getElementById('result-section');
        this.thinkingSection = document.getElementById('thinking-section');
        this.thinkingContent = document.getElementById('thinking-content');
        this.thinkingContentWrapper = document.getElementById('thinking-content-wrapper');
        this.thinkingToggle = document.getElementById('thinking-toggle');
        this.answerSection = document.getElementById('answer-section');
        this.answerContent = document.getElementById('answer-content');
        this.copyAnswerBtn = document.getElementById('copy-answer-btn');
        
        this._initializeEventListeners();
        this._subscribeToMessages();
        this._restoreState();
    }
    
    /**
     * Инициализация обработчиков событий
     */
    _initializeEventListeners() {
        // Обработчик генерации
        this.generateBtn.onClick(() => this._handleGenerate());
        
        // Обработчик сворачивания/разворачивания секции размышлений
        if (this.thinkingToggle && this.thinkingContentWrapper) {
            let isCollapsed = false;
            
            this.thinkingToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                isCollapsed = !isCollapsed;
                
                if (isCollapsed) {
                    this.thinkingContentWrapper.classList.add('collapsed');
                    this.thinkingToggle.classList.add('collapsed');
                } else {
                    this.thinkingContentWrapper.classList.remove('collapsed');
                    this.thinkingToggle.classList.remove('collapsed');
                    setTimeout(() => {
                        this.thinkingContent.scrollTop = this.thinkingContent.scrollHeight;
                    }, 100);
                }
            });
            
            const thinkingHeader = this.thinkingToggle.parentElement;
            if (thinkingHeader) {
                thinkingHeader.addEventListener('click', (e) => {
                    if (e.target !== this.thinkingToggle) {
                        this.thinkingToggle.click();
                    }
                });
            }
        }
        
        // Копирование ответа
        if (this.copyAnswerBtn) {
            this.copyAnswerBtn.addEventListener('click', () => this._handleCopyAnswer());
        }
        
        // Сохранение состояния при изменении текста
        if (this.promptInput.element) {
            this.promptInput.element.addEventListener('input', () => {
                this.vscode.setState({ text: this.promptInput.getValue() });
            });
        }
    }
    
    /**
     * Подписка на сообщения
     */
    _subscribeToMessages() {
        // Обновление активных моделей
        this.messageBus.subscribe('activeModelsList', (message) => {
            this.activeModels = message.models || [];
            this._updateModelSelect();
        });
        
        // Начало генерации
        this.messageBus.subscribe('generationStarted', () => {
            if (this.resultSection) {
                this.resultSection.style.display = 'block';
            }
            if (this.thinkingSection) {
                this.thinkingSection.style.display = 'block';
            }
            if (this.answerSection) {
                this.answerSection.style.display = 'none';
            }
            if (this.thinkingContent) {
                this.thinkingContent.textContent = '';
            }
            if (this.answerContent) {
                this.answerContent.textContent = '';
            }
        });
        
        // Стриминг чанков
        this.messageBus.subscribe('streamChunk', (message) => {
            if (message.thinking && this.thinkingContent) {
                if (this.thinkingSection) {
                    this.thinkingSection.style.display = 'block';
                }
                this.thinkingContent.textContent = message.thinking;
                if (this.thinkingContentWrapper && !this.thinkingContentWrapper.classList.contains('collapsed')) {
                    this.thinkingContent.scrollTop = this.thinkingContent.scrollHeight;
                }
            }
            if (message.answer && this.answerContent) {
                if (this.answerSection) {
                    this.answerSection.style.display = 'block';
                }
                this.answerContent.textContent = message.answer;
                const answerWrapper = this.answerContent.parentElement;
                if (answerWrapper) {
                    answerWrapper.scrollTop = answerWrapper.scrollHeight;
                }
            }
        });
        
        // Завершение генерации
        this.messageBus.subscribe('generationComplete', (message) => {
            if (message.thinking && this.thinkingContent) {
                if (this.thinkingSection) {
                    this.thinkingSection.style.display = 'block';
                }
                this.thinkingContent.textContent = message.thinking;
                if (this.thinkingContentWrapper && !this.thinkingContentWrapper.classList.contains('collapsed')) {
                    this.thinkingContent.scrollTop = this.thinkingContent.scrollHeight;
                }
            }
            if (message.answer && this.answerContent) {
                if (this.answerSection) {
                    this.answerSection.style.display = 'block';
                }
                this.answerContent.textContent = message.answer;
                const answerWrapper = this.answerContent.parentElement;
                if (answerWrapper) {
                    answerWrapper.scrollTop = answerWrapper.scrollHeight;
                }
            }
            this.generateBtn.setLoading(false);
            if (this.resultSection) {
                this.resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
        
        // Обратная совместимость - старый формат результата
        this.messageBus.subscribe('generated', (message) => {
            this._displayResult(message.result);
            this.generateBtn.setLoading(false);
        });
        
        // Ошибка генерации
        this.messageBus.subscribe('error', (message) => {
            this._displayError(message.error);
            this.generateBtn.setLoading(false);
        });
    }
    
    /**
     * Обновление списка моделей
     */
    _updateModelSelect() {
        const options = this.activeModels.map(model => ({
            value: `${model.serverId}:${model.modelId}`,
            label: `${model.serverName} - ${model.modelName}`
        }));
        this.modelSelect.setOptions([{ value: '', label: 'Выберите модель...' }, ...options]);
    }
    
    /**
     * Обработка генерации
     */
    _handleGenerate() {
        const text = this.promptInput.getValue();
        const modelValue = this.modelSelect.getValue();
        
        if (!text) {
            this.messageBus.send('showNotification', { message: 'Пожалуйста, введите запрос', type: 'error' });
            return;
        }
        
        if (!modelValue) {
            this.messageBus.send('showNotification', { message: 'Пожалуйста, выберите модель для генерации', type: 'error' });
            return;
        }
        
        // Находим выбранную модель
        const [serverId, modelId] = modelValue.split(':');
        const selectedModel = this.activeModels.find(m => m.serverId === serverId && m.modelId === modelId);
        
        if (!selectedModel) {
            this.messageBus.send('showNotification', { message: 'Выбранная модель не найдена', type: 'error' });
            return;
        }
        
        // Отправка сообщения
        this.messageBus.send('generate', {
            text: text,
            model: {
                serverId: selectedModel.serverId,
                modelId: selectedModel.modelId,
                url: selectedModel.url,
                apiKey: selectedModel.apiKey,
                modelName: selectedModel.modelName,
                temperature: selectedModel.temperature,
                maxTokens: selectedModel.maxTokens,
                systemPrompt: selectedModel.systemPrompt
            }
        });
        
        // Обновление UI
        this.generateBtn.setLoading(true);
        if (this.resultSection) {
            this.resultSection.style.display = 'block';
        }
        if (this.thinkingSection) {
            this.thinkingSection.style.display = 'none';
        }
        if (this.answerSection) {
            this.answerSection.style.display = 'none';
        }
        if (this.thinkingContent) {
            this.thinkingContent.textContent = '';
        }
        if (this.answerContent) {
            this.answerContent.textContent = '';
        }
    }
    
    /**
     * Отображение результата
     */
    _displayResult(result) {
        if (this.thinkingSection) {
            this.thinkingSection.style.display = 'none';
        }
        if (this.answerSection) {
            this.answerSection.style.display = 'none';
        }
        // Для обратной совместимости - старый формат
        if (this.resultSection) {
            this.resultSection.style.display = 'block';
            const resultContent = this.resultSection.querySelector('#result-content');
            if (resultContent) {
                resultContent.textContent = result;
            }
        }
        
        if (this.resultSection) {
            this.resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
    
    /**
     * Отображение результата с размышлениями
     */
    _displayResultWithThinking(thinking, answer) {
        if (this.thinkingSection && thinking) {
            this.thinkingSection.style.display = 'block';
            if (this.thinkingContent) {
                this.thinkingContent.textContent = thinking;
            }
        }
        
        if (this.answerSection && answer) {
            this.answerSection.style.display = 'block';
            if (this.answerContent) {
                this.answerContent.textContent = answer;
            }
        }
        
        if (this.resultSection) {
            this.resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
    
    /**
     * Отображение ошибки
     */
    _displayError(error) {
        this.messageBus.send('showNotification', { 
            message: `Ошибка генерации: ${error}`, 
            type: 'error' 
        });
    }
    
    /**
     * Копирование ответа в буфер обмена
     */
    async _handleCopyAnswer() {
        if (!this.answerContent) return;
        
        const text = this.answerContent.textContent;
        if (!text) return;
        
        try {
            await navigator.clipboard.writeText(text);
            const originalIcon = this.copyAnswerBtn.textContent;
            this.copyAnswerBtn.textContent = '✓';
            this.copyAnswerBtn.classList.add('copied');
            
            setTimeout(() => {
                this.copyAnswerBtn.textContent = originalIcon;
                this.copyAnswerBtn.classList.remove('copied');
            }, 2000);
        } catch (err) {
            this.messageBus.send('showNotification', { 
                message: 'Не удалось скопировать в буфер обмена', 
                type: 'error' 
            });
        }
    }
    
    /**
     * Восстановление состояния
     */
    _restoreState() {
        const previousState = this.vscode.getState();
        if (previousState && previousState.text) {
            this.promptInput.setValue(previousState.text);
        }
    }
    
    /**
     * Установка активных моделей (для внешнего использования)
     */
    setActiveModels(models) {
        this.activeModels = models || [];
        this._updateModelSelect();
    }
}

