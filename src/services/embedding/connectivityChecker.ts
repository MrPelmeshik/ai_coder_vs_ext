import { Logger } from '../../utils/logger';
import { VectorizationError } from '../../errors';

/**
 * Проверка, является ли ошибка проблемой сетевого подключения
 * 
 * @param error - Ошибка для проверки
 * @returns true если ошибка связана с сетевым подключением
 */
export function isConnectionError(error: unknown): boolean {
    if (!error) return false;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const connectionIndicators = [
        'ECONNREFUSED',
        'ECONNRESET',
        'ETIMEDOUT',
        'ENOTFOUND',
        'fetch failed',
        'request to',
        'network error',
        'FetchError',
    ];
    return connectionIndicators.some(indicator =>
        errorMessage.toLowerCase().includes(indicator.toLowerCase())
    );
}

/**
 * Проверка доступности сервера эмбеддингов перед началом векторизации.
 * 
 * Выполняет GET-запрос к /v1/models для проверки.
 * Выбрасывает VectorizationError если сервер недоступен.
 * 
 * @param config - Конфигурация с baseUrl и/или localUrl
 */
export async function checkEmbeddingServerConnectivity(config: { baseUrl?: string; localUrl?: string }): Promise<void> {
    const baseUrl = (config.baseUrl || config.localUrl || '').replace(/\/+$/, '');
    if (!baseUrl) {
        Logger.warn('[connectivityChecker] URL сервера эмбеддингов не указан, пропускаем проверку');
        return;
    }

    const checkUrl = baseUrl.endsWith('/v1')
        ? `${baseUrl}/models`
        : `${baseUrl}/v1/models`;

    Logger.info(`[connectivityChecker] Проверка доступности сервера эмбеддингов: ${checkUrl}`);

    try {
        const fetch = (await import('node-fetch')).default;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(checkUrl, {
            method: 'GET',
            signal: controller.signal as any,
        });

        clearTimeout(timeoutId);
        Logger.info(`[connectivityChecker] Сервер эмбеддингов доступен (статус: ${response.status})`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error(`[connectivityChecker] Сервер эмбеддингов недоступен по адресу ${baseUrl}: ${errorMessage}`);
        throw new VectorizationError(
            `Сервер эмбеддингов недоступен по адресу ${baseUrl}. ` +
            `Убедитесь, что Ollama или LM Studio запущен и доступен. ` +
            `Детали: ${errorMessage}`
        );
    }
}
