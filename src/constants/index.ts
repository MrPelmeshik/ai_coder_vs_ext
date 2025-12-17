/**
 * Константы для расширения AI Coder
 */

// URL по умолчанию
export const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
export const DEFAULT_LOCAL_API_URL = 'http://localhost:1234';
export const DEFAULT_TIMEOUT = 30000;

// Настройки суммаризации
export const SUMMARIZE = {
    MAX_TEXT_LENGTH: 10000, // ~2500-3000 токенов
    TRUNCATE_MESSAGE: '\n\n[...текст обрезан для суммаризации...]'
} as const;

// Настройки векторного индекса
export const VECTOR_INDEX = {
    MIN_RECORDS: 512,
    UPDATE_INTERVAL: 5000,
    SUB_VECTORS: 16,
    MAX_PARTITIONS: 512,
    SAMPLE_RATE_MAX: 1024
} as const;

// Имена таблиц и ключей
export const STORAGE_KEYS = {
    API_KEY: 'aiCoder.apiKey',
    EXCLUDED_FILES: 'aiCoder.excludedFiles'
} as const;

// Имена таблиц
export const TABLE_NAMES = {
    EMBEDDING_ITEM: 'embedding_item'
} as const;

