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
    const statusSection = document.getElementById('status-section');

    // Элементы DOM - поиск
    const searchQueryInput = document.getElementById('search-query-input');
    const searchBtn = document.getElementById('search-btn');
    const searchResultSection = document.getElementById('search-result-section');
    const searchResultsList = document.getElementById('search-results-list');
    const searchStatusSection = document.getElementById('search-status-section');

    // Элементы DOM - настройки
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const providerSelect = document.getElementById('provider-select');
    const apiKeyInput = document.getElementById('api-key-input');
    const toggleApiKeyBtn = document.getElementById('toggle-api-key');
    const modelInput = document.getElementById('model-input');
    const embedderModelInput = document.getElementById('embedder-model-input');
    const temperatureInput = document.getElementById('temperature-input');
    const temperatureValue = document.getElementById('temperature-value');
    const maxTokensInput = document.getElementById('max-tokens-input');
    const baseUrlInput = document.getElementById('base-url-input');
    const baseUrlGroup = document.getElementById('base-url-group');
    const apiTypeSelect = document.getElementById('api-type-select');
    const apiTypeGroup = document.getElementById('api-type-group');
    const localUrlInput = document.getElementById('local-url-input');
    const localUrlGroup = document.getElementById('local-url-group');
    const localCheckGroup = document.getElementById('local-check-group');
    const checkLocalBtn = document.getElementById('check-local-btn');
    const localStatus = document.getElementById('local-status');
    const timeoutInput = document.getElementById('timeout-input');
    const systemPromptInput = document.getElementById('system-prompt-input');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const resetSettingsBtn = document.getElementById('reset-settings-btn');
    const clearStorageBtn = document.getElementById('clear-storage-btn');
    const refreshStorageCountBtn = document.getElementById('refresh-storage-count-btn');
    const storageCount = document.getElementById('storage-count');
    const storageSize = document.getElementById('storage-size');
    const settingsStatusSection = document.getElementById('settings-status-section');
    const vectorizationStatusSection = document.getElementById('vectorization-status-section');

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
            
            // При открытии вкладки настроек запрашиваем количество записей
            if (targetTab === 'settings') {
                // Проверяем, какая подвкладка активна
                const activeSettingsTab = document.querySelector('.settings-tab-button.active');
                if (activeSettingsTab && activeSettingsTab.getAttribute('data-settings-tab') === 'vectorization') {
                    requestStorageCount();
                }
            }
        });
    });

    // Управление подвкладками в настройках
    const settingsTabButtons = document.querySelectorAll('.settings-tab-button');
    const settingsTabContents = document.querySelectorAll('.settings-tab-content');
    
    settingsTabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-settings-tab');
            
            // Обновление активных подвкладок
            settingsTabButtons.forEach(btn => btn.classList.remove('active'));
            settingsTabContents.forEach(content => content.classList.remove('active'));
            
            button.classList.add('active');
            document.getElementById(`settings-tab-${targetTab}`).classList.add('active');
            
            // При открытии вкладки векторизации запрашиваем количество записей
            if (targetTab === 'vectorization') {
                requestStorageCount();
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
        const provider = providerSelect.value;
        const isLocal = provider === 'ollama';
        const isCustom = provider === 'custom';
        const needsApiKey = provider === 'openai' || provider === 'anthropic';

        // Показ/скрытие полей
        localUrlGroup.style.display = isLocal ? 'block' : 'none';
        baseUrlGroup.style.display = isCustom ? 'block' : 'none';
        apiTypeGroup.style.display = isCustom ? 'block' : 'none';
        localCheckGroup.style.display = (isLocal || isCustom) ? 'block' : 'none';
        
        // API ключ нужен только для облачных провайдеров
        const apiKeyGroup = apiKeyInput.closest('.setting-group');
        if (apiKeyGroup) {
            apiKeyGroup.style.display = needsApiKey ? 'block' : 'none';
        }

        // Обновление placeholder для модели
        if (isLocal) {
            modelInput.placeholder = 'llama2, codellama, mistral, phi...';
        } else if (isCustom) {
            modelInput.placeholder = 'Название модели вашего локального сервера';
        } else {
            modelInput.placeholder = 'gpt-4, gpt-3.5-turbo, claude-3-opus...';
        }
    }

    providerSelect.addEventListener('change', updateProviderFields);

    // Проверка подключения к локальному серверу
    checkLocalBtn.addEventListener('click', () => {
        const provider = providerSelect.value;
        let url = '';

        if (provider === 'ollama') {
            url = localUrlInput.value.trim() || 'http://localhost:11434';
        } else if (provider === 'custom') {
            url = baseUrlInput.value.trim() || 'http://localhost:1234';
        }

        if (!url) {
            showSettingsStatus('Пожалуйста, укажите URL сервера', 'error');
            return;
        }

        checkLocalBtn.disabled = true;
        checkLocalBtn.textContent = 'Проверка...';
        localStatus.textContent = '';
        localStatus.className = 'local-status';

        const apiType = provider === 'custom' ? apiTypeSelect.value : undefined;
        vscode.postMessage({
            command: 'checkLocalServer',
            url: url,
            provider: provider,
            apiType: apiType
        });
    });

    // Запрос конфигурации при загрузке
    vscode.postMessage({ command: 'getConfig' });
    
    // Запрос количества записей при загрузке (если открыта вкладка векторизации)
    // Проверяем, активна ли вкладка настроек и подвкладка векторизации
    const settingsTab = document.getElementById('tab-settings');
    const vectorizationTab = document.getElementById('settings-tab-vectorization');
    if (settingsTab && settingsTab.classList.contains('active') && 
        vectorizationTab && vectorizationTab.classList.contains('active')) {
        requestStorageCount();
    }

    // Обработчик нажатия кнопки генерации
    generateBtn.addEventListener('click', () => {
        const text = promptInput.value.trim();
        
        if (!text) {
            showStatus('Пожалуйста, введите запрос', 'error');
            return;
        }

        // Отправка сообщения в extension
        vscode.postMessage({
            command: 'generate',
            text: text
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
            // Отправка сообщения в extension
            vscode.postMessage({
                command: 'vectorizeAll'
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

    // Сохранение настроек
    saveSettingsBtn.addEventListener('click', () => {
        const config = {
            provider: providerSelect.value,
            apiKey: apiKeyInput.value.trim(),
            model: modelInput.value.trim(),
            embedderModel: embedderModelInput.value.trim(),
            temperature: parseFloat(temperatureInput.value),
            maxTokens: parseInt(maxTokensInput.value),
            baseUrl: baseUrlInput.value.trim(),
            localUrl: localUrlInput.value.trim(),
            timeout: parseInt(timeoutInput.value),
            apiType: apiTypeSelect.value,
            systemPrompt: systemPromptInput.value.trim()
        };

        // Валидация
        if (!config.model) {
            showSettingsStatus('Пожалуйста, укажите модель', 'error');
            return;
        }

        if (config.temperature < 0 || config.temperature > 2) {
            showSettingsStatus('Температура должна быть от 0 до 2', 'error');
            return;
        }

        if (config.maxTokens < 100 || config.maxTokens > 8000) {
            showSettingsStatus('Максимум токенов должен быть от 100 до 8000', 'error');
            return;
        }

        // Отправка конфигурации
        vscode.postMessage({
            command: 'updateConfig',
            config: config
        });

        saveSettingsBtn.disabled = true;
        saveSettingsBtn.textContent = 'Сохранение...';
        showSettingsStatus('Сохранение настроек...', 'info');
    });

    // Сброс настроек
    resetSettingsBtn.addEventListener('click', () => {
        if (confirm('Вы уверены, что хотите сбросить настройки к значениям по умолчанию?')) {
            providerSelect.value = 'openai';
            apiKeyInput.value = '';
            modelInput.value = 'gpt-4';
            embedderModelInput.value = '';
            temperatureInput.value = '0.7';
            temperatureValue.textContent = '0.7';
            maxTokensInput.value = '2000';
            baseUrlInput.value = '';
            timeoutInput.value = '30000';
            systemPromptInput.value = '';
            baseUrlGroup.style.display = 'none';
            
            const config = {
                provider: 'openai',
                apiKey: '',
                model: 'gpt-4',
                embedderModel: '',
                temperature: 0.7,
                maxTokens: 2000,
                baseUrl: '',
                timeout: 30000,
                systemPrompt: ''
            };

            vscode.postMessage({
                command: 'updateConfig',
                config: config
            });
        }
    });

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
                updateSettingsUI(message.config);
                break;
            case 'localServerStatus':
                checkLocalBtn.disabled = false;
                checkLocalBtn.textContent = 'Проверить подключение';
                if (message.available) {
                    localStatus.textContent = '✓ Сервер доступен';
                    localStatus.className = 'local-status local-status-success';
                    showSettingsStatus('Локальный сервер доступен', 'success');
                } else {
                    localStatus.textContent = '✗ Сервер недоступен';
                    localStatus.className = 'local-status local-status-error';
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
        }

        // Восстановление кнопок (кроме векторизации и поиска, они восстанавливаются отдельно)
        generateBtn.disabled = false;
        generateBtn.textContent = 'Сгенерировать код';
        saveSettingsBtn.disabled = false;
        saveSettingsBtn.textContent = 'Сохранить настройки';
        searchBtn.disabled = false;
        searchBtn.textContent = 'Найти похожие файлы';
    });

    /**
     * Обновление UI настроек из конфигурации
     */
    function updateSettingsUI(config) {
        providerSelect.value = config.provider || 'openai';
        // API ключ не показываем полностью, только индикатор
        if (config.hasApiKey) {
            apiKeyInput.placeholder = 'API ключ сохранен';
            apiKeyInput.value = '';
        } else {
            apiKeyInput.placeholder = 'Введите ваш API ключ';
            apiKeyInput.value = '';
        }
        modelInput.value = config.model || 'gpt-4';
        embedderModelInput.value = config.embedderModel || '';
        temperatureInput.value = config.temperature || 0.7;
        temperatureValue.textContent = config.temperature || 0.7;
        maxTokensInput.value = config.maxTokens || 2000;
        baseUrlInput.value = config.baseUrl || '';
        localUrlInput.value = config.localUrl || 'http://localhost:11434';
        timeoutInput.value = config.timeout || 30000;
        apiTypeSelect.value = config.apiType || 'openai';
        systemPromptInput.value = config.systemPrompt || '';
        
        // Обновление видимости полей
        updateProviderFields();
        
        showSettingsStatus('Настройки загружены', 'success');
        setTimeout(() => {
            settingsStatusSection.textContent = '';
            settingsStatusSection.className = 'status';
        }, 2000);
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
     */
    function showStatus(message, type) {
        statusSection.textContent = message;
        statusSection.className = `status status-${type}`;
        
        // Автоматическое скрытие через 5 секунд для success/info
        if (type === 'success' || type === 'info') {
            setTimeout(() => {
                statusSection.textContent = '';
                statusSection.className = 'status';
            }, 5000);
        }
    }

    /**
     * Отображение статуса (настройки)
     */
    function showSettingsStatus(message, type) {
        // Определяем, какая вкладка активна
        const activeSettingsTab = document.querySelector('.settings-tab-button.active');
        const isVectorizationTab = activeSettingsTab && activeSettingsTab.getAttribute('data-settings-tab') === 'vectorization';
        
        // Показываем статус в соответствующей секции
        const statusSection = isVectorizationTab && vectorizationStatusSection 
            ? vectorizationStatusSection 
            : settingsStatusSection;
        
        if (statusSection) {
            statusSection.textContent = message;
            statusSection.className = `status status-${type}`;
            
            // Автоматическое скрытие через 5 секунд для success/info
            if (type === 'success' || type === 'info') {
                setTimeout(() => {
                    statusSection.textContent = '';
                    statusSection.className = 'status';
                }, 5000);
            }
        }
    }

    /**
     * Отображение статуса (поиск)
     */
    function showSearchStatus(message, type) {
        searchStatusSection.textContent = message;
        searchStatusSection.className = `status status-${type}`;
        
        // Автоматическое скрытие через 5 секунд для success/info
        if (type === 'success' || type === 'info') {
            setTimeout(() => {
                searchStatusSection.textContent = '';
                searchStatusSection.className = 'status';
            }, 5000);
        }
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
                </li>
            `;
        });
        html += '</ul>';

        searchResultsList.innerHTML = html;
        searchResultSection.style.display = 'block';
        
        // Добавляем обработчики клика для открытия файлов
        const resultItems = searchResultsList.querySelectorAll('.search-result-item');
        resultItems.forEach(item => {
            item.addEventListener('click', () => {
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
})();
