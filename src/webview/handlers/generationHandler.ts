import * as vscode from 'vscode';
import { PanelContext } from '../panelContext';
import { OpenAiCompatibleProvider } from '../../providers/openAiCompatibleProvider';

/** Маркеры для определения начала блока размышлений */
const THINKING_START_MARKERS = ['<think>', '<think>', '```thinking', 'thinking:', 'размышление:'];
/** Маркеры для определения конца блока размышлений */
const THINKING_END_MARKERS = ['</think>', '</think>', '```', 'answer:', 'ответ:'];

/**
 * Очистка текста размышлений от возможных закрывающих тегов
 */
function cleanThinkingContent(text: string): string {
    let cleanText = text;
    for (const marker of THINKING_END_MARKERS) {
        const lowerThinking = cleanText.toLowerCase();
        const lowerMarker = marker.toLowerCase();
        const markerPos = lowerThinking.indexOf(lowerMarker);
        if (markerPos !== -1) {
            cleanText = cleanText.substring(0, markerPos).trim();
        }
    }
    return cleanText;
}

/**
 * Обработка команды генерации кода.
 * Поддерживает streaming-генерацию с разделением размышлений и ответа.
 */
export async function handleGenerate(ctx: PanelContext, text: string, model?: any): Promise<void> {
    if (!text || text.trim().length === 0) {
        vscode.window.showWarningMessage('Пожалуйста, введите текст для генерации');
        return;
    }

    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Генерация кода",
        cancellable: false
    }, async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
        progress.report({ increment: 0, message: "Обработка запроса..." });

        try {
            ctx.panel.webview.postMessage({ command: 'generationStarted' });

            let fullResponse = '';
            let thinkingContent = '';
            let answerContent = '';

            let inThinkingBlock = false;
            let thinkingStartPos = -1;
            let thinkingEndPos = -1;
            let thinkingEndMarker = '';

            // Создаем конфигурацию из выбранной модели или используем дефолтную
            let config: any;
            if (model) {
                const defaultConfig = await ctx.llmService.getConfig();
                config = {
                    provider: 'openai',
                    apiKey: model.apiKey || '',
                    model: model.modelName,
                    baseUrl: model.url,
                    temperature: model.temperature !== undefined ? model.temperature : defaultConfig.temperature,
                    maxTokens: model.maxTokens !== undefined ? model.maxTokens : defaultConfig.maxTokens,
                    systemPrompt: model.systemPrompt || defaultConfig.systemPrompt,
                    timeout: defaultConfig.timeout
                };
            } else {
                config = await ctx.llmService.getConfig();
            }

            const provider = new OpenAiCompatibleProvider();

            if (provider.stream) {
                for await (const chunk of provider.stream(text, config)) {
                    fullResponse += chunk;

                    // Проверяем начало блока размышлений
                    if (!inThinkingBlock) {
                        for (const marker of THINKING_START_MARKERS) {
                            const lowerResponse = fullResponse.toLowerCase();
                            const lowerMarker = marker.toLowerCase();
                            const pos = lowerResponse.indexOf(lowerMarker);
                            if (pos !== -1) {
                                inThinkingBlock = true;
                                const actualMarker = fullResponse.substring(pos, pos + marker.length);
                                thinkingStartPos = pos + actualMarker.length;
                                break;
                            }
                        }
                    }

                    // Если мы в блоке размышлений, ищем конец
                    if (inThinkingBlock && thinkingEndPos === -1) {
                        for (const marker of THINKING_END_MARKERS) {
                            const lowerResponse = fullResponse.toLowerCase();
                            const lowerMarker = marker.toLowerCase();
                            const pos = lowerResponse.indexOf(lowerMarker, thinkingStartPos);
                            if (pos !== -1) {
                                thinkingEndPos = pos;
                                thinkingEndMarker = marker;
                                const actualMarker = fullResponse.substring(pos, pos + marker.length);
                                thinkingContent = fullResponse.substring(thinkingStartPos, thinkingEndPos).trim();
                                answerContent = fullResponse.substring(thinkingEndPos + actualMarker.length).trim();
                                inThinkingBlock = false;
                                break;
                            }
                        }
                    }

                    // Отправляем обновление в реальном времени
                    if (inThinkingBlock && thinkingEndPos === -1) {
                        const currentThinking = fullResponse.substring(thinkingStartPos);
                        thinkingContent = cleanThinkingContent(currentThinking);

                        ctx.panel.webview.postMessage({
                            command: 'streamChunk',
                            thinking: thinkingContent,
                            answer: '',
                            isThinking: true
                        });
                    } else if (thinkingEndPos !== -1) {
                        answerContent = fullResponse.substring(thinkingEndPos + thinkingEndMarker.length).trim();

                        ctx.panel.webview.postMessage({
                            command: 'streamChunk',
                            thinking: thinkingContent,
                            answer: answerContent,
                            isThinking: false
                        });
                    } else {
                        // Нет блока размышлений — показываем весь текст как размышления в реальном времени
                        thinkingContent = fullResponse;

                        ctx.panel.webview.postMessage({
                            command: 'streamChunk',
                            thinking: thinkingContent,
                            answer: '',
                            isThinking: true
                        });
                    }
                }
            } else {
                const result = await provider.generate(text, config);
                fullResponse = result;
            }

            // Финальная обработка
            if (thinkingEndPos === -1 && thinkingStartPos !== -1) {
                thinkingContent = fullResponse.substring(thinkingStartPos).trim();
                for (const marker of THINKING_END_MARKERS) {
                    const lowerThinking = thinkingContent.toLowerCase();
                    const lowerMarker = marker.toLowerCase();
                    const markerPos = lowerThinking.indexOf(lowerMarker);
                    if (markerPos !== -1) {
                        const actualMarker = thinkingContent.substring(markerPos, markerPos + marker.length);
                        thinkingContent = thinkingContent.substring(0, markerPos).trim();
                        const answerStartPos = thinkingStartPos + markerPos + actualMarker.length;
                        answerContent = fullResponse.substring(answerStartPos).trim();
                        break;
                    }
                }
            } else if (thinkingEndPos !== -1) {
                const actualEndMarker = fullResponse.substring(thinkingEndPos, thinkingEndPos + thinkingEndMarker.length);
                thinkingContent = fullResponse.substring(thinkingStartPos, thinkingEndPos).trim();
                answerContent = fullResponse.substring(thinkingEndPos + actualEndMarker.length).trim();
            } else {
                answerContent = fullResponse;
                thinkingContent = '';
            }

            progress.report({ increment: 100, message: "Готово!" });

            ctx.panel.webview.postMessage({
                command: 'generationComplete',
                thinking: thinkingContent,
                answer: answerContent || fullResponse
            });

            vscode.window.showInformationMessage('Код успешно сгенерирован!');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
            vscode.window.showErrorMessage(`Ошибка генерации: ${errorMessage}`);

            ctx.panel.webview.postMessage({
                command: 'error',
                error: errorMessage
            });
        }
    });
}
