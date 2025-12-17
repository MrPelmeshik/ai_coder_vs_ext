import * as vscode from 'vscode';
import { FileStatusService, FileStatus } from '../services/fileStatusService';

/**
 * Провайдер декораций для отображения статусов файлов в дереве проекта
 */
export class FileDecorationProvider implements vscode.FileDecorationProvider {
    private _onDidChangeFileDecorations: vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined> = 
        new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
    
    readonly onDidChangeFileDecorations: vscode.Event<vscode.Uri | vscode.Uri[] | undefined> = 
        this._onDidChangeFileDecorations.event;

    constructor(private _fileStatusService: FileStatusService) {
        // Подписываемся на изменения статусов
        this._fileStatusService.onStatusChanged((uri) => {
            // Если uri undefined, обновляем все декорации
            if (uri === undefined) {
                this._onDidChangeFileDecorations.fire(undefined);
            } else {
                this._onDidChangeFileDecorations.fire(uri);
            }
        });
    }

    /**
     * Получить декорацию для файла
     * Поддерживает асинхронную проверку статуса PROCESSED из БД
     */
    provideFileDecoration(uri: vscode.Uri, token: vscode.CancellationToken): vscode.ProviderResult<vscode.FileDecoration> {
        // Сначала проверяем синхронные статусы (EXCLUDED, PROCESSING)
        const syncStatus = this._fileStatusService.getFileStatusSync(uri);

        // Если файл исключен или обрабатывается, возвращаем декорацию сразу
        if (syncStatus === FileStatus.EXCLUDED) {
            return {
                badge: '✗',
                tooltip: 'Исключен из обработки',
                color: new vscode.ThemeColor('charts.red'),
                propagate: false
            };
        }

        if (syncStatus === FileStatus.PROCESSING) {
            return {
                badge: '⟳',
                tooltip: 'Обрабатывается',
                color: new vscode.ThemeColor('charts.yellow'),
                propagate: false
            };
        }

        // Для определения статуса PROCESSED проверяем БД асинхронно
        return this._fileStatusService.getFileStatus(uri).then(status => {
            if (status === FileStatus.PROCESSED) {
                return {
                    badge: '✓',
                    tooltip: 'Обработан',
                    color: new vscode.ThemeColor('charts.green'),
                    propagate: false
                };
            }
            // Для NOT_PROCESSED не показываем декорацию
            return undefined;
        });
    }

    /**
     * Обновить декорации для файла
     */
    public updateDecoration(uri: vscode.Uri): void {
        this._onDidChangeFileDecorations.fire(uri);
    }

    /**
     * Обновить декорации для нескольких файлов
     */
    public updateDecorations(uris: vscode.Uri[]): void {
        this._onDidChangeFileDecorations.fire(uris);
    }

    /**
     * Очистка ресурсов
     */
    public dispose(): void {
        this._onDidChangeFileDecorations.dispose();
    }
}

