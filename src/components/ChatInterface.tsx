import React, { useState, useRef, useEffect } from 'react';
import { Message, Slide } from '../types';
import { generateChatResponse } from '../services/gemini';
import { Send, Paperclip, Image as ImageIcon, Loader2, X, AlertTriangle, Globe } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatInterfaceProps {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  onUpdateDeck: (slides: Slide[]) => void;
  stylePrompt: string;
}

export function ChatInterface({ messages, setMessages, onUpdateDeck, stylePrompt }: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachment, setAttachment] = useState<{ name: string; type: string; data: string } | null>(null);
  const [isOverloaded, setIsOverloaded] = useState(false);
  const [useSearch, setUseSearch] = useState(false);
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
    reader.onload = (e) => {
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

      console.log(`File selected: ${file.name}, Type: ${mimeType}, Size: ${base64Data.length} chars`);

      setAttachment({
        name: file.name,
        type: mimeType,
        data: base64Data
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSend = async () => {
    if ((!input.trim() && !attachment) || isLoading) return;
    setIsOverloaded(false); // Reset overload state

    // Construct the user message for state/history
    // If there's an attachment, we append a text representation so the history remains valid
    // (We don't store the full base64 in history to save tokens/memory for now)
    let messageText = input;
    if (attachment) {
        const attachmentLabel = `[Attachment: ${attachment.name}]`;
        messageText = input ? `${input}\n${attachmentLabel}` : attachmentLabel;
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
    setIsLoading(true);

    try {
      // Prepare history from messages state
      // We pass the full message object including attachment to the service
      // The service will handle formatting it for the API
      const history = messages;

      const systemInstruction = `
        You are an expert presentation designer helping a user create a slide deck.
        
        Current Style Context: ${stylePrompt}
        
        Your goal is to help the user compose the content for their slides. Follow this strict process:

        PHASE 1: OUTLINE
        1. First, understand the topic and audience.
        2. Propose a high-level OUTLINE of the deck (a list of slide titles and brief ideas).
        3. Do NOT call the 'update_deck' tool yet. Wait for the user to agree to or modify the outline.

        PHASE 2: DETAILED CONTENT
        4. Once the user approves the outline, flesh out the content for each slide.
        5. Call the 'update_deck' tool to generate the slides. 
        6. The 'update_deck' tool requires a full list of slides. You should maintain the state of the deck in your context and update it incrementally.
        
        GENERAL RULES:
        - Be helpful, creative, and ensure the content fits the chosen style.
        - If the user uploads an image or document, analyze it and incorporate relevant information into the slide content.
        - Always provide a text response to the user, even when calling a tool.
      `;

      let messagePayload: any = input;
      if (currentAttachment) {
          messagePayload = {
              text: input,
              inlineData: {
                  mimeType: currentAttachment.type,
                  data: currentAttachment.data
              }
          };
      }

      const responseText = await generateChatResponse(history, messagePayload, systemInstruction, onUpdateDeck, 0, useSearch);

      const modelMsg: Message = { role: 'model', text: responseText, timestamp: Date.now() };
      setMessages(prev => [...prev, modelMsg]);
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
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 border-r border-gray-200 relative">
      {/* Overload Warning Banner */}
      {isOverloaded && (
        <div className="absolute top-0 left-0 right-0 bg-amber-50 border-b border-amber-200 p-3 flex items-center justify-between z-10 animate-in slide-in-from-top-2">
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

      <div className="p-4 bg-white border-t border-gray-200">
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

          <button 
            onClick={() => setUseSearch(!useSearch)}
            className={`p-2 rounded-full transition-colors ${useSearch ? 'text-blue-600 bg-blue-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
            title="Toggle Search Grounding"
          >
            <Globe className="h-5 w-5" />
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
