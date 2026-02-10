import * as vscode from 'vscode';
import { LLMConfig } from '../../types/llm';
import { CONFIG_KEYS } from '../../constants';

/**
 * Конфигурация для векторизации файлов
 */
export interface FileVectorizationConfig {
    embedderModel: string;
    enableOrigin: boolean;
    enableSummarize: boolean;
    summarizePrompt: string;
}

/**
 * Конфигурация для полной векторизации (файлы + директории)
 */
export interface FullVectorizationConfig extends FileVectorizationConfig {
    enableVsOrigin: boolean;
    enableVsSummarize: boolean;
}

/**
 * Загрузка конфигурации векторизации из VS Code Configuration API.
 * 
 * Читает настройки из workspace configuration и возвращает
 * объект конфигурации для передачи в векторизаторы.
 * 
 * @param llmConfig - Конфигурация LLM (для получения embedderModel)
 * @returns Конфигурация для полной векторизации
 */
export function loadVectorizationConfig(llmConfig: LLMConfig): FullVectorizationConfig {
    const vscodeConfig = vscode.workspace.getConfiguration('aiCoder');

    const enableOrigin = vscodeConfig.get<boolean>(CONFIG_KEYS.VECTORIZATION.ENABLE_ORIGIN) ?? true;
    const enableSummarize = vscodeConfig.get<boolean>(CONFIG_KEYS.VECTORIZATION.ENABLE_SUMMARIZE) ?? false;
    const enableVsOrigin = vscodeConfig.get<boolean>(CONFIG_KEYS.VECTORIZATION.ENABLE_VS_ORIGIN) ?? true;
    const enableVsSummarize = vscodeConfig.get<boolean>(CONFIG_KEYS.VECTORIZATION.ENABLE_VS_SUMMARIZE) ?? true;
    const summarizePrompt = vscodeConfig.get<string>(CONFIG_KEYS.VECTORIZATION.SUMMARIZE_PROMPT) ||
        'Суммаризируй следующий код или текст. Создай краткое описание основных функций, классов, методов и их назначения. Сохрани важные детали, но сделай текст более компактным и структурированным.';

    return {
        embedderModel: llmConfig.embedderModel!,
        enableOrigin,
        enableSummarize,
        enableVsOrigin,
        enableVsSummarize,
        summarizePrompt
    };
}
