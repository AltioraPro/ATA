import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ApiFailure } from '../types/api';

export function validateRequest<T>(
  schema: z.ZodSchema<T>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = schema.parse(req.body);
      req.body = validatedData;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const response: ApiFailure = {
          success: false,
          error: {
            error: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors.map(err => ({
              field: err.path.join('.'),
              message: err.message,
            })),
          },
        };

        res.status(400).json(response);
        return;
      }

      next(error);
    }
  };
}

export function validateParams<T>(
  schema: z.ZodSchema<T>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = schema.parse(req.params);
      req.params = validatedData as any;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const response: ApiFailure = {
          success: false,
          error: {
            error: 'VALIDATION_ERROR',
            message: 'Invalid URL parameters',
            details: error.errors.map(err => ({
              field: err.path.join('.'),
              message: err.message,
            })),
          },
        };

        res.status(400).json(response);
        return;
      }

      next(error);
    }
  };
}
