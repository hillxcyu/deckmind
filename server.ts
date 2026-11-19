/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import express from "express";
import { createServer } from "http";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";
import path from "path";
import fs from "fs";
import pg from "pg";
const { Pool } = pg;
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { fileURLToPath } from "url";
import { createSearchAgent, createDeckAgent, createMainAgent } from "./src/services/agentSystem";
import { getFlashModel, getImageModel } from "./src/utils/env";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const PORT = process.env.PORT || 3100;

  // Initialize Database (PostgreSQL)
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  // Create tables (PostgreSQL compatible)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_admin BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS decks (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      user_id INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      slides JSONB,
      style JSONB,
      messages JSONB,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS images (
      id SERIAL PRIMARY KEY,
      data TEXT NOT NULL, -- Base64 string
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT NOT NULL, -- pending, processing, completed, failed
      result JSONB,
      error TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id SERIAL PRIMARY KEY,
      filename TEXT,
      mime_type TEXT NOT NULL,
      data TEXT NOT NULL, -- Base64 string
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  app.use(express.json({ limit: '200mb' }));

  // Helper to get AI client (Vertex or API Key)
  const getAIClient = () => {
    if (process.env.GEMINI_API_KEY) {
      return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
    return new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || '',
      location: process.env.GOOGLE_CLOUD_LOCATION || process.env.GCLOUD_LOCATION || 'us-central1',
    });
  };

  // --- Authentication Middleware ---
  const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key-change-me";

  const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) return res.sendStatus(403);
      req.user = user;
      next();
    });
  };

  // --- Auth Routes ---

  app.get("/api/setup-status", async (req, res) => {
    try {
      const result = await pool.query('SELECT COUNT(*) as count FROM users');
      res.json({ needsSetup: parseInt(result.rows[0].count) === 0 });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/setup", async (req, res) => {
    try {
      const result = await pool.query('SELECT COUNT(*) as count FROM users');
      if (parseInt(result.rows[0].count) > 0) return res.status(403).json({ error: "Setup already completed" });

      const { username, password } = req.body;
      const hashedPassword = await bcrypt.hash(password, 10);
      
      const insertResult = await pool.query(
        'INSERT INTO users (username, password_hash, is_admin) VALUES ($1, $2, TRUE) RETURNING id',
        [username, hashedPassword]
      );
      const userId = insertResult.rows[0].id;
      
      await pool.query('UPDATE decks SET user_id = $1 WHERE user_id IS NULL', [userId]);

      const token = jwt.sign({ id: userId, username, is_admin: true }, JWT_SECRET);
      res.json({ token, user: { id: userId, username, is_admin: true } });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
      const user = result.rows[0];
      
      if (!user || !await bcrypt.compare(password, user.password_hash)) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const token = jwt.sign({ id: user.id, username: user.username, is_admin: !!user.is_admin }, JWT_SECRET);
      res.json({ token, user: { id: user.id, username: user.username, is_admin: !!user.is_admin } });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/users", authenticateToken, async (req: any, res) => {
    if (!req.user.is_admin) return res.sendStatus(403);
    try {
      const result = await pool.query('SELECT id, username, is_admin, created_at FROM users');
      res.json(result.rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/users", authenticateToken, async (req: any, res) => {
    if (!req.user.is_admin) return res.sendStatus(403);
    try {
      const { username, password, is_admin } = req.body;
      const hashedPassword = await bcrypt.hash(password, 10);
      await pool.query(
        'INSERT INTO users (username, password_hash, is_admin) VALUES ($1, $2, $3)',
        [username, hashedPassword, is_admin ? true : false]
      );
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/users/:id", authenticateToken, async (req: any, res) => {
    if (!req.user.is_admin) return res.sendStatus(403);
    if (req.user.id === parseInt(req.params.id)) return res.status(400).json({ error: "Cannot delete yourself" });
    
    try {
      await pool.query('DELETE FROM decks WHERE user_id = $1', [req.params.id]);
      await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/decks", authenticateToken, async (req: any, res) => {
    try {
      const result = await pool.query(
        'SELECT id, title, created_at, updated_at FROM decks WHERE user_id = $1 ORDER BY updated_at DESC',
        [req.user.id]
      );
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/images/:id", async (req, res) => {
    try {
      const result = await pool.query('SELECT data FROM images WHERE id = $1', [req.params.id]);
      const image = result.rows[0];
      if (image) {
        const matches = image.data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const type = matches[1];
          const buffer = Buffer.from(matches[2], 'base64');
          res.writeHead(200, {
            'Content-Type': type,
            'Content-Length': buffer.length
          });
          res.end(buffer);
        } else {
          res.send(image.data);
        }
      } else {
        res.status(404).send("Image not found");
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/decks/:id", authenticateToken, async (req: any, res) => {
    try {
      const result = await pool.query(
        'SELECT * FROM decks WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );
      const deck = result.rows[0];
      if (deck) {
        res.json(deck);
      } else {
        res.status(404).json({ error: "Deck not found" });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/decks", authenticateToken, async (req: any, res) => {
    try {
      const { title, slides, style, messages } = req.body;
      const result = await pool.query(
        'INSERT INTO decks (title, user_id, slides, style, messages) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [title, req.user.id, JSON.stringify(slides), JSON.stringify(style), JSON.stringify(messages)]
      );
      res.json({ id: result.rows[0].id, success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/decks/:id", authenticateToken, async (req: any, res) => {
    try {
      const { title, slides, style, messages } = req.body;
      const result = await pool.query(
        'UPDATE decks SET title = $1, slides = $2, style = $3, messages = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5 AND user_id = $6',
        [title, JSON.stringify(slides), JSON.stringify(style), JSON.stringify(messages), req.params.id, req.user.id]
      );
      if (result.rowCount && result.rowCount > 0) res.json({ success: true });
      else res.status(404).json({ error: "Deck not found or access denied" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/decks/:id", authenticateToken, async (req: any, res) => {
    try {
      const result = await pool.query(
        'DELETE FROM decks WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );
      if (result.rowCount && result.rowCount > 0) res.json({ success: true });
      else res.status(404).json({ error: "Deck not found or access denied" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Helper to hydrate attachments from DB
  const hydrateAttachments = async (content: any) => {
    if (!content) return content;
    
    if (Array.isArray(content)) {
      const hydrated = [];
      for (const item of content) {
        hydrated.push(await hydrateAttachments(item));
      }
      return hydrated;
    }
    
    if (content.attachmentId) {
      const result = await pool.query('SELECT mime_type, data FROM attachments WHERE id = $1', [content.attachmentId]);
      const attachment = result.rows[0];
      if (attachment) {
        return {
          inlineData: {
            mimeType: attachment.mime_type,
            data: attachment.data
          }
        };
      } else {
        console.warn(`Attachment ${content.attachmentId} not found`);
        return { text: "[Attachment not found]" };
      }
    }
    
    if (content.parts && Array.isArray(content.parts)) {
      const parts = [];
      for (const p of content.parts) {
        parts.push(await hydrateAttachments(p));
      }
      return { ...content, parts };
    }

    return content;
  };

  // Background Job Processor
  const processImageJob = async (jobId: number, prompt: string, imageResolution: string) => {
    try {
      await pool.query('UPDATE jobs SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['processing', jobId]);
      
      const ai = getAIClient();
      const response = await ai.models.generateContent({
        model: getImageModel(),
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          imageConfig: {
            aspectRatio: "16:9",
            imageSize: imageResolution || "2K"
          }
        }
      });

      let imageData = null;
      if (response.candidates && response.candidates[0].content.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            imageData = `data:image/png;base64,${part.inlineData.data}`;
            break;
          }
        }
      }

      if (imageData) {
        const result = await pool.query('INSERT INTO images (data) VALUES ($1) RETURNING id', [imageData]);
        const imageUrl = `/api/images/${result.rows[0].id}`;
        await pool.query('UPDATE jobs SET status = $1, result = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3', ['completed', JSON.stringify({ imageUrl }), jobId]);
      } else {
        throw new Error("No image generated");
      }
    } catch (error: any) {
      console.error(`Job ${jobId} failed:`, error);
      await pool.query('UPDATE jobs SET status = $1, error = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3', ['failed', error.message, jobId]);
    }
  };

  // Background Chat Processor
  const processChatJob = async (jobId: number, history: any, message: any, systemInstruction: any) => {
    try {
      await pool.query('UPDATE jobs SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['processing', jobId]);
      
      const ai = getAIClient();
      
      const hydratedHistory = [];
      for (const h of history) {
        hydratedHistory.push(await hydrateAttachments(h));
      }
      const hydratedMessage = await hydrateAttachments(message);

      const searchAgent = createSearchAgent(ai);
      const deckAgent = createDeckAgent(ai);
      const mainAgent = createMainAgent(searchAgent, deckAgent, ai, systemInstruction);

      let messagePayload: any = hydratedMessage;
      if (Array.isArray(hydratedMessage)) {
        let text = "";
        let inlineData = undefined;
        for (const part of hydratedMessage) {
          if (part.text) text += part.text;
          if (part.inlineData) inlineData = part.inlineData;
        }
        messagePayload = { text, inlineData };
      } else if (typeof hydratedMessage === 'string') {
        messagePayload = hydratedMessage;
      }

      let generatedSlides: any[] | null = null;
      let generatedSlideUpdate: any | null = null;

      const context = {
        history: hydratedHistory,
        onUpdateDeck: (slides: any[]) => { generatedSlides = slides; },
        onUpdateSlide: (index: number, updates: any) => { generatedSlideUpdate = { index, ...updates }; }
      };
      
      const textResponse = await mainAgent.run(messagePayload, context);
      const responseParts: any[] = [{ text: textResponse }];
      
      if (generatedSlides) {
        responseParts.push({ functionCall: { name: "update_deck", args: { slides: generatedSlides } } });
      } else if (generatedSlideUpdate) {
        responseParts.push({ functionCall: { name: "update_slide", args: generatedSlideUpdate } });
      }
      
      const result = { candidates: [{ content: { parts: responseParts, role: "model" }, finishReason: "STOP" }] };
      await pool.query('UPDATE jobs SET status = $1, result = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3', ['completed', JSON.stringify(result), jobId]);

    } catch (error: any) {
      console.error(`Chat Job ${jobId} failed:`, error);
      await pool.query('UPDATE jobs SET status = $1, error = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3', ['failed', error.message || "Internal Server Error", jobId]);
    }
  };

  app.post("/api/upload", async (req, res) => {
    try {
      const { filename, mimeType, data } = req.body;
      if (!data || !mimeType) return res.status(400).json({ error: "Missing data or mimeType" });
      const result = await pool.query('INSERT INTO attachments (filename, mime_type, data) VALUES ($1, $2, $3) RETURNING id', [filename || "untitled", mimeType, data]);
      res.json({ id: result.rows[0].id, url: `/api/attachments/${result.rows[0].id}` });
    } catch (error: any) {
      console.error("Upload API Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/attachments/:id", async (req, res) => {
    try {
      const result = await pool.query('SELECT mime_type, data FROM attachments WHERE id = $1', [req.params.id]);
      const attachment = result.rows[0];
      if (attachment) {
        const buffer = Buffer.from(attachment.data, 'base64');
        res.writeHead(200, { 'Content-Type': attachment.mime_type, 'Content-Length': buffer.length });
        res.end(buffer);
      } else {
        res.status(404).send("Attachment not found");
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const { history, message, systemInstruction } = req.body;
      const result = await pool.query('INSERT INTO jobs (type, status, created_at) VALUES ($1, $2, CURRENT_TIMESTAMP) RETURNING id', ['chat_generation', 'pending']);
      const jobId = result.rows[0].id;
      processChatJob(Number(jobId), history, message, systemInstruction).catch(err => console.error("Background processing error:", err));
      res.json({ jobId, status: 'pending' });
    } catch (error: any) {
      console.error("Chat API Error:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  app.post("/api/image", async (req, res) => {
    try {
      const { prompt, imageResolution, mode } = req.body;
      let finalPrompt = prompt;
      if (mode === 'background') finalPrompt += `\n\nIMPORTANT: Do NOT include any text, titles, or captions in the image itself. Create ONLY the visual imagery.`;
      const result = await pool.query('INSERT INTO jobs (type, status, created_at) VALUES ($1, $2, CURRENT_TIMESTAMP) RETURNING id', ['image_generation', 'pending']);
      const jobId = result.rows[0].id;
      processImageJob(Number(jobId), finalPrompt, imageResolution).catch(err => console.error("Background processing error:", err));
      res.json({ jobId, status: 'pending' });
    } catch (error: any) {
      console.error("Image API Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/jobs/:id", async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM jobs WHERE id = $1', [req.params.id]);
      const job = result.rows[0];
      if (!job) return res.status(404).json({ error: "Job not found" });
      if (job.result && typeof job.result === 'string') {
        try { job.result = JSON.parse(job.result); } catch (e) {}
      }
      res.json(job);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/extract-style", async (req, res) => {
    try {
      const { prompt } = req.body;
      const ai = getAIClient();
      const response = await ai.models.generateContent({
        model: getFlashModel(),
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });
      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Extract Style API Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/transform-style", async (req, res) => {
    try {
      const { prompt } = req.body;
      const ai = getAIClient();
      const response = await ai.models.generateContent({
        model: getFlashModel(),
        contents: prompt,
      });
      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Transform Style API Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/suggestions", async (req, res) => {
    try {
      const { history } = req.body;
      const ai = getAIClient();
      const prompt = `
        Analyze the conversation history, paying closest attention to the last user message and the model's response.
        Suggest 3 specific, relevant follow-up questions or actions the user might want to take next.
        Criteria: Must be directly related; natural next steps; short and concise.
        Return ONLY a JSON array of strings. No markdown, no code blocks.
        History: ${JSON.stringify(history.map((m: any) => ({ role: m.role, text: m.text })))}
      `;
      const response = await ai.models.generateContent({
        model: getFlashModel(),
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" }
      });
      const suggestions = JSON.parse(response.text || "[]");
      res.json({ suggestions });
    } catch (error: any) {
      console.error("Suggestions API Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: { server: httpServer } },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'dist', 'index.html')); });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
