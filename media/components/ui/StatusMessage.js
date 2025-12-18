/**
 * Компонент для отображения статусных сообщений
 */
class StatusMessage {
    constructor(containerSelector) {
        this.container = document.querySelector(containerSelector);
        this.currentMessage = null;
    }
    
    /**
     * Показать сообщение
     */
    show(message, type = 'info', duration = 3000) {
        if (!this.container) {
            // Если контейнер не найден, создаем временный
            this._showTemporaryMessage(message, type, duration);
            return;
        }
        
        // Удаляем предыдущее сообщение
        this.hide();
        
        // Создаем новое сообщение
        const messageElement = document.createElement('div');
        messageElement.className = `status-message status-${type}`;
        messageElement.textContent = message;
        
        this.container.appendChild(messageElement);
        this.currentMessage = messageElement;
        
        // Автоматически скрываем через duration
        if (duration > 0) {
            setTimeout(() => {
                this.hide();
            }, duration);
        }
    }
    
    /**
     * Скрыть сообщение
     */
    hide() {
        if (this.currentMessage && this.currentMessage.parentNode) {
            this.currentMessage.parentNode.removeChild(this.currentMessage);
            this.currentMessage = null;
        }
    }
    
    /**
     * Показать временное сообщение (если контейнер не найден)
     */
    _showTemporaryMessage(message, type, duration) {
        const messageElement = document.createElement('div');
        messageElement.className = `status-message status-${type}`;
        messageElement.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 16px;
            border-radius: 4px;
            z-index: 10000;
            background-color: var(--vscode-${type === 'error' ? 'errorForeground' : type === 'warning' ? 'textBlockQuote-background' : 'textLink-foreground'});
            color: var(--vscode-foreground);
        `;
        messageElement.textContent = message;
        
        document.body.appendChild(messageElement);
        
        setTimeout(() => {
            if (messageElement.parentNode) {
                messageElement.parentNode.removeChild(messageElement);
            }
        }, duration);
    }
}

