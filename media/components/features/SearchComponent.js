/**
 * Компонент поиска
 */
class SearchComponent {
    constructor(messageBus) {
        this.messageBus = messageBus;
        
        // Инициализация элементов
        this.searchQueryInput = new Input(document.getElementById('search-query-input'));
        this.searchBtn = new Button(document.getElementById('search-btn'), { loadingText: 'Поиск...' });
        this.searchResultSection = document.getElementById('search-result-section');
        this.searchResultsList = document.getElementById('search-results-list');
        
        this._initializeEventListeners();
        this._subscribeToMessages();
    }
    
    /**
     * Инициализация обработчиков событий
     */
    _initializeEventListeners() {
        this.searchBtn.onClick(() => this._handleSearch());
    }
    
    /**
     * Подписка на сообщения
     */
    _subscribeToMessages() {
        // Результаты поиска
        this.messageBus.subscribe('searchResults', (message) => {
            this._displayResults(message.results);
            this.searchBtn.setLoading(false);
        });
        
        // Ошибка поиска
        this.messageBus.subscribe('searchError', (message) => {
            this.messageBus.send('showNotification', { 
                message: `Ошибка поиска: ${message.error}`, 
                type: 'error' 
            });
            this.searchBtn.setLoading(false);
        });
    }
    
    /**
     * Обработка поиска
     */
    _handleSearch() {
        const query = this.searchQueryInput.getValue();
        
        if (!query) {
            this.messageBus.send('showNotification', { 
                message: 'Пожалуйста, введите запрос для поиска', 
                type: 'error' 
            });
            return;
        }
        
        this.messageBus.send('search', { query });
        this.searchBtn.setLoading(true);
    }
    
    /**
     * Отображение результатов поиска
     */
    _displayResults(results) {
        if (!this.searchResultsList) return;
        
        if (results.length === 0) {
            this.searchResultsList.innerHTML = '<p>Похожие файлы не найдены</p>';
            if (this.searchResultSection) {
                this.searchResultSection.style.display = 'block';
            }
            return;
        }
        
        const html = this._buildResultsHTML(results);
        this.searchResultsList.innerHTML = html;
        
        if (this.searchResultSection) {
            this.searchResultSection.style.display = 'block';
        }
        
        this._attachResultHandlers();
        
        if (this.searchResultSection) {
            this.searchResultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
    
    /**
     * Построение HTML для результатов
     */
    _buildResultsHTML(results) {
        let html = '<ul class="search-results-list">';
        
        results.forEach((result, index) => {
            const similarityPercent = (result.similarity * 100).toFixed(1);
            const typeLabel = this._getTypeLabel(result.type);
            const kindLabel = this._getKindLabel(result.kind);
            const rawContent = result.raw ? 
                (typeof result.raw === 'string' ? result.raw : JSON.stringify(result.raw, null, 2)) : '';
            const hasRaw = rawContent && rawContent.trim().length > 0;
            const rawId = `raw-content-${index}`;
            
            html += `
                <li class="search-result-item" data-path="${escapeHtml(result.path)}" data-type="${escapeHtml(result.type)}">
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
        return html;
    }
    
    /**
     * Прикрепление обработчиков к результатам
     */
    _attachResultHandlers() {
        // Обработчики клика для открытия файлов
        const resultItems = this.searchResultsList.querySelectorAll('.search-result-item');
        resultItems.forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.search-result-raw-toggle') || 
                    e.target.closest('.search-result-raw-content')) {
                    return;
                }
                
                const filePath = item.getAttribute('data-path');
                const fileType = item.getAttribute('data-type');
                
                if (fileType === 'file') {
                    this.messageBus.send('openFile', { path: filePath });
                }
            });
        });
        
        // Обработчики для кнопок раскрытия raw
        const rawToggles = this.searchResultsList.querySelectorAll('.search-result-raw-toggle');
        rawToggles.forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
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
    }
    
    /**
     * Получить метку типа
     */
    _getTypeLabel(type) {
        const labels = {
            'file': '📄 Файл',
            'directory': '📁 Директория',
            'chunk': '📝 Фрагмент'
        };
        return labels[type] || type;
    }
    
    /**
     * Получить метку kind
     */
    _getKindLabel(kind) {
        const labels = {
            'origin': 'Оригинальный текст',
            'summarize': 'Суммаризация по оригинальному тексту',
            'vs_origin': 'Сумма векторов по оригинальному тексту вложений',
            'vs_summarize': 'Сумма векторов по суммаризации вложений'
        };
        return labels[kind] || kind;
    }
}

// escapeHtml будет доступен из domUtils.js, загруженного ранее

