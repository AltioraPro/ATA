import "dotenv/config";
import express from "express";
import { env } from "./config/env";
import { securityMiddleware } from "./middleware/security";
import { errorHandler, logger } from "./middleware/errorHandler";
import accountRoutes from "./routes/accounts";
import syncRoutes from "./routes/sync";

const app = express();

// Apply security middleware first
app.use(securityMiddleware);

// Body parsing middleware
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "altiora-backend",
  });
});

// API routes
app.use("/api/accounts", accountRoutes);
app.use("/api/accounts", syncRoutes);

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      error: "NOT_FOUND",
      message: `Route ${req.originalUrl} not found`,
    },
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
const server = app.listen(env.PORT, () => {
  logger.info(`Server running on port ${env.PORT}`, {
    port: env.PORT,
    environment: env.NODE_ENV,
  });
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  server.close(() => {
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully");
  server.close(() => {
    process.exit(0);
  });
});

export default app;
