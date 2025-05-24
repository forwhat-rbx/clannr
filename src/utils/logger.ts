import { consoleMagenta, consoleGreen, consoleYellow, consoleRed, consoleClear } from '../handlers/locale';
import * as fs from 'fs';
import * as path from 'path';

// Define log levels with their respective colors
export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    FATAL = 4
}

// Configuration for the logger
interface LoggerConfig {
    minLevel: LogLevel;
    logToFile: boolean;
    logDir: string;
    maxFileSizeMB: number;
}

const DEFAULT_CONFIG: LoggerConfig = {
    minLevel: LogLevel.DEBUG,
    logToFile: true,
    logDir: path.resolve(process.cwd(), 'logs', 'system'),
    maxFileSizeMB: 10
};

// Current logger configuration
let config: LoggerConfig = { ...DEFAULT_CONFIG };

/**
 * Format a log message with timestamp, level, and context
 */
function formatLogMessage(level: LogLevel, message: string, context?: string, error?: Error): string {
    const timestamp = new Date().toISOString();
    const levelName = LogLevel[level].padEnd(5);
    const contextStr = context ? `[${context}]` : '';
    let formattedMessage = `${timestamp} ${levelName} ${contextStr} ${message}`;

    if (error) {
        formattedMessage += `\n${error.stack || error.message}`;
    }

    return formattedMessage;
}

/**
 * Get console color for log level
 */
function getColorForLevel(level: LogLevel): string {
    switch (level) {
        case LogLevel.DEBUG: return consoleMagenta;
        case LogLevel.INFO: return consoleGreen;
        case LogLevel.WARN: return consoleYellow;
        case LogLevel.ERROR: return consoleRed;
        case LogLevel.FATAL: return consoleRed;
        default: return '';
    }
}

/**
 * Log to console with appropriate color
 */
function logToConsole(level: LogLevel, message: string, context?: string, error?: Error): void {
    if (level < config.minLevel) return;

    const color = getColorForLevel(level);
    const logMessage = formatLogMessage(level, message, context, error);

    if (level >= LogLevel.ERROR) {
        console.error(`${color}${logMessage}${consoleClear}`);
    } else if (level === LogLevel.WARN) {
        console.warn(`${color}${logMessage}${consoleClear}`);
    } else {
        console.log(`${color}${logMessage}${consoleClear}`);
    }
}

/**
 * Write log to file
 */
function writeToFile(level: LogLevel, message: string, context?: string, error?: Error): void {
    if (!config.logToFile || level < config.minLevel) return;

    try {
        // Create log directory if it doesn't exist
        if (!fs.existsSync(config.logDir)) {
            fs.mkdirSync(config.logDir, { recursive: true });
        }

        const today = new Date().toISOString().split('T')[0];
        const logFile = path.join(config.logDir, `${today}.log`);

        // Check file size and rotate if necessary
        let shouldRotate = false;
        if (fs.existsSync(logFile)) {
            const stats = fs.statSync(logFile);
            const fileSizeMB = stats.size / (1024 * 1024);
            if (fileSizeMB >= config.maxFileSizeMB) {
                shouldRotate = true;
            }
        }

        if (shouldRotate) {
            const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
            fs.renameSync(logFile, path.join(config.logDir, `${today}-${timestamp}.log`));
        }

        // Append log message to file
        const logMessage = formatLogMessage(level, message, context, error) + '\n';
        fs.appendFileSync(logFile, logMessage);
    } catch (err) {
        // Fall back to console if file logging fails
        console.error(`Failed to write to log file: ${err.message}`);
    }
}

/**
 * Configure the logger
 */
export function configure(options: Partial<LoggerConfig>): void {
    config = { ...config, ...options };
}

/**
 * Main logger functions
 */
export const Logger = {
    debug: (message: string, context?: string, error?: Error) => {
        logToConsole(LogLevel.DEBUG, message, context, error);
        writeToFile(LogLevel.DEBUG, message, context, error);
    },

    info: (message: string, context?: string, error?: Error) => {
        logToConsole(LogLevel.INFO, message, context, error);
        writeToFile(LogLevel.INFO, message, context, error);
    },

    warn: (message: string, context?: string, error?: Error) => {
        logToConsole(LogLevel.WARN, message, context, error);
        writeToFile(LogLevel.WARN, message, context, error);
    },

    error: (message: string, context?: string, error?: Error) => {
        logToConsole(LogLevel.ERROR, message, context, error);
        writeToFile(LogLevel.ERROR, message, context, error);
    },

    fatal: (message: string, context?: string, error?: Error) => {
        logToConsole(LogLevel.FATAL, message, context, error);
        writeToFile(LogLevel.FATAL, message, context, error);
    }
};