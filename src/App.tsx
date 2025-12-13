import React, { useState, useEffect } from 'react';
import { StyleConfig } from './components/StyleConfig';
import { ChatInterface } from './components/ChatInterface';
import { DeckPreview } from './components/DeckPreview';
import { DeckStyle, Slide, Message } from './types';
import { Key, X, Info } from 'lucide-react';

import { getGeminiApiKey } from './utils/env';

export default function App() {
  const [style, setStyle] = useState<DeckStyle | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isStylePanelOpen, setIsStylePanelOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'chat' | 'preview'>('chat');

  useEffect(() => {
    checkApiKey();
  }, []);

  const checkApiKey = async () => {
    // Check if key is provided via env (Docker/Local)
    const envKey = getGeminiApiKey();
    if (envKey) {
        setHasApiKey(true);
        return;
    }

    // Fallback to AI Studio check
    if (window.aistudio) {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      setHasApiKey(hasKey);
    }
  };

  const handleSelectKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      // Assume success as per guidelines to mitigate race condition
      setHasApiKey(true);
    }
  };

  const handleStyleSet = (newStyle: DeckStyle) => {
    setStyle(newStyle);
    // Add initial system message to chat
    setMessages([
      {
        role: 'model',
        text: `I've set the style to **${newStyle.aesthetic}**. ${newStyle.customStyleGuide ? `Noted your preferences: "${newStyle.customStyleGuide}".` : ''}\n\nLet's start building your deck! What is the topic or title of your presentation?`,
        timestamp: Date.now()
      }
    ]);
  };

  const handleUpdateDeck = (newSlides: Slide[]) => {
    // Merge updates carefully to preserve generated images if content hasn't changed significantly?
    // For now, simple replacement but try to keep images if ID matches
    setSlides(prevSlides => {
      return newSlides.map(newSlide => {
        const existing = prevSlides.find(p => p.id === newSlide.id);
        if (existing) {
          return { ...newSlide, imageUrl: existing.imageUrl, status: existing.status === 'generating' ? 'generating' : (existing.imageUrl ? 'completed' : 'pending') };
        }
        return newSlide;
      });
    });
  };

  const handleSlideUpdate = (id: string, updates: Partial<Slide>) => {
    setSlides(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 relative overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex justify-between items-center shadow-sm z-10 shrink-0">
        <div className="flex items-center space-x-2">
          <div className="bg-blue-600 w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold">D</div>
          <h1 className="text-xl font-bold text-gray-800">DeckMind</h1>
        </div>
        
        <div className="flex items-center space-x-2 md:space-x-4">
           {!hasApiKey && (
            <button
              onClick={handleSelectKey}
              className="flex items-center space-x-2 text-sm text-red-600 bg-red-50 px-3 py-1.5 rounded-full hover:bg-red-100 transition-colors border border-red-200"
            >
              <Key className="w-4 h-4" />
              <span className="hidden md:inline">Select API Key</span>
              <span className="md:hidden">Key</span>
            </button>
          )}
          {style && (
            <button 
              onClick={() => setIsStylePanelOpen(true)}
              className="text-sm text-gray-500 hover:bg-gray-100 px-3 py-1.5 rounded-full transition-colors flex items-center border border-transparent hover:border-gray-200"
            >
              <span className="hidden md:inline mr-2">Style:</span>
              <span className="font-medium text-gray-800 capitalize mr-2">{style.aesthetic}</span>
              <Info className="w-4 h-4 text-blue-500" />
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative flex flex-col md:flex-row">
        {!style ? (
          <div className="h-full w-full overflow-y-auto">
            <StyleConfig onStyleSet={handleStyleSet} />
          </div>
        ) : (
          <>
            {/* Mobile Tab Switcher */}
            <div className="md:hidden flex border-b border-gray-200 bg-white shrink-0">
                <button 
                    onClick={() => setMobileTab('chat')} 
                    className={`flex-1 p-3 text-sm font-medium transition-colors ${mobileTab === 'chat' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    Chat
                </button>
                <button 
                    onClick={() => setMobileTab('preview')} 
                    className={`flex-1 p-3 text-sm font-medium transition-colors ${mobileTab === 'preview' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    Deck ({slides.length})
                </button>
            </div>

            {/* Left: Chat */}
            <div className={`${mobileTab === 'chat' ? 'flex' : 'hidden'} md:flex flex-1 md:flex-none w-full md:w-1/3 md:min-w-[350px] md:max-w-[500px] flex-col bg-white min-h-0`}>
              <ChatInterface
                messages={messages}
                setMessages={setMessages}
                onUpdateDeck={handleUpdateDeck}
                stylePrompt={style.generatedSystemPrompt}
              />
            </div>

            {/* Right: Preview */}
            <div className={`${mobileTab === 'preview' ? 'flex' : 'hidden'} md:flex flex-1 overflow-hidden border-l border-gray-200 flex-col min-h-0`}>
              <DeckPreview
                slides={slides}
                style={style}
                onSlideUpdate={handleSlideUpdate}
              />
            </div>
          </>
        )}

        {/* Style Context Slide-out Panel */}
        {style && (
          <>
            {/* Backdrop */}
            <div 
              className={`absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity duration-300 z-20 ${isStylePanelOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              onClick={() => setIsStylePanelOpen(false)}
            />
            
            {/* Panel */}
            <div 
              className={`absolute top-0 right-0 h-full w-full md:w-96 bg-white shadow-2xl transform transition-transform duration-300 ease-in-out z-30 flex flex-col ${isStylePanelOpen ? 'translate-x-0' : 'translate-x-full'}`}
            >
              <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                <h2 className="text-lg font-bold text-gray-800">Global Style Context</h2>
                <button 
                  onClick={() => setIsStylePanelOpen(false)}
                  className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto">
                <StyleConfig 
                    onStyleSet={(newStyle) => {
                        handleStyleSet(newStyle);
                        setIsStylePanelOpen(false);
                    }} 
                    initialStyle={style} 
                />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
