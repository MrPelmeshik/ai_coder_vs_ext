/**
 * Централизованная система коммуникации между компонентами и extension host
 */
class MessageBus {
    constructor(vscode) {
        this.vscode = vscode;
        this.subscribers = new Map();
        
        // Обработчик сообщений от extension host
        window.addEventListener('message', (event) => {
            const message = event.data;
            const command = message.command;
            
            // Уведомляем всех подписчиков на эту команду
            if (this.subscribers.has(command)) {
                this.subscribers.get(command).forEach(callback => {
                    try {
                        callback(message);
                    } catch (error) {
                        console.error(`Error in subscriber for command "${command}":`, error);
                    }
                });
            }
        });
    }
    
    /**
     * Отправка сообщения в extension host
     */
    send(command, data = {}) {
        this.vscode.postMessage({
            command,
            ...data
        });
    }
    
    /**
     * Подписка на сообщения от extension host
     */
    subscribe(command, callback) {
        if (!this.subscribers.has(command)) {
            this.subscribers.set(command, []);
        }
        this.subscribers.get(command).push(callback);
        
        // Возвращаем функцию для отписки
        return () => {
            const callbacks = this.subscribers.get(command);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        };
    }
    
    /**
     * Отписка от сообщений
     */
    unsubscribe(command, callback) {
        if (this.subscribers.has(command)) {
            const callbacks = this.subscribers.get(command);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }
}

