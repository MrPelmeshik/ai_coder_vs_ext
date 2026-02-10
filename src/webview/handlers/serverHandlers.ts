import * as vscode from 'vscode';
import { PanelContext } from '../panelContext';
import { LLMServer } from '../../types/servers';
import { OpenAiCompatibleProvider } from '../../providers/openAiCompatibleProvider';
import { OllamaProvider } from '../../providers/ollamaProvider';
import { Logger } from '../../utils/logger';
import { handleGetActiveModels } from './modelHandlers';

/**
 * Получение списка серверов из хранилища и отправка в webview
 */
export async function handleGetServers(ctx: PanelContext): Promise<void> {
    try {
        const servers = ctx.extensionContext.workspaceState.get<LLMServer[]>('llmServers') || [];
        Logger.info(`Отправка списка серверов в webview, количество: ${servers.length}`);
        Logger.info(`Детали серверов:`, servers.map(s => ({ id: s.id, name: s.name, active: s.active })));
        ctx.panel.webview.postMessage({
            command: 'serversList',
            servers: servers
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
        Logger.error('Ошибка получения списка серверов', error as Error);
        ctx.panel.webview.postMessage({
            command: 'serversList',
            servers: [],
            error: errorMessage
        });
    }
}

/**
 * Добавление нового сервера LLM
 */
export async function handleAddServer(ctx: PanelContext, serverData: { name: string; url: string; apiKey?: string }): Promise<void> {
    try {
        Logger.info(`Добавление сервера: ${serverData.name}, URL: ${serverData.url}`);
        const servers = ctx.extensionContext.workspaceState.get<LLMServer[]>('llmServers') || [];

        // Проверка уникальности имени сервера
        const trimmedName = serverData.name.trim();
        if (!trimmedName) {
            throw new Error('Имя сервера не может быть пустым');
        }

        const existingServer = servers.find(s => s.name.trim().toLowerCase() === trimmedName.toLowerCase());
        if (existingServer) {
            throw new Error(`Сервер с именем "${trimmedName}" уже существует`);
        }

        const newServer: LLMServer = {
            id: `server-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: trimmedName,
            url: serverData.url,
            apiKey: serverData.apiKey,
            active: true,
            status: 'unavailable'
        };
        servers.push(newServer);
        await ctx.extensionContext.workspaceState.update('llmServers', servers);

        Logger.info(`Сервер успешно добавлен, ID: ${newServer.id}`);
        Logger.info(`Всего серверов в хранилище: ${servers.length}`);

        ctx.panel.webview.postMessage({
            command: 'serverAdded',
            server: newServer
        });

        // Отправляем обновленный список серверов с небольшой задержкой
        setTimeout(() => {
            Logger.info(`Отправка обновленного списка серверов, количество: ${servers.length}`);
            ctx.panel.webview.postMessage({
                command: 'serversList',
                servers: servers
            });
            handleGetActiveModels(ctx);
        }, 50);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
        Logger.error('Ошибка добавления сервера', error as Error);
        ctx.panel.webview.postMessage({
            command: 'serverAddError',
            error: errorMessage
        });
    }
}

/**
 * Обновление существующего сервера LLM
 */
export async function handleUpdateServer(ctx: PanelContext, serverId: string, serverData: { name: string; url: string; apiKey?: string }): Promise<void> {
    try {
        const servers = ctx.extensionContext.workspaceState.get<LLMServer[]>('llmServers') || [];
        const serverIndex = servers.findIndex(s => s.id === serverId);

        if (serverIndex === -1) {
            throw new Error('Сервер не найден');
        }

        // Проверка уникальности имени сервера (исключая текущий сервер)
        const trimmedName = serverData.name.trim();
        if (!trimmedName) {
            throw new Error('Имя сервера не может быть пустым');
        }

        const existingServer = servers.find(s => s.id !== serverId && s.name.trim().toLowerCase() === trimmedName.toLowerCase());
        if (existingServer) {
            throw new Error(`Сервер с именем "${trimmedName}" уже существует`);
        }

        servers[serverIndex] = {
            ...servers[serverIndex],
            name: trimmedName,
            url: serverData.url,
            apiKey: serverData.apiKey
        };

        await ctx.extensionContext.workspaceState.update('llmServers', servers);

        ctx.panel.webview.postMessage({
            command: 'serverUpdated',
            server: servers[serverIndex]
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
            command: 'serverUpdateError',
            error: errorMessage
        });
    }
}

/**
 * Удаление сервера LLM
 */
export async function handleDeleteServer(ctx: PanelContext, serverId: string): Promise<void> {
    try {
        const servers = ctx.extensionContext.workspaceState.get<LLMServer[]>('llmServers') || [];
        const filteredServers = servers.filter(s => s.id !== serverId);
        await ctx.extensionContext.workspaceState.update('llmServers', filteredServers);

        ctx.panel.webview.postMessage({
            command: 'serverDeleted',
            serverId: serverId
        });

        setTimeout(() => {
            ctx.panel.webview.postMessage({
                command: 'serversList',
                servers: filteredServers
            });
            handleGetActiveModels(ctx);
        }, 50);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
        ctx.panel.webview.postMessage({
            command: 'serverDeleteError',
            error: errorMessage
        });
    }
}

/**
 * Проверка подключения к серверу
 */
export async function handleCheckServer(ctx: PanelContext, serverId: string, url: string, _apiKey?: string): Promise<void> {
    try {
        const provider = new OpenAiCompatibleProvider();
        const available = await provider.checkAvailability(url);

        ctx.panel.webview.postMessage({
            command: 'serverCheckResult',
            serverId: serverId,
            available: available
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
        ctx.panel.webview.postMessage({
            command: 'serverCheckError',
            serverId: serverId,
            error: errorMessage
        });
    }
}

/**
 * Проверка доступности локального сервера (Ollama или OpenAI-совместимый)
 */
export async function handleCheckLocalServer(ctx: PanelContext, url: string, provider: string): Promise<void> {
    try {
        let available = false;
        if (provider === 'ollama') {
            const providerInstance = new OllamaProvider();
            available = await providerInstance.checkAvailability(url);
        } else if (provider === 'openai') {
            const providerInstance = new OpenAiCompatibleProvider();
            available = await providerInstance.checkAvailability(url);
        }

        ctx.panel.webview.postMessage({
            command: 'localServerStatus',
            available: available
        });
    } catch (error) {
        ctx.panel.webview.postMessage({
            command: 'localServerStatus',
            available: false
        });
    }
}

/**
 * Переключение активности сервера
 */
export async function handleToggleServerActive(ctx: PanelContext, serverId: string, active: boolean): Promise<void> {
    try {
        const servers = ctx.extensionContext.workspaceState.get<LLMServer[]>('llmServers') || [];
        const serverIndex = servers.findIndex(s => s.id === serverId);

        if (serverIndex === -1) {
            throw new Error('Сервер не найден');
        }

        servers[serverIndex].active = active;
        await ctx.extensionContext.workspaceState.update('llmServers', servers);

        ctx.panel.webview.postMessage({
            command: 'serverActiveToggled',
            serverId: serverId,
            active: active
        });

        handleGetActiveModels(ctx);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
        ctx.panel.webview.postMessage({
            command: 'serverToggleError',
            serverId: serverId,
            error: errorMessage
        });
    }
}
