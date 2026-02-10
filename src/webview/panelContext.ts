import * as vscode from 'vscode';
import { LLMService } from '../services/llmService';
import { EmbeddingService } from '../services/embedding/embeddingService';

/**
 * Контекст панели для передачи зависимостей в обработчики сообщений.
 * Предоставляет доступ к webview, сервисам и расширению.
 */
export interface PanelContext {
    /** Панель webview */
    readonly panel: vscode.WebviewPanel;
    /** URI расширения */
    readonly extensionUri: vscode.Uri;
    /** Сервис для работы с LLM */
    readonly llmService: LLMService;
    /** Сервис для работы с эмбеддингами */
    readonly embeddingService: EmbeddingService;
    /** Контекст расширения VS Code */
    readonly extensionContext: vscode.ExtensionContext;
}
