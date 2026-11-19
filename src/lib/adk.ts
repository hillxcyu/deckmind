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

import { GoogleGenAI, FunctionDeclaration, Type, Tool } from "@google/genai";
import { getGeminiApiKey } from "../utils/env";

// --- ADK Abstractions ---

export interface AgentConfig {
  name: string;
  description: string;
  model: string;
  systemInstruction?: string;
  tools?: any[]; // Native Gemini Tools
  subAgents?: Agent[]; // Other agents callable as tools
  client?: GoogleGenAI; // Optional pre-configured client
}

export interface Agent {
  name: string;
  description: string;
  run(input: string | { text?: string; inlineData?: { mimeType: string; data: string } }, context?: any): Promise<string>;
  asTool(): FunctionDeclaration;
}

// --- ADK Abstractions ---

export interface AgentConfig {
  name: string;
  description: string;
  model: string;
  systemInstruction?: string;
  tools?: any[]; // Native Gemini Tools
  subAgents?: Agent[]; // Other agents callable as tools
  client?: GoogleGenAI; // Optional pre-configured client
}

export interface Agent {
  name: string;
  description: string;
  run(input: string | { text?: string; inlineData?: { mimeType: string; data: string } }, context?: any): Promise<string>;
  asTool(): FunctionDeclaration;
}

export class LlmAgent implements Agent {
  public name: string;
  public description: string;
  private model: string;
  private systemInstruction: string;
  private tools: any[];
  private subAgents: Map<string, Agent>;
  private client?: GoogleGenAI;

  constructor(config: AgentConfig) {
    this.name = config.name;
    this.description = config.description;
    this.model = config.model;
    this.systemInstruction = config.systemInstruction || "";
    this.tools = config.tools || [];
    this.subAgents = new Map();
    this.client = config.client;

    if (config.subAgents) {
      config.subAgents.forEach(agent => {
        this.subAgents.set(agent.name, agent);
        // Convert sub-agent to a function declaration
        const toolDecl = agent.asTool();
        // Add to tools list (wrapped in functionDeclarations)
        this.tools.push({ functionDeclarations: [toolDecl] });
      });
    }
  }

  public asTool(): FunctionDeclaration {
    return {
      name: `delegate_to_${this.name}`,
      description: `Delegate a task to the ${this.name}. ${this.description}`,
      parameters: {
        type: Type.OBJECT,
        properties: {
          instruction: {
            type: Type.STRING,
            description: "The detailed instruction or query for the sub-agent."
          }
        },
        required: ["instruction"]
      }
    };
  }

  public async run(input: string, context?: any): Promise<string> {
    let ai = this.client;
    
    if (!ai) {
        const apiKey = getGeminiApiKey();
        if (!apiKey) {
             console.warn("ADK: No API Key found and no client provided. This might fail.");
        }
        ai = new GoogleGenAI({ apiKey: apiKey || "" });
    }

    const chat = ai.chats.create({
      model: this.model,
      config: {
        systemInstruction: this.systemInstruction,
        tools: this.tools,
      },
      history: context?.history || [] 
    });

    console.log(`[Agent: ${this.name}] [Model: ${this.model}] Processing: "${typeof input === 'string' ? input.substring(0, 50) : '{multimodal input}'}..."`);

    const currentParts: any[] = [];
    let textInput: string = "";

    // 1. Handle Text (Always include, default to space if empty)
    if (typeof input === 'string') {
      textInput = input;
    } else {
      textInput = input.text || " ";
    }
    
    // Ensure text is never empty string to satisfy API requirements
    if (!textInput || textInput.trim() === "") {
        textInput = " ";
    }
    currentParts.push({ text: textInput });

    // 2. Handle InlineData (User example has it second)
    if (typeof input !== 'string' && input.inlineData) {
       if (!input.inlineData.mimeType || !input.inlineData.data) {
           console.warn(`[Agent: ${this.name}] Invalid inlineData:`, input.inlineData);
       } else {
           currentParts.push({ inlineData: input.inlineData });
       }
    }

    // Log parts without full base64 data
    const sanitizedParts = currentParts.map(p => {
        if (p.inlineData) {
            return { 
                inlineData: { 
                    mimeType: p.inlineData.mimeType, 
                    data: `(base64 data, length: ${p.inlineData.data?.length})` 
                } 
            };
        }
        return p;
    });
    console.log(`[Agent: ${this.name}] [Model: ${this.model}] Sending parts:`, JSON.stringify(sanitizedParts, null, 2));

    // Fix: Pass parts array directly, NOT { role, parts } object
    // Update: wrapping in { message: ... } to comply with @google/genai SDK signature
    let response = await chat.sendMessage({ message: currentParts });
    console.log(`[Agent: ${this.name}] Raw Response Text:`, response.text?.substring(0, 200) + "...");
    
    // Loop to handle tool calls (both native and sub-agents)
    const maxTurns = 5;
    let turn = 0;

    while (response.functionCalls && response.functionCalls.length > 0 && turn < maxTurns) {
      turn++;
      const functionCalls = response.functionCalls;
      const functionResponses: any[] = [];

      for (const call of functionCalls) {
        console.log(`[Agent: ${this.name}] [Model: ${this.model}] Tool Call: ${call.name}`);
        console.log(`[Agent: ${this.name}] Tool Args:`, JSON.stringify(call.args, null, 2));
        
        // Check if it's a sub-agent delegation
        let subAgent = this.subAgents.get(call.name);
        if (!subAgent && call.name.startsWith("delegate_to_")) {
             const agentName = call.name.replace("delegate_to_", "");
             subAgent = this.subAgents.get(agentName);
        }
        
        if (subAgent) {
            const args = call.args as any;
            // Pass context to sub-agent so it can access callbacks like onUpdateDeck
            const result = await subAgent.run(args.instruction, context);
            functionResponses.push({
                functionResponse: {
                    name: call.name,
                    id: call.id, // Include ID if present
                    response: { result: result }
                }
            });
        } else {
            // It's a native tool (like googleSearch or update_deck)
            const toolName = call.name.toLowerCase();
            
            if (toolName === "update_deck" || toolName === "updatedeck" || toolName === "updatedeckslides") {
                if (context?.onUpdateDeck) {
                    const args = call.args as any;
                    let slides: any[] = [];
                    
                    if (args.slides && Array.isArray(args.slides)) {
                        slides = args.slides;
                    } else if (Array.isArray(args)) {
                        slides = args;
                    } else if (args.title && args.content) {
                        // Handle single slide object (hallucinated structure)
                        slides = [args];
                    } else {
                        // Attempt to find any array in the args values
                        const possibleArray = Object.values(args).find(val => Array.isArray(val));
                        if (possibleArray) {
                            slides = possibleArray as any[];
                        }
                    }

                    if (slides.length > 0) {
                        context.onUpdateDeck(slides);
                        functionResponses.push({
                            functionResponse: {
                                name: call.name,
                                response: { result: "Deck updated successfully." }
                            }
                        });
                    } else {
                         console.warn(`[Agent: ${this.name}] Failed to extract slides from args:`, JSON.stringify(args));
                         functionResponses.push({
                            functionResponse: {
                                name: call.name,
                                response: { error: "Invalid slides format. Please provide an object with a 'slides' array." }
                            }
                        });
                    }
                } else {
                     functionResponses.push({
                        functionResponse: {
                            name: call.name,
                            response: { result: "Deck update simulated (no handler)." }
                        }
                    });
                }
            } else if (toolName === "update_slide" || toolName === "updateslide") {
                if (context?.onUpdateSlide) {
                    const args = call.args as any;
                    // Robustly extract index. Sometimes model sends "slide_index" or just "index" or wraps it.
                    let index = args.index;
                    if (index === undefined && args.slideIndex !== undefined) index = args.slideIndex;
                    
                    // If index is missing but we have an ID "slide_X", try to parse it? 
                    // No, reliance on index is safer for the tool definition we provided.
                    
                    if (typeof index === 'number') {
                        context.onUpdateSlide(index, args);
                        functionResponses.push({
                            functionResponse: {
                                name: call.name,
                                response: { result: `Slide ${index + 1} updated successfully.` }
                            }
                        });
                    } else {
                         console.warn(`[Agent: ${this.name}] Invalid index for update_slide:`, JSON.stringify(args));
                         functionResponses.push({
                            functionResponse: {
                                name: call.name,
                                response: { error: "Missing or invalid 'index' argument. Please provide the 0-based index of the slide to update." }
                            }
                        });
                    }
                } else {
                     functionResponses.push({
                        functionResponse: {
                            name: call.name,
                            response: { result: "Slide update simulated (no handler)." }
                        }
                    });
                }
            }
        }
      }

      // Send tool results back to the model
      if (functionResponses.length > 0) {
          console.log(`[Agent: ${this.name}] Sending Function Responses:`, JSON.stringify(functionResponses, null, 2));
          try {
             // The SDK expects `{ message: Part[] }` 
             response = await chat.sendMessage({ message: functionResponses }); 
             console.log(`[Agent: ${this.name}] Tool Response Sent. Raw Result:`, response.text?.substring(0, 50));
          } catch (e: any) {
             console.error(`[Agent: ${this.name}] Error sending tool response:`, e);
             return `Error executing tool: ${e.message}`;
          }
      } else {
          // If we had function calls but no responses (e.g. googleSearch might be handled internally?),
          // actually for googleSearch, the SDK/API handles it if we don't see it in functionCalls?
          // No, if googleSearch is used, we usually get groundingMetadata, not a functionCall we need to handle manually.
          // So if we are here, it's a manual function call.
          break;
      }
    }

    if (turn > 0 && (!response.text || response.text.trim() === "")) {
        return "Task completed via tool execution.";
    }

    return response.text || "No response generated.";
  }
}
