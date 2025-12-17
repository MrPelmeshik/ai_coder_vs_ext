import * as vscode from 'vscode';
import * as path from 'path';
import { VectorStorage } from '../storage/interfaces/vectorStorage';
import { STORAGE_KEYS } from '../constants';
import { Logger } from '../utils/logger';

/**
 * Статусы обработки файлов
 */
export enum FileStatus {
    NOT_PROCESSED = 'not_processed',      // Не обработан
    PROCESSING = 'processing',             // Обрабатывается (временный статус во время векторизации)
    PROCESSED = 'processed',               // Обработан (определяется автоматически на основе БД)
    EXCLUDED = 'excluded'                  // Исключен из обработки (ручное управление)
}

/**
 * Сервис для управления статусами файлов проекта
 * Статусы PROCESSED и NOT_PROCESSED определяются автоматически на основе наличия в LanceDB
 * Статусы EXCLUDED и PROCESSING управляются вручную
 */
export class FileStatusService {
    private _context: vscode.ExtensionContext;
    private _storage: VectorStorage | null = null;
    private _excludedFiles: Set<string> = new Set(); // Только исключенные файлы
    private _processingFiles: Set<string> = new Set(); // Файлы, которые обрабатываются прямо сейчас
    private _onStatusChangedEmitter: vscode.EventEmitter<vscode.Uri> = new vscode.EventEmitter<vscode.Uri>();
    public readonly onStatusChanged: vscode.Event<vscode.Uri> = this._onStatusChangedEmitter.event;

    private readonly STORAGE_KEY = STORAGE_KEYS.EXCLUDED_FILES;

    constructor(context: vscode.ExtensionContext, storage?: VectorStorage) {
        this._context = context;
        this._storage = storage || null;
        this._loadExcludedFiles();
    }

    /**
     * Установить хранилище для проверки реального состояния
     */
    public setStorage(storage: VectorStorage): void {
        this._storage = storage;
    }

    /**
     * Получить статус файла
     * Статус определяется автоматически на основе реального состояния в LanceDB
     */
    public async getFileStatus(uri: vscode.Uri): Promise<FileStatus> {
        const key = this._getFileKey(uri);
        const filePath = uri.fsPath;

        // Проверяем исключенные файлы
        if (this._excludedFiles.has(key)) {
            return FileStatus.EXCLUDED;
        }

        // Проверяем файлы, которые обрабатываются прямо сейчас
        if (this._processingFiles.has(key)) {
            return FileStatus.PROCESSING;
        }

        // Проверяем реальное состояние в БД
        if (this._storage) {
            try {
                const exists = await this._storage.exists(filePath, 'origin');
                if (exists) {
                    return FileStatus.PROCESSED;
                }
            } catch (error) {
                // В случае ошибки считаем файл необработанным
                Logger.warn(`Ошибка проверки статуса файла ${filePath}`, error as Error);
            }
        }

        return FileStatus.NOT_PROCESSED;
    }

    /**
     * Синхронная версия получения статуса (для обратной совместимости)
     * Использует кэш или возвращает NOT_PROCESSED
     */
    public getFileStatusSync(uri: vscode.Uri): FileStatus {
        const key = this._getFileKey(uri);

        // Проверяем исключенные файлы
        if (this._excludedFiles.has(key)) {
            return FileStatus.EXCLUDED;
        }

        // Проверяем файлы, которые обрабатываются прямо сейчас
        if (this._processingFiles.has(key)) {
            return FileStatus.PROCESSING;
        }

        // Без доступа к БД не можем точно определить статус
        // Возвращаем NOT_PROCESSED по умолчанию
        return FileStatus.NOT_PROCESSED;
    }

    /**
     * Установить статус файла
     * Можно устанавливать только EXCLUDED, NOT_PROCESSED (сброс) и PROCESSING (временно)
     * PROCESSED определяется автоматически на основе БД
     */
    public setFileStatus(uri: vscode.Uri, status: FileStatus): void {
        const key = this._getFileKey(uri);
        
        if (status === FileStatus.EXCLUDED) {
            this._excludedFiles.add(key);
            this._saveExcludedFiles();
        } else if (status === FileStatus.NOT_PROCESSED) {
            // Сброс статуса - удаляем из исключенных и из обрабатываемых
            this._excludedFiles.delete(key);
            this._processingFiles.delete(key);
            this._saveExcludedFiles();
        } else if (status === FileStatus.PROCESSING) {
            // Временно помечаем как обрабатывается
            this._processingFiles.add(key);
        } else if (status === FileStatus.PROCESSED) {
            // PROCESSED нельзя устанавливать вручную - он определяется автоматически
            // Просто убираем из обрабатываемых, если был там
            this._processingFiles.delete(key);
        }
        
        this._onStatusChangedEmitter.fire(uri);
    }

    /**
     * Убрать статус PROCESSING (когда обработка завершена)
     */
    public clearProcessingStatus(uri: vscode.Uri): void {
        const key = this._getFileKey(uri);
        if (this._processingFiles.delete(key)) {
            this._onStatusChangedEmitter.fire(uri);
        }
    }

    /**
     * Установить статус для нескольких файлов
     */
    public setFileStatuses(uris: vscode.Uri[], status: FileStatus): void {
        uris.forEach(uri => {
            this.setFileStatus(uri, status);
        });
    }

    /**
     * Получить все файлы с определенным статусом
     * Для EXCLUDED возвращает список исключенных файлов
     * Для других статусов требует проверки БД (асинхронно)
     */
    public getFilesByStatus(status: FileStatus): vscode.Uri[] {
        const files: vscode.Uri[] = [];
        const workspaceFolders = vscode.workspace.workspaceFolders;
        
        if (!workspaceFolders) {
            return files;
        }

        if (status === FileStatus.EXCLUDED) {
            // Возвращаем только исключенные файлы
            for (const key of this._excludedFiles) {
                for (const folder of workspaceFolders) {
                    const filePath = path.join(folder.uri.fsPath, key);
                    try {
                        const uri = vscode.Uri.file(filePath);
                        files.push(uri);
                        break;
                    } catch {
                        // Пропускаем невалидные пути
                    }
                }
            }
        } else if (status === FileStatus.PROCESSING) {
            // Возвращаем файлы, которые обрабатываются
            for (const key of this._processingFiles) {
                for (const folder of workspaceFolders) {
                    const filePath = path.join(folder.uri.fsPath, key);
                    try {
                        const uri = vscode.Uri.file(filePath);
                        files.push(uri);
                        break;
                    } catch {
                        // Пропускаем невалидные пути
                    }
                }
            }
        }
        // Для PROCESSED и NOT_PROCESSED нужно проверять БД асинхронно

        return files;
    }

    /**
     * Очистить все статусы (только исключенные и обрабатываемые)
     */
    public clearAllStatuses(): void {
        const uris: vscode.Uri[] = [];
        const workspaceFolders = vscode.workspace.workspaceFolders;
        
        if (workspaceFolders) {
            for (const key of [...this._excludedFiles, ...this._processingFiles]) {
                for (const folder of workspaceFolders) {
                    const filePath = path.join(folder.uri.fsPath, key);
                    try {
                        const uri = vscode.Uri.file(filePath);
                        uris.push(uri);
                        break;
                    } catch {
                        // Пропускаем невалидные пути
                    }
                }
            }
        }

        this._excludedFiles.clear();
        this._processingFiles.clear();
        this._saveExcludedFiles();
        uris.forEach(uri => this._onStatusChangedEmitter.fire(uri));
    }

    /**
     * Получить ключ для файла (относительный путь от корня workspace)
     */
    private _getFileKey(uri: vscode.Uri): string {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            // Если нет workspace, используем полный путь, нормализованный для кроссплатформенности
            return uri.fsPath.replace(/\\/g, '/');
        }

        for (const folder of workspaceFolders) {
            const folderPath = folder.uri.fsPath;
            const filePath = uri.fsPath;
            
            // Нормализуем пути для сравнения
            const normalizedFolder = path.normalize(folderPath);
            const normalizedFile = path.normalize(filePath);
            
            if (normalizedFile.startsWith(normalizedFolder + path.sep) || normalizedFile === normalizedFolder) {
                const relative = path.relative(normalizedFolder, normalizedFile);
                // Используем forward slash для кроссплатформенности
                return relative.replace(/\\/g, '/');
            }
        }

        // Если файл не в workspace, используем полный путь
        return uri.fsPath.replace(/\\/g, '/');
    }

    /**
     * Загрузить исключенные файлы из хранилища
     */
    private _loadExcludedFiles(): void {
        const stored = this._context.globalState.get<string[]>(this.STORAGE_KEY);
        if (stored) {
            this._excludedFiles = new Set(stored);
        }
    }

    /**
     * Сохранить исключенные файлы в хранилище
     */
    private _saveExcludedFiles(): void {
        const excludedArray = Array.from(this._excludedFiles);
        this._context.globalState.update(this.STORAGE_KEY, excludedArray);
    }

    /**
     * Уведомить об изменении статусов всех файлов
     * Используется после очистки хранилища
     */
    public notifyAllStatusesChanged(): void {
        // Отправляем undefined чтобы обновить все декорации
        this._onStatusChangedEmitter.fire(undefined as any);
    }

    /**
     * Очистка ресурсов
     */
    public dispose(): void {
        this._onStatusChangedEmitter.dispose();
    }
}

