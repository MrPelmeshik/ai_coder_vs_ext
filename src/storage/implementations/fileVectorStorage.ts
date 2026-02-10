import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { VectorStorage, EmbeddingItem, SearchResult, EmbeddingKind } from '../interfaces/vectorStorage';
import { Logger } from '../../utils/logger';
import { StorageError } from '../../errors';

/**
 * Формат данных на диске
 */
interface StorageData {
    items: SerializedItem[];
}

/**
 * Сериализованный элемент (без вектора — векторы хранятся в бинарном файле)
 */
interface SerializedItem {
    id: string;
    type: string;
    parent: string | null;
    childs: string[];
    path: string;
    kind: string;
    raw: string | object;
    vectorIndex: number; // Индекс в бинарном файле векторов
    vectorDim: number;   // Размерность вектора
}

/**
 * Реализация векторного хранилища на чистом TypeScript
 * 
 * Хранение: metadata.json + vectors.bin
 * Поиск: brute-force cosine similarity
 * Никаких нативных зависимостей — работает на любой платформе
 */
export class FileVectorStorage implements VectorStorage {
    private storagePath: string;
    private metadataPath: string;
    private vectorsPath: string;

    private items: Map<string, EmbeddingItem> = new Map();
    private initialized: boolean = false;
    private initPromise: Promise<void> | null = null;

    // Debounced save
    private saveTimeout: ReturnType<typeof setTimeout> | null = null;
    private savePromise: Promise<void> | null = null;
    private readonly SAVE_DEBOUNCE_MS = 500;

    constructor(context: vscode.ExtensionContext) {
        this.storagePath = path.join(context.globalStorageUri.fsPath, 'vectordb');
        this.metadataPath = path.join(this.storagePath, 'metadata.json');
        this.vectorsPath = path.join(this.storagePath, 'vectors.bin');

        // Создаём директорию если не существует
        try {
            if (!fs.existsSync(this.storagePath)) {
                fs.mkdirSync(this.storagePath, { recursive: true });
            }
        } catch (error) {
            Logger.error('Ошибка создания директории для FileVectorStorage', error as Error);
        }
    }

    /**
     * Инициализация хранилища
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this._doInitialize();
        try {
            await this.initPromise;
        } catch (error) {
            this.initPromise = null;
            throw error;
        }
    }

    private async _doInitialize(): Promise<void> {
        try {
            await this._loadFromDisk();
            this.initialized = true;
            Logger.info(`FileVectorStorage инициализировано, записей: ${this.items.size}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            Logger.error(`Ошибка инициализации FileVectorStorage: ${errorMessage}`, error as Error);
            throw new StorageError(`Ошибка инициализации хранилища: ${errorMessage}`, error as Error);
        }
    }

    /**
     * Добавление эмбеддинга в хранилище
     */
    async addEmbedding(item: EmbeddingItem): Promise<string> {
        await this.ensureInitialized();

        // Нормализуем вектор
        const vector: number[] = Array.isArray(item.vector) ? [...item.vector] : Array.from(item.vector as number[]);

        const storedItem: EmbeddingItem = {
            ...item,
            vector,
        };

        this.items.set(item.id, storedItem);
        this._scheduleSave();

        return item.id;
    }

    /**
     * Поиск похожих эмбеддингов (cosine similarity)
     */
    async searchSimilar(vector: number[], limit: number = 5): Promise<SearchResult[]> {
        await this.ensureInitialized();

        if (this.items.size === 0) {
            throw new Error('База данных пуста. Сначала выполните векторизацию файлов.');
        }

        const queryVector: number[] = Array.isArray(vector) ? vector : Array.from(vector as number[]);
        const queryNorm = this._vectorNorm(queryVector);

        if (queryNorm === 0) {
            return [];
        }

        // Brute-force cosine similarity
        const results: SearchResult[] = [];

        for (const item of this.items.values()) {
            if (!item.vector || item.vector.length === 0) {
                continue;
            }

            // Проверяем совпадение размерности
            if (item.vector.length !== queryVector.length) {
                continue;
            }

            const similarity = this._cosineSimilarity(queryVector, item.vector, queryNorm);
            results.push({ item, similarity });
        }

        // Сортируем по убыванию similarity и берём top-K
        results.sort((a, b) => b.similarity - a.similarity);
        return results.slice(0, limit);
    }

    /**
     * Получение эмбеддинга по ID
     */
    async getById(id: string): Promise<EmbeddingItem | null> {
        await this.ensureInitialized();
        return this.items.get(id) || null;
    }

    /**
     * Получение всех эмбеддингов по пути
     */
    async getByPath(filePath: string): Promise<EmbeddingItem[]> {
        await this.ensureInitialized();

        const results: EmbeddingItem[] = [];
        for (const item of this.items.values()) {
            if (item.path === filePath) {
                results.push(item);
            }
        }
        return results;
    }

    /**
     * Получение дочерних элементов
     */
    async getChildren(parentId: string): Promise<EmbeddingItem[]> {
        await this.ensureInitialized();

        const parentIdValue = parentId || '';
        const results: EmbeddingItem[] = [];

        for (const item of this.items.values()) {
            if (parentIdValue) {
                if (item.parent === parentIdValue) {
                    results.push(item);
                }
            } else {
                if (!item.parent || item.parent === '') {
                    results.push(item);
                }
            }
        }
        return results;
    }

    /**
     * Обновление эмбеддинга
     */
    async updateEmbedding(id: string, updates: Partial<EmbeddingItem>): Promise<void> {
        await this.ensureInitialized();

        const existing = this.items.get(id);
        if (!existing) {
            throw new Error(`Эмбеддинг с ID ${id} не найден`);
        }

        const updated: EmbeddingItem = {
            ...existing,
            ...updates,
            id: existing.id, // ID не меняется
        };

        this.items.set(id, updated);
        this._scheduleSave();
    }

    /**
     * Удаление эмбеддинга
     */
    async deleteEmbedding(id: string): Promise<void> {
        await this.ensureInitialized();
        this.items.delete(id);
        this._scheduleSave();
    }

    /**
     * Удаление всех эмбеддингов по пути
     */
    async deleteByPath(filePath: string): Promise<void> {
        await this.ensureInitialized();

        const toDelete: string[] = [];
        for (const [id, item] of this.items.entries()) {
            if (item.path === filePath) {
                toDelete.push(id);
            }
        }

        for (const id of toDelete) {
            this.items.delete(id);
        }

        if (toDelete.length > 0) {
            this._scheduleSave();
        }
    }

    /**
     * Проверка существования эмбеддинга по пути и типу
     */
    async exists(filePath: string, kind: EmbeddingKind): Promise<boolean> {
        await this.ensureInitialized();

        for (const item of this.items.values()) {
            if (item.path === filePath && item.kind === kind) {
                return true;
            }
        }
        return false;
    }

    /**
     * Получение всех записей из хранилища
     */
    async getAllItems(limit?: number): Promise<EmbeddingItem[]> {
        await this.ensureInitialized();

        const allItems = Array.from(this.items.values());
        if (limit && limit > 0) {
            return allItems.slice(0, limit);
        }
        return allItems;
    }

    /**
     * Получение количества записей в хранилище
     */
    async getCount(): Promise<number> {
        await this.ensureInitialized();
        return this.items.size;
    }

    /**
     * Получение размера хранилища в байтах
     */
    async getStorageSize(): Promise<number> {
        await this.ensureInitialized();

        let totalSize = 0;
        try {
            if (fs.existsSync(this.metadataPath)) {
                totalSize += fs.statSync(this.metadataPath).size;
            }
            if (fs.existsSync(this.vectorsPath)) {
                totalSize += fs.statSync(this.vectorsPath).size;
            }
        } catch (error) {
            Logger.warn('Ошибка получения размера хранилища', error as Error);
        }
        return totalSize;
    }

    /**
     * Очистка всех данных из хранилища
     */
    async clear(): Promise<void> {
        try {
            // Отменяем отложенное сохранение
            if (this.saveTimeout) {
                clearTimeout(this.saveTimeout);
                this.saveTimeout = null;
            }

            // Очищаем in-memory данные
            this.items.clear();

            // Удаляем файлы с диска
            if (fs.existsSync(this.storagePath)) {
                fs.rmSync(this.storagePath, { recursive: true, force: true });
                fs.mkdirSync(this.storagePath, { recursive: true });
            }

            // Сбрасываем состояние
            this.initialized = false;
            this.initPromise = null;

            Logger.info('FileVectorStorage очищено');
        } catch (error) {
            Logger.error('Ошибка очистки хранилища', error as Error);
            throw new StorageError('Ошибка очистки хранилища', error as Error);
        }
    }

    /**
     * Очистка ресурсов
     */
    async dispose(): Promise<void> {
        // Сохраняем данные перед закрытием
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = null;
        }

        if (this.items.size > 0 && this.initialized) {
            try {
                await this._saveToDisk();
            } catch (error) {
                Logger.error('Ошибка сохранения при dispose', error as Error);
            }
        }

        this.initialized = false;
        this.initPromise = null;
        this.items.clear();
    }

    // ==================== Приватные методы ====================

    /**
     * Проверка инициализации
     */
    private async ensureInitialized(): Promise<void> {
        if (!this.initialized) {
            await this.initialize();
        }
    }

    /**
     * Cosine similarity между двумя векторами
     */
    private _cosineSimilarity(a: number[], b: number[], aNorm?: number): number {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            if (aNorm === undefined) {
                normA += a[i] * a[i];
            }
            normB += b[i] * b[i];
        }

        normA = aNorm !== undefined ? aNorm : Math.sqrt(normA);
        normB = Math.sqrt(normB);

        if (normA === 0 || normB === 0) {
            return 0;
        }

        return Math.max(0, dotProduct / (normA * normB));
    }

    /**
     * Норма вектора
     */
    private _vectorNorm(v: number[]): number {
        let sum = 0;
        for (let i = 0; i < v.length; i++) {
            sum += v[i] * v[i];
        }
        return Math.sqrt(sum);
    }

    /**
     * Отложенное сохранение (debounce)
     */
    private _scheduleSave(): void {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }

        this.saveTimeout = setTimeout(async () => {
            this.saveTimeout = null;
            try {
                await this._saveToDisk();
            } catch (error) {
                Logger.error('Ошибка отложенного сохранения', error as Error);
            }
        }, this.SAVE_DEBOUNCE_MS);
    }

    /**
     * Загрузка данных с диска
     */
    private async _loadFromDisk(): Promise<void> {
        this.items.clear();

        // Проверяем существование файла метаданных
        if (!fs.existsSync(this.metadataPath)) {
            Logger.info('Файл метаданных не найден, начинаем с пустого хранилища');
            return;
        }

        try {
            // Читаем метаданные
            const metadataRaw = await fs.promises.readFile(this.metadataPath, 'utf-8');
            const storageData: StorageData = JSON.parse(metadataRaw);

            if (!storageData.items || storageData.items.length === 0) {
                return;
            }

            // Читаем бинарный файл с векторами
            let vectorBuffer: Buffer | null = null;
            if (fs.existsSync(this.vectorsPath)) {
                vectorBuffer = await fs.promises.readFile(this.vectorsPath);
            }

            // Восстанавливаем элементы
            for (const serialized of storageData.items) {
                let vector: number[] = [];

                if (vectorBuffer && serialized.vectorDim > 0) {
                    const byteOffset = serialized.vectorIndex * 4; // Float32 = 4 bytes
                    const byteLength = serialized.vectorDim * 4;

                    if (byteOffset + byteLength <= vectorBuffer.length) {
                        const float32View = new Float32Array(
                            vectorBuffer.buffer,
                            vectorBuffer.byteOffset + byteOffset,
                            serialized.vectorDim
                        );
                        vector = Array.from(float32View);
                    }
                }

                const item: EmbeddingItem = {
                    id: serialized.id,
                    type: serialized.type as any,
                    parent: serialized.parent,
                    childs: serialized.childs,
                    path: serialized.path,
                    kind: serialized.kind as any,
                    raw: serialized.raw,
                    vector: vector,
                };

                this.items.set(item.id, item);
            }

            Logger.info(`FileVectorStorage: загружено ${this.items.size} записей с диска`);
        } catch (error) {
            Logger.error('Ошибка загрузки данных с диска, начинаем с пустого хранилища', error as Error);
            this.items.clear();
        }
    }

    /**
     * Сохранение данных на диск
     */
    private async _saveToDisk(): Promise<void> {
        // Предотвращаем параллельное сохранение
        if (this.savePromise) {
            await this.savePromise;
        }

        this.savePromise = this._doSaveToDisk();
        try {
            await this.savePromise;
        } finally {
            this.savePromise = null;
        }
    }

    private async _doSaveToDisk(): Promise<void> {
        try {
            // Создаём директорию если не существует
            if (!fs.existsSync(this.storagePath)) {
                fs.mkdirSync(this.storagePath, { recursive: true });
            }

            const allItems = Array.from(this.items.values());

            // Подсчитываем общее количество float-ов для бинарного файла
            let totalFloats = 0;
            for (const item of allItems) {
                totalFloats += item.vector.length;
            }

            // Создаём бинарный буфер для всех векторов
            const vectorBuffer = Buffer.alloc(totalFloats * 4); // Float32 = 4 bytes
            const float32View = new Float32Array(vectorBuffer.buffer, vectorBuffer.byteOffset, totalFloats);

            // Сериализуем элементы
            const serializedItems: SerializedItem[] = [];
            let vectorOffset = 0;

            for (const item of allItems) {
                const vectorDim = item.vector.length;

                // Записываем вектор в бинарный буфер
                for (let i = 0; i < vectorDim; i++) {
                    float32View[vectorOffset + i] = item.vector[i];
                }

                serializedItems.push({
                    id: item.id,
                    type: item.type,
                    parent: item.parent,
                    childs: item.childs,
                    path: item.path,
                    kind: item.kind,
                    raw: item.raw,
                    vectorIndex: vectorOffset,
                    vectorDim: vectorDim,
                });

                vectorOffset += vectorDim;
            }

            const storageData: StorageData = {
                items: serializedItems,
            };

            // Записываем файлы (атомарно через временные файлы)
            const metadataTmp = this.metadataPath + '.tmp';
            const vectorsTmp = this.vectorsPath + '.tmp';

            await fs.promises.writeFile(metadataTmp, JSON.stringify(storageData), 'utf-8');
            await fs.promises.writeFile(vectorsTmp, vectorBuffer);

            // Атомарная замена
            await fs.promises.rename(metadataTmp, this.metadataPath);
            await fs.promises.rename(vectorsTmp, this.vectorsPath);

            Logger.debug(`FileVectorStorage: сохранено ${allItems.length} записей на диск`);
        } catch (error) {
            Logger.error('Ошибка сохранения на диск', error as Error);
            throw error;
        }
    }
}
