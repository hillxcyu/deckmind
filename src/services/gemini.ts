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

export const updateSlideTool: FunctionDeclaration = {
  name: "update_slide",
  description: "Update a specific slide by index.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      index: { type: Type.NUMBER, description: "The 0-based index of the slide to update." },
      title: { type: Type.STRING, description: "New title for the slide." },
      content: { type: Type.STRING, description: "New content for the slide." },
      visualDescription: { type: Type.STRING, description: "New visual description for the slide." },
    },
    required: ["index"],
  },
};

import { Message } from "../types";
import { getGeminiApiKey, getImageModel, getFlashModel } from "../utils/env";

export async function generateChatResponse(
  historyMessages: Message[],
  message: string | { text: string; inlineData?: { mimeType: string; data: string } },
  systemInstruction: string,
  onUpdateDeck?: (slides: Slide[]) => void,
  onUpdateSlide?: (index: number, updates: Partial<Slide>) => void,
  retryCount = 0,
  selectedSlideIndex = -1
): Promise<string> {
  const apiKey = getGeminiApiKey();
  
  // Inject selection context into system instruction if valid
  let finalSystemInstruction = systemInstruction;
  if (selectedSlideIndex >= 0) {
      finalSystemInstruction += `\n\n[CONTEXT: The user has currently selected SLIDE #${selectedSlideIndex + 1} (index ${selectedSlideIndex}). If the user says "this slide", "current slide", or refers to a slide without specifying, assume they mean this one.]`;
  }
  
  if (!apiKey) {
      // Fallback to backend proxy (which currently uses the monolithic approach).
      console.log("No API Key found, using backend proxy for Chat...");
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            history: historyMessages.map(m => {
                const parts: any[] = [];
                if (m.attachment?.id) {
                    parts.push({ attachmentId: m.attachment.id });
                } else if (m.attachment?.data) {
                    // Fallback for old attachments without ID
                    parts.push({ inlineData: { mimeType: m.attachment.type, data: m.attachment.data } });
                }
                
                if (m.text && m.text.trim() !== '') {
                    parts.push({ text: m.text });
                } else if (parts.length === 0) {
                    parts.push({ text: " " });
                }
                return { role: m.role, parts: parts };
            }),
            message: typeof message === 'string' ? [{ text: message }] : (
                (message as any).attachmentId 
                ? [{ attachmentId: (message as any).attachmentId }, { text: message.text || " " }] 
                : (message.inlineData 
                    ? [{ inlineData: message.inlineData }, { text: message.text || " " }] 
                    : [{ text: message.text || " " }]
                  )
            ),
            systemInstruction: finalSystemInstruction
        })
    });

    if (!response.ok) {
        throw new Error(`Backend Chat Error: ${response.statusText}`);
    }

    const initialResult = await response.json();
    let result = initialResult;

    // Handle Async Job (if jobId is present)
    if (initialResult.jobId) {
        const jobId = initialResult.jobId;
        const startTime = Date.now();
        const timeout = 300000; // 5 minutes timeout

        while (true) {
            if (Date.now() - startTime > timeout) {
                throw new Error("Chat generation timed out");
            }

            const jobResponse = await fetch(`/api/jobs/${jobId}`);
            if (!jobResponse.ok) throw new Error("Failed to check chat job status");
            const job = await jobResponse.json();

            if (job.status === 'completed') {
                if (typeof job.result === 'string') {
                    try {
                        result = JSON.parse(job.result);
                    } catch (e) {
                        result = { candidates: [{ content: { parts: [{ text: job.result }] } }] };
                    }
                } else {
                    result = job.result;
                }
                break;
            } else if (job.status === 'failed') {
                throw new Error(job.error || "Chat generation failed");
            }

            // Wait 1 second before next poll
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    // Check for function calls in the backend response
    if (result.candidates && result.candidates.length > 0) {
        const candidate = result.candidates[0];
        if (candidate.content && candidate.content.parts) {
             // Check for function calls
             const parts = candidate.content.parts;
             const functionCalls = parts.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);
             
             for (const call of functionCalls) {
                 if (call.name === "update_deck" && onUpdateDeck) {
                     const args = call.args as any;
                     if (args.slides) {
                        onUpdateDeck(args.slides.map((s: any) => ({ ...s, status: 'pending' })));
                        return "I've updated the deck based on our conversation.";
                     }
                 } else if (call.name === "update_slide" && onUpdateSlide) {
                     const args = call.args as any;
                     if (typeof args.index === 'number') {
                         onUpdateSlide(args.index, { 
                             title: args.title, 
                             content: args.content, 
                             visualDescription: args.visualDescription 
                         });
                         return `I've updated slide ${args.index + 1}.`;
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
  const mainAgent = createMainAgent(searchAgent, deckAgent, undefined, systemInstruction);

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
      onUpdateDeck: onUpdateDeck,
      onUpdateSlide: onUpdateSlide
  };

  // Run the Main Agent
  return await mainAgent.run(message, context);
}

export function constructImagePrompt(
  slide: Slide,
  style: DeckStyle,
  mode: 'full' | 'background' = 'full'
): string {
  if (mode === 'background') {
      return `
        Create a high-quality visual illustration or background for a presentation slide.
        
        Style Context:
        ${style.generatedSystemPrompt}
        
        Slide Content (For Context Only - Do NOT Render Text):
        Title: ${slide.title}
        Text: ${slide.content}
        
        Visual Description:
        ${slide.visualDescription}
        
        IMPORTANT: Do NOT include any text, titles, or captions in the image itself. Create ONLY the visual imagery.
      `;
  } else {
      return `
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
  }
}


export async function generateSlideImage(
  slide: Slide,
  style: DeckStyle,
  mode: 'full' | 'background' = 'full',
  customPrompt?: string
): Promise<string> {
  const apiKey = getGeminiApiKey();
  
  // Check for API Key selection for Gemini 3 Pro Image (only if we are in client-side mode)
  if (apiKey && window.aistudio && !await window.aistudio.hasSelectedApiKey()) {
    // This check is a bit redundant if getGeminiApiKey() returns a value, 
    // but ensures we respect the studio environment if key is there but not selected?
    // Actually if getGeminiApiKey() returns something, we are good.
  }
  
  const prompt = customPrompt || constructImagePrompt(slide, style, mode);
  
  if (!apiKey) {
      // Use backend
      try {
        const response = await fetch('/api/image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: prompt,
                imageResolution: style.imageResolution,
                mode: mode // Passing mode for logging/reference, though prompt is pre-constructed if custom
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
  
  try {
    const response = await ai.models.generateContent({
      model: getImageModel(),
      contents: [{
        role: 'user',
        parts: [{ text: prompt }],
      }],
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
        model: getFlashModel(),
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
        model: getFlashModel(),
        contents: prompt,
    });
    
    return response.text || "";
}

export async function getChatSuggestions(historyMessages: Message[]): Promise<string[]> {
    const apiKey = getGeminiApiKey();
    
    // We only need the last few messages for context
    const recentHistory = historyMessages.slice(-4); 

    if (!apiKey) {
        try {
            const response = await fetch('/api/suggestions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ history: recentHistory })
            });
            if (!response.ok) return [];
            const result = await response.json();
            return result.suggestions || [];
        } catch (e) {
            console.error("Backend Suggestions Failed", e);
            return [];
        }
    }

    // Client-side fallback (if API key is present)
    const ai = new GoogleGenAI({ apiKey: apiKey || "" });
    const prompt = `
      Analyze the conversation history, paying closest attention to the last user message and the model's response.
      Suggest 3 specific, relevant follow-up questions or actions the user might want to take next.
      
      Criteria:
      - Must be directly related to the content just discussed.
      - Should be natural next steps (e.g., if asking for a definition, suggest asking for examples; if creating a slide, suggest refining it).
      - Keep them short and concise (under 10 words).
      
      Return ONLY a JSON array of strings. No markdown, no code blocks.
      
      History:
      ${JSON.stringify(recentHistory.map(m => ({ role: m.role, text: m.text })))}
    `;

    try {
        const response = await ai.models.generateContent({
            model: getFlashModel(),
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: { responseMimeType: "application/json" }
        });
        return JSON.parse(response.text || "[]");
    } catch (e) {
        console.warn("Failed to generate suggestions", e);
        return [];
    }
}

export interface ImageGenerationResult {
  jobId?: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: { imageUrl: string }; // Matches DB JSON structure
  imageUrl?: string; // For convenience in frontend
  error?: string;
}

export async function initiateImageGeneration(
  slide: Slide,
  style: DeckStyle,
  mode: 'full' | 'background' = 'full'
): Promise<ImageGenerationResult> {
    const apiKey = getGeminiApiKey();
    const prompt = slide.imagePrompt || constructImagePrompt(slide, style, mode);

    if (apiKey) {
        // Client-side generation (still blocking/sync from UI perspective)
        try {
            const ai = new GoogleGenAI({ apiKey: apiKey });
            const response = await ai.models.generateContent({
                model: getImageModel(),
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: {
                    imageConfig: {
                        aspectRatio: "16:9",
                        imageSize: style.imageResolution || "2K"
                    }
                }
            });

            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    return {
                        status: 'completed',
                        imageUrl: `data:image/png;base64,${part.inlineData.data}`
                    };
                }
            }
            return { status: 'failed', error: "No image generated" };
        } catch (e: any) {
            return { status: 'failed', error: e.message };
        }
    } else {
        // Backend generation (Async Job)
        try {
            const response = await fetch('/api/image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: prompt,
                    imageResolution: style.imageResolution,
                    mode: mode
                })
            });

            if (!response.ok) throw new Error(response.statusText);
            const result = await response.json();
            // Result contains { jobId, status }
            return result;
        } catch (e: any) {
            return { status: 'failed', error: e.message };
        }
    }
}

export async function checkImageJobStatus(jobId: number): Promise<ImageGenerationResult> {
    try {
        const response = await fetch(`/api/jobs/${jobId}`);
        if (!response.ok) throw new Error("Failed to check job status");
        const job = await response.json();
        
        // Transform DB job to Result
        return {
            jobId: job.id,
            status: job.status,
            imageUrl: job.result ? job.result.imageUrl : undefined,
            error: job.error
        };
    } catch (e: any) {
        return { status: 'failed', error: e.message };
    }
}
