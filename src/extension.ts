import * as vscode from 'vscode';
import { AICoderPanel } from './webview/panel';
import { LLMService } from './services/llmService';
import { FileStatusService, FileStatus } from './services/fileStatusService';
import { FileDecorationProvider } from './providers/fileDecorationProvider';
import { EmbeddingService } from './services/embeddingService';

let llmService: LLMService | undefined;
let fileStatusService: FileStatusService | undefined;
let fileDecorationProvider: FileDecorationProvider | undefined;
let embeddingService: EmbeddingService | undefined;

/**
 * Активация расширения
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('AI Coder Extension активировано');

    // Инициализация сервиса LLM
    llmService = new LLMService(context);

    // Инициализация сервиса статусов файлов
    fileStatusService = new FileStatusService(context);

    // Инициализация сервиса эмбеддингов
    embeddingService = new EmbeddingService(context, llmService, fileStatusService);
    embeddingService.initialize().catch(err => {
        console.error('Ошибка инициализации EmbeddingService:', err);
    });

    // Регистрация провайдера декораций файлов
    fileDecorationProvider = new FileDecorationProvider(fileStatusService);
    const decorationProviderDisposable = vscode.window.registerFileDecorationProvider(fileDecorationProvider);
    context.subscriptions.push(decorationProviderDisposable);

    // Отслеживание изменений файлов для автоматического сброса статуса
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');
    
    fileWatcher.onDidChange(async (uri) => {
        // При изменении файла удаляем его из БД и сбрасываем статус
        if (embeddingService && fileStatusService) {
            try {
                const storage = embeddingService.getStorage();
                const filePath = uri.fsPath;
                
                // Проверяем, не исключен ли файл
                const status = await fileStatusService.getFileStatus(uri);
                if (status === FileStatus.EXCLUDED) {
                    // Исключенные файлы не обрабатываем
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
                // Игнорируем ошибки при отслеживании изменений
                console.warn(`Ошибка обработки изменения файла ${uri.fsPath}:`, error);
            }
        }
    });
    
    context.subscriptions.push(fileWatcher);

    // Регистрация команды для открытия панели
    const openPanelCommand = vscode.commands.registerCommand('aiCoder.openPanel', () => {
        if (llmService && embeddingService) {
            AICoderPanel.createOrShow(context.extensionUri, llmService, embeddingService);
        }
    });

    context.subscriptions.push(openPanelCommand);

    // Команды для управления статусами файлов
    // Только сброс и исключение - остальные статусы определяются автоматически из БД
    const markAsNotProcessedCommand = vscode.commands.registerCommand('aiCoder.markAsNotProcessed', async (uri: vscode.Uri) => {
        if (fileStatusService && embeddingService) {
            const targetUri = uri || vscode.window.activeTextEditor?.document.uri;
            if (targetUri) {
                // Сбрасываем статус и удаляем из БД
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
        }
    });

    const markAsExcludedCommand = vscode.commands.registerCommand('aiCoder.markAsExcluded', async (uri: vscode.Uri) => {
        if (fileStatusService) {
            const targetUri = uri || vscode.window.activeTextEditor?.document.uri;
            if (targetUri) {
                fileStatusService.setFileStatus(targetUri, FileStatus.EXCLUDED);
                vscode.window.showInformationMessage(`Файл исключен из обработки`);
            }
        }
    });

    const clearAllStatusesCommand = vscode.commands.registerCommand('aiCoder.clearAllStatuses', async () => {
        if (fileStatusService) {
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
        }
    });

    context.subscriptions.push(
        markAsNotProcessedCommand,
        markAsExcludedCommand,
        clearAllStatusesCommand
    );

    // Добавление сервисов в подписки для правильной очистки
    context.subscriptions.push({
        dispose: () => {
            if (llmService) {
                llmService.dispose();
            }
            if (fileStatusService) {
                fileStatusService.dispose();
            }
            if (fileDecorationProvider) {
                fileDecorationProvider.dispose();
            }
            if (embeddingService) {
                embeddingService.dispose();
            }
        }
    });
}

/**
 * Деактивация расширения
 */
export function deactivate() {
    console.log('AI Coder Extension деактивировано');
    if (llmService) {
        llmService.dispose();
        llmService = undefined;
    }
    if (fileStatusService) {
        fileStatusService.dispose();
        fileStatusService = undefined;
    }
    if (fileDecorationProvider) {
        fileDecorationProvider.dispose();
        fileDecorationProvider = undefined;
    }
    if (embeddingService) {
        embeddingService.dispose();
        embeddingService = undefined;
    }
}

