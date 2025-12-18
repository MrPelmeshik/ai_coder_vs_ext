/**
 * Главный файл инициализации компонентов
 */
(function() {
    const vscode = acquireVsCodeApi();
    
    // Импорт утилит и компонентов
    // В VS Code webview мы не можем использовать ES6 модули напрямую,
    // поэтому используем глобальные переменные и загружаем скрипты через script теги
    
    // Инициализация MessageBus
    const messageBus = new MessageBus(vscode);
    
    // Инициализация компонентов
    let codeGenerationComponent;
    let searchComponent;
    let settingsComponent;
    let serverManagementComponent;
    let mainTabs;
    
    /**
     * Инициализация всех компонентов
     */
    function initializeComponents() {
        // Инициализация вкладок главного интерфейса
        // Кнопки находятся в .header .tabs, контент - в .container
        mainTabs = new Tabs('body', {
            tabButtonSelector: '.header .tab-button',
            tabContentSelector: '.tab-content',
            dataAttribute: 'data-tab',
            onTabChange: (tabId) => {
                if (tabId === 'search') {
                    messageBus.send('getAllItems');
                }
            }
        });
        
        // Инициализация функциональных компонентов
        codeGenerationComponent = new CodeGenerationComponent(messageBus, vscode);
        searchComponent = new SearchComponent(messageBus);
        settingsComponent = new SettingsComponent(messageBus);
        serverManagementComponent = new ServerManagementComponent(messageBus);
        
        // Делаем компонент доступным глобально для переинициализации при открытии модального окна
        window.serverManagementComponent = serverManagementComponent;
        
        // Запрос конфигурации при загрузке
        messageBus.send('getConfig');
        // Запрос списка активных моделей при загрузке
        messageBus.send('getActiveModels');
    }
    
    /**
     * Обработка сообщений для обратной совместимости
     */
    function setupLegacyMessageHandlers() {
        messageBus.subscribe('generationStarted', (message) => {
            const resultSection = document.getElementById('result-section');
            const thinkingSection = document.getElementById('thinking-section');
            const answerSection = document.getElementById('answer-section');
            const thinkingContent = document.getElementById('thinking-content');
            const answerContent = document.getElementById('answer-content');
            
            if (resultSection) resultSection.style.display = 'block';
            if (thinkingSection) thinkingSection.style.display = 'block';
            if (answerSection) answerSection.style.display = 'none';
            if (thinkingContent) thinkingContent.textContent = '';
            if (answerContent) answerContent.textContent = '';
        });
        
        messageBus.subscribe('streamChunk', (message) => {
            const thinkingSection = document.getElementById('thinking-section');
            const thinkingContent = document.getElementById('thinking-content');
            const thinkingContentWrapper = document.getElementById('thinking-content-wrapper');
            const answerSection = document.getElementById('answer-section');
            const answerContent = document.getElementById('answer-content');
            
            if (message.thinking && thinkingContent) {
                if (thinkingSection) thinkingSection.style.display = 'block';
                thinkingContent.textContent = message.thinking;
                if (thinkingContentWrapper && !thinkingContentWrapper.classList.contains('collapsed')) {
                    thinkingContent.scrollTop = thinkingContent.scrollHeight;
                }
            }
            
            if (message.answer && answerContent) {
                if (answerSection) answerSection.style.display = 'block';
                answerContent.textContent = message.answer;
                const answerWrapper = answerContent.parentElement;
                if (answerWrapper) {
                    answerWrapper.scrollTop = answerWrapper.scrollHeight;
                }
            }
        });
        
        messageBus.subscribe('generationComplete', (message) => {
            const thinkingSection = document.getElementById('thinking-section');
            const thinkingContent = document.getElementById('thinking-content');
            const thinkingContentWrapper = document.getElementById('thinking-content-wrapper');
            const answerSection = document.getElementById('answer-section');
            const answerContent = document.getElementById('answer-content');
            const resultSection = document.getElementById('result-section');
            const generateBtn = document.getElementById('generate-btn');
            
            if (message.thinking && thinkingContent) {
                if (thinkingSection) thinkingSection.style.display = 'block';
                thinkingContent.textContent = message.thinking;
                if (thinkingContentWrapper && !thinkingContentWrapper.classList.contains('collapsed')) {
                    thinkingContent.scrollTop = thinkingContent.scrollHeight;
                }
            }
            
            if (message.answer && answerContent) {
                if (answerSection) answerSection.style.display = 'block';
                answerContent.textContent = message.answer;
                const answerWrapper = answerContent.parentElement;
                if (answerWrapper) {
                    answerWrapper.scrollTop = answerWrapper.scrollHeight;
                }
            }
            
            if (generateBtn) {
                generateBtn.disabled = false;
                generateBtn.classList.remove('loading');
                generateBtn.textContent = 'Сгенерировать код';
            }
            
            messageBus.send('showNotification', {
                message: 'Код успешно сгенерирован!',
                type: 'success'
            });
            
            if (resultSection) {
                resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
        
        messageBus.subscribe('generated', (message) => {
            if (codeGenerationComponent) {
                codeGenerationComponent._displayResult(message.result);
            }
            messageBus.send('showNotification', {
                message: 'Код успешно сгенерирован!',
                type: 'success'
            });
        });
        
        messageBus.subscribe('error', (message) => {
            const generateBtn = document.getElementById('generate-btn');
            if (generateBtn) {
                generateBtn.disabled = false;
                generateBtn.classList.remove('loading');
                generateBtn.textContent = 'Сгенерировать код';
            }
            messageBus.send('showNotification', {
                message: `Ошибка: ${message.error}`,
                type: 'error'
            });
        });
        
        messageBus.subscribe('searchResults', (message) => {
            const searchBtn = document.getElementById('search-btn');
            if (searchBtn) {
                searchBtn.disabled = false;
                searchBtn.textContent = 'Найти похожие файлы';
            }
            messageBus.send('showNotification', {
                message: `Найдено файлов: ${message.results.length}`,
                type: 'success'
            });
        });
        
        messageBus.subscribe('searchError', (message) => {
            const searchBtn = document.getElementById('search-btn');
            if (searchBtn) {
                searchBtn.disabled = false;
                searchBtn.textContent = 'Найти похожие файлы';
            }
        });
    }
    
    // Инициализация при загрузке DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initializeComponents();
            setupLegacyMessageHandlers();
        });
    } else {
        initializeComponents();
        setupLegacyMessageHandlers();
    }
})();
