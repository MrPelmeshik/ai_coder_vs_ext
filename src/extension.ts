import * as vscode from 'vscode';
import { AICoderPanel } from './webview/panel';
import { LLMService } from './services/llmService';

let llmService: LLMService | undefined;

/**
 * Активация расширения
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('AI Coder Extension активировано');

    // Инициализация сервиса LLM
    llmService = new LLMService(context);

    // Регистрация команды для открытия панели
    const openPanelCommand = vscode.commands.registerCommand('aiCoder.openPanel', () => {
        if (llmService) {
            AICoderPanel.createOrShow(context.extensionUri, llmService);
        }
    });

    context.subscriptions.push(openPanelCommand);

    // Добавление сервиса в подписки для правильной очистки
    context.subscriptions.push({
        dispose: () => {
            if (llmService) {
                llmService.dispose();
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
}

