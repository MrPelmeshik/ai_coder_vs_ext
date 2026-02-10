import { TABLE_NAMES } from '../../constants';
import { Logger } from '../../utils/logger';

/**
 * Создание таблицы LanceDB с указанной размерностью вектора.
 * 
 * Использует Apache Arrow для определения схемы таблицы.
 * Создаёт таблицу с начальной заглушкой и сразу удаляет её.
 * 
 * @param db - Подключение к LanceDB
 * @param vectorDim - Размерность вектора
 * @returns Созданная таблица
 */
export async function createTableWithDimension(db: any, vectorDim: number): Promise<any> {
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
        parent: '',
        childs: '[]',
        path: '',
        kind: 'origin',
        raw: '',
        vector: new Array(vectorDim).fill(0) // Заглушка, будет удалена
    }];

    // Создаем таблицу с явной схемой
    const table = await db.createTable(TABLE_NAMES.EMBEDDING_ITEM, initialData, {
        mode: 'create',
        schema: schema
    });

    // Удаляем заглушку
    await table.delete('id = \'00000000-0000-0000-0000-000000000000\'');

    Logger.info(`Таблица embedding_item создана с размерностью вектора: ${vectorDim}`);

    return table;
}

/**
 * Определение размерности вектора из существующей таблицы LanceDB.
 * 
 * Пытается определить размерность из данных первой записи,
 * а если не удаётся — из схемы таблицы.
 * 
 * @param table - Таблица LanceDB
 * @returns Размерность вектора или null
 */
export async function detectVectorDimension(table: any): Promise<number | null> {
    if (!table) {
        return null;
    }

    try {
        // Получаем первую запись из таблицы
        const results = await table.query()
            .limit(1)
            .toArray();

        if (results.length > 0 && results[0].vector) {
            const vector = results[0].vector;
            // Вектор может быть массивом или Arrow Vector
            if (Array.isArray(vector)) {
                return vector.length;
            } else if (vector.length !== undefined) {
                return vector.length;
            } else {
                // Пытаемся получить размерность из схемы таблицы
                const schema = table.schema;
                const vectorField = schema.fields.find((f: any) => f.name === 'vector');
                if (vectorField && vectorField.type && vectorField.type.listSize) {
                    return vectorField.type.listSize;
                }
            }
        }
    } catch (error) {
        Logger.warn('Не удалось определить размерность вектора из таблицы', error as Error);
    }

    return null;
}
