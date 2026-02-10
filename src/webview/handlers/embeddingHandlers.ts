import * as vscode from 'vscode';
import { PanelContext } from '../panelContext';
import { LLMServer } from '../../types/servers';
import { VectorizeAllMessage } from '../../types/messages';
import { CONFIG_KEYS } from '../../constants';
import { Logger } from '../../utils/logger';

/**
 * Обработка команды векторизации всех файлов.
 * Сохраняет конфигурацию из сообщения, запрашивает подтверждение
 * и запускает векторизацию с отображением прогресса.
 */
export async function handleVectorizeAll(ctx: PanelContext, vectorizeMessage?: VectorizeAllMessage): Promise<void> {
    // Сохраняем конфигурацию из сообщения перед векторизацией
    if (vectorizeMessage) {
        const vscodeConfig = vscode.workspace.getConfiguration('aiCoder');

        if (vectorizeMessage.enableOrigin !== undefined) {
            await vscodeConfig.update(CONFIG_KEYS.VECTORIZATION.ENABLE_ORIGIN, vectorizeMessage.enableOrigin, vscode.ConfigurationTarget.Global);
        }
        if (vectorizeMessage.enableSummarize !== undefined) {
            await vscodeConfig.update(CONFIG_KEYS.VECTORIZATION.ENABLE_SUMMARIZE, vectorizeMessage.enableSummarize, vscode.ConfigurationTarget.Global);
        }
        if (vectorizeMessage.enableVsOrigin !== undefined) {
            await vscodeConfig.update(CONFIG_KEYS.VECTORIZATION.ENABLE_VS_ORIGIN, vectorizeMessage.enableVsOrigin, vscode.ConfigurationTarget.Global);
        }
        if (vectorizeMessage.enableVsSummarize !== undefined) {
            await vscodeConfig.update(CONFIG_KEYS.VECTORIZATION.ENABLE_VS_SUMMARIZE, vectorizeMessage.enableVsSummarize, vscode.ConfigurationTarget.Global);
        }
        if (vectorizeMessage.summarizePrompt !== undefined) {
            await vscodeConfig.update(CONFIG_KEYS.VECTORIZATION.SUMMARIZE_PROMPT, vectorizeMessage.summarizePrompt, vscode.ConfigurationTarget.Global);
        }

        // Обновляем конфигурацию модели эмбеддинга и суммаризации
        if (vectorizeMessage.embedderModel) {
            const currentConfig = await ctx.llmService.getConfig();

            // Получаем реальное API-имя модели из списка серверов
            let apiModelName = vectorizeMessage.embedderModel.modelName;
            const servers = ctx.extensionContext.workspaceState.get<LLMServer[]>('llmServers') || [];
            const server = servers.find(s => s.id === vectorizeMessage.embedderModel!.serverId);
            if (server?.models) {
                const model = server.models.find(m =>
                    m.id === vectorizeMessage.embedderModel!.modelId ||
                    m.name === vectorizeMessage.embedderModel!.modelName
                );
                if (model) {
                    apiModelName = model.name;
                    Logger.info(`[embeddingHandlers] Модель эмбеддинга: displayName="${model.displayName || model.name}", apiName="${model.name}"`);
                }
            }

            const updateData: Partial<typeof currentConfig> = {
                ...currentConfig,
                embedderModel: apiModelName
            };
            if (vectorizeMessage.embedderModel.url) {
                updateData.localUrl = vectorizeMessage.embedderModel.url;
                updateData.baseUrl = vectorizeMessage.embedderModel.url;
                Logger.info(`[embeddingHandlers] Используем URL сервера эмбеддингов: ${vectorizeMessage.embedderModel.url}`);
            }
            if (vectorizeMessage.embedderModel.apiKey) {
                updateData.apiKey = vectorizeMessage.embedderModel.apiKey;
            }
            await ctx.llmService.updateConfig(updateData);
        }
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        Logger.error('[embeddingHandlers] Не открыта рабочая область');
        vscode.window.showErrorMessage('Не открыта рабочая область');
        return;
    }

    // Запрашиваем подтверждение
    const action = await vscode.window.showWarningMessage(
        'Векторизация может занять длительное время. Продолжить?',
        { modal: true },
        'Да',
        'Нет'
    );

    if (action !== 'Да') {
        return;
    }

    // Показываем прогресс
    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Векторизация файлов",
        cancellable: true
    }, async (progress, _token) => {
        progress.report({ increment: 0, message: "Начало векторизации..." });

        try {
            const result = await ctx.embeddingService.vectorizeAllUnprocessed(workspaceFolder);

            progress.report({ increment: 100, message: "Готово!" });

            ctx.panel.webview.postMessage({
                command: 'vectorizationComplete',
                result: {
                    processed: result.processed,
                    errors: result.errors
                }
            });

            vscode.window.showInformationMessage(
                `Векторизация завершена. Обработано: ${result.processed}, Ошибок: ${result.errors}`
            );

            handleGetStorageCount(ctx);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
            const errorStack = error instanceof Error ? error.stack : undefined;
            Logger.error(`[embeddingHandlers] Ошибка при векторизации: ${errorMessage}`, error as Error);
            if (errorStack) {
                Logger.error(`[embeddingHandlers] Стек ошибки: ${errorStack}`, error as Error);
            }
            vscode.window.showErrorMessage(`Ошибка векторизации: ${errorMessage}`);

            ctx.panel.webview.postMessage({
                command: 'vectorizationError',
                error: errorMessage
            });
        }
    });
}

/**
 * Обработка команды поиска похожих файлов
 */
export async function handleSearch(ctx: PanelContext, query: string, limit?: number): Promise<void> {
    if (limit === undefined) {
        const config = vscode.workspace.getConfiguration('aiCoder');
        limit = config.get<number>(CONFIG_KEYS.UI.SEARCH_DEFAULT_LIMIT) ?? 10;
    }
    if (!query || query.trim().length === 0) {
        vscode.window.showWarningMessage('Пожалуйста, введите запрос для поиска');
        return;
    }

    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Поиск в хранилище",
        cancellable: false
    }, async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
        progress.report({ increment: 0, message: "Поиск похожих файлов..." });

        try {
            const results = await ctx.embeddingService.searchSimilar(query, limit);

            progress.report({ increment: 100, message: "Готово!" });

            ctx.panel.webview.postMessage({
                command: 'searchResults',
                results: results
            });

            if (results.length === 0) {
                vscode.window.showInformationMessage('Похожие файлы не найдены');
            } else {
                vscode.window.showInformationMessage(`Найдено файлов: ${results.length}`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
            vscode.window.showErrorMessage(`Ошибка поиска: ${errorMessage}`);

            ctx.panel.webview.postMessage({
                command: 'searchError',
                error: errorMessage
            });
        }
    });
}

/**
 * Обработка получения всех записей из хранилища
 */
export async function handleGetAllItems(ctx: PanelContext, limit?: number): Promise<void> {
    try {
        const results = await ctx.embeddingService.getAllItems(limit);

        ctx.panel.webview.postMessage({
            command: 'searchResults',
            results: results
        });

        if (results.length === 0) {
            vscode.window.showInformationMessage('Записи в хранилище отсутствуют');
        } else {
            vscode.window.showInformationMessage(`Загружено записей: ${results.length}`);
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
        vscode.window.showErrorMessage(`Ошибка загрузки записей: ${errorMessage}`);

        ctx.panel.webview.postMessage({
            command: 'searchError',
            error: errorMessage
        });
    }
}

/**
 * Обработка открытия файла по пути
 */
export async function handleOpenFile(filePath: string): Promise<void> {
    try {
        const uri = vscode.Uri.file(filePath);
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
        vscode.window.showErrorMessage(`Не удалось открыть файл ${filePath}: ${errorMessage}`);
    }
}

/**
 * Обработка очистки хранилища эмбеддингов (с подтверждением)
 */
export async function handleClearStorage(ctx: PanelContext): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
        'Вы уверены, что хотите очистить хранилище эмбеддингов? Все векторизованные данные будут удалены.',
        { modal: true },
        'Да, очистить',
        'Отмена'
    );

    if (confirm !== 'Да, очистить') {
        return;
    }

    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Очистка хранилища",
        cancellable: false
    }, async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
        progress.report({ increment: 0, message: "Очистка данных..." });

        try {
            await ctx.embeddingService.clearStorage();

            progress.report({ increment: 100, message: "Готово!" });

            ctx.panel.webview.postMessage({ command: 'storageCleared' });

            vscode.window.showInformationMessage('Хранилище эмбеддингов успешно очищено');

            handleGetStorageCount(ctx);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
            vscode.window.showErrorMessage(`Ошибка очистки хранилища: ${errorMessage}`);

            ctx.panel.webview.postMessage({
                command: 'storageClearError',
                error: errorMessage
            });
        }
    });
}

/**
 * Получение количества записей и размера хранилища
 */
export async function handleGetStorageCount(ctx: PanelContext): Promise<void> {
    try {
        const [count, size] = await Promise.all([
            ctx.embeddingService.getStorageCount(),
            ctx.embeddingService.getStorageSize()
        ]);

        ctx.panel.webview.postMessage({
            command: 'storageCount',
            count: count,
            size: size
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';

        ctx.panel.webview.postMessage({
            command: 'storageCountError',
            error: errorMessage
        });
    }
}
