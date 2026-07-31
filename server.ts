import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import 'dotenv/config';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { connectDB } from './server/db.js';
import { getBot, initializeBot } from './server/bot.js';
import { apiRouter, apiRateLimiter } from './server/api.js';
import { initializeAllMirrorBots, handleMirrorBotWebhook } from './server/mirrorBotManager.js';

async function startServer() {
  await connectDB();
  await initializeBot();
  await initializeAllMirrorBots();

  const app = express();
  const PORT = 3000;

  // Security headers with Helmet
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:  ["'self'", "https:"],
        scriptSrc:   ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://telegram.org", "https://pagead2.googlesyndication.com"],
        styleSrc:    ["'self'", "'unsafe-inline'"],
        imgSrc:      ["'self'", "data:", "https:"],
        connectSrc:  ["'self'", "https:", "wss:", "http:", "ws:"],
        frameSrc:    ["'self'", "https:", "http:"],
      }
    },
    hsts:                  { maxAge: 63072000, includeSubDomains: true },
    frameguard:            false, // Required false to let the app run within the AI Studio preview iframe!
    referrerPolicy:        { policy: "strict-origin-when-cross-origin" },
    xContentTypeOptions:   true,
    xPoweredBy:            false,    // Hide X-Powered-By header
  }));

  // CORS configuration allowing production domains, local development, and dynamic AI Studio preview domains
  const allowedOrigins = [
    "https://69childreninmybasement.vercel.app",
    "https://your-actual-domain.com"
  ];
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const isAllowed = allowedOrigins.includes(origin) || 
                        origin.includes("localhost") || 
                        origin.includes("127.0.0.1") || 
                        origin.includes("ais-dev-") || 
                        origin.includes("ais-pre-") || 
                        origin.includes("run.app");
      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "x-telegram-id", "x-telegram-init-data"],
  }));

  app.use(cookieParser());
  app.use(express.json());

  // Global rate limiter on all API routes except telegram webhook endpoints
  app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/telegram/webhook')) {
      return next();
    }
    return apiRateLimiter(req, res, next);
  });

  // Webhook for Telegram
  const bot = getBot();
  if (bot) {
    app.post('/api/telegram/webhook', (req, res) => {
      const updateId = req.body?.update_id;
      const message = req.body?.message;
      const callbackQuery = req.body?.callback_query;
      const fromUser = message?.from || callbackQuery?.from;
      const text = message?.text || "";
      const chatId = message?.chat?.id || callbackQuery?.message?.chat?.id;
      const chatType = message?.chat?.type || callbackQuery?.message?.chat?.type;

      console.log(
        `[Webhook Update] [server.ts] Received update ID: ${updateId || 'unknown'} | Chat: ${chatId || 'unknown'} (${chatType || 'unknown'}) | User: ${fromUser?.username || 'unknown'} (${fromUser?.id || 'unknown'}) | Text: "${text.substring(0, 50)}"`
      );

      bot.handleUpdate(req.body, res).catch((err: any) => {
        console.error(`[Webhook Update Error] [server.ts] Failed handling update ID: ${updateId}:`, err);
        if (!res.headersSent) res.sendStatus(500);
      });
    });
  }

  // Webhook for Mirror Bots
  app.post('/api/telegram/webhook/mirror/*', (req, res) => {
    const prefix = '/api/telegram/webhook/mirror/';
    const token = req.path.substring(req.path.indexOf(prefix) + prefix.length);
    if (!token) {
      return res.status(400).send("No token supplied");
    }

    const updateId = req.body?.update_id;
    const message = req.body?.message;
    const callbackQuery = req.body?.callback_query;
    const fromUser = message?.from || callbackQuery?.from;
    const text = message?.text || "";

    console.log(
      `[Mirror Webhook] Received update ID: ${updateId || 'unknown'} | Token: ${token.substring(0, 10)}... | User: ${fromUser?.username || 'unknown'} | Text: "${text.substring(0, 50)}"`
    );

    handleMirrorBotWebhook(token, req.body, res).catch((err: any) => {
      console.error(`[Webhook Update Error] Mirror Bot token ${token ? token.substring(0, 10) : ''}... Error:`, err);
      if (!res.headersSent) res.sendStatus(200);
    });
  });

  // Use separated API routes
  app.use(apiRouter);

  // --- VITE MIDDLEWARES ---

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Export for Vercel/Serverless
  if (process.env.VERCEL) {
    return app;
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
  
  return app;
}

export default startServer();
