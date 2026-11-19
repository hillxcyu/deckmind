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

import { Slide, DeckStyle, Message } from "../types";
import { auth } from "./auth";

export interface SavedDeckMetadata {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface SavedDeck extends SavedDeckMetadata {
  slides: Slide[];
  style: DeckStyle;
  messages: Message[];
}

export const deckStore = {
  list: async (): Promise<SavedDeckMetadata[]> => {
    const res = await fetch('/api/decks', { headers: auth.getAuthHeaders() });
    if (!res.ok) throw new Error("Failed to list decks");
    return res.json();
  },

  load: async (id: number): Promise<SavedDeck> => {
    const res = await fetch(`/api/decks/${id}`, { headers: auth.getAuthHeaders() });
    if (!res.ok) throw new Error("Failed to load deck");
    return res.json();
  },

  save: async (deck: { title: string, slides: Slide[], style: DeckStyle, messages: Message[] }): Promise<{ id: number }> => {
    // Filter out transient image history
    const cleanSlides = deck.slides.map(s => {
        const { imageHistory, currentImageIndex, ...rest } = s;
        return rest;
    });

    const res = await fetch('/api/decks', {
      method: 'POST',
      headers: auth.getAuthHeaders(),
      body: JSON.stringify({ ...deck, slides: cleanSlides })
    });
    if (!res.ok) throw new Error("Failed to save deck");
    return res.json();
  },

  update: async (id: number, deck: { title: string, slides: Slide[], style: DeckStyle, messages: Message[] }): Promise<void> => {
    // Filter out transient image history
    const cleanSlides = deck.slides.map(s => {
        const { imageHistory, currentImageIndex, ...rest } = s;
        return rest;
    });

    const res = await fetch(`/api/decks/${id}`, {
      method: 'PUT',
      headers: auth.getAuthHeaders(),
      body: JSON.stringify({ ...deck, slides: cleanSlides })
    });
    if (!res.ok) throw new Error("Failed to update deck");
  },

  delete: async (id: number): Promise<void> => {
    const res = await fetch(`/api/decks/${id}`, {
      method: 'DELETE',
      headers: auth.getAuthHeaders()
    });
    if (!res.ok) throw new Error("Failed to delete deck");
  }
};
