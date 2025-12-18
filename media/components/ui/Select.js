/**
 * Компонент выпадающего списка
 */
class Select {
    constructor(element) {
        this.element = element;
    }
    
    /**
     * Установка опций
     */
    setOptions(options, valueKey = 'value', labelKey = 'label') {
        if (!this.element) return;
        
        const currentValue = this.element.value;
        this.element.innerHTML = '';
        
        options.forEach(option => {
            const optionElement = document.createElement('option');
            const value = typeof option === 'object' ? option[valueKey] : option;
            const label = typeof option === 'object' ? option[labelKey] : option;
            
            optionElement.value = value;
            optionElement.textContent = label;
            this.element.appendChild(optionElement);
        });
        
        // Восстанавливаем выбранное значение, если оно существует
        if (currentValue && this.hasOption(currentValue)) {
            this.element.value = currentValue;
        }
    }
    
    /**
     * Проверка наличия опции
     */
    hasOption(value) {
        if (!this.element) return false;
        return Array.from(this.element.options).some(opt => opt.value === value);
    }
    
    /**
     * Получить выбранное значение
     */
    getValue() {
        return this.element ? this.element.value : '';
    }
    
    /**
     * Установить значение
     */
    setValue(value) {
        if (this.element && this.hasOption(value)) {
            this.element.value = value;
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
}

