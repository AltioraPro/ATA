import helmet from "helmet";
import cors from "cors";
import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { logger } from "./errorHandler";

// Rate limiting store (simple in-memory for now)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export const securityMiddleware = [
  // Helmet for security headers
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }),

  // CORS configuration
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),

  // Rate limiting middleware
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
      success: false,
      error: {
        error: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests from this IP, please try again later.",
      },
    },
    standardHeaders: true,
    legacyHeaders: false,
  }),

  // Request logging middleware (only log errors in production)
  (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    res.on("finish", () => {
      const duration = Date.now() - start;
      // Only log errors in production, all requests in development
      if (env.NODE_ENV === "production") {
        if (res.statusCode >= 400) {
          logger.warn("Request error", {
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            duration,
          });
        }
      } else {
        logger.info("Request", {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration,
        });
      }
    });

    next();
  },

  // Body size limits
  (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.headers["content-length"] || "0");

    if (contentLength > 1024 * 1024) {
      // 1MB limit
      return res.status(413).json({
        success: false,
        error: {
          error: "PAYLOAD_TOO_LARGE",
          message: "Request payload too large",
        },
      });
    }

    next();
  },
];

// Simple rate limiting implementation
function rateLimit(options: {
  windowMs: number;
  max: number;
  message: any;
  standardHeaders: boolean;
  legacyHeaders: boolean;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.connection.remoteAddress || "unknown";
    const now = Date.now();
    const windowStart = now - options.windowMs;

    // Clean up old entries
    for (const [k, v] of rateLimitStore.entries()) {
      if (v.resetTime < now) {
        rateLimitStore.delete(k);
      }
    }

    const current = rateLimitStore.get(key);
    if (!current || current.resetTime < now) {
      rateLimitStore.set(key, { count: 1, resetTime: now + options.windowMs });
    } else {
      current.count++;
      if (current.count > options.max) {
        if (options.standardHeaders) {
          res.set("X-RateLimit-Limit", options.max.toString());
          res.set("X-RateLimit-Remaining", "0");
          res.set("X-RateLimit-Reset", current.resetTime.toString());
        }
        return res.status(429).json(options.message);
      }
    }

    next();
  };
}
