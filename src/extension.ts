import * as vscode from 'vscode';
import { LLMService } from './services/llmService';
import { FileStatusService } from './services/fileStatusService';
import { FileDecorationProvider } from './providers/fileDecorationProvider';
import { EmbeddingService } from './services/embedding/embeddingService';
import { FileVectorStorage } from './storage/implementations/fileVectorStorage';
import { Logger } from './utils/logger';
import { registerCommands } from './commands';
import { createFileWatcher } from './watchers/fileWatcher';

let llmService: LLMService | undefined;
let fileStatusService: FileStatusService | undefined;
let fileDecorationProvider: FileDecorationProvider | undefined;
let embeddingService: EmbeddingService | undefined;

/**
 * Активация расширения
 */
export function activate(context: vscode.ExtensionContext) {
    // Инициализация логгера
    Logger.initialize(context);
    Logger.info('AI Coder Extension активировано');

    // Инициализация сервисов
    llmService = new LLMService(context);
    fileStatusService = new FileStatusService(context);
    const storage = new FileVectorStorage(context);

    embeddingService = new EmbeddingService(context, llmService, fileStatusService, storage);
    embeddingService.initialize().catch(err => {
        Logger.error('Ошибка инициализации EmbeddingService', err as Error);
    });

    // Регистрация провайдера декораций файлов
    fileDecorationProvider = new FileDecorationProvider(fileStatusService);
    context.subscriptions.push(
        vscode.window.registerFileDecorationProvider(fileDecorationProvider)
    );

    // Отслеживание изменений файлов
    context.subscriptions.push(
        createFileWatcher(fileStatusService, embeddingService)
    );

    // Регистрация команд
    const commandDisposables = registerCommands(context, llmService, fileStatusService, embeddingService);
    context.subscriptions.push(...commandDisposables);

    // Добавление сервисов в подписки для правильной очистки
    context.subscriptions.push({
        dispose: () => {
            llmService?.dispose();
            fileStatusService?.dispose();
            fileDecorationProvider?.dispose();
            embeddingService?.dispose();
        }
    });
}

/**
 * Деактивация расширения
 */
export function deactivate() {
    Logger.info('AI Coder Extension деактивировано');
    llmService?.dispose();
    llmService = undefined;
    fileStatusService?.dispose();
    fileStatusService = undefined;
    fileDecorationProvider?.dispose();
    fileDecorationProvider = undefined;
    embeddingService?.dispose();
    embeddingService = undefined;
    Logger.dispose();
}
