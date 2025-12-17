/**
 * Кастомные ошибки для расширения AI Coder
 */

/**
 * Базовый класс ошибок расширения
 */
export class AICoderError extends Error {
    constructor(message: string, public readonly cause?: Error) {
        super(message);
        this.name = 'AICoderError';
        Object.setPrototypeOf(this, AICoderError.prototype);
    }
}

/**
 * Ошибка работы с эмбеддингами
 */
export class EmbeddingError extends AICoderError {
    constructor(message: string, cause?: Error) {
        super(message, cause);
        this.name = 'EmbeddingError';
        Object.setPrototypeOf(this, EmbeddingError.prototype);
    }
}

/**
 * Ошибка векторизации
 */
export class VectorizationError extends AICoderError {
    constructor(
        message: string,
        public readonly filePath?: string,
        cause?: Error
    ) {
        super(message, cause);
        this.name = 'VectorizationError';
        Object.setPrototypeOf(this, VectorizationError.prototype);
    }
}

/**
 * Ошибка работы с хранилищем
 */
export class StorageError extends AICoderError {
    constructor(message: string, cause?: Error) {
        super(message, cause);
        this.name = 'StorageError';
        Object.setPrototypeOf(this, StorageError.prototype);
    }
}

/**
 * Ошибка конфигурации
 */
export class ConfigError extends AICoderError {
    constructor(message: string, cause?: Error) {
        super(message, cause);
        this.name = 'ConfigError';
        Object.setPrototypeOf(this, ConfigError.prototype);
    }
}

