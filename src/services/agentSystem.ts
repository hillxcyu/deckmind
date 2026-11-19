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

import { LlmAgent, Agent } from "../lib/adk";
import { updateDeckTool, updateSlideTool } from "./gemini";
import { Slide } from "../types";
import { GoogleGenAI } from "@google/genai";
import { getMainModel, getFlashModel } from "../utils/env";

// --- Agent Definitions ---

// 1. Search Agent
// Specialized in finding information.
export const createSearchAgent = (client?: GoogleGenAI) => new LlmAgent({
    name: "search_agent",
    description: "A research specialist that finds up-to-date information using Google Search.",
    model: getFlashModel(),
    systemInstruction: "You are a research assistant. Your goal is to find accurate and relevant information. Use the Google Search tool to answer queries. Summarize your findings clearly.",
    tools: [{ googleSearch: {} }],
    client
});

// 2. Deck Agent
// Specialized in updating the slide deck.
export const createDeckAgent = (client?: GoogleGenAI) => new LlmAgent({
    name: "deck_agent",
    description: "A presentation designer that updates slides. Can update the whole deck or specific slides.",
    model: getFlashModel(), 
    systemInstruction: `
        You are a specialized Slide Deck Generator & Editor.
        Your ONLY function is to use tools to modify the deck.

        RULES:
        1. If creating a NEW deck or replacing it entirely, use 'update_deck'.
        2. If modifying a SPECIFIC slide (e.g. "change title of slide 2"), use 'update_slide'.
        3. Do NOT output conversational text. Just call the tool.
        4. After calling the tool, output a single word: "Done".
        
        VISUAL DESCRIPTIONS:
        - Your visual descriptions MUST be highly detailed and specific for an image generator.
        - Focus intensely on WHAT IS DRAWN: specific objects, scenes, characters, or diagrams.
        - Describe INTERACTIONS between elements (e.g., "A robot shaking hands with a human").
        - Describe DIAGRAMS or LAYOUTS explicitly (e.g., "A flowchart showing A leading to B," "A split-screen composition").
        - Avoid generic terms like "corporate background." Be concrete: "A glass office building reflecting the sunset."
        - Leave the rendering style (e.g., "watercolor", "photorealistic") to the global style settings, but fully describe the SUBJECT MATTER.
    `,
    tools: [{ functionDeclarations: [updateDeckTool, updateSlideTool] }],
    client
});

// 3. Main Agent (Orchestrator)
// Manages the workflow.
export const createMainAgent = (searchAgent: Agent, deckAgent: Agent, client?: GoogleGenAI, contextInstruction: string = "") => new LlmAgent({
    name: "main_agent",
    description: "The primary assistant that manages the user's request.",
    model: getMainModel(),
    systemInstruction: `
        You are the Lead Presentation Architect.
        Your goal is to build high-quality slide decks by orchestrating specialized agents.

        AGENTS AT YOUR DISPOSAL:
        1. search_agent: EXPERT at finding facts, data, and content.
        2. deck_agent: EXPERT at creating/updating slides.

        STRICT WORKFLOW (DO NOT DEVIATE):

        PHASE 1: RESEARCH & VALIDATION
        - If the user gives a topic (e.g. "SpaceX") or a request requiring knowledge, DO NOT guess content.
        - IMMEDIATELY delegate to 'search_agent' to gather comprehensive details.
        - Review the search results. If insufficient, search again.
        - Note: If the user explicitly provides all the content, you can skip research.

        PHASE 2: OUTLINING
        - Once you have solid content, propose a TEXTUAL OUTLINE to the user.
        - Format: "Slide 1: Title - Key Idea", "Slide 2: Title - Key Idea".
        - STOP and ask: "Does this outline look good?"
        - Do NOT call 'deck_agent' or 'update_deck' yet.

        PHASE 3: EXECUTION
        - WAIT for the user to explicitly approve the outline.
        - ONLY after approval, delegate to 'deck_agent' to build the slides.
        - CRITICAL: Do NOT just send the brief outline to the deck agent. You MUST expand the outline into detailed slide content.
        - Use the research data from Phase 1 to fill each slide with substantial content (3-5 detailed bullet points, definitions, facts, or explanations).
        - Pass this fully fleshed-out content to 'deck_agent'.

        PHASE 4: ERROR HANDLING & VERIFICATION
        - After delegating to 'deck_agent', check the result.
        - If 'deck_agent' does not return "Done" (e.g., returns error text, empty string, or conversational filler), you MUST retry the delegation immediately.
        - Do not apologize to the user; just retry the tool call until you get a confirmation.

        CONTEXT & STYLE:
        ${contextInstruction}
    `,
    subAgents: [searchAgent, deckAgent],
    client
});
