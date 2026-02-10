import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../../utils/logger';

/**
 * Элемент для обработки (файл или директория)
 */
export interface CollectedItem {
    path: string;
    type: 'file' | 'directory';
    depth: number;
    parentPath: string | null;
}

/**
 * Рекурсивный сбор всех файлов и директорий с их глубиной вложенности.
 * 
 * Пропускает служебные директории (начинающиеся с точки, node_modules).
 * Нормализует все пути.
 * 
 * @param dirPath - Путь к директории для сбора
 * @param parentPath - Путь к родительской директории
 * @param depth - Текущая глубина вложенности
 * @param items - Массив для накопления результатов
 */
export async function collectItems(
    dirPath: string,
    parentPath: string | null,
    depth: number,
    items: CollectedItem[]
): Promise<void> {
    try {
        Logger.debug(`[itemCollector] Сбор элементов из директории: ${dirPath} (глубина: ${depth})`);
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        Logger.debug(`[itemCollector] Найдено записей в ${dirPath}: ${entries.length}`);

        for (const entry of entries) {
            const itemPath = path.normalize(path.join(dirPath, entry.name));

            if (entry.isFile()) {
                items.push({
                    path: itemPath,
                    type: 'file',
                    depth: depth,
                    parentPath: parentPath ? path.normalize(parentPath) : null
                });
                Logger.debug(`[itemCollector] Добавлен файл: ${itemPath}`);
            } else if (entry.isDirectory()) {
                // Пропускаем служебные директории
                if (entry.name.startsWith('.') || entry.name === 'node_modules') {
                    Logger.debug(`[itemCollector] Пропущена служебная директория: ${itemPath}`);
                    continue;
                }

                // Добавляем директорию в список
                items.push({
                    path: itemPath,
                    type: 'directory',
                    depth: depth,
                    parentPath: parentPath ? path.normalize(parentPath) : null
                });
                Logger.debug(`[itemCollector] Добавлена директория: ${itemPath}`);

                // Рекурсивно собираем элементы из поддиректории
                await collectItems(itemPath, itemPath, depth + 1, items);
            }
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error(`[itemCollector] Ошибка сбора элементов из ${dirPath}: ${errorMessage}`, error as Error);
    }
}
