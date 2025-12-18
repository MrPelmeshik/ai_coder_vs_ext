/**
 * Компонент модального окна
 */
class Modal {
    constructor(element) {
        this.element = element;
        this.isOpen = false;
        this.onCloseCallbacks = [];
    }
    
    /**
     * Открыть модальное окно
     */
    open() {
        if (this.element) {
            this.element.style.display = 'flex';
            this.isOpen = true;
        }
    }
    
    /**
     * Закрыть модальное окно
     */
    close() {
        if (this.element) {
            this.element.style.display = 'none';
            this.isOpen = false;
            this.onCloseCallbacks.forEach(callback => callback());
        }
    }
    
    /**
     * Проверка, открыто ли модальное окно
     */
    isOpen() {
        return this.isOpen;
    }
    
    /**
     * Добавить обработчик закрытия
     */
    onClose(callback) {
        this.onCloseCallbacks.push(callback);
    }
    
    /**
     * Инициализация обработчиков закрытия
     */
    initCloseHandlers(closeButton, overlayClick = true, escapeKey = true) {
        // Закрытие по кнопке
        if (closeButton) {
            closeButton.addEventListener('click', () => this.close());
        }
        
        // Закрытие по клику на фон
        if (overlayClick && this.element) {
            this.element.addEventListener('click', (e) => {
                if (e.target === this.element) {
                    this.close();
                }
            });
        }
        
        // Закрытие по Escape
        if (escapeKey) {
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.isOpen) {
                    this.close();
                }
            });
        }
    }
}

