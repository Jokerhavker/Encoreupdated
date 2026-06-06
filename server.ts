import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import 'dotenv/config';
import mongoose from 'mongoose';

import { connectDB } from './server/db.js';
import { getBot, initializeBot } from './server/bot.js';
import { apiRouter } from './server/api.js';
import { initializeAllMirrorBots } from './server/mirrorBotManager.js';

async function startServer() {
  await connectDB();
  await initializeBot();
  await initializeAllMirrorBots();

  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

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
