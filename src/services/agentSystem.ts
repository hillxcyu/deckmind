import { LlmAgent, Agent } from "../lib/adk";
import { updateDeckTool } from "./gemini";
import { Slide } from "../types";
import { GoogleGenAI } from "@google/genai";

// --- Agent Definitions ---

// 1. Search Agent
// Specialized in finding information.
export const createSearchAgent = (client?: GoogleGenAI) => new LlmAgent({
    name: "search_agent",
    description: "A research specialist that finds up-to-date information using Google Search.",
    model: "gemini-3-pro-preview",
    systemInstruction: "You are a research assistant. Your goal is to find accurate and relevant information. Use the Google Search tool to answer queries. Summarize your findings clearly.",
    tools: [{ googleSearch: {} }],
    client
});

// 2. Deck Agent
// Specialized in updating the slide deck.
export const createDeckAgent = (client?: GoogleGenAI) => new LlmAgent({
    name: "deck_agent",
    description: "A presentation designer that updates slides.",
    model: "gemini-3-pro-preview", // We can use 3.0 here because it's isolated!
    systemInstruction: "You are a presentation designer. Your ONLY job is to update the slide deck based on the provided content. You must use the `update_deck` tool to save changes. Do not invent information; use the content provided to you.",
    tools: [{ functionDeclarations: [updateDeckTool] }],
    client
});

// 3. Main Agent (Orchestrator)
// Manages the workflow.
export const createMainAgent = (searchAgent: Agent, deckAgent: Agent, client?: GoogleGenAI) => new LlmAgent({
    name: "main_agent",
    description: "The primary assistant that manages the user's request.",
    model: "gemini-3-pro-preview",
    systemInstruction: `
        You are a helpful presentation assistant. You help users create and update slide decks.
        
        You have access to two specialized agents:
        1. search_agent: Use this to find information, facts, or news.
        2. deck_agent: Use this to update the slides.
        
        WORKFLOW:
        - If the user asks for information (e.g., "Find info about X"), delegate to 'search_agent'.
        - If the user asks to update slides (e.g., "Add a slide about X"), AND you have the info, delegate to 'deck_agent'.
        - If the user asks to "Find X and add a slide", you MUST do this in steps:
          Step 1: Delegate to 'search_agent' to get the info.
          Step 2: Once you have the info, delegate to 'deck_agent' with the specific content to add.
          
        Do not try to call 'update_deck' or 'googleSearch' directly. You must delegate.
    `,
    subAgents: [searchAgent, deckAgent],
    client
});
