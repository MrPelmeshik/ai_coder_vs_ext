/**
 * Компонент управления хранилищем эмбеддингов.
 * Отображает статистику, обеспечивает очистку и обновление информации.
 */
class StorageManagementComponent {
    constructor(messageBus) {
        this.messageBus = messageBus;
        
        // Элементы
        this.storageCount = document.getElementById('storage-count');
        this.storageSize = document.getElementById('storage-size');
        this.clearStorageBtn = new Button(document.getElementById('clear-storage-btn'), { loadingText: 'Очистка...' });
        this.refreshStorageCountBtn = new Button(document.getElementById('refresh-storage-count-btn'));
        
        this._initializeEventListeners();
        this._subscribeToMessages();
    }
    
    /**
     * Инициализация обработчиков событий
     */
    _initializeEventListeners() {
        this.clearStorageBtn.onClick(() => this._handleClearStorage());
        this.refreshStorageCountBtn.onClick(() => this.requestStorageCount());
    }
    
    /**
     * Подписка на сообщения
     */
    _subscribeToMessages() {
        // Статистика хранилища
        this.messageBus.subscribe('storageCount', (message) => {
            if (this.storageCount) {
                const count = message.count || 0;
                this.storageCount.textContent = count.toLocaleString('ru-RU');
            }
            if (this.storageSize) {
                const size = message.size || 0;
                this.storageSize.textContent = this._formatBytes(size);
            }
        });
        
        // Хранилище очищено
        this.messageBus.subscribe('storageCleared', () => {
            this.clearStorageBtn.setLoading(false);
            this.messageBus.send('showNotification', {
                message: 'Хранилище эмбеддингов успешно очищено',
                type: 'success'
            });
            this.requestStorageCount();
        });
        
        // Ошибка очистки
        this.messageBus.subscribe('storageClearError', (message) => {
            this.clearStorageBtn.setLoading(false);
            this.messageBus.send('showNotification', {
                message: `Ошибка очистки хранилища: ${message.error}`,
                type: 'error'
            });
            this.requestStorageCount();
        });
    }
    
    /**
     * Запрос количества записей и размера хранилища
     */
    requestStorageCount() {
        if (this.storageCount) {
            this.storageCount.textContent = '...';
        }
        if (this.storageSize) {
            this.storageSize.textContent = '...';
        }
        this.messageBus.send('getStorageCount');
    }
    
    /**
     * Обработка очистки хранилища
     */
    _handleClearStorage() {
        this.messageBus.send('clearStorage');
        this.clearStorageBtn.setLoading(true);
    }
    
    /**
     * Форматирование размера в байтах
     */
    _formatBytes(bytes) {
        // Используем глобальную функцию если доступна
        let formatBytesFn = window.formatBytes || (typeof formatBytes !== 'undefined' ? formatBytes : null);
        
        if (!formatBytesFn) {
            formatBytesFn = (b) => {
                if (b === 0) return '0 Б';
                const k = 1024;
                const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
                const i = Math.floor(Math.log(b) / Math.log(k));
                return Math.round((b / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
            };
        }
        
        try {
            return formatBytesFn(bytes);
        } catch (error) {
            return `${bytes} Б`;
        }
    }
}
