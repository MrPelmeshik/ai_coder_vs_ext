/**
 * Константы для расширения AI Coder
 * 
 * ВАЖНО: Все дефолтные значения вынесены в настройки VS Code.
 * Здесь только ключи для доступа к настройкам и неизменяемые константы.
 */

// Ключи для доступа к настройкам LLM
export const CONFIG_KEYS = {
    LLM: {
        PROVIDER: 'llm.provider',
        MODEL: 'llm.model',
        EMBEDDER_MODEL: 'llm.embedderModel',
        TEMPERATURE: 'llm.temperature',
        MAX_TOKENS: 'llm.maxTokens',
        BASE_URL: 'llm.baseUrl',
        API_TYPE: 'llm.apiType',
        LOCAL_URL: 'llm.localUrl',
        TIMEOUT: 'llm.timeout',
        SYSTEM_PROMPT: 'llm.systemPrompt',
        DEFAULT_MODEL_OPENAI: 'llm.defaultModelOpenai',
        DEFAULT_MODEL_OLLAMA: 'llm.defaultModelOllama',
        DEFAULT_MODEL_LOCAL_API: 'llm.defaultModelLocalApi',
        API_KEY_NOT_NEEDED: 'llm.apiKeyNotNeeded',
        AVAILABILITY_CHECK_TIMEOUT_LOCAL_API: 'llm.availabilityCheckTimeoutLocalApi',
        AVAILABILITY_CHECK_TIMEOUT_OLLAMA: 'llm.availabilityCheckTimeoutOllama',
        STREAM_POLLING_DELAY: 'llm.streamPollingDelay',
        PROMPT_FORMAT_OLLAMA_SYSTEM_PREFIX: 'llm.promptFormatOllamaSystemPrefix',
        PROMPT_FORMAT_OLLAMA_CODE_SUFFIX: 'llm.promptFormatOllamaCodeSuffix',
        SSE_DATA_PREFIX: 'llm.sseDataPrefix',
        SSE_DONE_MARKER: 'llm.sseDoneMarker'
    },
    VECTORIZATION: {
        SUMMARIZE_PROMPT: 'vectorization.summarizePrompt',
        ENABLE_ORIGIN: 'vectorization.enableOrigin',
        ENABLE_SUMMARIZE: 'vectorization.enableSummarize',
        ENABLE_VS_ORIGIN: 'vectorization.enableVsOrigin',
        ENABLE_VS_SUMMARIZE: 'vectorization.enableVsSummarize',
        MAX_TEXT_LENGTH: 'vectorization.maxTextLength',
        TRUNCATE_MESSAGE: 'vectorization.truncateMessage'
    },
    VALIDATION: {
        TEMPERATURE_MIN: 'validation.temperatureMin',
        TEMPERATURE_MAX: 'validation.temperatureMax',
        MAX_TOKENS_MIN: 'validation.maxTokensMin',
        MAX_TOKENS_MAX: 'validation.maxTokensMax',
        TIMEOUT_MIN: 'validation.timeoutMin',
        TIMEOUT_MAX: 'validation.timeoutMax'
    },
    UI: {
        SEARCH_DEFAULT_LIMIT: 'ui.searchDefaultLimit',
        STATUS_AUTO_HIDE_DELAY: 'ui.statusAutoHideDelay',
        COPY_BUTTON_RESET_DELAY: 'ui.copyButtonResetDelay',
        NONCE_LENGTH: 'ui.nonceLength'
    },
    PROVIDERS: {
        OPENAI_API_URL: 'providers.openaiApiUrl',
        MOCK_DELAY: 'providers.mockDelay'
    }
} as const;

// Типы API (неизменяемые значения)
export const API_TYPES = {
    OPENAI: 'openai',
    OLLAMA: 'ollama'
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

