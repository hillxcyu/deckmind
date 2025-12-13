import express from "express";
import { createServer } from "http";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";
import path from "path";
import { fileURLToPath } from "url";
import { createSearchAgent, createDeckAgent, createMainAgent } from "./src/services/agentSystem";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Helper to get AI client (Vertex or API Key)
  const getAIClient = () => {
    if (process.env.GEMINI_API_KEY) {
      return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    } else {
      // Vertex AI with ADC
      return new GoogleGenAI({
        vertexAI: {
          project: process.env.GCLOUD_PROJECT || '',
          location: process.env.GCLOUD_LOCATION || 'us-central1',
        }
      });
    }
  };

  // API Routes
  app.post("/api/chat", async (req, res) => {
    try {
      const { history, message, systemInstruction, useSearchGrounding } = req.body;
      const ai = getAIClient();
      
      // Instantiate Agents
      const searchAgent = createSearchAgent(ai);
      const deckAgent = createDeckAgent(ai);
      const mainAgent = createMainAgent(searchAgent, deckAgent, ai);

      // Extract text from message if it's an array or object
      let messageText = "";
      if (Array.isArray(message)) {
          messageText = message.map((p: any) => p.text || "").join(" ");
      } else if (typeof message === 'object' && message.text) {
          messageText = message.text;
      } else {
          messageText = String(message);
      }

      // Capture deck updates
      let generatedSlides: any[] | null = null;
      const context = {
          history: history,
          onUpdateDeck: (slides: any[]) => {
              generatedSlides = slides;
          }
      };
      
      const textResponse = await mainAgent.run(messageText, context);
      
      // Construct response mimicking Gemini structure
      const responseParts: any[] = [{ text: textResponse }];
      
      if (generatedSlides) {
          responseParts.push({
              functionCall: {
                  name: "update_deck",
                  args: { slides: generatedSlides }
              }
          });
      }
      
      const result = {
          candidates: [{
              content: {
                  parts: responseParts,
                  role: "model"
              },
              finishReason: "STOP"
          }]
      };
      
      res.json(result);
    } catch (error: any) {
      console.error("Chat API Error:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  app.post("/api/image", async (req, res) => {
    try {
      const { prompt, imageResolution } = req.body;
      const ai = getAIClient();
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
          parts: [{ text: prompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: "16:9",
            imageSize: imageResolution || "2K"
          }
        }
      });

      // Extract image data
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
        res.json({ imageUrl: imageData });
      } else {
        res.status(500).json({ error: "No image generated" });
      }
    } catch (error: any) {
      console.error("Image API Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/extract-style", async (req, res) => {
    try {
      const { prompt } = req.body;
      const ai = getAIClient();
      
      const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: prompt,
        config: {
            responseMimeType: "application/json"
        }
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
        model: "gemini-3-pro-preview",
        contents: prompt,
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Transform Style API Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: {
          server: httpServer
        }
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.join(__dirname, 'dist')));
    
    // Handle SPA routing
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
