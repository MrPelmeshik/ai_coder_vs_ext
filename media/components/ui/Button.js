/**
 * Компонент кнопки
 */
class Button {
    constructor(element, options = {}) {
        this.element = element;
        this.options = {
            loadingText: 'Загрузка...',
            ...options
        };
        this.originalText = element ? element.textContent : '';
    }
    
    /**
     * Установка состояния загрузки
     */
    setLoading(loading) {
        if (!this.element) return;
        
        if (loading) {
            this.element.disabled = true;
            this.element.classList.add('loading');
            this.originalText = this.element.textContent;
            this.element.textContent = this.options.loadingText;
        } else {
            this.element.disabled = false;
            this.element.classList.remove('loading');
            this.element.textContent = this.originalText;
        }
    }
    
    /**
     * Установка текста кнопки
     */
    setText(text) {
        if (this.element) {
            this.element.textContent = text;
        }
    }
    
    /**
     * Включить/выключить кнопку
     */
    setEnabled(enabled) {
        if (this.element) {
            this.element.disabled = !enabled;
        }
    }
    
    /**
     * Добавить обработчик клика
     */
    onClick(handler) {
        if (this.element) {
            // Удаляем предыдущий обработчик, если он был сохранен
            if (this._clickHandler) {
                this.element.removeEventListener('click', this._clickHandler);
            }
            // Сохраняем ссылку на обработчик для возможности удаления
            this._clickHandler = handler;
            this.element.addEventListener('click', handler);
        }
    }
    
    /**
     * Установка видимости
     */
    setVisible(visible) {
        if (this.element) {
            this.element.style.display = visible ? '' : 'none';
        }
    }
}

