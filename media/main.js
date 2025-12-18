(function() {
    const vscode = acquireVsCodeApi();

    // Элементы DOM - генерация
    const promptInput = document.getElementById('prompt-input');
    const generateBtn = document.getElementById('generate-btn');
    const vectorizeBtn = document.getElementById('vectorize-btn');
    const resultSection = document.getElementById('result-section');
    const resultContent = document.getElementById('result-content');
    const thinkingSection = document.getElementById('thinking-section');
    const thinkingContent = document.getElementById('thinking-content');
    const thinkingContentWrapper = document.getElementById('thinking-content-wrapper');
    const thinkingToggle = document.getElementById('thinking-toggle');
    const answerSection = document.getElementById('answer-section');
    const answerContent = document.getElementById('answer-content');
    const copyAnswerBtn = document.getElementById('copy-answer-btn');

    // Элементы DOM - поиск
    const searchQueryInput = document.getElementById('search-query-input');
    const searchBtn = document.getElementById('search-btn');
    const searchResultSection = document.getElementById('search-result-section');
    const searchResultsList = document.getElementById('search-results-list');

    // Элементы DOM - настройки
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const generationModelSelect = document.getElementById('generation-model-select');
    const generationModelSelectMain = document.getElementById('generation-model-select-main');
    const embedderModelSelect = document.getElementById('embedder-model-select');
    const summarizeModelSelect = document.getElementById('summarize-model-select');
    const summarizeModelGroup = document.getElementById('summarize-model-group');
    const summarizePromptInput = document.getElementById('summarize-prompt-input');
    const enableOriginCheckbox = document.getElementById('enable-origin-checkbox');
    const enableSummarizeCheckbox = document.getElementById('enable-summarize-checkbox');
    const enableVsOriginCheckbox = document.getElementById('enable-vs-origin-checkbox');
    const enableVsSummarizeCheckbox = document.getElementById('enable-vs-summarize-checkbox');
    const clearStorageBtn = document.getElementById('clear-storage-btn');
    const refreshStorageCountBtn = document.getElementById('refresh-storage-count-btn');
    const storageCount = document.getElementById('storage-count');
    const storageSize = document.getElementById('storage-size');
    
    let activeModels = []; // Список активных моделей

    // Элементы DOM - управление серверами
    const serverNameInput = document.getElementById('server-name-input');
    const serverUrlInput = document.getElementById('server-url-input');
    const serverApiKeyInput = document.getElementById('server-api-key-input');
    const addServerBtn = document.getElementById('add-server-btn');
    const saveServerBtn = document.getElementById('save-server-btn');
    const cancelServerBtn = document.getElementById('cancel-server-btn');
    const serverFormCard = document.getElementById('server-form-card');
    const serversList = document.getElementById('servers-list');
    
    let editingServerId = null; // ID редактируемого сервера, null если создание нового
    let modelsEditMode = {}; // Объект для хранения режима редактирования моделей для каждого сервера

    // Функция форматирования размера
    function formatBytes(bytes) {
        if (bytes === 0) return '0 Б';
        const k = 1024;
        const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    }

    // Функция запроса количества записей
    function requestStorageCount() {
        if (storageCount) {
            storageCount.textContent = '...';
        }
        if (storageSize) {
            storageSize.textContent = '...';
        }
        vscode.postMessage({
            command: 'getStorageCount'
        });
    }

    // Управление вкладками
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            
            // Обновление активных вкладок
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            button.classList.add('active');
            document.getElementById(`tab-${targetTab}`).classList.add('active');
            
            // При открытии вкладки поиска загружаем все записи
            if (targetTab === 'search') {
                vscode.postMessage({
                    command: 'getAllItems'
                });
            }
        });
    });

    // Управление вкладками в модальном окне настроек
    const settingsTabButtons = document.querySelectorAll('.modal-tab-button');
    const settingsTabContents = document.querySelectorAll('.settings-tab-content');
    
    settingsTabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-settings-tab');
            
            // Обновление активных вкладок
            settingsTabButtons.forEach(btn => btn.classList.remove('active'));
            settingsTabContents.forEach(content => content.classList.remove('active'));
            
            button.classList.add('active');
            document.getElementById(`settings-tab-${targetTab}`).classList.add('active');
            
            // При переключении на вкладку "Модели" загружаем серверы
            if (targetTab === 'models') {
                loadServers();
            }
        });
    });


    // Обновление количества записей при нажатии на кнопку
    if (refreshStorageCountBtn) {
        refreshStorageCountBtn.addEventListener('click', () => {
            requestStorageCount();
        });
    }

    // Обработчик сворачивания/разворачивания секции размышлений
    if (thinkingToggle && thinkingContentWrapper) {
        let isCollapsed = false;
        
        thinkingToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            isCollapsed = !isCollapsed;
            
            if (isCollapsed) {
                thinkingContentWrapper.classList.add('collapsed');
                thinkingToggle.classList.add('collapsed');
            } else {
                thinkingContentWrapper.classList.remove('collapsed');
                thinkingToggle.classList.remove('collapsed');
                // Автоскролл к концу после разворачивания
                setTimeout(() => {
                    thinkingContent.scrollTop = thinkingContent.scrollHeight;
                }, 100);
            }
        });
        
        // Также можно сворачивать по клику на заголовок
        const thinkingHeader = thinkingToggle.parentElement;
        if (thinkingHeader) {
            thinkingHeader.addEventListener('click', (e) => {
                if (e.target !== thinkingToggle) {
                    thinkingToggle.click();
                }
            });
        }
    }

    // Копирование ответа в буфер обмена
    if (copyAnswerBtn) {
        copyAnswerBtn.addEventListener('click', async () => {
            const text = answerContent.textContent;
            if (!text) return;
            
            try {
                await navigator.clipboard.writeText(text);
                const originalIcon = copyAnswerBtn.textContent;
                copyAnswerBtn.textContent = '✓';
                copyAnswerBtn.classList.add('copied');
                
                // Задержка сброса кнопки копирования
                // Значение по умолчанию: 2000 мс (будет получено из настроек при следующем обновлении)
                setTimeout(() => {
                    copyAnswerBtn.textContent = originalIcon;
                    copyAnswerBtn.classList.remove('copied');
                }, 2000);
            } catch (err) {
                showStatus('Не удалось скопировать в буфер обмена', 'error');
            }
        });
    }

    // Переключение видимости API ключа
    let apiKeyVisible = false;
    toggleApiKeyBtn.addEventListener('click', () => {
        apiKeyVisible = !apiKeyVisible;
        apiKeyInput.type = apiKeyVisible ? 'text' : 'password';
        toggleApiKeyBtn.textContent = apiKeyVisible ? '🙈' : '👁';
    });

    // Обновление значения температуры
    temperatureInput.addEventListener('input', () => {
        temperatureValue.textContent = temperatureInput.value;
    });

    // Показ/скрытие полей в зависимости от провайдера
    function updateProviderFields() {
        if (!providerSelect) {
            return;
        }
        
        const provider = providerSelect.value;
        const isOllama = provider === 'ollama';
        const isOpenAI = provider === 'openai';
        const needsApiKey = provider === 'openai' || provider === 'anthropic';

        // Показ/скрытие полей с проверкой существования
        if (localUrlGroup) {
            localUrlGroup.style.display = isOllama ? 'block' : 'none';
        }
        // baseUrl показываем для OpenAI (можно использовать для локальных моделей)
        if (baseUrlGroup) {
            baseUrlGroup.style.display = isOpenAI ? 'block' : 'none';
        }
        if (apiTypeGroup) {
            apiTypeGroup.style.display = 'none'; // Больше не используется
        }
        if (localCheckGroup) {
            localCheckGroup.style.display = (isOllama || isOpenAI) ? 'block' : 'none';
        }
        
        // API ключ показываем для OpenAI и Anthropic (но можно не указывать для локальных моделей)
        if (apiKeyInput) {
            const apiKeyGroup = apiKeyInput.closest('.setting-group');
            if (apiKeyGroup) {
                apiKeyGroup.style.display = needsApiKey ? 'block' : 'none';
            }
        }

        // Обновление placeholder для модели
        if (modelInput) {
            if (isOllama) {
                modelInput.placeholder = 'llama2, codellama, mistral, phi...';
            } else if (isOpenAI) {
                modelInput.placeholder = 'gpt-4, gpt-3.5-turbo (или название локальной модели)...';
            } else {
                modelInput.placeholder = 'gpt-4, gpt-3.5-turbo, claude-3-opus...';
            }
        }
    }

    providerSelect.addEventListener('change', updateProviderFields);

    // Проверка подключения к локальному серверу
    checkLocalBtn.addEventListener('click', () => {
        const provider = providerSelect.value;
        let url = '';

        if (provider === 'ollama') {
            url = localUrlInput.value.trim();
        } else if (provider === 'openai') {
            url = baseUrlInput.value.trim();
        }

        if (!url) {
            showSettingsStatus('Пожалуйста, укажите URL сервера', 'error');
            return;
        }

        checkLocalBtn.disabled = true;
        checkLocalBtn.textContent = 'Проверка...';

        vscode.postMessage({
            command: 'checkLocalServer',
            url: url,
            provider: provider
        });
    });

    // Установка значения по умолчанию для провайдера (только если select пустой)
    // Это временное значение, которое будет перезаписано сохраненной конфигурацией пользователя
    if (providerSelect && !providerSelect.value) {
        providerSelect.value = 'openai';
        updateProviderFields();
    }

    // Запрос конфигурации при загрузке (сохраненные настройки пользователя)
    vscode.postMessage({ command: 'getConfig' });
    
    // Хранение исходных значений настроек для отслеживания изменений
    let originalSettings = null;
    
    /**
     * Сохранение текущих значений настроек как исходных
     */
    function saveOriginalSettings() {
        // Для API ключа: если поле пустое, но placeholder указывает на сохраненный ключ,
        // сохраняем специальное значение, чтобы не считать это изменением
        let apiKeyValue = '';
        if (apiKeyInput) {
            const trimmed = apiKeyInput.value.trim();
            if (trimmed) {
                apiKeyValue = trimmed;
            } else if (apiKeyInput.placeholder === 'API ключ сохранен') {
                // API ключ сохранен, но не отображается - используем специальное значение
                apiKeyValue = '__SAVED__';
            }
        }
        
        originalSettings = {
            provider: providerSelect ? providerSelect.value : '',
            apiKey: apiKeyValue,
            model: modelInput ? modelInput.value.trim() : '',
            embedderModel: embedderModelInput ? embedderModelInput.value.trim() : '',
            summarizePrompt: summarizePromptInput ? summarizePromptInput.value.trim() : '',
            enableOrigin: enableOriginCheckbox ? enableOriginCheckbox.checked : true,
            enableSummarize: enableSummarizeCheckbox ? enableSummarizeCheckbox.checked : false,
            enableVsOrigin: enableVsOriginCheckbox ? enableVsOriginCheckbox.checked : true,
            enableVsSummarize: enableVsSummarizeCheckbox ? enableVsSummarizeCheckbox.checked : true,
            temperature: temperatureInput ? parseFloat(temperatureInput.value) : 0.7,
            maxTokens: maxTokensInput ? parseInt(maxTokensInput.value) : 2000,
            baseUrl: baseUrlInput ? baseUrlInput.value.trim() : '',
            localUrl: localUrlInput ? localUrlInput.value.trim() : '',
            timeout: timeoutInput ? parseInt(timeoutInput.value) : 30000,
            systemPrompt: systemPromptInput ? systemPromptInput.value.trim() : '',
            hasApiKey: apiKeyInput ? (apiKeyInput.placeholder === 'API ключ сохранен') : false
        };
    }
    
    /**
     * Проверка наличия изменений в настройках
     */
    function hasSettingsChanges() {
        if (!originalSettings) {
            return false;
        }
        
        // Для API ключа: если поле пустое, но placeholder указывает на сохраненный ключ,
        // считаем, что ключ не изменился
        let currentApiKey = '';
        if (apiKeyInput) {
            const trimmed = apiKeyInput.value.trim();
            if (trimmed) {
                currentApiKey = trimmed;
            } else if (apiKeyInput.placeholder === 'API ключ сохранен') {
                // API ключ сохранен, но не отображается
                currentApiKey = '__SAVED__';
            }
        }
        
        const current = {
            provider: providerSelect ? providerSelect.value : '',
            apiKey: currentApiKey,
            model: modelInput ? modelInput.value.trim() : '',
            embedderModel: embedderModelInput ? embedderModelInput.value.trim() : '',
            summarizePrompt: summarizePromptInput ? summarizePromptInput.value.trim() : '',
            enableOrigin: enableOriginCheckbox ? enableOriginCheckbox.checked : true,
            enableSummarize: enableSummarizeCheckbox ? enableSummarizeCheckbox.checked : false,
            enableVsOrigin: enableVsOriginCheckbox ? enableVsOriginCheckbox.checked : true,
            enableVsSummarize: enableVsSummarizeCheckbox ? enableVsSummarizeCheckbox.checked : true,
            temperature: temperatureInput ? parseFloat(temperatureInput.value) : 0.7,
            maxTokens: maxTokensInput ? parseInt(maxTokensInput.value) : 2000,
            baseUrl: baseUrlInput ? baseUrlInput.value.trim() : '',
            localUrl: localUrlInput ? localUrlInput.value.trim() : '',
            timeout: timeoutInput ? parseInt(timeoutInput.value) : 30000,
            systemPrompt: systemPromptInput ? systemPromptInput.value.trim() : ''
        };
        
        // Сравниваем все поля
        return (
            current.provider !== originalSettings.provider ||
            current.apiKey !== originalSettings.apiKey ||
            current.model !== originalSettings.model ||
            current.embedderModel !== originalSettings.embedderModel ||
            current.summarizePrompt !== originalSettings.summarizePrompt ||
            current.enableOrigin !== originalSettings.enableOrigin ||
            current.enableSummarize !== originalSettings.enableSummarize ||
            current.enableVsOrigin !== originalSettings.enableVsOrigin ||
            current.enableVsSummarize !== originalSettings.enableVsSummarize ||
            Math.abs(current.temperature - originalSettings.temperature) > 0.001 ||
            current.maxTokens !== originalSettings.maxTokens ||
            current.baseUrl !== originalSettings.baseUrl ||
            current.localUrl !== originalSettings.localUrl ||
            current.timeout !== originalSettings.timeout ||
            current.systemPrompt !== originalSettings.systemPrompt
        );
    }
    
    /**
     * Функция закрытия настроек с проверкой изменений
     */
    function closeSettingsWithCheck() {
        const hasChanges = hasSettingsChanges();
        if (hasChanges) {
            // Отправляем запрос на закрытие с информацией о наличии изменений
            vscode.postMessage({
                command: 'requestCloseSettings',
                hasChanges: true
            });
        } else {
            // Нет изменений - просто закрываем
            if (settingsModal) {
                settingsModal.style.display = 'none';
                originalSettings = null;
            }
        }
    }
    
    // Управление модальным окном настроек
    if (settingsBtn && settingsModal) {
        settingsBtn.addEventListener('click', () => {
            settingsModal.style.display = 'flex';
            // Сохраняем исходные значения при открытии
            // Немного задерживаем, чтобы поля успели заполниться из конфигурации
            setTimeout(() => {
                saveOriginalSettings();
            }, 100);
            // Всегда запрашиваем актуальную информацию о хранилище при открытии настроек
            requestStorageCount();
            // Загружаем серверы и активные модели при открытии настроек
            setTimeout(() => {
                loadServers();
                loadActiveModels();
            }, 150);
        });
    }
    
    // Загрузка активных моделей
    function loadActiveModels() {
        vscode.postMessage({
            command: 'getActiveModels'
        });
    }
    
    // Обновление селектов моделей
    function updateModelSelects() {
        const selects = [generationModelSelect, generationModelSelectMain, embedderModelSelect, summarizeModelSelect].filter(Boolean);
        
        selects.forEach(select => {
            if (!select) return;
            const currentValue = select.value;
            select.innerHTML = '<option value="">Выберите модель...</option>';
            
            activeModels.forEach(model => {
                const option = document.createElement('option');
                option.value = `${model.serverId}:${model.modelId}`;
                option.textContent = `${model.serverName} - ${model.modelName}`;
                select.appendChild(option);
            });
            
            // Восстанавливаем выбранное значение, если оно все еще существует
            if (currentValue) {
                select.value = currentValue;
            }
        });
        
        // Показываем/скрываем группу выбора модели для суммаризации
        if (summarizeModelGroup && enableSummarizeCheckbox) {
            summarizeModelGroup.style.display = enableSummarizeCheckbox.checked ? 'block' : 'none';
        }
    }
    
    // Обработчик изменения чекбокса суммаризации
    if (enableSummarizeCheckbox && summarizeModelGroup) {
        enableSummarizeCheckbox.addEventListener('change', () => {
            summarizeModelGroup.style.display = enableSummarizeCheckbox.checked ? 'block' : 'none';
        });
    }
    
    if (closeSettingsBtn && settingsModal) {
        closeSettingsBtn.addEventListener('click', () => {
            closeSettingsWithCheck();
        });
    }
    
    // Закрытие модального окна при клике на фон
    if (settingsModal) {
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                closeSettingsWithCheck();
            }
        });
        
        // Закрытие модального окна при нажатии Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && settingsModal.style.display === 'flex') {
                closeSettingsWithCheck();
            }
        });
    }

    // Обработчик нажатия кнопки генерации
    generateBtn.addEventListener('click', () => {
        const text = promptInput.value.trim();
        const modelValue = generationModelSelectMain ? generationModelSelectMain.value : '';
        
        if (!text) {
            showStatus('Пожалуйста, введите запрос', 'error');
            return;
        }
        
        if (!modelValue) {
            showStatus('Пожалуйста, выберите модель для генерации', 'error');
            return;
        }

        // Находим выбранную модель
        const [serverId, modelId] = modelValue.split(':');
        const selectedModel = activeModels.find(m => m.serverId === serverId && m.modelId === modelId);
        
        if (!selectedModel) {
            showStatus('Выбранная модель не найдена', 'error');
            return;
        }

        // Отправка сообщения в extension
        vscode.postMessage({
            command: 'generate',
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
        generateBtn.disabled = true;
        generateBtn.classList.add('loading');
        generateBtn.textContent = 'Генерация...';
        resultSection.style.display = 'block';
        thinkingSection.style.display = 'none';
        answerSection.style.display = 'none';
        thinkingContent.textContent = '';
        answerContent.textContent = '';
        showStatus('Генерация кода...', 'info');
    });

    // Обработчик нажатия кнопки векторизации
    if (vectorizeBtn) {
        vectorizeBtn.addEventListener('click', () => {
            const embedderModelValue = embedderModelSelect ? embedderModelSelect.value : '';
            const summarizeModelValue = summarizeModelSelect ? summarizeModelSelect.value : '';
            const enableSummarize = enableSummarizeCheckbox ? enableSummarizeCheckbox.checked : false;
            
            if (!embedderModelValue) {
                showSettingsStatus('Пожалуйста, выберите модель эмбеддинга', 'error');
                return;
            }
            
            if (enableSummarize && !summarizeModelValue) {
                showSettingsStatus('Пожалуйста, выберите модель для суммаризации', 'error');
                return;
            }
            
            // Находим выбранные модели
            const [embedderServerId, embedderModelId] = embedderModelValue.split(':');
            const embedderModel = activeModels.find(m => m.serverId === embedderServerId && m.modelId === embedderModelId);
            
            let summarizeModel = null;
            if (enableSummarize && summarizeModelValue) {
                const [summarizeServerId, summarizeModelId] = summarizeModelValue.split(':');
                summarizeModel = activeModels.find(m => m.serverId === summarizeServerId && m.modelId === summarizeModelId);
            }
            
            if (!embedderModel) {
                showSettingsStatus('Выбранная модель эмбеддинга не найдена', 'error');
                return;
            }
            
            if (enableSummarize && !summarizeModel) {
                showSettingsStatus('Выбранная модель для суммаризации не найдена', 'error');
                return;
            }

            // Отправка сообщения в extension
            vscode.postMessage({
                command: 'vectorizeAll',
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
                } : null
            });

            // Обновление UI
            vectorizeBtn.disabled = true;
            vectorizeBtn.textContent = 'Векторизация...';
            showSettingsStatus('Векторизация файлов начата...', 'info');
        });
    }

    // Обработчик нажатия кнопки поиска
    searchBtn.addEventListener('click', () => {
        const query = searchQueryInput.value.trim();
        
        if (!query) {
            showSearchStatus('Пожалуйста, введите запрос для поиска', 'error');
            return;
        }

        // Отправка сообщения в extension
        // Значение limit по умолчанию (10) будет использовано на сервере из настроек
        vscode.postMessage({
            command: 'search',
            query: query,
            limit: 10
        });

        // Обновление UI
        searchBtn.disabled = true;
        searchBtn.textContent = 'Поиск...';
        searchResultSection.style.display = 'none';
        showSearchStatus('Поиск похожих файлов...', 'info');
    });

    // Сброс настроек
    // Все значения по умолчанию берутся из package.json через сервер
    if (resetSettingsBtn) {
        resetSettingsBtn.addEventListener('click', () => {
            // Блокируем кнопку сразу при нажатии
            resetSettingsBtn.disabled = true;
            // В sandboxed webview нельзя использовать confirm(), поэтому отправляем запрос на подтверждение
            // в extension, который покажет диалог через VS Code API
            vscode.postMessage({
                command: 'requestResetConfig'
            });
        });
    }

    // Очистка хранилища
    clearStorageBtn.addEventListener('click', () => {
        clearStorageBtn.disabled = true;
        clearStorageBtn.textContent = 'Очистка...';
        
        vscode.postMessage({
            command: 'clearStorage'
        });
    });

    // Обработка сообщений от extension
    window.addEventListener('message', event => {
        const message = event.data;

        switch (message.command) {
            case 'generationStarted':
                resultSection.style.display = 'block';
                thinkingSection.style.display = 'block';
                answerSection.style.display = 'none';
                thinkingContent.textContent = '';
                answerContent.textContent = '';
                break;
            case 'streamChunk':
                // Обновляем размышления и ответ в реальном времени
                if (message.thinking) {
                    thinkingSection.style.display = 'block';
                    thinkingContent.textContent = message.thinking;
                    // Автоскролл к концу размышлений, если секция не свернута
                    if (thinkingContentWrapper && !thinkingContentWrapper.classList.contains('collapsed')) {
                        thinkingContent.scrollTop = thinkingContent.scrollHeight;
                    }
                }
                if (message.answer) {
                    answerSection.style.display = 'block';
                    answerContent.textContent = message.answer;
                    // Автоскролл к концу ответа
                    const answerWrapper = answerContent.parentElement;
                    if (answerWrapper) {
                        answerWrapper.scrollTop = answerWrapper.scrollHeight;
                    }
                }
                break;
            case 'generationComplete':
                // Финальное отображение результата
                if (message.thinking) {
                    thinkingSection.style.display = 'block';
                    thinkingContent.textContent = message.thinking;
                    // Автоскролл к концу размышлений, если секция не свернута
                    if (thinkingContentWrapper && !thinkingContentWrapper.classList.contains('collapsed')) {
                        thinkingContent.scrollTop = thinkingContent.scrollHeight;
                    }
                }
                if (message.answer) {
                    answerSection.style.display = 'block';
                    answerContent.textContent = message.answer;
                    // Автоскролл к концу ответа
                    const answerWrapper = answerContent.parentElement;
                    if (answerWrapper) {
                        answerWrapper.scrollTop = answerWrapper.scrollHeight;
                    }
                }
                generateBtn.disabled = false;
                generateBtn.classList.remove('loading');
                generateBtn.textContent = 'Сгенерировать код';
                showStatus('Код успешно сгенерирован!', 'success');
                // Прокрутка к результату
                resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                break;
            case 'generated':
                // Обратная совместимость с не-streaming генерацией
                displayResult(message.result);
                showStatus('Код успешно сгенерирован!', 'success');
                break;
            case 'error':
                generateBtn.disabled = false;
                generateBtn.classList.remove('loading');
                generateBtn.textContent = 'Сгенерировать код';
                showStatus(`Ошибка: ${message.error}`, 'error');
                break;
            case 'config':
                try {
                    updateSettingsUI(message.config);
                } catch (error) {
                    // Ошибка обновления UI настроек
                }
                // Восстанавливаем кнопку сброса после получения конфигурации
                if (resetSettingsBtn) {
                    resetSettingsBtn.disabled = false;
                }
                // Сохраняем исходные значения после загрузки конфигурации
                // Если окно настроек открыто, обновляем исходные значения
                if (settingsModal && settingsModal.style.display === 'flex') {
                    setTimeout(() => {
                        saveOriginalSettings();
                    }, 100);
                }
                // Запрашиваем информацию о хранилище при загрузке конфигурации
                // Это нужно, чтобы информация отображалась при открытии настроек
                requestStorageCount();
                break;
            case 'configUpdateError':
                // Сбрасываем флаг закрытия при ошибке
                if (window._closeSettingsAfterSave) {
                    window._closeSettingsAfterSave = false;
                }
                showSettingsStatus(`Ошибка сохранения настроек: ${message.error}`, 'error');
                break;
            case 'configUpdated':
                // Обновляем исходные значения после успешного сохранения
                saveOriginalSettings();
                // Если был запрос на закрытие после сохранения, закрываем окно
                if (window._closeSettingsAfterSave) {
                    window._closeSettingsAfterSave = false;
                    if (settingsModal) {
                        settingsModal.style.display = 'none';
                        originalSettings = null;
                    }
                }
                break;
            case 'resetConfigStarted':
                // Кнопка уже заблокирована при нажатии, просто показываем статус
                showSettingsStatus('Сброс настроек...', 'info');
                break;
            case 'resetConfigCancelled':
                // Восстанавливаем кнопку, если пользователь отменил
                if (resetSettingsBtn) {
                    resetSettingsBtn.disabled = false;
                }
                break;
            case 'configReset':
                // Восстанавливаем кнопку сброса после успешного сброса
                if (resetSettingsBtn) {
                    resetSettingsBtn.disabled = false;
                }
                // Обновляем исходные значения после успешного сброса
                setTimeout(() => {
                    saveOriginalSettings();
                }, 100);
                break;
            case 'configResetError':
                // Восстанавливаем кнопку сброса при ошибке
                if (resetSettingsBtn) {
                    resetSettingsBtn.disabled = false;
                }
                showSettingsStatus(`Ошибка сброса настроек: ${message.error}`, 'error');
                break;
            case 'localServerStatus':
                checkLocalBtn.disabled = false;
                checkLocalBtn.textContent = 'Проверить подключение';
                if (message.available) {
                    showSettingsStatus('Локальный сервер доступен', 'success');
                } else {
                    showSettingsStatus('Не удалось подключиться к серверу', 'error');
                }
                break;
            case 'vectorizationComplete':
                if (vectorizeBtn) {
                    vectorizeBtn.disabled = false;
                    vectorizeBtn.textContent = 'Векторизовать все файлы';
                }
                showSettingsStatus(
                    `Векторизация завершена. Обработано: ${message.result.processed}, Ошибок: ${message.result.errors}`,
                    message.result.errors > 0 ? 'warning' : 'success'
                );
                // Обновляем количество записей после векторизации
                requestStorageCount();
                break;
            case 'vectorizationError':
                if (vectorizeBtn) {
                    vectorizeBtn.disabled = false;
                    vectorizeBtn.textContent = 'Векторизовать все файлы';
                }
                showSettingsStatus(`Ошибка векторизации: ${message.error}`, 'error');
                break;
            case 'searchResults':
                displaySearchResults(message.results);
                showSearchStatus(`Найдено файлов: ${message.results.length}`, 'success');
                break;
            case 'searchError':
                searchBtn.disabled = false;
                searchBtn.textContent = 'Найти похожие файлы';
                showSearchStatus(`Ошибка поиска: ${message.error}`, 'error');
                break;
            case 'storageCleared':
                clearStorageBtn.disabled = false;
                clearStorageBtn.textContent = 'Очистить хранилище';
                showSettingsStatus('Хранилище эмбеддингов успешно очищено', 'success');
                // Обновляем количество записей после очистки
                requestStorageCount();
                break;
            case 'storageClearError':
                clearStorageBtn.disabled = false;
                clearStorageBtn.textContent = 'Очистить хранилище';
                showSettingsStatus(`Ошибка очистки хранилища: ${message.error}`, 'error');
                // Обновляем количество записей после очистки (или ошибки)
                requestStorageCount();
                break;
            case 'storageCount':
                if (storageCount) {
                    const count = message.count || 0;
                    storageCount.textContent = count.toLocaleString('ru-RU');
                }
                if (storageSize) {
                    const size = message.size || 0;
                    storageSize.textContent = formatBytes(size);
                }
                break;
            case 'storageCountError':
                if (storageCount) {
                    storageCount.textContent = 'Ошибка';
                    storageCount.title = message.error;
                }
                if (storageSize) {
                    storageSize.textContent = 'Ошибка';
                    storageSize.title = message.error;
                }
                break;
            case 'closeSettings':
                // Просто закрываем окно настроек
                if (settingsModal) {
                    settingsModal.style.display = 'none';
                    originalSettings = null;
                }
                break;
            case 'saveAndCloseSettings':
                // Сохраняем настройки и закрываем окно
                // Собираем текущие значения и отправляем на сохранение
                const configToSave = {
                    provider: providerSelect.value,
                    apiKey: apiKeyInput.value.trim(),
                    model: modelInput.value.trim(),
                    embedderModel: embedderModelInput.value.trim(),
                    summarizePrompt: summarizePromptInput ? summarizePromptInput.value.trim() : '',
                    enableOrigin: enableOriginCheckbox ? enableOriginCheckbox.checked : true,
                    enableSummarize: enableSummarizeCheckbox ? enableSummarizeCheckbox.checked : false,
                    enableVsOrigin: enableVsOriginCheckbox ? enableVsOriginCheckbox.checked : true,
                    enableVsSummarize: enableVsSummarizeCheckbox ? enableVsSummarizeCheckbox.checked : true,
                    temperature: parseFloat(temperatureInput.value),
                    maxTokens: parseInt(maxTokensInput.value),
                    baseUrl: baseUrlInput.value.trim(),
                    localUrl: localUrlInput.value.trim(),
                    timeout: parseInt(timeoutInput.value),
                    systemPrompt: systemPromptInput.value.trim()
                };
                
                // Валидация
                if (!configToSave.model) {
                    showSettingsStatus('Пожалуйста, укажите модель', 'error');
                    // Отменяем закрытие при ошибке валидации
                    window._closeSettingsAfterSave = false;
                    break;
                }

                if (isNaN(configToSave.temperature) || configToSave.temperature < 0 || configToSave.temperature > 2) {
                    showSettingsStatus('Температура должна быть от 0 до 2', 'error');
                    window._closeSettingsAfterSave = false;
                    break;
                }

                if (isNaN(configToSave.maxTokens) || configToSave.maxTokens < 100 || configToSave.maxTokens > 8000) {
                    showSettingsStatus('Максимум токенов должен быть от 100 до 8000', 'error');
                    window._closeSettingsAfterSave = false;
                    break;
                }

                if (isNaN(configToSave.timeout) || configToSave.timeout < 5000 || configToSave.timeout > 300000) {
                    showSettingsStatus('Таймаут должен быть от 5000 до 300000 миллисекунд', 'error');
                    window._closeSettingsAfterSave = false;
                    break;
                }
                
                // Отправляем на сохранение
                vscode.postMessage({
                    command: 'updateConfig',
                    config: configToSave
                });
                
                // Устанавливаем флаг, что нужно закрыть окно после сохранения
                window._closeSettingsAfterSave = true;
                showSettingsStatus('Сохранение настроек...', 'info');
                break;
            case 'discardAndCloseSettings':
                // Отменяем изменения (восстанавливаем исходные значения) и закрываем
                if (originalSettings) {
                    // Восстанавливаем исходные значения
                    if (providerSelect) providerSelect.value = originalSettings.provider;
                    if (apiKeyInput) {
                        // Если API ключ был сохранен, восстанавливаем placeholder
                        if (originalSettings.apiKey === '__SAVED__' || originalSettings.hasApiKey) {
                            apiKeyInput.placeholder = 'API ключ сохранен';
                            apiKeyInput.value = '';
                        } else {
                            apiKeyInput.value = originalSettings.apiKey;
                            apiKeyInput.placeholder = 'Введите ваш API ключ';
                        }
                    }
                    if (modelInput) modelInput.value = originalSettings.model;
                    if (embedderModelInput) embedderModelInput.value = originalSettings.embedderModel;
                    if (summarizePromptInput) summarizePromptInput.value = originalSettings.summarizePrompt;
                    if (enableOriginCheckbox) enableOriginCheckbox.checked = originalSettings.enableOrigin;
                    if (enableSummarizeCheckbox) enableSummarizeCheckbox.checked = originalSettings.enableSummarize;
                    if (enableVsOriginCheckbox) enableVsOriginCheckbox.checked = originalSettings.enableVsOrigin;
                    if (enableVsSummarizeCheckbox) enableVsSummarizeCheckbox.checked = originalSettings.enableVsSummarize;
                    if (temperatureInput) {
                        temperatureInput.value = originalSettings.temperature;
                        if (temperatureValue) temperatureValue.textContent = originalSettings.temperature;
                    }
                    if (maxTokensInput) maxTokensInput.value = originalSettings.maxTokens;
                    if (baseUrlInput) baseUrlInput.value = originalSettings.baseUrl;
                    if (localUrlInput) localUrlInput.value = originalSettings.localUrl;
                    if (timeoutInput) timeoutInput.value = originalSettings.timeout;
                    if (systemPromptInput) systemPromptInput.value = originalSettings.systemPrompt;
                    
                    // Обновляем видимость полей
                    updateProviderFields();
                }
                // Закрываем окно
                if (settingsModal) {
                    settingsModal.style.display = 'none';
                    originalSettings = null;
                }
                break;
            case 'cancelCloseSettings':
                // Пользователь отменил закрытие - ничего не делаем
                break;
        }

        // Восстановление кнопок только для определенных команд
        // (кроме векторизации, поиска и настроек, они восстанавливаются отдельно)
        if (message.command === 'error' || message.command === 'generationComplete' || message.command === 'generated') {
            generateBtn.disabled = false;
            generateBtn.textContent = 'Сгенерировать код';
        }
        if (message.command === 'searchResults' || message.command === 'searchError') {
            searchBtn.disabled = false;
            searchBtn.textContent = 'Найти похожие файлы';
        }
    });

    /**
     * Обновление UI настроек из конфигурации
     */
    function updateSettingsUI(config) {
        // Используем значения из конфигурации (дефолтные значения берутся из package.json через VS Code Configuration API)
        // VS Code Configuration API всегда возвращает дефолтное значение из package.json, если оно там указано
        if (config.provider) {
            providerSelect.value = config.provider;
        }
        // API ключ не показываем полностью, только индикатор
        if (config.hasApiKey) {
            apiKeyInput.placeholder = 'API ключ сохранен';
            apiKeyInput.value = '';
        } else {
            apiKeyInput.placeholder = 'Введите ваш API ключ';
            apiKeyInput.value = '';
        }
        modelInput.value = config.model || '';
        embedderModelInput.value = config.embedderModel || '';
        if (summarizePromptInput) {
            summarizePromptInput.value = config.summarizePrompt || '';
        }
        if (enableOriginCheckbox) {
            if (config.enableOrigin !== undefined) {
                enableOriginCheckbox.checked = config.enableOrigin;
            }
        }
        if (enableSummarizeCheckbox) {
            if (config.enableSummarize !== undefined) {
                enableSummarizeCheckbox.checked = config.enableSummarize;
            }
        }
        if (enableVsOriginCheckbox) {
            if (config.enableVsOrigin !== undefined) {
                enableVsOriginCheckbox.checked = config.enableVsOrigin;
            }
        }
        if (enableVsSummarizeCheckbox) {
            if (config.enableVsSummarize !== undefined) {
                enableVsSummarizeCheckbox.checked = config.enableVsSummarize;
            }
        }
        temperatureInput.value = config.temperature !== undefined ? config.temperature : '';
        temperatureValue.textContent = config.temperature !== undefined ? config.temperature : '';
        maxTokensInput.value = config.maxTokens !== undefined ? config.maxTokens : '';
        baseUrlInput.value = config.baseUrl || '';
        localUrlInput.value = config.localUrl || '';
        timeoutInput.value = config.timeout !== undefined ? config.timeout : '';
        systemPromptInput.value = config.systemPrompt || '';
        
        // Обновление видимости полей
        updateProviderFields();
        
        showSettingsStatus('Настройки загружены', 'success');
    }

    /**
     * Отображение результата генерации (обратная совместимость)
     */
    function displayResult(result) {
        // Скрываем секции размышлений и ответа
        thinkingSection.style.display = 'none';
        answerSection.style.display = 'none';
        // Показываем старый формат результата
        resultContent.textContent = result;
        resultSection.style.display = 'block';
        
        // Прокрутка к результату
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    /**
     * Отображение статуса (генерация)
     * Задержка автоматического скрытия берется из настроек через сервер
     */
    function showStatus(message, type) {
        // Отправляем уведомление в VS Code
        vscode.postMessage({
            command: 'showNotification',
            message: message,
            type: type
        });
    }

    /**
     * Отображение статуса (настройки)
     */
    function showSettingsStatus(message, type) {
        // Отправляем уведомление в VS Code
        vscode.postMessage({
            command: 'showNotification',
            message: message,
            type: type
        });
    }

    /**
     * Отображение статуса (поиск)
     */
    function showSearchStatus(message, type) {
        // Отправляем уведомление в VS Code
        vscode.postMessage({
            command: 'showNotification',
            message: message,
            type: type
        });
    }

    /**
     * Отображение результатов поиска
     */
    function displaySearchResults(results) {
        if (results.length === 0) {
            searchResultsList.innerHTML = '<p>Похожие файлы не найдены</p>';
            searchResultSection.style.display = 'block';
            return;
        }

        // Функция для получения понятного названия типа
        function getTypeLabel(type) {
            const labels = {
                'file': '📄 Файл',
                'directory': '📁 Директория',
                'chunk': '📝 Фрагмент'
            };
            return labels[type] || type;
        }

        // Функция для получения понятного названия kind
        function getKindLabel(kind) {
            const labels = {
                'origin': 'Оригинальный текст',
                'summarize': 'Суммаризация по оригинальному тексту',
                'vs_origin': 'Сумма векторов по оригинальному тексту вложений',
                'vs_summarize': 'Сумма векторов по суммаризации вложений'
            };
            return labels[kind] || kind;
        }

        let html = '<ul class="search-results-list">';
        results.forEach((result, index) => {
            const similarityPercent = (result.similarity * 100).toFixed(1);
            const typeLabel = getTypeLabel(result.type);
            const kindLabel = getKindLabel(result.kind);
            const rawContent = result.raw ? (typeof result.raw === 'string' ? result.raw : JSON.stringify(result.raw, null, 2)) : '';
            const hasRaw = rawContent && rawContent.trim().length > 0;
            const rawId = `raw-content-${index}`;
            html += `
                <li class="search-result-item" data-path="${escapeHtml(result.path)}" data-type="${result.type}">
                    <div class="search-result-header">
                        <div class="search-result-type-badge">${typeLabel}</div>
                        <span class="search-result-similarity">${similarityPercent}%</span>
                    </div>
                    <div class="search-result-path">${escapeHtml(result.path)}</div>
                    <div class="search-result-meta">
                        <span class="search-result-kind-badge" title="${kindLabel}">${kindLabel}</span>
                    </div>
                    ${hasRaw ? `
                    <div class="search-result-raw-section">
                        <button class="search-result-raw-toggle" data-target="${rawId}" type="button">
                            <span class="raw-toggle-icon">▼</span>
                            <span class="raw-toggle-text">Показать содержимое</span>
                        </button>
                        <div class="search-result-raw-content" id="${rawId}" style="display: none;">
                            <pre class="raw-content-pre">${escapeHtml(rawContent)}</pre>
                        </div>
                    </div>
                    ` : ''}
                </li>
            `;
        });
        html += '</ul>';

        searchResultsList.innerHTML = html;
        searchResultSection.style.display = 'block';
        
        // Добавляем обработчики клика для открытия файлов
        const resultItems = searchResultsList.querySelectorAll('.search-result-item');
        resultItems.forEach(item => {
            // Обработчик клика на сам элемент (для открытия файла)
            item.addEventListener('click', (e) => {
                // Не открываем файл, если клик был на кнопке раскрытия raw или внутри блока raw
                if (e.target.closest('.search-result-raw-toggle') || e.target.closest('.search-result-raw-content')) {
                    return;
                }
                
                const filePath = item.getAttribute('data-path');
                const fileType = item.getAttribute('data-type');
                
                if (fileType === 'file') {
                    // Открываем файл в VS Code
                    vscode.postMessage({
                        command: 'openFile',
                        path: filePath
                    });
                }
            });
        });
        
        // Добавляем обработчики для кнопок раскрытия raw
        const rawToggles = searchResultsList.querySelectorAll('.search-result-raw-toggle');
        rawToggles.forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation(); // Предотвращаем открытие файла
                const targetId = toggle.getAttribute('data-target');
                const rawContent = document.getElementById(targetId);
                const toggleIcon = toggle.querySelector('.raw-toggle-icon');
                const toggleText = toggle.querySelector('.raw-toggle-text');
                
                if (rawContent) {
                    if (rawContent.style.display === 'none') {
                        rawContent.style.display = 'block';
                        toggleIcon.textContent = '▲';
                        toggleText.textContent = 'Скрыть содержимое';
                        toggle.classList.add('expanded');
                    } else {
                        rawContent.style.display = 'none';
                        toggleIcon.textContent = '▼';
                        toggleText.textContent = 'Показать содержимое';
                        toggle.classList.remove('expanded');
                    }
                }
            });
        });
        
        // Прокрутка к результатам
        searchResultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    /**
     * Экранирование HTML для безопасности
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }


    // Восстановление состояния при загрузке
    const previousState = vscode.getState();
    if (previousState && previousState.text) {
        promptInput.value = previousState.text;
    }

    // Сохранение состояния при изменении текста
    promptInput.addEventListener('input', () => {
        vscode.setState({ text: promptInput.value });
    });

    // Управление серверами LLM
    let servers = [];

    // Загрузка списка серверов при открытии настроек
    function loadServers() {
        vscode.postMessage({
            command: 'getServers'
        });
    }

    // Отображение списка серверов
    function renderServers() {
        if (!serversList) return;

        if (servers.length === 0) {
            serversList.innerHTML = '<div class="empty-servers-message">Серверы не добавлены</div>';
            return;
        }

        serversList.innerHTML = servers.map((server, index) => {
            const statusClass = server.status === 'checking' ? 'checking' : 
                              server.status === 'available' ? 'available' : 'unavailable';
            const statusText = server.status === 'checking' ? 'Проверка...' :
                              server.status === 'available' ? '✓ Доступен' : '✗ Недоступен';
            
            // Показываем статус только если он "checking" или "available", скрываем "unavailable"
            const showStatus = server.status === 'checking' || server.status === 'available';

            const isActive = server.active !== false; // По умолчанию активен
            return `
                <div class="server-item ${!isActive ? 'server-inactive' : ''}" data-server-id="${server.id}">
                    <div class="server-main-content" style="display: flex; align-items: center; gap: 12px; width: 100%;">
                        <label class="server-active-toggle" style="display: flex; align-items: center; cursor: pointer; margin-right: 4px;">
                            <input type="checkbox" class="server-active-checkbox" data-server-id="${server.id}" ${isActive ? 'checked' : ''} style="margin-right: 8px; cursor: pointer;">
                            <span style="font-size: 12px; color: var(--vscode-foreground);">Активен</span>
                        </label>
                        <div class="server-info" style="flex: 1;">
                            <div class="server-name">${escapeHtml(server.name)}</div>
                            <div class="server-url">${escapeHtml(server.url)}</div>
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
        }).join('');

        // Добавляем обработчики событий
        serversList.querySelectorAll('.check-server-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const serverId = e.target.getAttribute('data-server-id');
                checkServer(serverId);
            });
        });

        serversList.querySelectorAll('.edit-server-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const serverId = e.target.getAttribute('data-server-id');
                editServer(serverId);
            });
        });

        serversList.querySelectorAll('.toggle-models-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const serverId = e.target.closest('[data-server-id]')?.getAttribute('data-server-id') || 
                                e.target.getAttribute('data-server-id');
                toggleServerModels(serverId);
            });
        });

        serversList.querySelectorAll('.load-models-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const serverId = e.target.getAttribute('data-server-id');
                loadServerModels(serverId);
            });
        });

        serversList.querySelectorAll('.edit-models-mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const serverId = e.target.getAttribute('data-server-id');
                setModelsEditMode(serverId, true);
            });
        });

        serversList.querySelectorAll('.view-models-mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const serverId = e.target.getAttribute('data-server-id');
                setModelsEditMode(serverId, false);
            });
        });

        serversList.querySelectorAll('.delete-server-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const serverId = e.target.getAttribute('data-server-id');
                deleteServer(serverId);
            });
        });

        serversList.querySelectorAll('.server-active-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const serverId = e.target.getAttribute('data-server-id');
                const isActive = e.target.checked;
                toggleServerActive(serverId, isActive);
            });
        });
    }
    
    // Переключение активности сервера
    function toggleServerActive(serverId, active) {
        vscode.postMessage({
            command: 'toggleServerActive',
            serverId: serverId,
            active: active
        });
    }
    
    // Переключение активности модели
    function toggleModelActive(serverId, modelId, active) {
        vscode.postMessage({
            command: 'toggleModelActive',
            serverId: serverId,
            modelId: modelId,
            active: active
        });
    }
    
    // Переключение видимости списка моделей
    function toggleServerModels(serverId) {
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
    
    // Загрузка моделей сервера
    function loadServerModels(serverId) {
        const serverForLoad = servers.find(s => s.id === serverId);
        if (!serverForLoad) return;
        
        const serverItem = serversList?.querySelector(`[data-server-id="${serverId}"]`);
        const modelsList = serverItem?.querySelector('.server-models-list');
        
        if (modelsList) {
            modelsList.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--vscode-descriptionForeground);">Загрузка моделей...</div>';
        }
        
        // Запрашиваем список моделей с сервера
        vscode.postMessage({
            command: 'getServerModels',
            serverId: serverId,
            url: serverForLoad.url,
            apiKey: serverForLoad.apiKey
        });
    }
    
    // Установка режима редактирования моделей
    function setModelsEditMode(serverId, editMode) {
        modelsEditMode[serverId] = editMode;
        const serverItem = serversList?.querySelector(`[data-server-id="${serverId}"]`);
        if (!serverItem) return;
        
        const modelsList = serverItem.querySelector('.server-models-list');
        const editBtn = serverItem.querySelector('.edit-models-mode-btn');
        const viewBtn = serverItem.querySelector('.view-models-mode-btn');
        
        if (editMode) {
            if (editBtn) editBtn.style.display = 'none';
            if (viewBtn) viewBtn.style.display = 'inline-block';
            // Перерисовываем модели в режиме редактирования
            const serverForEdit = servers.find(s => s.id === serverId);
            if (serverForEdit && serverForEdit.models) {
                renderServerModels(serverId, serverForEdit.models, true);
            }
        } else {
            if (editBtn) editBtn.style.display = 'inline-block';
            if (viewBtn) viewBtn.style.display = 'none';
            // Перерисовываем модели в режиме просмотра
            const serverForView = servers.find(s => s.id === serverId);
            if (serverForView && serverForView.models) {
                renderServerModels(serverId, serverForView.models, false);
            }
        }
    }
    
    // Отображение списка моделей
    function renderServerModels(serverId, models, editMode = false) {
        const serverItem = serversList?.querySelector(`[data-server-id="${serverId}"]`);
        const modelsList = serverItem?.querySelector('.server-models-list');
        if (!modelsList) return;
        
        if (models.length === 0) {
            modelsList.innerHTML = '<div class="empty-servers-message">Модели не найдены</div>';
            return;
        }
        
        if (editMode) {
            // Режим редактирования - показываем настройки для каждой модели
            modelsList.innerHTML = models.map((model, index) => {
                const modelId = model.id || `model-${index}`;
                const isModelActive = model.active !== false; // По умолчанию активна
                return `
                    <div class="model-item ${!isModelActive ? 'model-inactive' : ''}" data-model-id="${modelId}">
                        <div class="model-info" style="display: flex; align-items: center; gap: 12px;">
                            <label class="model-active-toggle" style="display: flex; align-items: center; cursor: pointer;">
                                <input type="checkbox" class="model-active-checkbox" data-server-id="${serverId}" data-model-id="${modelId}" ${isModelActive ? 'checked' : ''} style="margin-right: 8px; cursor: pointer;">
                                <span style="font-size: 11px; color: var(--vscode-foreground);">Активна</span>
                            </label>
                            <div style="flex: 1;">
                                <div class="model-name">${escapeHtml(model.name)}</div>
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
            }).join('');
            
            // Добавляем обработчики для сохранения настроек
            modelsList.querySelectorAll('.save-model-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const modelId = e.target.getAttribute('data-model-id');
                    const serverId = e.target.getAttribute('data-server-id');
                    const modelItem = modelsList.querySelector(`[data-model-id="${modelId}"]`);
                    if (!modelItem || !serverId) return;
                    
                    const modelName = modelItem.querySelector('.model-name')?.textContent || '';
                    const temperatureInput = modelItem.querySelector('.model-temperature-input');
                    const maxTokensInput = modelItem.querySelector('.model-max-tokens-input');
                    const systemPromptInput = modelItem.querySelector('.model-system-prompt-input');
                    
                    const temperature = temperatureInput && temperatureInput.value ? parseFloat(temperatureInput.value) : undefined;
                    const maxTokens = maxTokensInput && maxTokensInput.value ? parseInt(maxTokensInput.value) : undefined;
                    const systemPrompt = systemPromptInput ? systemPromptInput.value.trim() : undefined;
                    
                    vscode.postMessage({
                        command: 'updateServerModel',
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
            
            // Добавляем обработчики для чекбоксов активности моделей (в режиме редактирования)
            modelsList.querySelectorAll('.model-active-checkbox').forEach(checkbox => {
                checkbox.addEventListener('change', (e) => {
                    const serverId = e.target.getAttribute('data-server-id');
                    const modelId = e.target.getAttribute('data-model-id');
                    const isActive = e.target.checked;
                    toggleModelActive(serverId, modelId, isActive);
                });
            });
        } else {
            // Режим просмотра - просто показываем список моделей с их настройками
            modelsList.innerHTML = models.map((model, index) => {
                const modelId = model.id || `model-${index}`;
                const isModelActive = model.active !== false; // По умолчанию активна
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
                                <div class="model-name">${escapeHtml(model.name)}</div>
                                ${settings.length > 0 ? `<div class="model-settings-preview" style="font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 4px;">${settings.join(' • ')}</div>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        // Добавляем обработчики для чекбоксов активности моделей
        modelsList.querySelectorAll('.model-active-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const serverId = e.target.getAttribute('data-server-id');
                const modelId = e.target.getAttribute('data-model-id');
                const isActive = e.target.checked;
                toggleModelActive(serverId, modelId, isActive);
            });
        });
    }
    
    // Показать форму создания/редактирования
    function showServerForm(server = null) {
        if (!serverFormCard) return;
        
        editingServerId = server ? server.id : null;
        
        // Заполняем поля если редактируем
        if (server) {
            if (serverNameInput) serverNameInput.value = server.name || '';
            if (serverUrlInput) serverUrlInput.value = server.url || '';
            if (serverApiKeyInput) serverApiKeyInput.value = server.apiKey || '';
        } else {
            // Очищаем поля для нового сервера
            if (serverNameInput) serverNameInput.value = '';
            if (serverUrlInput) serverUrlInput.value = '';
            if (serverApiKeyInput) serverApiKeyInput.value = '';
        }
        
        // Показываем форму в начале списка
        serverFormCard.style.display = 'flex';
        if (serversList) {
            serversList.insertBefore(serverFormCard, serversList.firstChild);
        }
        
        // Фокус на первое поле
        if (serverNameInput) {
            setTimeout(() => serverNameInput.focus(), 100);
        }
    }
    
    // Скрыть форму создания/редактирования
    function hideServerForm() {
        if (!serverFormCard) return;
        serverFormCard.style.display = 'none';
        editingServerId = null;
    }
    
    // Редактирование сервера
    function editServer(serverId) {
        const server = servers.find(s => s.id === serverId);
        if (server) {
            showServerForm(server);
        }
    }

    // Показать форму добавления сервера
    if (addServerBtn) {
        addServerBtn.addEventListener('click', () => {
            showServerForm();
        });
    }
    
    // Сохранение сервера (создание или редактирование)
    if (saveServerBtn) {
        saveServerBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            console.log('Кнопка сохранения нажата');
            
            const name = serverNameInput ? serverNameInput.value.trim() : '';
            const url = serverUrlInput ? serverUrlInput.value.trim() : '';
            const apiKey = serverApiKeyInput ? serverApiKeyInput.value.trim() : '';

            console.log('Данные сервера:', { name, url, hasApiKey: !!apiKey, editingServerId });

            if (!name) {
                console.warn('Не указано имя сервера');
                showSettingsStatus('Пожалуйста, укажите наименование сервера', 'error');
                return;
            }

            if (!url) {
                console.warn('Не указан URL сервера');
                showSettingsStatus('Пожалуйста, укажите URL сервера', 'error');
                return;
            }

            // Валидация URL
            try {
                new URL(url);
            } catch (e) {
                console.warn('Некорректный URL:', url);
                showSettingsStatus('Некорректный URL сервера', 'error');
                return;
            }

            if (editingServerId) {
                // Редактирование существующего сервера
                console.log('Отправка команды updateServer для сервера:', editingServerId);
                const message = {
                    command: 'updateServer',
                    serverId: editingServerId,
                    server: {
                        name: name,
                        url: url,
                        apiKey: apiKey
                    }
                };
                console.log('Отправляем сообщение:', message);
                vscode.postMessage(message);
                hideServerForm();
            } else {
                // Создание нового сервера
                console.log('Отправка команды addServer');
                const message = {
                    command: 'addServer',
                    server: {
                        name: name,
                        url: url,
                        apiKey: apiKey
                    }
                };
                console.log('Отправляем сообщение:', message);
                vscode.postMessage(message);
                // Форма будет скрыта после получения ответа serverAdded или serverAddError
            }
        });
    } else {
        console.error('Кнопка save-server-btn не найдена!');
    }
    
    // Отмена создания/редактирования
    if (cancelServerBtn) {
        cancelServerBtn.addEventListener('click', () => {
            hideServerForm();
        });
    }

    // Проверка подключения к серверу
    function checkServer(serverId) {
        const server = servers.find(s => s.id === serverId);
        if (!server) return;

        // Обновляем статус на "проверка"
        server.status = 'checking';
        renderServers();

        vscode.postMessage({
            command: 'checkServer',
            serverId: serverId,
            url: server.url,
            apiKey: server.apiKey
        });
    }

    // Удаление сервера
    function deleteServer(serverId) {
        vscode.postMessage({
            command: 'deleteServer',
            serverId: serverId
        });
    }

    // Обработка сообщений о серверах
    window.addEventListener('message', event => {
        const message = event.data;

        switch (message.command) {
            case 'serversList':
                servers = message.servers || [];
                renderServers();
                // Обновляем список активных моделей после загрузки серверов
                loadActiveModels();
                break;
            case 'activeModelsList':
                activeModels = message.models || [];
                updateModelSelects();
                break;
            case 'serverActiveToggled':
            case 'modelActiveToggled':
                // При изменении активности сервера или модели обновляем список активных моделей
                loadActiveModels();
                break;
            case 'serverAdded':
                console.log('Получено сообщение serverAdded:', message);
                showSettingsStatus('Сервер успешно добавлен', 'success');
                hideServerForm(); // Скрываем форму после успешного добавления
                loadServers();
                break;
            case 'serverAddError':
                console.error('Ошибка добавления сервера:', message.error);
                showSettingsStatus(`Ошибка добавления сервера: ${message.error}`, 'error');
                // Не скрываем форму при ошибке, чтобы пользователь мог исправить данные
                break;
            case 'serverUpdated':
                showSettingsStatus('Сервер успешно обновлен', 'success');
                loadServers();
                break;
            case 'serverUpdateError':
                showSettingsStatus(`Ошибка обновления сервера: ${message.error}`, 'error');
                break;
            case 'serverDeleted':
                showSettingsStatus('Сервер удален', 'success');
                loadServers();
                break;
            case 'serverDeleteError':
                showSettingsStatus(`Ошибка удаления сервера: ${message.error}`, 'error');
                break;
            case 'serverCheckResult':
                const server = servers.find(s => s.id === message.serverId);
                if (server) {
                    server.status = message.available ? 'available' : 'unavailable';
                    renderServers();
                }
                break;
            case 'serverCheckError':
                const serverError = servers.find(s => s.id === message.serverId);
                if (serverError) {
                    serverError.status = 'unavailable';
                    renderServers();
                }
                showSettingsStatus(`Ошибка проверки сервера: ${message.error}`, 'error');
                break;
            case 'serverModelsList':
                const serverWithModels = servers.find(s => s.id === message.serverId);
                if (serverWithModels) {
                    // Сохраняем модели в сервер
                    serverWithModels.models = message.models || [];
                    // Обновляем отображение
                    const editMode = modelsEditMode[message.serverId] || false;
                    renderServerModels(message.serverId, message.models || [], editMode);
                }
                break;
            case 'serverModelsListError':
                const serverItem = serversList?.querySelector(`[data-server-id="${message.serverId}"]`);
                const modelsList = serverItem?.querySelector('.server-models-list');
                if (modelsList) {
                    modelsList.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--vscode-testing-iconFailed);">Ошибка загрузки моделей: ${message.error}</div>`;
                }
                break;
            case 'serverModelUpdated':
                showSettingsStatus('Настройки модели сохранены', 'success');
                // Обновляем список моделей
                const updatedServer = servers.find(s => s.id === message.serverId);
                if (updatedServer) {
                    // Обновляем модель в списке
                    if (!updatedServer.models) {
                        updatedServer.models = [];
                    }
                    const modelIndex = updatedServer.models.findIndex(m => (m.id && m.id === message.model.id) || m.name === message.model.name);
                    if (modelIndex !== -1) {
                        updatedServer.models[modelIndex] = message.model;
                    } else {
                        updatedServer.models.push(message.model);
                    }
                    // Перерисовываем
                    const editMode = modelsEditMode[message.serverId] || false;
                    renderServerModels(message.serverId, updatedServer.models, editMode);
                }
                break;
            case 'serverModelUpdateError':
                showSettingsStatus(`Ошибка сохранения настроек модели: ${message.error}`, 'error');
                break;
            case 'serverActiveToggled':
                const toggledServer = servers.find(s => s.id === message.serverId);
                if (toggledServer) {
                    toggledServer.active = message.active;
                    renderServers();
                }
                break;
            case 'modelActiveToggled':
                const modelServer = servers.find(s => s.id === message.serverId);
                if (modelServer && modelServer.models) {
                    const model = modelServer.models.find(m => m.id === message.modelId || m.name === message.modelId);
                    if (model) {
                        model.active = message.active;
                        // Перерисовываем модели
                        const editMode = modelsEditMode[message.serverId] || false;
                        renderServerModels(message.serverId, modelServer.models, editMode);
                    }
                }
                break;
            case 'serverToggleError':
            case 'modelToggleError':
                showSettingsStatus(`Ошибка переключения активности: ${message.error}`, 'error');
                break;
        }
    });

})();
