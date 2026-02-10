import * as vscode from 'vscode';
import { AICoderPanel } from '../webview/panel';
import { LLMService } from '../services/llmService';
import { FileStatusService, FileStatus } from '../services/fileStatusService';
import { EmbeddingService } from '../services/embedding/embeddingService';

/**
 * Регистрация всех команд расширения.
 * 
 * @param context - Контекст расширения
 * @param llmService - Сервис LLM
 * @param fileStatusService - Сервис статусов файлов
 * @param embeddingService - Сервис эмбеддингов
 * @returns Массив disposable-ресурсов
 */
export function registerCommands(
    context: vscode.ExtensionContext,
    llmService: LLMService,
    fileStatusService: FileStatusService,
    embeddingService: EmbeddingService
): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    // Команда для открытия панели
    disposables.push(
        vscode.commands.registerCommand('aiCoder.openPanel', () => {
            AICoderPanel.createOrShow(context.extensionUri, llmService, embeddingService, context);
        })
    );

    // Сброс статуса файла и удаление из БД
    disposables.push(
        vscode.commands.registerCommand('aiCoder.markAsNotProcessed', async (uri: vscode.Uri) => {
            const targetUri = uri || vscode.window.activeTextEditor?.document.uri;
            if (targetUri) {
                const filePath = targetUri.fsPath;
                try {
                    const storage = embeddingService.getStorage();
                    const existingItems = await storage.getByPath(filePath);
                    for (const item of existingItems) {
                        await storage.deleteEmbedding(item.id);
                    }
                    fileStatusService.setFileStatus(targetUri, FileStatus.NOT_PROCESSED);
                    vscode.window.showInformationMessage(`Статус файла сброшен, записи удалены из БД`);
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
                    vscode.window.showErrorMessage(`Ошибка сброса статуса: ${errorMessage}`);
                }
            }
        })
    );

    // Исключение файла из обработки
    disposables.push(
        vscode.commands.registerCommand('aiCoder.markAsExcluded', async (uri: vscode.Uri) => {
            const targetUri = uri || vscode.window.activeTextEditor?.document.uri;
            if (targetUri) {
                fileStatusService.setFileStatus(targetUri, FileStatus.EXCLUDED);
                vscode.window.showInformationMessage(`Файл исключен из обработки`);
            }
        })
    );

    // Очистка всех статусов файлов
    disposables.push(
        vscode.commands.registerCommand('aiCoder.clearAllStatuses', async () => {
            const action = await vscode.window.showWarningMessage(
                'Вы уверены, что хотите очистить все статусы файлов? (Исключенные файлы и обрабатываемые)',
                { modal: true },
                'Да',
                'Нет'
            );
            if (action === 'Да') {
                fileStatusService.clearAllStatuses();
                vscode.window.showInformationMessage('Все статусы файлов очищены');
            }
        })
    );

    return disposables;
}
