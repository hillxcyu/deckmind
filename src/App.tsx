import React, { useState, useEffect } from 'react';
import { StyleConfig } from './components/StyleConfig';
import { ChatInterface } from './components/ChatInterface';
import { DeckPreview } from './components/DeckPreview';
import { DeckStyle, Slide, Message } from './types';
import { Info, X, Save, FolderOpen, User as UserIcon, Shield, LogOut, Plus } from 'lucide-react';
import { PresenterView } from './components/PresenterView';
import { DeckManager } from './components/DeckManager';
import { LoginScreen } from './components/LoginScreen';
import { AdminPanel } from './components/AdminPanel';
import { deckStore } from './services/deckStore';
import { auth } from './services/auth';
import { checkImageJobStatus, constructImagePrompt, generateChatResponse } from './services/gemini';

export default function App() {
  const [style, setStyle] = useState<DeckStyle | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStylePanelOpen, setIsStylePanelOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'chat' | 'preview'>('chat');
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(null);
  const [imageGenerationMode, setImageGenerationMode] = useState<'full' | 'background'>('full');

  const [isPresenting, setIsPresenting] = useState(false);
  const [currentPresentationSlideIndex, setCurrentPresentationSlideIndex] = useState(0);
  
  const [currentDeckId, setCurrentDeckId] = useState<number | null>(null);
  const [isDeckManagerOpen, setIsDeckManagerOpen] = useState(false);
  
  const [user, setUser] = useState<{ username: string, is_admin?: boolean } | null>(null);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [deckTitle, setDeckTitle] = useState("Untitled Presentation");
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  // Auto-Restore on Mount
  useEffect(() => {
    // Check local storage for rescue data
    try {
        const rescueJson = localStorage.getItem('deckmind_rescue');
        if (rescueJson) {
            const rescueData = JSON.parse(rescueJson);
            // Only restore if we have meaningful data
            if (rescueData.slides?.length > 0 || rescueData.style) {
                console.log("Restoring session from local storage...");
                if (rescueData.slides) setSlides(rescueData.slides);
                if (rescueData.style) setStyle(rescueData.style);
                if (rescueData.messages) setMessages(rescueData.messages);
                if (rescueData.deckTitle) setDeckTitle(rescueData.deckTitle);
                if (rescueData.currentDeckId) setCurrentDeckId(rescueData.currentDeckId);
            }
        }
    } catch (e) {
        console.error("Failed to restore session", e);
    }
  }, []);

  // Image Generation Polling
  useEffect(() => {
      const generatingSlides = slides.filter(s => s.status === 'generating' && s.generationJobId);
      
      if (generatingSlides.length === 0) return;

      const interval = setInterval(async () => {
          let hasUpdates = false;
          // Create a map for quick lookup
          const updates = new Map<string, Partial<Slide>>();

          await Promise.all(generatingSlides.map(async (slide) => {
              if (!slide.generationJobId) return;
              try {
                  const result = await checkImageJobStatus(slide.generationJobId);
                  
                  if (result.status === 'completed' && result.imageUrl) {
                      const currentHistory = slide.imageHistory || (slide.imageUrl ? [slide.imageUrl] : []);
                      const newHistory = [...currentHistory, result.imageUrl];
                      
                      updates.set(slide.id, {
                          status: 'completed',
                          imageUrl: result.imageUrl,
                          imageHistory: newHistory,
                          currentImageIndex: newHistory.length - 1,
                          generationJobId: undefined
                      });
                      hasUpdates = true;
                  } else if (result.status === 'failed') {
                       updates.set(slide.id, { status: 'failed', generationJobId: undefined });
                       hasUpdates = true;
                  }
              } catch (e) {
                  console.error("Polling error for slide " + slide.id, e);
              }
          }));

          if (hasUpdates) {
              setSlides(prev => prev.map(s => updates.has(s.id) ? { ...s, ...updates.get(s.id) } : s));
          }
      }, 3000); // Poll every 3 seconds

      return () => clearInterval(interval);
  }, [slides]);

  // Auto-Save Effect
  useEffect(() => {
      // Don't save empty states
      if (slides.length === 0 && !style && messages.length === 0) return;

      const saveData = {
          slides,
          style,
          messages,
          deckTitle,
          currentDeckId,
          timestamp: Date.now()
      };

      const handler = setTimeout(async () => {
          // Local Rescue
          localStorage.setItem('deckmind_rescue', JSON.stringify(saveData));
          
          // Remote Autosave
          if (currentDeckId) {
             try {
                await deckStore.update(currentDeckId, {
                    title: deckTitle,
                    slides, style: style!, messages
                });
                console.log("Autosaved to server");
             } catch(e) {
                 console.error("Autosave failed", e);
             }
          }
      }, 2000); // Debounce 2s

      return () => clearTimeout(handler);
  }, [slides, style, messages, deckTitle, currentDeckId]);

  useEffect(() => {
    // Check for existing session
    const savedUser = auth.getUser();
    if (savedUser) setUser(savedUser);
  }, []);

  if (!user) {
      return <LoginScreen onLogin={setUser} />;
  }

  const handleStyleSet = async (newStyle: DeckStyle) => {
    setStyle(newStyle);
    
    // Add a system message to history indicating the style change
    const styleChangeMsg: Message = {
        role: 'user',
        text: `(System: The user has updated the visual style to "${newStyle.aesthetic}". Context: ${newStyle.generatedSystemPrompt})`,
        timestamp: Date.now()
    };
    
    // Optimistically update messages
    setMessages(prev => [...prev, styleChangeMsg]);

    if (slides.length > 0) {
        // Trigger the Agent to update visual descriptions
        const prompt = `
            The visual style has been updated to: ${newStyle.aesthetic}.
            
            Please delegate to 'deck_agent' to REBUILD the deck to match this new style.
            - Use the current deck state provided in the context as the source content.
            - You may refine the slide titles and content to better fit the new style if needed, but keep the core message.
            - Generate completely new 'visualDescription's that align with the new style context: ${newStyle.generatedSystemPrompt}
        `;

        // Temporary loading indicator (optional, or we just let the chat interface show processing)
        
        try {
            // We need to construct the history including the current slides context
            // Ideally, we pass the slides to the agent context. The agent already has access via tools, 
            // but providing them in the context helps it "see" them without querying.
            // For now, we rely on the agent's memory or the fact that it manages the deck state.
            // Wait, the agent state is stateless per request in this architecture, 
            // so we must pass the current slides in the prompt or history if we want it to know them *exactly*.
            // However, the `update_deck` tool replaces the whole deck.
            
            const contextInstruction = `
                Current Style Context: ${newStyle.generatedSystemPrompt}
                
                Current Deck State (JSON):
                ${JSON.stringify(slides.map(s => ({ id: s.id, title: s.title, content: s.content, visualDescription: s.visualDescription })))}
            `;

            const responseText = await generateChatResponse(
                [...messages, styleChangeMsg], 
                prompt, 
                contextInstruction, 
                (newSlides) => {
                     // When agent returns new slides, update them and regenerate prompts
                     setSlides(prevSlides => newSlides.map(s => {
                         const existing = prevSlides.find(p => p.id === s.id);
                         return {
                             ...s,
                             // Preserve images if status hasn't changed? No, we want to regenerate visuals later.
                             // But for now, we just update the prompt.
                             imageUrl: existing?.imageUrl, // Keep old image until user regenerates?
                             status: 'pending', // Mark as pending to allow regeneration
                             imagePrompt: constructImagePrompt(s, newStyle, s.generationMode || 'full')
                         };
                     }));
                },
                handleUpdateSlideContent
            );

            setMessages(prev => [...prev, { role: 'model', text: responseText, timestamp: Date.now() }]);

        } catch (e) {
            console.error("Failed to trigger agent style update", e);
            setMessages(prev => [...prev, { role: 'model', text: "I updated the style settings, but couldn't automatically rewrite the slide descriptions. You may need to regenerate them manually.", timestamp: Date.now() }]);
            
            // Fallback: Just update local prompts with old descriptions
            setSlides(prevSlides => prevSlides.map(slide => ({
                ...slide,
                imagePrompt: constructImagePrompt(slide, newStyle, slide.generationMode || 'full')
            })));
        }
    } else {
        // No slides yet, just standard ack
        const responseText = `I've updated the style to **${newStyle.aesthetic}**. ${newStyle.customStyleGuide ? `Noted your preferences: "${newStyle.customStyleGuide}".` : ''}\n\nLet's start building your deck! What is the topic or title of your presentation?`;
         setMessages(prev => {
            if (prev.length === 0) return [{ role: 'model', text: responseText, timestamp: Date.now() }];
            return [...prev, { role: 'model', text: responseText, timestamp: Date.now() }];
        });
    }
  };

  const handleUpdateDeck = (newSlides: Slide[]) => {
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

  const handleUpdateSlideContent = (index: number, updates: Partial<Slide>) => {
    setSlides(prev => prev.map((s, i) => i === index ? { ...s, ...updates, imageUrl: undefined, status: 'pending' } : s));
  };

  const handleSlideUpdate = (id: string, updates: Partial<Slide>) => {
    setSlides(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const handleStartPresentation = (initialIndex: number = 0) => {
    setCurrentPresentationSlideIndex(initialIndex);
    setIsPresenting(true);
  };

  const handleExitPresentation = () => {
    setIsPresenting(false);
  };

  const handleLogout = () => {
      auth.clearToken();
      setUser(null);
      setSlides([]);
      setStyle(null);
      setMessages([]);
      setDeckTitle("Untitled Presentation");
      setCurrentDeckId(null);
  };

  const handleNewProject = () => {
      if (slides.length > 0 && !confirm("Start a new project? Unsaved changes will be lost.")) {
          return;
      }
      setSlides([]);
      setStyle(null);
      setMessages([]);
      setDeckTitle("Untitled Presentation");
      setCurrentDeckId(null);
  };

  const handleRenameTitle = async (newTitle: string) => {
      setDeckTitle(newTitle);
      setIsEditingTitle(false);
      
      if (currentDeckId) {
          try {
              await deckStore.update(currentDeckId, {
                  title: newTitle,
                  slides, style: style!, messages
              });
          } catch (e) {
              console.error("Failed to persist title change", e);
          }
      }
  };

  const handleSaveDeck = async () => {
    if (!style) {
        alert("Please create a deck first.");
        return;
    }
    
    if (currentDeckId) {
        await deckStore.update(currentDeckId, {
            title: deckTitle,
            slides, style, messages
        });
        alert("Deck saved!");
    } else {
        const { id } = await deckStore.save({ title: deckTitle, slides, style, messages });
        setCurrentDeckId(id);
        alert("Deck saved!");
    }
  };

  const handleLoadDeck = async (id: number) => {
      try {
          const deck = await deckStore.load(id);
          setSlides(deck.slides);
          setStyle(deck.style);
          setMessages(deck.messages);
          setDeckTitle(deck.title);
          setCurrentDeckId(deck.id);
          setIsDeckManagerOpen(false);
      } catch (e) {
          console.error(e);
          alert("Failed to load deck.");
      }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 relative overflow-hidden">
      {isPresenting ? (
        <PresenterView 
            slides={slides} 
            initialSlideIndex={currentPresentationSlideIndex}
            onExit={handleExitPresentation}
        />
      ) : (
        <>
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex justify-between items-center shadow-sm z-10 shrink-0">
        <div className="flex items-center space-x-2">
          <div className="bg-blue-600 w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold shrink-0">D</div>
          {isEditingTitle ? (
              <input 
                autoFocus
                className="text-xl font-bold text-gray-800 border-b border-blue-500 outline-none px-1"
                value={deckTitle}
                onChange={(e) => setDeckTitle(e.target.value)}
                onBlur={() => handleRenameTitle(deckTitle)}
                onKeyDown={(e) => e.key === 'Enter' && handleRenameTitle(deckTitle)}
              />
          ) : (
              <h1 
                className="text-xl font-bold text-gray-800 cursor-pointer hover:bg-gray-100 px-2 rounded transition-colors truncate max-w-[200px] md:max-w-md"
                onClick={() => setIsEditingTitle(true)}
                title="Click to rename"
              >
                {deckTitle}
              </h1>
          )}
          <button
            onClick={handleNewProject}
            className="text-gray-500 hover:text-green-600 p-2 rounded-full hover:bg-green-50 transition-colors ml-2"
            title="New Project"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex items-center space-x-2 md:space-x-4">
          {user.is_admin && (
            <button
                onClick={() => setIsAdminPanelOpen(true)}
                className="text-gray-500 hover:text-purple-600 p-2 rounded-full hover:bg-purple-50 transition-colors"
                title="Admin Settings"
            >
                <Shield className="w-5 h-5" />
            </button>
          )}
          
          <button
            onClick={() => setIsDeckManagerOpen(true)}
            className="text-gray-500 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 transition-colors"
            title="Open Saved Decks"
          >
            <FolderOpen className="w-5 h-5" />
          </button>
          
          <button
            onClick={handleSaveDeck}
            className="text-gray-500 hover:text-blue-600 p-2 rounded-full hover:bg-blue-50 transition-colors"
            title="Save Deck"
          >
            <Save className="w-5 h-5" />
          </button>

          <div className="h-6 w-px bg-gray-200 mx-1"></div>

          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-red-600 p-2 rounded-full hover:bg-red-50 transition-colors"
            title={`Sign out (${user.username})`}
          >
            <LogOut className="w-5 h-5" />
          </button>

          <button
            onClick={() => setImageGenerationMode(prev => prev === 'full' ? 'background' : 'full')}
            className={`text-sm px-3 py-1.5 rounded-full transition-colors flex items-center border ${imageGenerationMode === 'full' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-green-50 text-green-700 border-green-200'}`}
            title={imageGenerationMode === 'full' ? "Full Slide Mode: AI generates text & layout" : "Background Mode: AI generates art only, text is overlaid"}
          >
             <span className="hidden md:inline mr-2">{imageGenerationMode === 'full' ? 'Full Slide' : 'Background Only'}</span>
             <span className="md:hidden">{imageGenerationMode === 'full' ? 'Full' : 'Bg'}</span>
          </button>

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
                    onUpdateSlide={handleUpdateSlideContent}
                    stylePrompt={style.generatedSystemPrompt}
                    selectedSlideId={selectedSlideId}
                    currentSlides={slides}
                    onSlideSelect={setSelectedSlideId}
                  />
                </div>

                {/* Right: Preview */}
                <div className={`${mobileTab === 'preview' ? 'flex' : 'hidden'} md:flex flex-1 overflow-hidden border-l border-gray-200 flex-col min-h-0`}>
                  <DeckPreview
                    slides={slides}
                    style={style}
                    onSlideUpdate={handleSlideUpdate}
                    selectedSlideId={selectedSlideId}
                    onSlideSelect={setSelectedSlideId}
                    imageGenerationMode={imageGenerationMode}
                    onStartPresentation={handleStartPresentation}
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
          
          <DeckManager 
            isOpen={isDeckManagerOpen} 
            onClose={() => setIsDeckManagerOpen(false)} 
            onLoad={handleLoadDeck} 
          />
          
          <AdminPanel 
            isOpen={isAdminPanelOpen} 
            onClose={() => setIsAdminPanelOpen(false)} 
            currentUser={user}
          />
        </>
      )}
    </div>
  );
}
