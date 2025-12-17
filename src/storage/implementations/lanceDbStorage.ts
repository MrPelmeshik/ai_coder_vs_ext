import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { VectorStorage, EmbeddingItem, SearchResult, EmbeddingKind } from '../interfaces/vectorStorage';
import { VECTOR_INDEX, TABLE_NAMES } from '../../constants';
import { Logger } from '../../utils/logger';
import { StorageError } from '../../errors';

/**
 * Реализация векторного хранилища на основе LanceDB
 * 
 * Использует паттерн Adapter для обеспечения возможности замены БД
 */
export class LanceDbStorage implements VectorStorage {
    private db: any; // LanceDB connection
    private table: any; // LanceDB table
    private storagePath: string;
    private initialized: boolean = false;
    private vectorDimension: number | null = null; // Размерность вектора (определяется динамически)

    constructor(context: vscode.ExtensionContext) {
        // Используем globalStorageUri для хранения данных расширения
        this.storagePath = path.join(context.globalStorageUri.fsPath, 'lancedb');
        
        // Создаем директорию если не существует
        try {
            if (!fs.existsSync(this.storagePath)) {
                fs.mkdirSync(this.storagePath, { recursive: true });
            }
        } catch (error) {
            Logger.error('Ошибка создания директории для LanceDB', error as Error);
        }
    }

    /**
     * Инициализация хранилища
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        try {
            // Динамический импорт @lancedb/lancedb (может быть не установлен)
            const lancedb = await import('@lancedb/lancedb');
            
            // Подключение к БД
            this.db = await lancedb.connect(this.storagePath);

            // Проверяем существование таблицы
            const tableNames = await this.db.tableNames();
            
            if (tableNames.includes(TABLE_NAMES.EMBEDDING_ITEM)) {
                try {
                    // Открываем существующую таблицу
                    this.table = await this.db.openTable(TABLE_NAMES.EMBEDDING_ITEM);
                    
                    // Определяем размерность вектора из существующей таблицы
                    await this._detectVectorDimension();
                    
                    // Проверяем и создаем индекс если нужно
                    await this._ensureIndex();
                } catch (error) {
                    // Если таблица повреждена, удаляем и пересоздаем
                    Logger.warn('Таблица embedding_item повреждена, пересоздаём', error as Error);
                    await this.db.dropTable(TABLE_NAMES.EMBEDDING_ITEM);
                    // Продолжаем создание новой таблицы
                }
            }
            
            if (!this.table) {
                // Таблица будет создана при первом добавлении эмбеддинга
                // Размерность вектора определится автоматически
                
            }

            this.initialized = true;
        } catch (error) {
            // Если @lancedb/lancedb не установлен, выбрасываем понятную ошибку
            if (error instanceof Error && error.message.includes('Cannot find module')) {
                throw new StorageError('LanceDB не установлен. Выполните: npm install @lancedb/lancedb', error);
            }
            throw new StorageError('Ошибка инициализации хранилища', error as Error);
        }
    }

    /**
     * Добавление эмбеддинга в хранилище
     */
    async addEmbedding(item: EmbeddingItem): Promise<string> {
        await this.ensureInitialized();

        // Преобразуем данные для LanceDB
        // Вектор должен быть массивом чисел (Float32Array или number[])
        const vector = Array.isArray(item.vector) 
            ? item.vector 
            : Array.from(item.vector);

        // Проверяем размерность вектора
        const vectorDim = vector.length;
        
        // Если таблица еще не создана, создаем её с нужной размерностью
        if (!this.table) {
            await this._createTableWithDimension(vectorDim);
        } else {
            // Проверяем, что размерность совпадает
            if (this.vectorDimension === null) {
                await this._detectVectorDimension();
            }
            
            if (this.vectorDimension !== null && this.vectorDimension !== vectorDim) {
                throw new StorageError(
                    `Несоответствие размерности вектора: ожидается ${this.vectorDimension}, получено ${vectorDim}. ` +
                    `Убедитесь, что при создании эмбеддингов и при поиске используется одна и та же модель. ` +
                    `Для смены модели необходимо очистить базу данных (удалите папку ${this.storagePath})`
                );
            }
        }

        const data = {
            id: item.id,
            type: item.type,
            parent: item.parent || '', // Используем пустую строку вместо null для совместимости
            childs: JSON.stringify(item.childs), // Сохраняем массив как JSON строку
            path: item.path,
            kind: item.kind,
            raw: typeof item.raw === 'string' ? item.raw : JSON.stringify(item.raw),
            vector: vector // Вектор как массив чисел
        };

        // Добавляем запись
        await this.table.add([data]);
        
        // Сохраняем размерность вектора
        if (this.vectorDimension === null) {
            this.vectorDimension = vectorDim;
        }
        
        // Проверяем, нужно ли создать индекс (создаем после добавления определенного количества записей)
        await this._ensureIndex();
        
        return item.id;
    }

    /**
     * Создание индекса для ускорения векторного поиска
     */
    private indexCreationInProgress: boolean = false;
    private lastIndexCount: number = 0;

    /**
     * Создание индекса для ускорения векторного поиска
     * 
     * Примечание: Индекс создается только при достаточном количестве векторов для обучения KMeans.
     * Это НЕ ограничивает количество хранимых векторов - можно хранить миллионы векторов.
     * Индекс просто не будет создан до тех пор, пока не будет достаточно данных для его обучения.
     */
    private async _ensureIndex(): Promise<void> {
        // Предотвращаем параллельное создание индекса
        if (this.indexCreationInProgress) {
            return;
        }

        try {
            // Проверяем количество записей в таблице
            const count = await this.table.countRows();
            
            // Создаем индекс если есть достаточно записей
            // Обновляем индекс каждые UPDATE_INTERVAL новых записей или при первом создании
            // Это снижает нагрузку при больших объемах данных (тысячи/миллионы векторов)
            if (count >= VECTOR_INDEX.MIN_RECORDS && (count - this.lastIndexCount >= VECTOR_INDEX.UPDATE_INTERVAL || this.lastIndexCount === 0)) {
                this.indexCreationInProgress = true;
                
                try {
                    const { Index } = await import('@lancedb/lancedb');
                    
                    // Вычисляем оптимальное количество разделов для разных объемов данных
                    // ВАЖНО: Это НЕ ограничивает количество хранимых векторов!
                    // Можно хранить миллионы векторов - индекс только ускоряет поиск
                    let numPartitions: number;
                    
                    if (count < 10000) {
                        // Для средних объемов (512-10K): адаптивное количество партиций
                        numPartitions = Math.min(256, Math.max(64, Math.floor(Math.sqrt(count))));
                    } else if (count < 100000) {
                        // Для больших объемов (10K-100K): 256 партиций (стандарт)
                        numPartitions = 256;
                    } else {
                        // Для очень больших объемов (>100K, включая миллионы): MAX_PARTITIONS партиций
                        // Это обеспечивает лучшую производительность при поиске в миллионах векторов
                        numPartitions = VECTOR_INDEX.MAX_PARTITIONS;
                    }
                    
                    // КРИТИЧНО: numPartitions НЕ должен превышать количество векторов
                    // Это требование алгоритма KMeans
                    numPartitions = Math.min(numPartitions, count);
                    
                    // sampleRate: количество векторов для обучения KMeans
                    // Для больших объемов используем больше данных для обучения
                    const sampleRate = Math.max(numPartitions, Math.min(VECTOR_INDEX.SAMPLE_RATE_MAX, count));
                    
                    // numSubVectors: количество подвекторов для Product Quantization
                    const numSubVectors = VECTOR_INDEX.SUB_VECTORS;
                    
                    // Создаем IVF-PQ индекс для векторной колонки
                    await this.table.createIndex('vector', {
                        config: Index.ivfPq({
                            numPartitions: numPartitions,
                            numSubVectors: numSubVectors,
                            distanceType: 'cosine', // Используем cosine для эмбеддингов
                            maxIterations: 50,
                            sampleRate: sampleRate
                        }),
                        replace: true // Заменяем существующий индекс если есть
                    });
                    
                    this.lastIndexCount = count;
                    Logger.info(
                        `Векторный индекс создан/обновлен для таблицы embedding_item`,
                        { count: count.toLocaleString('ru-RU'), partitions: numPartitions }
                    );
                } catch (indexError) {
                    // Игнорируем ошибки создания индекса
                    // Это НЕ критично - поиск будет работать и без индекса, просто медленнее
                    // При больших объемах (>100K) рекомендуется иметь индекс для производительности
                    // Но можно хранить миллионы векторов и без индекса
                    Logger.warn('Не удалось создать индекс (поиск будет работать без индекса)', indexError as Error);
                } finally {
                    this.indexCreationInProgress = false;
                }
            }
        } catch (error) {
            // Игнорируем ошибки проверки индекса
            Logger.warn('Ошибка проверки индекса', error as Error);
            this.indexCreationInProgress = false;
        }
    }

    /**
     * Поиск похожих эмбеддингов
     */
    async searchSimilar(vector: number[], limit: number = 5): Promise<SearchResult[]> {
        await this.ensureInitialized();

        // Проверяем, что таблица существует
        if (!this.table) {
            throw new Error('База данных пуста. Сначала выполните векторизацию файлов.');
        }

        // Определяем размерность вектора если еще не определена
        if (this.vectorDimension === null) {
            await this._detectVectorDimension();
        }

        // Проверяем размерность вектора запроса
        const queryDim = vector.length;
        if (this.vectorDimension === null) {
            throw new StorageError('Не удалось определить размерность векторов в базе данных.');
        }
        
        if (this.vectorDimension !== queryDim) {
            throw new StorageError(
                `Несоответствие размерности вектора: в базе данных векторы размерности ${this.vectorDimension}, ` +
                `а запрос имеет размерность ${queryDim}. ` +
                `Убедитесь, что при создании эмбеддингов и при поиске используется одна и та же модель эмбеддингов.`
            );
        }

        try {
            // Поиск в LanceDB
            const results = await this.table.search(vector)
                .limit(limit)
                .toArray();

            // Преобразуем результаты в наш формат
            // LanceDB возвращает результаты с полем _distance для векторного поиска
            return results.map((result: any) => {
                const distance = result._distance || 0;
                return {
                    item: this._deserializeItem(result),
                    similarity: Math.max(0, 1 - distance) // Преобразуем расстояние в схожесть
                };
            });
        } catch (error) {
            Logger.error('Ошибка поиска в LanceDB', error as Error);
            throw new StorageError('Ошибка поиска в хранилище', error as Error);
        }
    }

    /**
     * Получение эмбеддинга по ID
     */
    async getById(id: string): Promise<EmbeddingItem | null> {
        await this.ensureInitialized();

        // Проверяем, что таблица существует
        if (!this.table) {
            return null;
        }

        try {
            // Используем query для поиска по ID
            const results = await this.table.query()
                .where(`id = '${id}'`)
                .limit(1)
                .toArray();

            if (results.length === 0) {
                return null;
            }

            return this._deserializeItem(results[0]);
        } catch (error) {
            Logger.error('Ошибка получения по ID', error as Error);
            return null;
        }
    }

    /**
     * Получение всех эмбеддингов по пути
     */
    async getByPath(filePath: string): Promise<EmbeddingItem[]> {
        await this.ensureInitialized();

        // Проверяем, что таблица существует
        if (!this.table) {
            return [];
        }

        try {
            // Используем query для поиска по пути
            const results = await this.table.query()
                .where(`path = '${filePath.replace(/'/g, "''")}'`) // Экранируем одинарные кавычки
                .toArray();
            
            return results.map((item: any) => this._deserializeItem(item));
        } catch (error) {
            Logger.error('Ошибка получения по пути', error as Error);
            return [];
        }
    }

    /**
     * Получение дочерних элементов
     */
    async getChildren(parentId: string): Promise<EmbeddingItem[]> {
        await this.ensureInitialized();

        // Проверяем, что таблица существует
        if (!this.table) {
            return [];
        }

        try {
            // Используем query для поиска дочерних элементов
            // Если parentId null, ищем записи с пустым parent
            const parentIdValue = parentId || '';
            const whereClause = parentIdValue 
                ? `parent = '${parentIdValue.replace(/'/g, "''")}'`
                : `parent = '' OR parent IS NULL`;
            const results = await this.table.query()
                .where(whereClause)
                .toArray();
            
            return results.map((item: any) => this._deserializeItem(item));
        } catch (error) {
            Logger.error('Ошибка получения дочерних элементов', error as Error);
            return [];
        }
    }

    /**
     * Обновление эмбеддинга
     */
    async updateEmbedding(id: string, updates: Partial<EmbeddingItem>): Promise<void> {
        await this.ensureInitialized();

        // LanceDB не поддерживает обновление напрямую
        // Удаляем старую запись и добавляем новую
        const existing = await this.getById(id);
        if (!existing) {
            throw new Error(`Эмбеддинг с ID ${id} не найден`);
        }

        const updated: EmbeddingItem = {
            ...existing,
            ...updates,
            id: existing.id // ID не меняется
        };

        await this.deleteEmbedding(id);
        await this.addEmbedding(updated);
    }

    /**
     * Удаление эмбеддинга
     */
    async deleteEmbedding(id: string): Promise<void> {
        await this.ensureInitialized();

        // Проверяем, что таблица существует
        if (!this.table) {
            throw new Error('Таблица не существует. База данных пуста.');
        }

        try {
            await this.table.delete(`id = '${id.replace(/'/g, "''")}'`);
        } catch (error) {
            Logger.error('Ошибка удаления', error as Error);
            throw new StorageError('Ошибка удаления эмбеддинга', error as Error);
        }
    }

    /**
     * Удаление всех эмбеддингов по пути (всех видов)
     */
    async deleteByPath(filePath: string): Promise<void> {
        await this.ensureInitialized();

        // Проверяем, что таблица существует
        if (!this.table) {
            // Если таблицы нет, значит записей с таким путем тоже нет - ничего не делаем
            return;
        }

        try {
            // Удаляем все записи с указанным путем
            await this.table.delete(`path = '${filePath.replace(/'/g, "''")}'`);
        } catch (error) {
            Logger.error('Ошибка удаления по пути', error as Error);
            throw new StorageError('Ошибка удаления эмбеддингов по пути', error as Error);
        }
    }

    /**
     * Проверка существования эмбеддинга по пути и типу
     */
    async exists(filePath: string, kind: EmbeddingKind): Promise<boolean> {
        await this.ensureInitialized();

        const items = await this.getByPath(filePath);
        return items.some(item => item.kind === kind);
    }

    /**
     * Получение всех записей из хранилища
     */
    async getAllItems(limit?: number): Promise<EmbeddingItem[]> {
        await this.ensureInitialized();

        // Проверяем, что таблица существует
        if (!this.table) {
            return [];
        }

        try {
            let query = this.table.query();
            
            if (limit && limit > 0) {
                query = query.limit(limit);
            }
            
            const results = await query.toArray();
            
            return results.map((item: any) => this._deserializeItem(item));
        } catch (error) {
            Logger.error('Ошибка получения всех записей', error as Error);
            return [];
        }
    }

    /**
     * Получение количества записей в хранилище
     */
    async getCount(): Promise<number> {
        await this.ensureInitialized();

        try {
            // Если таблица не существует, возвращаем 0
            if (!this.table) {
                return 0;
            }

            // Получаем количество записей
            const count = await this.table.countRows();
            return count;
        } catch (error) {
            Logger.error('Ошибка получения количества записей', error as Error);
            // В случае ошибки возвращаем 0
            return 0;
        }
    }

    /**
     * Получение размера хранилища в байтах
     */
    async getStorageSize(): Promise<number> {
        await this.ensureInitialized();

        try {
            // Если таблица не существует, возвращаем 0
            if (!this.table) {
                return 0;
            }

            // Получаем размер директории хранилища
            let totalSize = 0;
            
            const calculateDirSize = (dirPath: string): number => {
                let size = 0;
                try {
                    const files = fs.readdirSync(dirPath);
                    for (const file of files) {
                        const filePath = path.join(dirPath, file);
                        const stats = fs.statSync(filePath);
                        if (stats.isDirectory()) {
                            size += calculateDirSize(filePath);
                        } else {
                            size += stats.size;
                        }
                    }
                } catch (error) {
                    // Игнорируем ошибки доступа к файлам
                }
                return size;
            };

            if (fs.existsSync(this.storagePath)) {
                totalSize = calculateDirSize(this.storagePath);
            }

            return totalSize;
        } catch (error) {
            Logger.error('Ошибка получения размера хранилища', error as Error);
            return 0;
        }
    }

    /**
     * Очистка всех данных из хранилища
     */
    async clear(): Promise<void> {
        await this.ensureInitialized();

        try {
            // Удаляем таблицу если она существует
            if (this.table) {
                const tableNames = await this.db.tableNames();
                if (tableNames.includes(TABLE_NAMES.EMBEDDING_ITEM)) {
                    await this.db.dropTable(TABLE_NAMES.EMBEDDING_ITEM);
                    Logger.info('Таблица embedding_item удалена');
                }
            }

            // Сбрасываем состояние
            this.table = null;
            this.vectorDimension = null;
            this.initialized = false;
            this.lastIndexCount = 0;
            
            Logger.info('Хранилище эмбеддингов очищено');
        } catch (error) {
            Logger.error('Ошибка очистки хранилища', error as Error);
            throw new StorageError('Ошибка очистки хранилища', error as Error);
        }
    }

    /**
     * Очистка ресурсов
     */
    async dispose(): Promise<void> {
        // LanceDB автоматически сохраняет данные
        this.initialized = false;
        this.table = null;
        this.db = null;
    }

    /**
     * Проверка инициализации
     */
    private async ensureInitialized(): Promise<void> {
        if (!this.initialized) {
            await this.initialize();
        }
    }

    /**
     * Создание таблицы с указанной размерностью вектора
     */
    private async _createTableWithDimension(vectorDim: number): Promise<void> {
        const { Field, Schema, Utf8, FixedSizeList, Float32 } = await import('apache-arrow');
        
        // Определяем схему таблицы
        const schema = new Schema([
            new Field('id', new Utf8(), false),
            new Field('type', new Utf8(), false),
            new Field('parent', new Utf8(), true), // nullable - используем пустую строку для null
            new Field('childs', new Utf8(), false),
            new Field('path', new Utf8(), false),
            new Field('kind', new Utf8(), false),
            new Field('raw', new Utf8(), false),
            new Field('vector', new FixedSizeList(vectorDim, new Field('item', new Float32(), false)), false)
        ]);
        
        const initialData = [{
            id: '00000000-0000-0000-0000-000000000000',
            type: 'file',
            parent: '', // Используем пустую строку вместо null для начальных данных
            childs: '[]',
            path: '',
            kind: 'origin',
            raw: '',
            vector: new Array(vectorDim).fill(0) // Заглушка, будет удалена
        }];

        // Создаем таблицу с явной схемой
        this.table = await this.db.createTable(TABLE_NAMES.EMBEDDING_ITEM, initialData, {
            mode: 'create', // Создаем новую таблицу
            schema: schema
        });
        
        // Удаляем заглушку
        await this.table.delete('id = \'00000000-0000-0000-0000-000000000000\'');
        
        // Сохраняем размерность
        this.vectorDimension = vectorDim;
        
        Logger.info(`Таблица embedding_item создана с размерностью вектора: ${vectorDim}`);
    }

    /**
     * Определение размерности вектора из существующей таблицы
     */
    private async _detectVectorDimension(): Promise<void> {
        if (!this.table) {
            return;
        }

        try {
            // Получаем первую запись из таблицы
            const results = await this.table.query()
                .limit(1)
                .toArray();
            
            if (results.length > 0 && results[0].vector) {
                const vector = results[0].vector;
                // Вектор может быть массивом или Arrow Vector
                if (Array.isArray(vector)) {
                    this.vectorDimension = vector.length;
                } else if (vector.length !== undefined) {
                    this.vectorDimension = vector.length;
                } else {
                    // Пытаемся получить размерность из схемы таблицы
                    const schema = this.table.schema;
                    const vectorField = schema.fields.find((f: any) => f.name === 'vector');
                    if (vectorField && vectorField.type && vectorField.type.listSize) {
                        this.vectorDimension = vectorField.type.listSize;
                    }
                }
                
                if (this.vectorDimension) {
                    Logger.debug(`Размерность вектора определена: ${this.vectorDimension}`);
                }
            }
        } catch (error) {
            Logger.warn('Не удалось определить размерность вектора из таблицы', error as Error);
        }
    }

    /**
     * Десериализация элемента из формата LanceDB
     */
    private _deserializeItem(data: any): EmbeddingItem {
        let raw: string | object;
        try {
            // Пытаемся распарсить как JSON
            raw = JSON.parse(data.raw);
        } catch {
            // Если не JSON, оставляем как строку
            raw = data.raw;
        }

        let childs: string[];
        try {
            childs = JSON.parse(data.childs);
        } catch {
            childs = [];
        }

        return {
            id: data.id,
            type: data.type,
            parent: data.parent && data.parent !== '' ? data.parent : null, // Преобразуем пустую строку обратно в null
            childs: childs,
            path: data.path,
            kind: data.kind,
            raw: raw,
            vector: Array.isArray(data.vector) ? data.vector : []
        };
    }
}

