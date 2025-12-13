import { GoogleGenAI, GenerateContentResponse, FunctionDeclaration, Type, Tool } from "@google/genai";
import { DeckStyle, Slide } from "../types";
import { createSearchAgent, createDeckAgent, createMainAgent } from "./agentSystem";

export const updateDeckTool: FunctionDeclaration = {
  name: "update_deck",
  description: "Save the slides.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      slides: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            title: { type: Type.STRING },
            content: { type: Type.STRING },
            visualDescription: { type: Type.STRING },
          },
          required: ["id", "title", "content", "visualDescription"],
        },
      },
    },
    required: ["slides"],
  },
};

import { Message } from "../types";
import { getGeminiApiKey } from "../utils/env";

export async function generateChatResponse(
  historyMessages: Message[],
  message: string | { text: string; inlineData?: { mimeType: string; data: string } },
  systemInstruction: string,
  onUpdateDeck?: (slides: Slide[]) => void,
  retryCount = 0,
  useSearchGrounding = false
): Promise<string> {
  const apiKey = getGeminiApiKey();
  
  if (!apiKey) {
      // Fallback to backend proxy (which currently uses the monolithic approach).
      console.log("No API Key found, using backend proxy for Chat...");
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            history: historyMessages.map(m => {
                const parts: any[] = [];
                if (m.attachment) {
                    parts.push({ inlineData: { mimeType: m.attachment.type, data: m.attachment.data } });
                }
                if (m.text && m.text.trim() !== '') {
                    parts.push({ text: m.text });
                } else if (parts.length === 0) {
                    parts.push({ text: " " });
                }
                return { role: m.role, parts: parts };
            }),
            message: typeof message === 'string' ? [{ text: message }] : (message.inlineData ? [{ inlineData: message.inlineData }, { text: message.text || " " }] : [{ text: message.text || " " }]),
            systemInstruction,
            useSearchGrounding
        })
    });

    if (!response.ok) {
        throw new Error(`Backend Chat Error: ${response.statusText}`);
    }

    const result = await response.json();
    
    // Check for function calls in the backend response
    if (result.candidates && result.candidates.length > 0) {
        const candidate = result.candidates[0];
        if (candidate.content && candidate.content.parts) {
             // Check for function calls
             const parts = candidate.content.parts;
             const functionCalls = parts.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);
             
             if (functionCalls.length > 0) {
                 const call = functionCalls[0];
                 if (call.name === "update_deck" && onUpdateDeck) {
                     const args = call.args as any;
                     if (args.slides) {
                        onUpdateDeck(args.slides.map((s: any) => ({ ...s, status: 'pending' })));
                        return "I've updated the deck based on our conversation.";
                     }
                 }
             }
             
             // Return text
             const textParts = parts.filter((p: any) => p.text).map((p: any) => p.text).join("");
             if (textParts) return textParts;
        }
    }
    
    return "Backend response processed.";
  }

  // --- ADK Implementation (Client Side) ---
  
  const searchAgent = createSearchAgent();
  const deckAgent = createDeckAgent();
  const mainAgent = createMainAgent(searchAgent, deckAgent);

  // Prepare context
  const context = {
      history: historyMessages.map(m => {
          const parts: any[] = [];
          if (m.attachment) {
            parts.push({ inlineData: { mimeType: m.attachment.type, data: m.attachment.data } });
          }
          if (m.text && m.text.trim() !== '') {
            parts.push({ text: m.text });
          } else if (parts.length === 0) {
            parts.push({ text: " " });
          }
          return { role: m.role, parts: parts };
      }),
      onUpdateDeck: onUpdateDeck
  };

  // Run the Main Agent
  let input = "";
  if (typeof message === 'string') {
      input = message;
  } else {
      input = message.text || "";
      if (message.inlineData) {
          console.warn("ADK: Image attachment detected but not fully supported in simple ADK run yet. Passing text only.");
      }
  }
  
  return await mainAgent.run(input, context);
}

export async function generateSlideImage(
  slide: Slide,
  style: DeckStyle
): Promise<string> {
  const apiKey = getGeminiApiKey();
  
  // Check for API Key selection for Gemini 3 Pro Image (only if we are in client-side mode)
  if (apiKey && window.aistudio && !await window.aistudio.hasSelectedApiKey()) {
    // This check is a bit redundant if getGeminiApiKey() returns a value, 
    // but ensures we respect the studio environment if key is there but not selected?
    // Actually if getGeminiApiKey() returns something, we are good.
  }
  
  if (!apiKey) {
      // Use backend
      try {
        const response = await fetch('/api/image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: `
                    Create a high-quality presentation slide image.
                    
                    Style Context:
                    ${style.generatedSystemPrompt}
                    
                    Slide Content:
                    Title: ${slide.title}
                    Text: ${slide.content}
                    
                    Visual Description:
                    ${slide.visualDescription}
                    
                    Ensure the text is legible if it appears, but primarily focus on the visual composition and background that fits the slide content and style.
                `,
                imageResolution: style.imageResolution
            })
        });

        if (!response.ok) throw new Error(response.statusText);
        const result = await response.json();
        return result.imageUrl;
      } catch (e) {
          console.error("Backend Image Generation Failed", e);
          throw e;
      }
  }

  // Client side generation
  if (window.aistudio && !await window.aistudio.hasSelectedApiKey()) {
     throw new Error("API Key not selected");
  }
  
  const ai = new GoogleGenAI({ apiKey: apiKey || "" });
  
  const prompt = `
    Create a high-quality presentation slide image.
    
    Style Context:
    ${style.generatedSystemPrompt}
    
    Slide Content:
    Title: ${slide.title}
    Text: ${slide.content}
    
    Visual Description:
    ${slide.visualDescription}
    
    Ensure the text is legible if it appears, but primarily focus on the visual composition and background that fits the slide content and style.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: "16:9",
          imageSize: style.imageResolution || "2K" // Use style resolution or default to 2K
        }
      }
    });

    // Extract image
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image generated");
  } catch (e) {
    console.error("Image generation failed", e);
    throw e;
  }
}

export async function extractStyleFromBrand(brandOrUrl: string): Promise<Partial<DeckStyle> & { colors: { color1: string; color2: string; color3: string; accent: string } }> {
    const apiKey = getGeminiApiKey();
    const prompt = `
      Analyze the visual style of the following brand or URL: "${brandOrUrl}".
      
      Infer the following design elements:
      1. Aesthetic (one of: vibrant, professional, minimalist, playful, custom)
      2. Color Palette (4 hex codes: Primary, Secondary, Tertiary, Accent)
      3. Typography (e.g., "Modern Sans-Serif", "Classic Serif")
      4. Mood (e.g., "Innovative", "Trustworthy")
      
      Return ONLY a JSON object with this structure:
      {
        "aesthetic": "string",
        "colors": {
          "color1": "#hex",
          "color2": "#hex",
          "color3": "#hex",
          "accent": "#hex"
        },
        "typography": "string",
        "mood": "string"
      }
    `;

    if (!apiKey) {
        try {
            const response = await fetch('/api/extract-style', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });
            if (!response.ok) throw new Error(response.statusText);
            const result = await response.json();
            return JSON.parse(result.text || "{}");
        } catch (e) {
            console.error("Backend Extract Style Failed", e);
            return {
                colors: { color1: "#ffffff", color2: "#f3f4f6", color3: "#1f2937", accent: "#3b82f6" }
            };
        }
    }

    const ai = new GoogleGenAI({ apiKey: apiKey || "" });
    
    const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: prompt,
        config: {
            responseMimeType: "application/json"
        }
    });
    
    try {
        return JSON.parse(response.text || "{}");
    } catch (e) {
        console.error("Failed to parse extracted style", e);
        return {
            colors: { color1: "#ffffff", color2: "#f3f4f6", color3: "#1f2937", accent: "#3b82f6" }
        };
    }
}

export async function transformStyle(style: DeckStyle): Promise<string> {
    const apiKey = getGeminiApiKey();
    
    const colors = style.colors 
      ? `Primary: ${style.colors.color1}, Secondary: ${style.colors.color2}, Tertiary: ${style.colors.color3}, Accent: ${style.colors.accent}`
      : "Not specified";

    const prompt = `
      You are an expert art director. Convert the following style preferences into a detailed visual system prompt for an image generation model.
      
      Aesthetic: ${style.aesthetic}
      Color Palette: ${colors}
      Typography/Font Style: ${style.typography || "Not specified"}
      Mood: ${style.mood || "Not specified"}
      Extract Style From (Brand/URL): ${style.extractFrom || "None"}
      Additional Notes: ${style.customStyleGuide || "None"}
      
      Output a paragraph describing the color palette, typography mood, composition rules, and overall vibe. This will be used to ensure consistency across multiple generated images.
    `;

    if (!apiKey) {
        try {
            const response = await fetch('/api/transform-style', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });
            if (!response.ok) throw new Error(response.statusText);
            const result = await response.json();
            return result.text || "";
        } catch (e) {
            console.error("Backend Transform Style Failed", e);
            return "";
        }
    }

    const ai = new GoogleGenAI({ apiKey: apiKey || "" });

    const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: prompt,
    });
    
    return response.text || "";
}
