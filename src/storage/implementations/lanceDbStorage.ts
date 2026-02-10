import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { VectorStorage, EmbeddingItem, SearchResult, EmbeddingKind } from '../interfaces/vectorStorage';
import { VECTOR_INDEX, TABLE_NAMES } from '../../constants';
import { Logger } from '../../utils/logger';
import { StorageError } from '../../errors';
import { deserializeLanceDbItem } from '../utils/vectorDeserializer';
import { LanceDbIndexManager } from '../utils/lanceDbIndexManager';
import { createTableWithDimension, detectVectorDimension } from '../utils/lanceDbSchema';

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
    private initPromise: Promise<void> | null = null; // Кэш промиса инициализации для предотвращения race condition
    private vectorDimension: number | null = null; // Размерность вектора (определяется динамически)
    private indexManager: LanceDbIndexManager = new LanceDbIndexManager();

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

        // Если инициализация уже запущена, ждём её завершения
        // Это предотвращает race condition при параллельных вызовах
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this._doInitialize();
        try {
            await this.initPromise;
        } catch (error) {
            // Сбрасываем промис при ошибке, чтобы можно было повторить попытку
            this.initPromise = null;
            throw error;
        }
    }

    /**
     * Внутренняя логика инициализации
     */
    private async _doInitialize(): Promise<void> {
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
                    this.vectorDimension = await detectVectorDimension(this.table);

                    // Проверяем и создаем индекс если нужно
                    await this.indexManager.ensureIndex(this.table);
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
            const errorMessage = error instanceof Error ? error.message : String(error);
            Logger.error(`Детали ошибки инициализации хранилища: ${errorMessage}`, error as Error);
            // Если @lancedb/lancedb не установлен, выбрасываем понятную ошибку
            if (error instanceof Error && error.message.includes('Cannot find module')) {
                throw new StorageError('LanceDB не установлен. Выполните: npm install @lancedb/lancedb', error);
            }
            throw new StorageError(`Ошибка инициализации хранилища: ${errorMessage}`, error as Error);
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
            this.table = await createTableWithDimension(this.db, vectorDim);
            this.vectorDimension = vectorDim;
        } else {
            // Проверяем, что размерность совпадает
            if (this.vectorDimension === null) {
                this.vectorDimension = await detectVectorDimension(this.table);
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
        await this.indexManager.ensureIndex(this.table);

        return item.id;
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
            this.vectorDimension = await detectVectorDimension(this.table);
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
                    item: deserializeLanceDbItem(result),
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

            return deserializeLanceDbItem(results[0]);
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

            return results.map((item: any) => deserializeLanceDbItem(item));
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

            return results.map((item: any) => deserializeLanceDbItem(item));
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

            return results.map((item: any) => deserializeLanceDbItem(item));
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
        try {
            // Пытаемся инициализировать для корректного удаления через LanceDB API
            try {
                await this.ensureInitialized();
            } catch (initError) {
                Logger.warn('Не удалось инициализировать хранилище для очистки, используем fallback', initError as Error);
            }

            // Удаляем таблицу если она существует и БД доступна
            if (this.db && this.table) {
                try {
                    const tableNames = await this.db.tableNames();
                    if (tableNames.includes(TABLE_NAMES.EMBEDDING_ITEM)) {
                        await this.db.dropTable(TABLE_NAMES.EMBEDDING_ITEM);
                        Logger.info('Таблица embedding_item удалена через LanceDB API');
                    }
                } catch (dbError) {
                    Logger.warn('Не удалось удалить таблицу через API, будет удалена директория', dbError as Error);
                }
            }

            // Fallback: удаляем директорию хранилища напрямую
            if (fs.existsSync(this.storagePath)) {
                fs.rmSync(this.storagePath, { recursive: true, force: true });
                fs.mkdirSync(this.storagePath, { recursive: true });
                Logger.info('Директория хранилища очищена');
            }

            // Сбрасываем состояние
            this.table = null;
            this.db = null;
            this.vectorDimension = null;
            this.initialized = false;
            this.initPromise = null;
            this.indexManager.reset();

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
        this.initPromise = null;
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

}

