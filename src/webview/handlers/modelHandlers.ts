import * as vscode from 'vscode';
import { PanelContext } from '../panelContext';
import { LLMServer, ServerModel } from '../../types/servers';
import { OpenAiCompatibleProvider } from '../../providers/openAiCompatibleProvider';
import { STORAGE_KEYS } from '../../constants';
import { Logger } from '../../utils/logger';

/**
 * Получение списка активных моделей из всех активных серверов.
 * Также включает сохранённые выбранные модели из globalState.
 */
export async function handleGetActiveModels(ctx: PanelContext): Promise<void> {
    try {
        const servers = ctx.extensionContext.workspaceState.get<LLMServer[]>('llmServers') || [];
        const activeModels: Array<{
            serverId: string;
            serverName: string;
            modelId: string;
            modelName: string;
            url: string;
            apiKey?: string;
            temperature?: number;
            maxTokens?: number;
            systemPrompt?: string;
        }> = [];

        servers.forEach(server => {
            if (server.active !== false && server.models) {
                server.models.forEach(model => {
                    if (model.active !== false) {
                        activeModels.push({
                            serverId: server.id,
                            serverName: server.name,
                            modelId: model.id || model.name,
                            modelName: model.displayName || model.name,
                            url: server.url,
                            apiKey: server.apiKey,
                            temperature: model.temperature,
                            maxTokens: model.maxTokens,
                            systemPrompt: model.systemPrompt
                        });
                    }
                });
            }
        });

        const savedSelections = {
            generationModel: ctx.extensionContext.globalState.get<string>(STORAGE_KEYS.SELECTED_GENERATION_MODEL) || '',
            embedderModel: ctx.extensionContext.globalState.get<string>(STORAGE_KEYS.SELECTED_EMBEDDER_MODEL) || '',
            summarizeModel: ctx.extensionContext.globalState.get<string>(STORAGE_KEYS.SELECTED_SUMMARIZE_MODEL) || ''
        };

        ctx.panel.webview.postMessage({
            command: 'activeModelsList',
            models: activeModels,
            savedSelections: savedSelections
        });
    } catch (error) {
        ctx.panel.webview.postMessage({
            command: 'activeModelsList',
            models: [],
            savedSelections: { generationModel: '', embedderModel: '', summarizeModel: '' }
        });
    }
}

/**
 * Получение списка доступных моделей с сервера (без сохранения)
 */
export async function handleGetAvailableModels(ctx: PanelContext, serverId: string, url: string, apiKey?: string): Promise<void> {
    try {
        const provider = new OpenAiCompatibleProvider();
        const models = await provider.listModels(url, apiKey);

        ctx.panel.webview.postMessage({
            command: 'availableModelsList',
            serverId: serverId,
            models: models
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
        ctx.panel.webview.postMessage({
            command: 'availableModelsListError',
            serverId: serverId,
            error: errorMessage
        });
    }
}

/**
 * Получение списка моделей с сервера (с сохранением в хранилище, для обратной совместимости)
 */
export async function handleGetServerModels(ctx: PanelContext, serverId: string, url: string, apiKey?: string): Promise<void> {
    try {
        const provider = new OpenAiCompatibleProvider();
        const models = await provider.listModels(url, apiKey);

        const servers = ctx.extensionContext.workspaceState.get<LLMServer[]>('llmServers') || [];
        const serverIndex = servers.findIndex(s => s.id === serverId);

        if (serverIndex === -1) {
            throw new Error('Сервер не найден');
        }

        const savedModels = servers[serverIndex].models || [];

        // Объединяем полученные модели с сохраненными настройками
        const modelsWithSettings: ServerModel[] = models.map((modelName, index) => {
            const savedModel = savedModels.find(m => m.name === modelName);
            return savedModel || {
                id: `model-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
                name: modelName,
                active: true
            };
        });

        servers[serverIndex].models = modelsWithSettings;
        await ctx.extensionContext.workspaceState.update('llmServers', servers);

        ctx.panel.webview.postMessage({
            command: 'serverModelsList',
            serverId: serverId,
            models: modelsWithSettings
        });

        handleGetActiveModels(ctx);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
        ctx.panel.webview.postMessage({
            command: 'serverModelsListError',
            serverId: serverId,
            error: errorMessage
        });
    }
}

/**
 * Добавление модели к серверу.
 * Проверяет уникальность displayName среди всех серверов.
 */
export async function handleAddServerModel(ctx: PanelContext, serverId: string, model: ServerModel): Promise<void> {
    try {
        const servers = ctx.extensionContext.workspaceState.get<LLMServer[]>('llmServers') || [];
        const serverIndex = servers.findIndex(s => s.id === serverId);

        if (serverIndex === -1) {
            throw new Error('Сервер не найден');
        }

        if (!servers[serverIndex].models) {
            servers[serverIndex].models = [];
        }

        // Проверка обязательности и уникальности названия модели
        if (!model.displayName || !model.displayName.trim()) {
            throw new Error('Пользовательское наименование модели обязательно для заполнения');
        }
        const modelDisplayName = model.displayName.trim();

        // Проверяем уникальность среди всех моделей всех серверов
        for (const server of servers) {
            if (server.models) {
                for (const existingModel of server.models) {
                    const existingDisplayName = existingModel.displayName?.trim() || existingModel.name.trim();
                    if (existingDisplayName.toLowerCase() === modelDisplayName.toLowerCase()) {
                        throw new Error(`Модель с названием "${modelDisplayName}" уже существует`);
                    }
                }
            }
        }

        const newModel: ServerModel = {
            id: `model-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: model.name,
            displayName: modelDisplayName,
            temperature: model.temperature,
            maxTokens: model.maxTokens,
            systemPrompt: model.systemPrompt,
            active: model.active !== false
        };

        servers[serverIndex].models!.push(newModel);
        await ctx.extensionContext.workspaceState.update('llmServers', servers);

        ctx.panel.webview.postMessage({
            command: 'serverModelAdded',
            serverId: serverId,
            model: newModel
        });

        setTimeout(() => {
            ctx.panel.webview.postMessage({
                command: 'serversList',
                servers: servers
            });
            handleGetActiveModels(ctx);
        }, 50);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
        ctx.panel.webview.postMessage({
            command: 'serverModelAddError',
            serverId: serverId,
            error: errorMessage
        });
    }
}

/**
 * Обновление настроек модели сервера.
 * Проверяет уникальность displayName среди всех серверов (исключая текущую модель).
 */
export async function handleUpdateServerModel(ctx: PanelContext, serverId: string, model: ServerModel): Promise<void> {
    try {
        const servers = ctx.extensionContext.workspaceState.get<LLMServer[]>('llmServers') || [];
        const serverIndex = servers.findIndex(s => s.id === serverId);

        if (serverIndex === -1) {
            throw new Error('Сервер не найден');
        }

        if (!servers[serverIndex].models) {
            servers[serverIndex].models = [];
        }

        const modelIndex = servers[serverIndex].models!.findIndex(m => m.id === model.id || m.name === model.name);

        // Проверка обязательности и уникальности названия модели
        if (!model.displayName || !model.displayName.trim()) {
            throw new Error('Пользовательское наименование модели обязательно для заполнения');
        }
        const modelDisplayName = model.displayName.trim();

        // Проверяем уникальность среди всех моделей всех серверов (исключая текущую модель)
        for (const server of servers) {
            if (server.models) {
                for (const existingModel of server.models) {
                    if (modelIndex !== -1 && existingModel.id === servers[serverIndex].models![modelIndex].id) {
                        continue;
                    }
                    const existingDisplayName = existingModel.displayName?.trim() || existingModel.name.trim();
                    if (existingDisplayName.toLowerCase() === modelDisplayName.toLowerCase()) {
                        throw new Error(`Модель с названием "${modelDisplayName}" уже существует`);
                    }
                }
            }
        }

        if (modelIndex === -1) {
            if (!model.id) {
                model.id = `model-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            }
            servers[serverIndex].models!.push({
                ...model,
                displayName: modelDisplayName
            });
        } else {
            const existingModel = servers[serverIndex].models![modelIndex];
            servers[serverIndex].models![modelIndex] = {
                ...existingModel,
                ...model,
                name: existingModel.name, // Сохраняем оригинальное имя модели
                displayName: modelDisplayName
            };
        }

        await ctx.extensionContext.workspaceState.update('llmServers', servers);

        ctx.panel.webview.postMessage({
            command: 'serverModelUpdated',
            serverId: serverId,
            model: model
        });

        handleGetActiveModels(ctx);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
        ctx.panel.webview.postMessage({
            command: 'serverModelUpdateError',
            serverId: serverId,
            error: errorMessage
        });
    }
}

/**
 * Переключение активности модели сервера
 */
export async function handleToggleModelActive(ctx: PanelContext, serverId: string, modelId: string, active: boolean): Promise<void> {
    try {
        const servers = ctx.extensionContext.workspaceState.get<LLMServer[]>('llmServers') || [];
        const serverIndex = servers.findIndex(s => s.id === serverId);

        if (serverIndex === -1) {
            throw new Error('Сервер не найден');
        }

        if (!servers[serverIndex].models) {
            throw new Error('Модели не найдены');
        }

        const modelIndex = servers[serverIndex].models!.findIndex(m => m.id === modelId || m.name === modelId);

        if (modelIndex === -1) {
            throw new Error('Модель не найдена');
        }

        servers[serverIndex].models![modelIndex].active = active;
        await ctx.extensionContext.workspaceState.update('llmServers', servers);

        ctx.panel.webview.postMessage({
            command: 'modelActiveToggled',
            serverId: serverId,
            modelId: modelId,
            active: active
        });

        handleGetActiveModels(ctx);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
        ctx.panel.webview.postMessage({
            command: 'modelToggleError',
            serverId: serverId,
            modelId: modelId,
            error: errorMessage
        });
    }
}

/**
 * Сохранение выбранных моделей в globalState.
 * @param selections - объект с ключами generationModel, embedderModel, summarizeModel (формат serverId:modelId)
 */
export async function handleSaveSelectedModels(
    ctx: PanelContext,
    selections: { generationModel?: string; embedderModel?: string; summarizeModel?: string }
): Promise<void> {
    try {
        if (selections.generationModel !== undefined) {
            await ctx.extensionContext.globalState.update(STORAGE_KEYS.SELECTED_GENERATION_MODEL, selections.generationModel);
        }
        if (selections.embedderModel !== undefined) {
            await ctx.extensionContext.globalState.update(STORAGE_KEYS.SELECTED_EMBEDDER_MODEL, selections.embedderModel);
        }
        if (selections.summarizeModel !== undefined) {
            await ctx.extensionContext.globalState.update(STORAGE_KEYS.SELECTED_SUMMARIZE_MODEL, selections.summarizeModel);
        }
        Logger.info('Выбранные модели сохранены', selections);
    } catch (error) {
        Logger.error('Ошибка сохранения выбранных моделей', error as Error);
    }
}

/**
 * Получение сохранённых выбранных моделей из globalState и отправка в webview
 */
export function handleGetSelectedModels(ctx: PanelContext): void {
    const selections = {
        generationModel: ctx.extensionContext.globalState.get<string>(STORAGE_KEYS.SELECTED_GENERATION_MODEL) || '',
        embedderModel: ctx.extensionContext.globalState.get<string>(STORAGE_KEYS.SELECTED_EMBEDDER_MODEL) || '',
        summarizeModel: ctx.extensionContext.globalState.get<string>(STORAGE_KEYS.SELECTED_SUMMARIZE_MODEL) || ''
    };

    ctx.panel.webview.postMessage({
        command: 'selectedModels',
        selections: selections
    });
}
