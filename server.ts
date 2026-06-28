import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProd = process.env.NODE_ENV === 'production';

async function createServer() {
  const app = express();
  const port = 3000;

  app.use(cors());
  app.use(express.json());

  // Lazy initialization of Gemini client
  let genAI: GoogleGenAI | null = null;

  function getGenAI() {
    if (!genAI) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY environment variable is required');
      }
      genAI = new GoogleGenAI({ apiKey });
    }
    return genAI;
  }

  // Chat API route
  app.post('/chat', async (req: Request, res: Response) => {
    try {
      const { message } = req.body;

      if (!message) {
         res.status(400).json({ error: 'Message is required' });
         return;
      }

      const ai = getGenAI();
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: message,
      });

      res.json({ reply: response.text });
    } catch (error: any) {
      console.error('Chat error:', error);
      res.status(500).json({ 
        error: 'Failed to generate response', 
        details: error.message 
      });
    }
  });

  if (!isProd) {
    // In development: use Vite middleware
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    
    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    // In production: serve static files
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
  });
}

createServer();
