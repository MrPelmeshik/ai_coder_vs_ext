import { LLMConfig } from '../llm';
import { BaseWebviewMessage } from './base';

/**
 * Сообщение обновления конфигурации
 */
export interface UpdateConfigMessage extends BaseWebviewMessage {
    command: 'updateConfig';
    config: Partial<LLMConfig & {
        summarizePrompt: string;
        enableOrigin: boolean;
        enableSummarize: boolean;
        enableVsOrigin: boolean;
        enableVsSummarize: boolean;
    }>;
}

/**
 * Сообщение запроса на закрытие настроек с проверкой изменений
 */
export interface RequestCloseSettingsMessage extends BaseWebviewMessage {
    command: 'requestCloseSettings';
    hasChanges: boolean;
}
