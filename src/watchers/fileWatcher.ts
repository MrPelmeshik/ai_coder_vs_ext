import * as vscode from 'vscode';
import { FileStatusService, FileStatus } from '../services/fileStatusService';
import { EmbeddingService } from '../services/embedding/embeddingService';
import { Logger } from '../utils/logger';

/**
 * Создание файлового наблюдателя для автоматического сброса статуса
 * при изменении файлов.
 * 
 * При изменении файла удаляет его записи из БД эмбеддингов
 * и сбрасывает статус на NOT_PROCESSED.
 * 
 * @param fileStatusService - Сервис статусов файлов
 * @param embeddingService - Сервис эмбеддингов
 * @returns Disposable-ресурс наблюдателя
 */
export function createFileWatcher(
    fileStatusService: FileStatusService,
    embeddingService: EmbeddingService
): vscode.Disposable {
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');

    fileWatcher.onDidChange(async (uri) => {
        try {
            const storage = embeddingService.getStorage();
            const filePath = uri.fsPath;

            // Проверяем, не исключен ли файл
            const status = await fileStatusService.getFileStatus(uri);
            if (status === FileStatus.EXCLUDED) {
                return;
            }

            // Удаляем все записи файла из БД
            const existingItems = await storage.getByPath(filePath);
            if (existingItems.length > 0) {
                for (const item of existingItems) {
                    await storage.deleteEmbedding(item.id);
                }
                // Уведомляем об изменении статуса
                fileStatusService.setFileStatus(uri, FileStatus.NOT_PROCESSED);
            }
        } catch (error) {
            Logger.warn(`Ошибка обработки изменения файла ${uri.fsPath}`, error as Error);
        }
    });

    return fileWatcher;
}
