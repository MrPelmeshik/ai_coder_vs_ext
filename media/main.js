(function() {
    const vscode = acquireVsCodeApi();

    // Элементы DOM - генерация
    const promptInput = document.getElementById('prompt-input');
    const generateBtn = document.getElementById('generate-btn');
    const resultSection = document.getElementById('result-section');
    const resultContent = document.getElementById('result-content');
    const statusSection = document.getElementById('status-section');

    // Элементы DOM - настройки
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const providerSelect = document.getElementById('provider-select');
    const apiKeyInput = document.getElementById('api-key-input');
    const toggleApiKeyBtn = document.getElementById('toggle-api-key');
    const modelInput = document.getElementById('model-input');
    const temperatureInput = document.getElementById('temperature-input');
    const temperatureValue = document.getElementById('temperature-value');
    const maxTokensInput = document.getElementById('max-tokens-input');
    const baseUrlInput = document.getElementById('base-url-input');
    const baseUrlGroup = document.getElementById('base-url-group');
    const localUrlInput = document.getElementById('local-url-input');
    const localUrlGroup = document.getElementById('local-url-group');
    const localCheckGroup = document.getElementById('local-check-group');
    const checkLocalBtn = document.getElementById('check-local-btn');
    const localStatus = document.getElementById('local-status');
    const timeoutInput = document.getElementById('timeout-input');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const resetSettingsBtn = document.getElementById('reset-settings-btn');
    const settingsStatusSection = document.getElementById('settings-status-section');

    // Управление вкладками
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            
            // Обновление активных вкладок
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            button.classList.add('active');
            document.getElementById(`tab-${targetTab}`).classList.add('active');
        });
    });

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

        vscode.postMessage({
            command: 'checkLocalServer',
            url: url,
            provider: provider
        });
    });

    // Запрос конфигурации при загрузке
    vscode.postMessage({ command: 'getConfig' });

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
        generateBtn.textContent = 'Генерация...';
        resultSection.style.display = 'none';
        showStatus('Генерация кода...', 'info');
    });

    // Сохранение настроек
    saveSettingsBtn.addEventListener('click', () => {
        const config = {
            provider: providerSelect.value,
            apiKey: apiKeyInput.value.trim(),
            model: modelInput.value.trim(),
            temperature: parseFloat(temperatureInput.value),
            maxTokens: parseInt(maxTokensInput.value),
            baseUrl: baseUrlInput.value.trim(),
            localUrl: localUrlInput.value.trim(),
            timeout: parseInt(timeoutInput.value)
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
            temperatureInput.value = '0.7';
            temperatureValue.textContent = '0.7';
            maxTokensInput.value = '2000';
            baseUrlInput.value = '';
            timeoutInput.value = '30000';
            baseUrlGroup.style.display = 'none';
            
            const config = {
                provider: 'openai',
                apiKey: '',
                model: 'gpt-4',
                temperature: 0.7,
                maxTokens: 2000,
                baseUrl: '',
                timeout: 30000
            };

            vscode.postMessage({
                command: 'updateConfig',
                config: config
            });
        }
    });

    // Обработка сообщений от extension
    window.addEventListener('message', event => {
        const message = event.data;

        switch (message.command) {
            case 'generated':
                displayResult(message.result);
                showStatus('Код успешно сгенерирован!', 'success');
                break;
            case 'error':
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
        }

        // Восстановление кнопок
        generateBtn.disabled = false;
        generateBtn.textContent = 'Сгенерировать код';
        saveSettingsBtn.disabled = false;
        saveSettingsBtn.textContent = 'Сохранить настройки';
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
        temperatureInput.value = config.temperature || 0.7;
        temperatureValue.textContent = config.temperature || 0.7;
        maxTokensInput.value = config.maxTokens || 2000;
        baseUrlInput.value = config.baseUrl || '';
        localUrlInput.value = config.localUrl || 'http://localhost:11434';
        timeoutInput.value = config.timeout || 30000;
        
        // Обновление видимости полей
        updateProviderFields();
        
        showSettingsStatus('Настройки загружены', 'success');
        setTimeout(() => {
            settingsStatusSection.textContent = '';
            settingsStatusSection.className = 'status';
        }, 2000);
    }

    /**
     * Отображение результата генерации
     */
    function displayResult(result) {
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
        settingsStatusSection.textContent = message;
        settingsStatusSection.className = `status status-${type}`;
        
        // Автоматическое скрытие через 5 секунд для success/info
        if (type === 'success' || type === 'info') {
            setTimeout(() => {
                settingsStatusSection.textContent = '';
                settingsStatusSection.className = 'status';
            }, 5000);
        }
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
