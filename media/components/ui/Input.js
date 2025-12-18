/**
 * Компонент поля ввода
 */
class Input {
    constructor(element) {
        this.element = element;
    }
    
    /**
     * Получить значение
     */
    getValue() {
        return this.element ? this.element.value.trim() : '';
    }
    
    /**
     * Установить значение
     */
    setValue(value) {
        if (this.element) {
            this.element.value = value;
        }
    }
    
    /**
     * Очистить поле
     */
    clear() {
        if (this.element) {
            this.element.value = '';
        }
    }
    
    /**
     * Установить placeholder
     */
    setPlaceholder(placeholder) {
        if (this.element) {
            this.element.placeholder = placeholder;
        }
    }
    
    /**
     * Добавить обработчик ввода
     */
    onInput(handler) {
        if (this.element) {
            this.element.addEventListener('input', handler);
        }
    }
    
    /**
     * Добавить обработчик изменения
     */
    onChange(handler) {
        if (this.element) {
            this.element.addEventListener('change', handler);
        }
    }
    
    /**
     * Показать/скрыть
     */
    setVisible(visible) {
        if (this.element) {
            this.element.style.display = visible ? '' : 'none';
        }
    }
    
    /**
     * Включить/выключить
     */
    setEnabled(enabled) {
        if (this.element) {
            this.element.disabled = !enabled;
        }
    }
    
    /**
     * Установить тип (для input)
     */
    setType(type) {
        if (this.element && this.element.tagName === 'INPUT') {
            this.element.type = type;
        }
    }
    
    /**
     * Фокус на поле
     */
    focus() {
        if (this.element) {
            this.element.focus();
        }
    }
}

