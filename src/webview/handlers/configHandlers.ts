import * as vscode from 'vscode';
import { PanelContext } from '../panelContext';
import { CONFIG_KEYS } from '../../constants';

/**
 * Отправка текущей конфигурации в webview.
 * Загружает настройки из LLMService и VS Code Configuration API,
 * маскирует API-ключ и отправляет в webview.
 */
export async function handleSendConfig(ctx: PanelContext): Promise<void> {
    try {
        const config = await ctx.llmService.getConfig();
        const vscodeConfig = vscode.workspace.getConfiguration('aiCoder');

        const summarizePrompt = vscodeConfig.get<string>(CONFIG_KEYS.VECTORIZATION.SUMMARIZE_PROMPT) ||
            'Суммаризируй следующий код или текст. Создай краткое описание основных функций, классов, методов и их назначения. Сохрани важные детали, но сделай текст более компактным и структурированным.';
        const enableOrigin = vscodeConfig.get<boolean>(CONFIG_KEYS.VECTORIZATION.ENABLE_ORIGIN) ?? true;
        const enableSummarize = vscodeConfig.get<boolean>(CONFIG_KEYS.VECTORIZATION.ENABLE_SUMMARIZE) ?? false;
        const enableVsOrigin = vscodeConfig.get<boolean>(CONFIG_KEYS.VECTORIZATION.ENABLE_VS_ORIGIN) ?? true;
        const enableVsSummarize = vscodeConfig.get<boolean>(CONFIG_KEYS.VECTORIZATION.ENABLE_VS_SUMMARIZE) ?? true;

        // Не отправляем API ключ в webview по соображениям безопасности
        const safeConfig = {
            ...config,
            apiKey: config.apiKey ? '***' : '',
            hasApiKey: await ctx.llmService.hasApiKey(),
            localUrl: config.localUrl,
            summarizePrompt,
            enableOrigin,
            enableSummarize,
            enableVsOrigin,
            enableVsSummarize
        };

        ctx.panel.webview.postMessage({
            command: 'config',
            config: safeConfig
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
        // Пытаемся отправить конфигурацию с дефолтными значениями
        try {
            const config = await ctx.llmService.getConfig();
            const vscodeConfig = vscode.workspace.getConfiguration('aiCoder');
            const safeConfig = {
                ...config,
                apiKey: config.apiKey ? '***' : '',
                hasApiKey: await ctx.llmService.hasApiKey(),
                localUrl: config.localUrl || '',
                summarizePrompt: vscodeConfig.get<string>(CONFIG_KEYS.VECTORIZATION.SUMMARIZE_PROMPT) ||
                    'Суммаризируй следующий код или текст. Создай краткое описание основных функций, классов, методов и их назначения. Сохрани важные детали, но сделай текст более компактным и структурированным.',
                enableOrigin: vscodeConfig.get<boolean>(CONFIG_KEYS.VECTORIZATION.ENABLE_ORIGIN) ?? true,
                enableSummarize: vscodeConfig.get<boolean>(CONFIG_KEYS.VECTORIZATION.ENABLE_SUMMARIZE) ?? false,
                enableVsOrigin: vscodeConfig.get<boolean>(CONFIG_KEYS.VECTORIZATION.ENABLE_VS_ORIGIN) ?? true,
                enableVsSummarize: vscodeConfig.get<boolean>(CONFIG_KEYS.VECTORIZATION.ENABLE_VS_SUMMARIZE) ?? true
            };
            ctx.panel.webview.postMessage({
                command: 'config',
                config: safeConfig
            });
        } catch (fallbackError) {
            vscode.window.showErrorMessage(`Ошибка загрузки конфигурации: ${errorMessage}`);
        }
    }
}

/**
 * Обработка обновления конфигурации из webview.
 * Сохраняет настройки LLM и векторизации.
 */
export async function handleUpdateConfig(ctx: PanelContext, config: any): Promise<void> {
    try {
        await ctx.llmService.updateConfig(config);

        const vscodeConfig = vscode.workspace.getConfiguration('aiCoder');

        // Сохраняем промпт суммаризации отдельно
        if (config.summarizePrompt !== undefined) {
            await vscodeConfig.update(CONFIG_KEYS.VECTORIZATION.SUMMARIZE_PROMPT, config.summarizePrompt, vscode.ConfigurationTarget.Global);
        }

        // Сохраняем настройки включения/отключения типов векторов
        if (config.enableOrigin !== undefined) {
            await vscodeConfig.update(CONFIG_KEYS.VECTORIZATION.ENABLE_ORIGIN, config.enableOrigin, vscode.ConfigurationTarget.Global);
        }
        if (config.enableSummarize !== undefined) {
            await vscodeConfig.update(CONFIG_KEYS.VECTORIZATION.ENABLE_SUMMARIZE, config.enableSummarize, vscode.ConfigurationTarget.Global);
        }
        if (config.enableVsOrigin !== undefined) {
            await vscodeConfig.update(CONFIG_KEYS.VECTORIZATION.ENABLE_VS_ORIGIN, config.enableVsOrigin, vscode.ConfigurationTarget.Global);
        }
        if (config.enableVsSummarize !== undefined) {
            await vscodeConfig.update(CONFIG_KEYS.VECTORIZATION.ENABLE_VS_SUMMARIZE, config.enableVsSummarize, vscode.ConfigurationTarget.Global);
        }

        await handleSendConfig(ctx);
        vscode.window.showInformationMessage('Настройки успешно сохранены');
        ctx.panel.webview.postMessage({ command: 'configUpdated' });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
        vscode.window.showErrorMessage(`Ошибка сохранения настроек: ${errorMessage}`);
        ctx.panel.webview.postMessage({
            command: 'configUpdateError',
            error: errorMessage
        });
    }
}

/**
 * Обработка запроса на сброс настроек (с подтверждением через диалог VS Code)
 */
export async function handleRequestResetConfig(ctx: PanelContext): Promise<void> {
    const action = await vscode.window.showWarningMessage(
        'Вы уверены, что хотите сбросить настройки к значениям по умолчанию?',
        { modal: true },
        'Да, сбросить',
        'Отмена'
    );

    if (action === 'Да, сбросить') {
        ctx.panel.webview.postMessage({ command: 'resetConfigStarted' });
        await handleResetConfig(ctx);
    } else {
        ctx.panel.webview.postMessage({ command: 'resetConfigCancelled' });
    }
}

/**
 * Сброс всех настроек к значениям по умолчанию из package.json.
 * Удаляет пользовательские значения через VS Code Configuration API.
 */
export async function handleResetConfig(ctx: PanelContext): Promise<void> {
    try {
        const vscodeConfig = vscode.workspace.getConfiguration('aiCoder');

        // Сбрасываем все настройки LLM
        await vscodeConfig.update(CONFIG_KEYS.LLM.PROVIDER, undefined, vscode.ConfigurationTarget.Global);
        await vscodeConfig.update(CONFIG_KEYS.LLM.MODEL, undefined, vscode.ConfigurationTarget.Global);
        await vscodeConfig.update(CONFIG_KEYS.LLM.EMBEDDER_MODEL, undefined, vscode.ConfigurationTarget.Global);
        await vscodeConfig.update(CONFIG_KEYS.LLM.TEMPERATURE, undefined, vscode.ConfigurationTarget.Global);
        await vscodeConfig.update(CONFIG_KEYS.LLM.MAX_TOKENS, undefined, vscode.ConfigurationTarget.Global);
        await vscodeConfig.update(CONFIG_KEYS.LLM.BASE_URL, undefined, vscode.ConfigurationTarget.Global);
        await vscodeConfig.update(CONFIG_KEYS.LLM.API_TYPE, undefined, vscode.ConfigurationTarget.Global);
        await vscodeConfig.update(CONFIG_KEYS.LLM.LOCAL_URL, undefined, vscode.ConfigurationTarget.Global);
        await vscodeConfig.update(CONFIG_KEYS.LLM.TIMEOUT, undefined, vscode.ConfigurationTarget.Global);
        await vscodeConfig.update(CONFIG_KEYS.LLM.SYSTEM_PROMPT, undefined, vscode.ConfigurationTarget.Global);

        // Сбрасываем настройки векторизации
        await vscodeConfig.update(CONFIG_KEYS.VECTORIZATION.SUMMARIZE_PROMPT, undefined, vscode.ConfigurationTarget.Global);
        await vscodeConfig.update(CONFIG_KEYS.VECTORIZATION.ENABLE_ORIGIN, undefined, vscode.ConfigurationTarget.Global);
        await vscodeConfig.update(CONFIG_KEYS.VECTORIZATION.ENABLE_SUMMARIZE, undefined, vscode.ConfigurationTarget.Global);
        await vscodeConfig.update(CONFIG_KEYS.VECTORIZATION.ENABLE_VS_ORIGIN, undefined, vscode.ConfigurationTarget.Global);
        await vscodeConfig.update(CONFIG_KEYS.VECTORIZATION.ENABLE_VS_SUMMARIZE, undefined, vscode.ConfigurationTarget.Global);

        // Очищаем API ключ из SecretStorage
        await ctx.llmService.setApiKey('');

        await handleSendConfig(ctx);
        vscode.window.showInformationMessage('Настройки сброшены к значениям по умолчанию');
        ctx.panel.webview.postMessage({ command: 'configReset' });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
        vscode.window.showErrorMessage(`Ошибка сброса настроек: ${errorMessage}`);
        ctx.panel.webview.postMessage({
            command: 'configResetError',
            error: errorMessage
        });
    }
}

/**
 * Обработка запроса на закрытие настроек с проверкой несохранённых изменений
 */
export async function handleRequestCloseSettings(ctx: PanelContext, hasChanges: boolean): Promise<void> {
    if (!hasChanges) {
        ctx.panel.webview.postMessage({ command: 'closeSettings' });
        return;
    }

    const action = await vscode.window.showWarningMessage(
        'У вас есть несохраненные изменения. Что вы хотите сделать?',
        { modal: true },
        'Выйти с сохранением',
        'Выйти без сохранения'
    );

    if (action === 'Выйти с сохранением') {
        ctx.panel.webview.postMessage({ command: 'saveAndCloseSettings' });
    } else if (action === 'Выйти без сохранения') {
        ctx.panel.webview.postMessage({ command: 'discardAndCloseSettings' });
    } else {
        ctx.panel.webview.postMessage({ command: 'cancelCloseSettings' });
    }
}
