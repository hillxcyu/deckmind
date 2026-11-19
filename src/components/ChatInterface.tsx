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

import React, { useState, useRef, useEffect } from 'react';
import { Message, Slide } from '../types';
import { generateChatResponse, getChatSuggestions } from '../services/gemini';
import { Send, Paperclip, Image as ImageIcon, Loader2, X, AlertTriangle, Sparkles, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatInterfaceProps {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  onUpdateDeck: (slides: Slide[]) => void;
  onUpdateSlide: (index: number, updates: Partial<Slide>) => void;
  stylePrompt: string;
  selectedSlideId: string | null;
  currentSlides: Slide[];
  onSlideSelect: (id: string | null) => void;
}

export function ChatInterface({ messages, setMessages, onUpdateDeck, onUpdateSlide, stylePrompt, selectedSlideId, currentSlides, onSlideSelect }: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachment, setAttachment] = useState<{ name: string; type: string; data: string } | null>(null);
  const [isOverloaded, setIsOverloaded] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Limit to 20MB for inlineData
    if (file.size > 20 * 1024 * 1024) {
        alert("File is too large. Please select a file under 20MB.");
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      if (!base64) {
          console.error("Failed to read file: result is empty");
          return;
      }
      
      // Remove data URL prefix (e.g., "data:image/png;base64,")
      const parts = base64.split(',');
      if (parts.length < 2) {
          console.error("Failed to parse base64 data");
          return;
      }
      
      const base64Data = parts[1];
      
      // Fallback for mime type if empty
      let mimeType = file.type;
      if (!mimeType) {
          const ext = file.name.split('.').pop()?.toLowerCase();
          if (ext === 'pdf') mimeType = 'application/pdf';
          else if (['jpg', 'jpeg'].includes(ext || '')) mimeType = 'image/jpeg';
          else if (ext === 'png') mimeType = 'image/png';
          else if (ext === 'txt') mimeType = 'text/plain';
          else mimeType = 'application/octet-stream';
      }

      console.log(`File selected: ${file.name}, Type: ${mimeType}, Size: ${base64Data.length} chars. Uploading...`);
      setIsLoading(true);

      try {
          const response = await fetch('/api/upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  filename: file.name,
                  mimeType: mimeType,
                  data: base64Data
              })
          });

          if (!response.ok) throw new Error("Upload failed");
          const result = await response.json();

          setAttachment({
            name: file.name,
            type: mimeType,
            data: undefined, // Cleared to save memory
            id: result.id,
            url: result.url
          });
      } catch (error) {
          console.error("Upload Error:", error);
          alert("Failed to upload file.");
      } finally {
          setIsLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSend = async () => {
    if ((!input.trim() && !attachment) || isLoading) return;
    setIsOverloaded(false); // Reset overload state

    // Determine selected slide index early
    let selectedIndex = -1;
    if (selectedSlideId) {
        selectedIndex = currentSlides.findIndex(s => s.id === selectedSlideId);
    }

    // Construct the user message for state/history
    let messageText = input;
    if (selectedIndex !== -1) {
        messageText = `(Referring to Slide #${selectedIndex + 1}) ${messageText}`;
    }

    if (attachment) {
        const attachmentLabel = `[Attachment: ${attachment.name}]`;
        messageText = input ? `${messageText}\n${attachmentLabel}` : `${messageText} ${attachmentLabel}`;
    }

    const userMsg: Message = { 
        role: 'user', 
        text: messageText, 
        timestamp: Date.now(),
        attachment: attachment || undefined
    };
    
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    const currentAttachment = attachment; 
    setAttachment(null); 
    setSuggestions([]); // Clear suggestions
    setIsLoading(true);

    try {
      // Prepare history from messages state
      const history = messages;

      const systemInstruction = `
        Current Style Context: ${stylePrompt}
        
        GENERAL RULES:
        - Be helpful, creative, and ensure the content fits the chosen style.
        - If the user uploads an image or document, analyze it and incorporate relevant information into the slide content.
        - Always provide a text response to the user, even when calling a tool.
      `;

      let messagePayload: any = input;
      if (currentAttachment && currentAttachment.id) {
          messagePayload = {
              text: input,
              attachmentId: currentAttachment.id // Send ID instead of inlineData
          };
      } else if (currentAttachment && currentAttachment.data) {
          // Fallback for legacy local attachments (if any)
          messagePayload = {
              text: input,
              inlineData: {
                  mimeType: currentAttachment.type,
                  data: currentAttachment.data
              }
          };
      }

      const responseText = await generateChatResponse(history, messagePayload, systemInstruction, onUpdateDeck, onUpdateSlide, 0, selectedIndex);

      const modelMsg: Message = { role: 'model', text: responseText, timestamp: Date.now() };
      setMessages(prev => [...prev, modelMsg]);
      
      // Generate suggestions in background
      getChatSuggestions([...messages, userMsg, modelMsg]).then(s => setSuggestions(s));
    } catch (error: any) {
      console.error("Chat error", error);
      const errorMessage = error.toString();
      if (errorMessage.includes("503") || errorMessage.includes("overloaded")) {
          setIsOverloaded(true);
          setMessages(prev => [...prev, { role: 'model', text: "The model is currently overloaded. Please try again in a moment.", timestamp: Date.now() }]);
      } else {
          setMessages(prev => [...prev, { role: 'model', text: "Sorry, I encountered an error. Please try again.", timestamp: Date.now() }]);
      }
    } finally {
      setIsLoading(false);
      onSlideSelect(null); // Clear selected slide after sending message
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 border-r border-gray-200 relative">
      {/* Header with Clear Button */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white shadow-sm shrink-0 z-10">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Assistant</h2>
        <button 
            onClick={() => {
                if (messages.length > 0 && window.confirm("Clear chat history? This will reset the conversation context.")) {
                    setMessages([]);
                }
            }}
            disabled={messages.length === 0}
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
            title="Clear Chat History"
        >
            <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Overload Warning Banner */}
      {isOverloaded && (
        <div className="absolute top-[50px] left-0 right-0 bg-amber-50 border-b border-amber-200 p-3 flex items-center justify-between z-20 animate-in slide-in-from-top-2">
            <div className="flex items-center text-amber-800 text-sm">
                <AlertTriangle className="h-4 w-4 mr-2" />
                <span>The model is experiencing high traffic. Please wait a moment before retrying.</span>
            </div>
            <button onClick={() => setIsOverloaded(false)} className="text-amber-600 hover:text-amber-800">
                <X className="h-4 w-4" />
            </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pt-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] p-3 rounded-lg ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-none'
                  : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none shadow-sm'
              }`}
            >
              <div className={`prose prose-sm ${msg.role === 'user' ? 'prose-invert' : ''} max-w-none`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 p-3 rounded-lg rounded-bl-none shadow-sm">
              <Loader2 className="animate-spin h-5 w-5 text-gray-400" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggestion Chips */}
      {suggestions.length > 0 && !isLoading && (
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto scrollbar-hide">
            {suggestions.map((s, i) => (
                <button
                    key={i}
                    onClick={() => setInput(s)} 
                    className="flex items-center whitespace-nowrap bg-gray-100 hover:bg-blue-50 text-gray-600 hover:text-blue-600 border border-gray-200 px-3 py-1.5 rounded-full text-xs transition-colors"
                >
                    <Sparkles className="w-3 h-3 mr-1.5" />
                    {s}
                </button>
            ))}
        </div>
      )}

      <div className="p-4 bg-white border-t border-gray-200">
        {selectedSlideId && currentSlides.length > 0 && (
            (() => {
                const selectedSlideIndex = currentSlides.findIndex(s => s.id === selectedSlideId);
                if (selectedSlideIndex !== -1) {
                    const slide = currentSlides[selectedSlideIndex];
                    return (
                        <div className="mb-2 flex items-center bg-blue-50 text-blue-800 text-sm px-3 py-1 rounded-full w-fit">
                            <span>Selected Slide: {selectedSlideIndex + 1} - {slide.title}</span>
                        </div>
                    );
                }
                return null;
            })()
        )}
        {attachment && (
            <div className="mb-2 flex items-center bg-gray-100 px-3 py-1 rounded-full w-fit">
                <span className="text-xs text-gray-600 truncate max-w-[200px]">{attachment.name}</span>
                <button onClick={() => setAttachment(null)} className="ml-2 text-gray-500 hover:text-red-500">
                    <X className="h-3 w-3" />
                </button>
            </div>
        )}
        <div className="flex items-center space-x-2">
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            onChange={handleFileSelect}
            accept="image/*,application/pdf,text/plain,video/*,audio/*"
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            title="Attach file or image"
          >
            <Paperclip className="h-5 w-5" />
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type a message..."
            className="flex-1 p-2 border border-gray-300 rounded-full focus:ring-2 focus:ring-blue-500 outline-none px-4"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || (!input.trim() && !attachment)}
            className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
