import { VECTOR_INDEX } from '../../constants';
import { Logger } from '../../utils/logger';

/**
 * Менеджер индексов для LanceDB.
 * 
 * Управляет созданием и обновлением IVF-PQ индексов
 * для ускорения векторного поиска.
 */
export class LanceDbIndexManager {
    private indexCreationInProgress: boolean = false;
    private lastIndexCount: number = 0;

    /**
     * Создание/обновление индекса для ускорения векторного поиска.
     * 
     * Примечание: Индекс создается только при достаточном количестве векторов для обучения KMeans.
     * Это НЕ ограничивает количество хранимых векторов - можно хранить миллионы векторов.
     * Индекс просто не будет создан до тех пор, пока не будет достаточно данных для его обучения.
     * 
     * @param table - Таблица LanceDB
     */
    async ensureIndex(table: any): Promise<void> {
        // Предотвращаем параллельное создание индекса
        if (this.indexCreationInProgress) {
            return;
        }

        try {
            // Проверяем количество записей в таблице
            const count = await table.countRows();

            // Создаем индекс если есть достаточно записей
            // Обновляем индекс каждые UPDATE_INTERVAL новых записей или при первом создании
            // Это снижает нагрузку при больших объемах данных (тысячи/миллионы векторов)
            if (count >= VECTOR_INDEX.MIN_RECORDS && (count - this.lastIndexCount >= VECTOR_INDEX.UPDATE_INTERVAL || this.lastIndexCount === 0)) {
                this.indexCreationInProgress = true;

                try {
                    const { Index } = await import('@lancedb/lancedb');

                    const numPartitions = this._calculatePartitions(count);
                    const sampleRate = Math.max(numPartitions, Math.min(VECTOR_INDEX.SAMPLE_RATE_MAX, count));
                    const numSubVectors = VECTOR_INDEX.SUB_VECTORS;

                    // Создаем IVF-PQ индекс для векторной колонки
                    await table.createIndex('vector', {
                        config: Index.ivfPq({
                            numPartitions: numPartitions,
                            numSubVectors: numSubVectors,
                            distanceType: 'cosine',
                            maxIterations: 50,
                            sampleRate: sampleRate
                        }),
                        replace: true
                    });

                    this.lastIndexCount = count;
                    Logger.info(
                        `Векторный индекс создан/обновлен для таблицы embedding_item`,
                        { count: count.toLocaleString('ru-RU'), partitions: numPartitions }
                    );
                } catch (indexError) {
                    // Это НЕ критично - поиск будет работать и без индекса, просто медленнее
                    Logger.warn('Не удалось создать индекс (поиск будет работать без индекса)', indexError as Error);
                } finally {
                    this.indexCreationInProgress = false;
                }
            }
        } catch (error) {
            Logger.warn('Ошибка проверки индекса', error as Error);
            this.indexCreationInProgress = false;
        }
    }

    /**
     * Сброс состояния менеджера индексов
     */
    reset(): void {
        this.lastIndexCount = 0;
        this.indexCreationInProgress = false;
    }

    /**
     * Вычисление оптимального количества партиций для IVF-PQ индекса
     * 
     * @param count - Количество записей в таблице
     * @returns Оптимальное количество партиций
     */
    private _calculatePartitions(count: number): number {
        let numPartitions: number;

        if (count < 10000) {
            // Для средних объемов (512-10K): адаптивное количество партиций
            numPartitions = Math.min(256, Math.max(64, Math.floor(Math.sqrt(count))));
        } else if (count < 100000) {
            // Для больших объемов (10K-100K): 256 партиций (стандарт)
            numPartitions = 256;
        } else {
            // Для очень больших объемов (>100K): MAX_PARTITIONS партиций
            numPartitions = VECTOR_INDEX.MAX_PARTITIONS;
        }

        // КРИТИЧНО: numPartitions НЕ должен превышать количество векторов
        // Это требование алгоритма KMeans
        numPartitions = Math.min(numPartitions, count);

        return numPartitions;
    }
}
