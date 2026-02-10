import { EmbeddingItem } from '../interfaces/vectorStorage';
import { Logger } from '../../utils/logger';

/**
 * Конвертация Arrow Vector или другого формата вектора в обычный number[]
 * 
 * @param vectorObj - Объект вектора из LanceDB (Arrow Vector, TypedArray, массив и т.д.)
 * @param debugPath - Путь элемента для отладки
 * @param debugKind - Тип элемента для отладки
 * @returns Обычный массив number[]
 */
export function convertArrowVector(vectorObj: any, debugPath?: string, debugKind?: string): number[] {
    if (!vectorObj) {
        return [];
    }

    if (Array.isArray(vectorObj)) {
        return vectorObj;
    }

    let vector: number[] = [];

    try {
        // Проверяем, есть ли метод toArray (Arrow Vector)
        if (typeof vectorObj.toArray === 'function') {
            const tempVector = vectorObj.toArray();
            vector = Array.isArray(tempVector) ? tempVector : Array.from(tempVector);
        }
        // Проверяем, можно ли использовать Array.from (для итерируемых объектов)
        else if (vectorObj.length !== undefined) {
            try {
                const tempVector = Array.from(vectorObj);
                vector = Array.isArray(tempVector) ? tempVector : Array.from(tempVector);
            } catch {
                // Если Array.from не работает, пытаемся получить через индексацию
                const length = vectorObj.length;
                vector = [];
                for (let i = 0; i < length; i++) {
                    const value = vectorObj[i];
                    if (value !== undefined && value !== null) {
                        vector.push(Number(value));
                    }
                }
            }
        }
        // Пытаемся использовать spread operator для итерируемых объектов
        else if (Symbol.iterator in vectorObj) {
            try {
                const tempVector = [...vectorObj];
                vector = Array.isArray(tempVector) ? tempVector : Array.from(tempVector);
            } catch (e) {
                Logger.warn(`[vectorDeserializer] Не удалось использовать spread для вектора ${debugPath} (${debugKind})`, e as Error);
            }
        }
        // Если ничего не помогло, пытаемся получить значения через метод get
        else if (typeof vectorObj.get === 'function') {
            const length = vectorObj.length || 0;
            vector = [];
            for (let i = 0; i < length; i++) {
                const value = vectorObj.get(i);
                if (value !== undefined && value !== null) {
                    vector.push(Number(value));
                }
            }
        }
        // Пытаемся получить через values() или другие методы
        else if (typeof vectorObj.values === 'function') {
            try {
                const tempVector = Array.from(vectorObj.values());
                vector = Array.isArray(tempVector) ? tempVector : Array.from(tempVector);
            } catch (e) {
                Logger.warn(`[vectorDeserializer] Метод values() не сработал для ${debugPath} (${debugKind})`, e as Error);
            }
        }
        // Пытаемся получить через data (Arrow Vector может хранить данные в data)
        else if (vectorObj.data && Array.isArray(vectorObj.data)) {
            vector = vectorObj.data;
        }
        // Пытаемся получить через _data (Arrow Vector может хранить данные в _data)
        else if (vectorObj._data && Array.isArray(vectorObj._data)) {
            vector = vectorObj._data;
        }
        else {
            Logger.warn(`[vectorDeserializer] Не удалось преобразовать вектор для ${debugPath} (${debugKind}): тип=${typeof vectorObj}, конструктор=${vectorObj?.constructor?.name}`);
        }
    } catch (error) {
        Logger.error(`[vectorDeserializer] Ошибка преобразования вектора для ${debugPath} (${debugKind})`, error as Error);
    }

    // Убеждаемся, что вектор является обычным массивом (не TypedArray)
    if (vector && vector.length > 0 && !Array.isArray(vector)) {
        vector = Array.from(vector as any);
    }

    return vector;
}

/**
 * Десериализация элемента из формата LanceDB в EmbeddingItem
 * 
 * @param data - Сырые данные из LanceDB
 * @returns Десериализованный EmbeddingItem
 */
export function deserializeLanceDbItem(data: any): EmbeddingItem {
    let raw: string | object;
    try {
        raw = JSON.parse(data.raw);
    } catch {
        raw = data.raw;
    }

    let childs: string[];
    try {
        childs = JSON.parse(data.childs);
    } catch {
        childs = [];
    }

    const vector = convertArrowVector(data.vector, data.path, data.kind);

    if (vector.length === 0 && data.vector) {
        Logger.warn(`[vectorDeserializer] Вектор для ${data.path} (${data.kind}) пустой после преобразования`);
    }

    return {
        id: data.id,
        type: data.type,
        parent: data.parent && data.parent !== '' ? data.parent : null,
        childs: childs,
        path: data.path,
        kind: data.kind,
        raw: raw,
        vector: vector
    };
}
