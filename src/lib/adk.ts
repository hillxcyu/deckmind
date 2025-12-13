import { GoogleGenAI, FunctionDeclaration, Type, Tool, GenerateContentResult } from "@google/genai";
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
  run(input: string, context?: any): Promise<string>;
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

    console.log(`[Agent: ${this.name}] Processing: "${input.substring(0, 50)}..."`);

    // Ensure input is not empty to avoid "ContentUnion is required" error
    const messageContent = input && input.trim() !== "" ? input : " ";

    let response = await chat.sendMessage({ message: messageContent });
    
    // Loop to handle tool calls (both native and sub-agents)
    const maxTurns = 5;
    let turn = 0;

    while (response.functionCalls && response.functionCalls.length > 0 && turn < maxTurns) {
      turn++;
      const functionCalls = response.functionCalls;
      const functionResponses: any[] = [];

      for (const call of functionCalls) {
        console.log(`[Agent: ${this.name}] Tool Call: ${call.name}`);
        
        // Check if it's a sub-agent delegation
        if (call.name.startsWith("delegate_to_")) {
            const agentName = call.name.replace("delegate_to_", "");
            const subAgent = this.subAgents.get(agentName);
            
            if (subAgent) {
                const args = call.args as any;
                // Pass context to sub-agent so it can access callbacks like onUpdateDeck
                const result = await subAgent.run(args.instruction, context);
                functionResponses.push({
                    functionResponse: {
                        name: call.name,
                        response: { result: result }
                    }
                });
            } else {
                functionResponses.push({
                    functionResponse: {
                        name: call.name,
                        response: { error: "Agent not found" }
                    }
                });
            }
        } else {
            // It's a native tool (like googleSearch or update_deck)
            if (call.name === "update_deck") {
                if (context?.onUpdateDeck) {
                    const args = call.args as any;
                    context.onUpdateDeck(args.slides);
                    functionResponses.push({
                        functionResponse: {
                            name: call.name,
                            response: { result: "Deck updated successfully." }
                        }
                    });
                } else {
                     functionResponses.push({
                        functionResponse: {
                            name: call.name,
                            response: { result: "Deck update simulated (no handler)." }
                        }
                    });
                }
            }
        }
      }

      // Send tool results back to the model
      if (functionResponses.length > 0) {
          response = await chat.sendMessage({ message: functionResponses });
      } else {
          // If we had function calls but no responses (e.g. googleSearch might be handled internally?),
          // actually for googleSearch, the SDK/API handles it if we don't see it in functionCalls?
          // No, if googleSearch is used, we usually get groundingMetadata, not a functionCall we need to handle manually.
          // So if we are here, it's a manual function call.
          break;
      }
    }

    return response.text || "No response generated.";
  }
}
