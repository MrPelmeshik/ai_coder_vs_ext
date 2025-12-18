/**
 * Утилита для обработки ошибок API
 */
export class ApiErrorHandler {
    /**
     * Обработка ошибок API запросов
     * 
     * @param error - Ошибка для обработки
     * @param context - Контекст ошибки (название сервиса/API)
     * @param timeout - Таймаут запроса в миллисекундах
     * @param url - URL сервера (опционально)
     */
    static handle(error: unknown, context: string, timeout: number, url?: string): never {
        if (error instanceof Error) {
            if (error.name === 'AbortError') {
                const urlInfo = url ? ` по адресу ${url}` : '';
                throw new Error(
                    `Таймаут запроса к ${context}${urlInfo} (${timeout}ms). ` +
                    `Убедитесь, что сервер запущен и доступен.`
                );
            }
            if (error.message.includes('fetch') || 
                error.message.includes('ECONNREFUSED') ||
                error.message.includes('ENOTFOUND')) {
                const urlInfo = url ? ` по адресу ${url}` : '';
                throw new Error(
                    `Не удалось подключиться к ${context}${urlInfo}. ` +
                    `Убедитесь, что сервер запущен.`
                );
            }
            throw error;
        }
        throw new Error(`Неизвестная ошибка при обращении к ${context}`);
    }
}

