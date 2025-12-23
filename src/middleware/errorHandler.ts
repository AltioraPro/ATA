import { Request, Response, NextFunction } from 'express';
import { ApiFailure } from '../types/api';
import winston from 'winston';

// Configure Winston logger
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'altiora-backend' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    // Add file transport for production
    ...(process.env.NODE_ENV === 'production'
      ? [
          new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
          }),
          new winston.transports.File({
            filename: 'logs/combined.log',
          }),
        ]
      : []),
  ],
});

export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Log the error
  logger.error('Unhandled error:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    body: req.body,
    params: req.params,
    query: req.query,
  });

  // Determine status code
  let statusCode = 500;
  let errorCode = 'INTERNAL_SERVER_ERROR';

  if (error.message.includes('not found') || error.message.includes('Not found')) {
    statusCode = 404;
    errorCode = 'NOT_FOUND';
  } else if (error.message.includes('validation') || error.message.includes('invalid')) {
    statusCode = 400;
    errorCode = 'BAD_REQUEST';
  } else if (error.message.includes('unauthorized') || error.message.includes('Unauthorized')) {
    statusCode = 401;
    errorCode = 'UNAUTHORIZED';
  } else if (error.message.includes('forbidden') || error.message.includes('Forbidden')) {
    statusCode = 403;
    errorCode = 'FORBIDDEN';
  }

  const response: ApiFailure = {
    success: false,
    error: {
      error: errorCode,
      message: process.env.NODE_ENV === 'production'
        ? 'An error occurred while processing your request'
        : error.message,
      details: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
    },
  };

  res.status(statusCode).json(response);
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
