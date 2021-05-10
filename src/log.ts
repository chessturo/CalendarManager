import pino from 'pino';

const logger = pino();

// Get the log level from the environment, set a default if one isn't provided
const DEFAULT_LOG_LEVEL_NAME = 'warn';
let logLevel: string = process.env.LOG_LEVEL ?? DEFAULT_LOG_LEVEL_NAME;

// Check to make sure that the environment LOG_LEVEL is a valid log level, use the default if not.
if (!Object.prototype.hasOwnProperty.call(logger.levels.values, logLevel)) {
    logger.warn('log.invalidLogLevel');
    logLevel = DEFAULT_LOG_LEVEL_NAME;
}

logger.level = logLevel;

const LOG_LEVEL = logLevel;
export { logger, LOG_LEVEL };
