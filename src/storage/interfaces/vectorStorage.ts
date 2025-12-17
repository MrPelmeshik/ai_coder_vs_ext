/**
 * Интерфейс для векторного хранилища
 * Позволяет легко заменить реализацию БД (LanceDB, Chroma, FAISS и т.д.)
 */
export interface VectorStorage {
    /**
     * Инициализация хранилища
     */
    initialize(): Promise<void>;

    /**
     * Добавление эмбеддинга в хранилище
     */
    addEmbedding(item: EmbeddingItem): Promise<string>;

    /**
     * Поиск похожих эмбеддингов
     */
    searchSimilar(vector: number[], limit?: number): Promise<SearchResult[]>;

    /**
     * Получение эмбеддинга по ID
     */
    getById(id: string): Promise<EmbeddingItem | null>;

    /**
     * Получение всех эмбеддингов по пути
     */
    getByPath(path: string): Promise<EmbeddingItem[]>;

    /**
     * Получение дочерних элементов
     */
    getChildren(parentId: string): Promise<EmbeddingItem[]>;

    /**
     * Обновление эмбеддинга
     */
    updateEmbedding(id: string, updates: Partial<EmbeddingItem>): Promise<void>;

    /**
     * Удаление эмбеддинга
     */
    deleteEmbedding(id: string): Promise<void>;

    /**
     * Удаление всех эмбеддингов по пути (всех видов)
     */
    deleteByPath(path: string): Promise<void>;

    /**
     * Проверка существования эмбеддинга по пути и типу
     */
    exists(path: string, kind: EmbeddingKind): Promise<boolean>;

    /**
     * Получение количества записей в хранилище
     */
    getCount(): Promise<number>;

    /**
     * Очистка всех данных из хранилища
     */
    clear(): Promise<void>;

    /**
     * Очистка ресурсов
     */
    dispose(): Promise<void>;
}

/**
 * Тип элемента эмбеддинга
 */
export type EmbeddingType = 'chunk' | 'file' | 'directory';

/**
 * Тип эмбеддинга (origin, summarize, vs_origin, vs_summarize)
 */
export type EmbeddingKind = 'origin' | 'summarize' | 'vs_origin' | 'vs_summarize';

/**
 * Элемент эмбеддинга
 */
export interface EmbeddingItem {
    id: string; // GUID
    type: EmbeddingType;
    parent: string | null; // GUID родителя или null
    childs: string[]; // Массив GUID дочерних элементов
    path: string;
    kind: EmbeddingKind;
    raw: string | object; // Строка или JSON объект
    vector: number[]; // Вектор эмбеддинга
}

/**
 * Результат поиска
 */
export interface SearchResult {
    item: EmbeddingItem;
    similarity: number; // Степень схожести (0-1)
}

