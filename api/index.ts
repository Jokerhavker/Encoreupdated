import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import 'dotenv/config';

import { connectDB } from '../server/db.js';
import { getBot, initializeBot } from '../server/bot.js';
import { apiRouter } from '../server/api.js';

let app: express.Express | null = null;

async function init() {
  if (app) return app;
  
  await connectDB();
  await initializeBot();

  app = express();
  app.use(cors());
  app.use(express.json());

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
        `[Webhook Update] [api/index.ts] Received update ID: ${updateId || 'unknown'} | Chat: ${chatId || 'unknown'} (${chatType || 'unknown'}) | User: ${fromUser?.username || 'unknown'} (${fromUser?.id || 'unknown'}) | Text: "${text.substring(0, 50)}"`
      );

      bot.handleUpdate(req.body, res).catch((err: any) => {
         console.error(`[Webhook Update Error] [api/index.ts] Failed handling update ID: ${updateId}:`, err);
         if (!res.headersSent) res.sendStatus(500);
      });
    });
  }

  // To properly support Vercel, attach all the dashboard APIs
  app.use(apiRouter);
  
  return app;
}

export default async function handler(req: any, res: any) {
  const application = await init();
  return application(req, res);
}
