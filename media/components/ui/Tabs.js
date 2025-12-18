/**
 * Компонент вкладок
 */
class Tabs {
    constructor(containerSelector, options = {}) {
        this.container = document.querySelector(containerSelector);
        this.options = {
            tabButtonSelector: '.tab-button',
            tabContentSelector: '.tab-content',
            activeClass: 'active',
            dataAttribute: 'data-tab',
            onTabChange: null,
            ...options
        };
        this.currentTab = null;
        this.tabButtons = [];
        this.tabContents = [];
        this.onChangeCallbacks = [];
        
        this._initialize();
    }
    
    /**
     * Инициализация компонента
     */
    _initialize() {
        if (!this.container) {
            console.warn('Tabs: контейнер не найден', this.container);
            return;
        }
        
        // Ищем кнопки вкладок - селектор может быть относительным или абсолютным
        // Если селектор начинается с точки или #, ищем внутри контейнера
        // Иначе ищем в document
        if (this.options.tabButtonSelector.startsWith('.') || this.options.tabButtonSelector.startsWith('#')) {
            // Относительный селектор - ищем внутри контейнера
            this.tabButtons = Array.from(this.container.querySelectorAll(this.options.tabButtonSelector));
        } else {
            // Абсолютный селектор - ищем в document
            this.tabButtons = Array.from(document.querySelectorAll(this.options.tabButtonSelector));
        }
        
        // Ищем контент вкладок - аналогично
        if (this.options.tabContentSelector.startsWith('.') || this.options.tabContentSelector.startsWith('#')) {
            this.tabContents = Array.from(this.container.querySelectorAll(this.options.tabContentSelector));
        } else {
            this.tabContents = Array.from(document.querySelectorAll(this.options.tabContentSelector));
        }
        
        // Если не нашли внутри контейнера, пробуем в document
        if (this.tabButtons.length === 0) {
            this.tabButtons = Array.from(document.querySelectorAll(this.options.tabButtonSelector));
        }
        if (this.tabContents.length === 0) {
            this.tabContents = Array.from(document.querySelectorAll(this.options.tabContentSelector));
        }
        
        if (this.tabButtons.length === 0) {
            console.warn('Tabs: кнопки вкладок не найдены', this.options.tabButtonSelector);
        }
        if (this.tabContents.length === 0) {
            console.warn('Tabs: контент вкладок не найден', this.options.tabContentSelector);
        }
        
        // Находим активную вкладку по умолчанию
        const activeButton = this.tabButtons.find(btn => btn.classList.contains(this.options.activeClass));
        if (activeButton) {
            const tabId = activeButton.getAttribute(this.options.dataAttribute);
            this.currentTab = tabId;
        }
        
        // Добавляем обработчики кликов
        this.tabButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const tabId = button.getAttribute(this.options.dataAttribute);
                if (tabId) {
                    this.switchToTab(tabId);
                }
            });
        });
    }
    
    /**
     * Переключение на вкладку
     */
    switchToTab(tabId) {
        if (this.currentTab === tabId) return;
        
        // Убираем активный класс со всех кнопок и контента
        this.tabButtons.forEach(btn => btn.classList.remove(this.options.activeClass));
        this.tabContents.forEach(content => content.classList.remove(this.options.activeClass));
        
        // Находим и активируем нужную вкладку
        const targetButton = this.tabButtons.find(btn => 
            btn.getAttribute(this.options.dataAttribute) === tabId
        );
        
        // Ищем контент по ID (tab-{tabId} или settings-tab-{tabId}) или по data-атрибуту
        let targetContent = this.tabContents.find(content => 
            content.id === `tab-${tabId}` || 
            content.id === `settings-tab-${tabId}` ||
            content.getAttribute(this.options.dataAttribute) === tabId
        );
        
        // Если не нашли по ID, пробуем найти в document
        if (!targetContent) {
            const contentById = document.getElementById(`tab-${tabId}`) || 
                               document.getElementById(`settings-tab-${tabId}`);
            if (contentById && this.tabContents.includes(contentById)) {
                targetContent = contentById;
            }
        }
        
        if (targetButton && targetContent) {
            targetButton.classList.add(this.options.activeClass);
            targetContent.classList.add(this.options.activeClass);
            this.currentTab = tabId;
            
            // Вызываем колбэки
            this.onChangeCallbacks.forEach(callback => callback(tabId));
            if (this.options.onTabChange) {
                this.options.onTabChange(tabId);
            }
        } else {
            console.warn('Tabs: не найдены кнопка или контент для вкладки', tabId, {
                targetButton: !!targetButton,
                targetContent: !!targetContent,
                buttonsCount: this.tabButtons.length,
                contentsCount: this.tabContents.length
            });
        }
    }
    
    /**
     * Получить текущую вкладку
     */
    getCurrentTab() {
        return this.currentTab;
    }
    
    /**
     * Добавить обработчик изменения вкладки
     */
    onChange(callback) {
        this.onChangeCallbacks.push(callback);
    }
}

