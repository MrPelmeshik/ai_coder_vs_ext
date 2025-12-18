/**
 * Утилиты для работы с DOM
 */

/**
 * Экранирование HTML для безопасного отображения
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Делаем функцию доступной глобально для использования в других скриптах
window.escapeHtml = escapeHtml;

/**
 * Форматирование размера в байтах
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 Б';
    const k = 1024;
    const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// Делаем функцию доступной глобально для использования в других скриптах
window.formatBytes = formatBytes;

/**
 * Создание элемента с атрибутами
 */
export function createElement(tag, attributes = {}, textContent = '') {
    const element = document.createElement(tag);
    
    Object.entries(attributes).forEach(([key, value]) => {
        if (key === 'className') {
            element.className = value;
        } else if (key === 'textContent') {
            element.textContent = value;
        } else if (key === 'innerHTML') {
            element.innerHTML = value;
        } else if (key.startsWith('data-')) {
            element.setAttribute(key, value);
        } else {
            element[key] = value;
        }
    });
    
    if (textContent) {
        element.textContent = textContent;
    }
    
    return element;
}

/**
 * Показать/скрыть элемент
 */
export function toggleElement(element, show) {
    if (element) {
        element.style.display = show ? 'block' : 'none';
    }
}

/**
 * Добавить/удалить класс
 */
export function toggleClass(element, className, add) {
    if (element) {
        if (add) {
            element.classList.add(className);
        } else {
            element.classList.remove(className);
        }
    }
}

