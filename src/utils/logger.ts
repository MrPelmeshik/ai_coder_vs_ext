import * as vscode from 'vscode';

/**
 * Уровни логирования
 */
export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

/**
 * Централизованный логгер для расширения
 */
export class Logger {
    private static outputChannel: vscode.OutputChannel | undefined;
    private static logLevel: LogLevel = LogLevel.INFO;

    /**
     * Инициализация логгера
     */
    static initialize(context: vscode.ExtensionContext): void {
        this.outputChannel = vscode.window.createOutputChannel('AI Coder');
        const config = vscode.workspace.getConfiguration('aiCoder');
        const levelName = config.get<string>('logLevel');
        // Если logLevel не задан в настройках, используем INFO по умолчанию
        // (это внутренняя настройка логирования, не критична для работы расширения)
        if (levelName) {
            this.logLevel = LogLevel[levelName.toUpperCase() as keyof typeof LogLevel] ?? LogLevel.INFO;
        } else {
            this.logLevel = LogLevel.INFO;
        }
    }

    /**
     * Логирование отладочной информации
     */
    static debug(message: string, ...args: unknown[]): void {
        if (this.logLevel <= LogLevel.DEBUG) {
            this.log('DEBUG', message, args);
        }
    }

    /**
     * Логирование информационных сообщений
     */
    static info(message: string, ...args: unknown[]): void {
        if (this.logLevel <= LogLevel.INFO) {
            this.log('INFO', message, args);
        }
    }

    /**
     * Логирование предупреждений
     */
    static warn(message: string, ...args: unknown[]): void {
        if (this.logLevel <= LogLevel.WARN) {
            this.log('WARN', message, args);
        }
    }

    /**
     * Логирование ошибок
     */
    static error(message: string, error?: Error, ...args: unknown[]): void {
        if (this.logLevel <= LogLevel.ERROR) {
            this.log('ERROR', message, args);
            if (error) {
                this.log('ERROR', error.stack || error.message, []);
            }
        }
    }

    /**
     * Внутренний метод логирования
     */
    private static log(level: string, message: string, args: unknown[]): void {
        const timestamp = new Date().toISOString();
        const formattedMessage = args.length > 0 
            ? `${message} ${JSON.stringify(args)}`
            : message;
        
        const logLine = `[${timestamp}] [${level}] ${formattedMessage}`;
        
        // Всегда выводим в консоль для отладки (даже если outputChannel не инициализирован)
        try {
            console.log(logLine);
        } catch (e) {
            // Игнорируем ошибки консоли
        }
        
        if (this.outputChannel) {
            try {
                this.outputChannel.appendLine(logLine);
            } catch (e) {
                console.error(`[Logger] Ошибка записи в outputChannel: ${e}`);
            }
        } else {
            // Если outputChannel не инициализирован, выводим предупреждение в консоль
            try {
                console.warn(`[Logger] outputChannel не инициализирован! Логирование только в консоль: ${logLine}`);
            } catch (e) {
                // Игнорируем ошибки консоли
            }
        }
    }

    /**
     * Очистка ресурсов
     */
    static dispose(): void {
        this.outputChannel?.dispose();
        this.outputChannel = undefined;
    }
}

