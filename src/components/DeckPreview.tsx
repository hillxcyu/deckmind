import React, { useState, useRef, useEffect } from 'react';
import { Slide, DeckStyle } from '../types';
import { generateSlideImage, constructImagePrompt, initiateImageGeneration } from '../services/gemini';
import { exportToPPTX, exportToPDF } from '../services/export';
import { Loader2, RefreshCw, Image as ImageIcon, AlertCircle, Download, FileText, Presentation, Save, MoreVertical, SquarePen, Undo2, ArrowLeft, ArrowRight } from 'lucide-react';

interface DeckPreviewProps {
  slides: Slide[];
  style: DeckStyle;
  onSlideUpdate: (id: string, updates: Partial<Slide>) => void;
  selectedSlideId: string | null;
  onSlideSelect: (id: string) => void;
  imageGenerationMode: 'full' | 'background';
  onStartPresentation: (initialIndex?: number) => void;
}

export function DeckPreview({ slides, style, onSlideUpdate, selectedSlideId, onSlideSelect, imageGenerationMode, onStartPresentation }: DeckPreviewProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [openSlideMenuId, setOpenSlideMenuId] = useState<string | null>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const slideMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
      // Close slide menus if clicking outside the menu container
      if (openSlideMenuId && slideMenuRef.current && !slideMenuRef.current.contains(event.target as Node)) {
          setOpenSlideMenuId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openSlideMenuId]);
  
  const handleGenerateImage = async (slide: Slide) => {
    // Ensure prompt exists or construct it
    const promptToUse = slide.imagePrompt || constructImagePrompt(slide, style, imageGenerationMode);
    
    // Save prompt if it wasn't there
    if (!slide.imagePrompt) {
        onSlideUpdate(slide.id, { imagePrompt: promptToUse });
    }

    onSlideUpdate(slide.id, { status: 'generating', imagePrompt: promptToUse }); 
    try {
      const result = await initiateImageGeneration(slide, style, imageGenerationMode);
      
      if (result.status === 'completed' && result.imageUrl) {
          // Immediate completion (Client-side)
          const currentHistory = slide.imageHistory || (slide.imageUrl ? [slide.imageUrl] : []);
          const newHistory = [...currentHistory, result.imageUrl];
          const newIndex = newHistory.length - 1;

          onSlideUpdate(slide.id, { 
              imageUrl: result.imageUrl, 
              status: 'completed', 
              generationMode: imageGenerationMode,
              imageHistory: newHistory,
              currentImageIndex: newIndex,
              generationJobId: undefined
          });
      } else if (result.status === 'pending' && result.jobId) {
          // Background Job Started
          onSlideUpdate(slide.id, { 
              status: 'generating', 
              generationJobId: result.jobId 
          });
      } else {
          throw new Error(result.error || "Generation failed");
      }
    } catch (error) {
      console.error("Failed to generate image", error);
      onSlideUpdate(slide.id, { status: 'failed' });
    }
  };

  const handleImageHistoryNav = (slide: Slide, direction: 'prev' | 'next') => {
      if (!slide.imageHistory || slide.imageHistory.length === 0) return;
      
      const currentIndex = slide.currentImageIndex ?? (slide.imageHistory.length - 1);
      let newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
      
      // Clamp index
      if (newIndex < 0) newIndex = 0;
      if (newIndex >= slide.imageHistory.length) newIndex = slide.imageHistory.length - 1;
      
      if (newIndex !== currentIndex) {
          onSlideUpdate(slide.id, {
              currentImageIndex: newIndex,
              imageUrl: slide.imageHistory[newIndex]
          });
      }
  };

  const handleToggleFlip = (slide: Slide) => {
      // Initialize prompt if missing when flipping
      if (!slide.imagePrompt) {
          const prompt = constructImagePrompt(slide, style, imageGenerationMode);
          onSlideUpdate(slide.id, { isFlipped: !slide.isFlipped, imagePrompt: prompt });
      } else {
          onSlideUpdate(slide.id, { isFlipped: !slide.isFlipped });
      }
  };

  const handleSavePrompt = (slide: Slide, newPrompt: string) => {
      onSlideUpdate(slide.id, { imagePrompt: newPrompt, isFlipped: false });
  };

  const handleGenerateAll = () => {
    slides.forEach(slide => {
      if (slide.status !== 'completed' && slide.status !== 'generating') {
        handleGenerateImage(slide);
      }
    });
  };

  const handleExportPPTX = async () => {
    setIsExporting(true);
    try {
        await exportToPPTX(slides, style);
    } catch (e) {
        console.error("Export failed", e);
        alert("Failed to export presentation.");
    } finally {
        setIsExporting(false);
    }
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
        await exportToPDF(slides, style);
    } catch (e) {
        console.error("Export failed", e);
        alert("Failed to export PDF.");
    } finally {
        setIsExporting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 bg-gray-100">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Deck</h2>
                    <div className="flex w-full md:w-auto space-x-2">
                    <button
                    onClick={() => {
                        const initialIndex = selectedSlideId ? slides.findIndex(s => s.id === selectedSlideId) : 0;
                        onStartPresentation(initialIndex !== -1 ? initialIndex : 0);
                    }}
                    className="flex-1 md:flex-none justify-center bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors flex items-center shadow-sm text-sm"
                    disabled={slides.length === 0}
                    >
                    <Presentation className="mr-2 h-4 w-4" />
                    <span className="whitespace-nowrap">Present</span>
                    </button>
        
                    <button
                    onClick={handleGenerateAll}
                    className="flex-1 md:flex-none justify-center bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 transition-colors flex items-center shadow-sm text-sm"
                    >            <ImageIcon className="mr-2 h-4 w-4" />
            <span className="whitespace-nowrap">Generate Images</span>
            </button>
            
            <div className="relative" ref={exportMenuRef}>
                <button 
                    onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                    className="w-full justify-center bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors flex items-center shadow-sm text-sm"
                >
                    <Download className="mr-2 h-4 w-4" />
                    Export
                </button>
                {isExportMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-20 border border-gray-200">
                    <button 
                        onClick={() => { handleExportPPTX(); setIsExportMenuOpen(false); }}
                        disabled={isExporting}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                    >
                        <Presentation className="mr-2 h-4 w-4 text-orange-500" />
                        PowerPoint (.pptx)
                    </button>
                    <button 
                         onClick={() => { alert("To export to Google Slides, please upload the generated .pptx file to Google Drive and open it with Google Slides."); setIsExportMenuOpen(false); }}
                         className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                    >
                        <FileText className="mr-2 h-4 w-4 text-yellow-500" />
                        Google Slides
                    </button>
                    <button 
                        onClick={() => { handleExportPDF(); setIsExportMenuOpen(false); }}
                        disabled={isExporting}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                    >
                        <FileText className="mr-2 h-4 w-4 text-red-500" />
                        PDF
                    </button>
                </div>
                )}
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {slides.map((slide, index) => (
          <div 
            key={slide.id} 
            onClick={() => onSlideSelect(slide.id)}
            className={`bg-white rounded-lg shadow-md overflow-hidden flex flex-col transition-all duration-300 hover:shadow-lg cursor-pointer border-2 ${selectedSlideId === slide.id ? 'border-blue-500 ring-2 ring-blue-200' : 'border-transparent'}`}
          >
            <div className="relative aspect-video bg-gray-200 group [perspective:1000px]">
              <div className={`relative w-full h-full transition-all duration-500 [transform-style:preserve-3d] ${slide.isFlipped ? '[transform:rotateY(180deg)]' : ''}`}>
                  {/* Front Face (Image) */}
                  <div className="absolute inset-0 w-full h-full [backface-visibility:hidden]">
                    {slide.status === 'generating' ? (
                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 p-4 text-center bg-gray-100">
                            <Loader2 className="h-8 w-8 animate-spin mb-2 text-blue-600" />
                            <span className="text-sm">Generating...</span>
                        </div>
                    ) : slide.imageUrl ? (
                        <img src={slide.imageUrl} alt={slide.title} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 p-4 text-center">
                        {slide.status === 'failed' ? (
                            <div className="flex flex-col items-center text-red-500">
                                <AlertCircle className="h-8 w-8 mb-2" />
                                <span className="text-sm">Generation Failed</span>
                            </div>
                        ) : (
                            <>
                            <ImageIcon className="h-12 w-12 mb-2 opacity-50" />
                            <span className="text-sm">{slide.visualDescription || "No visual description yet"}</span>
                            </>
                        )}
                        </div>
                    )}
                    
                    {/* Actions Menu (Kebab) - Front Only */}
                    {slide.status !== 'generating' && !slide.isFlipped && (
                        <div className="absolute top-2 right-2 z-10" ref={openSlideMenuId === slide.id ? slideMenuRef : null}>
                            <button
                                onClick={(e) => { e.stopPropagation(); setOpenSlideMenuId(openSlideMenuId === slide.id ? null : slide.id); }}
                                className="slide-menu-trigger bg-black/50 text-white p-1.5 rounded-full hover:bg-black/70 transition-colors backdrop-blur-sm"
                            >
                                <MoreVertical className="h-4 w-4" />
                            </button>
                            
                            {openSlideMenuId === slide.id && (
                                <div className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg border border-gray-200 overflow-hidden flex flex-col py-1">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleGenerateImage(slide); setOpenSlideMenuId(null); }}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                                    >
                                        <RefreshCw className="mr-2 h-4 w-4 text-blue-500" />
                                        {slide.imageUrl ? 'Regenerate Image' : 'Generate Image'}
                                    </button>

                                    {/* Image History Nav */}
                                    {slide.imageHistory && slide.imageHistory.length > 1 && (
                                        <div className="flex border-t border-gray-100">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleImageHistoryNav(slide, 'prev'); }}
                                                disabled={(slide.currentImageIndex ?? slide.imageHistory.length - 1) <= 0}
                                                className="flex-1 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
                                                title="Previous Image"
                                            >
                                                <ArrowLeft className="h-4 w-4" />
                                            </button>
                                            <div className="w-px bg-gray-100"></div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleImageHistoryNav(slide, 'next'); }}
                                                disabled={(slide.currentImageIndex ?? slide.imageHistory.length - 1) >= slide.imageHistory.length - 1}
                                                className="flex-1 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
                                                title="Next Image"
                                            >
                                                <ArrowRight className="h-4 w-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                  </div>

                  {/* Back Face (Editor) */}
                  <div className="absolute inset-0 w-full h-full bg-white p-4 flex flex-col [backface-visibility:hidden] [transform:rotateY(180deg)]">
                      <label className="text-xs font-semibold text-gray-500 mb-1 uppercase">Image Prompt Editor</label>
                      <textarea 
                        className="flex-1 w-full p-2 border border-gray-300 rounded-md text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
                        value={slide.imagePrompt || ""}
                        onChange={(e) => onSlideUpdate(slide.id, { imagePrompt: e.target.value })}
                        onClick={(e) => e.stopPropagation()} 
                      />
                  </div>
              </div>
            </div>
            
            <div className="p-4 flex-1 flex flex-col relative">
              {slide.isFlipped ? (
                  <div className="flex-1 flex items-end">
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleSavePrompt(slide, slide.imagePrompt || ""); }}
                        className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center shadow-sm text-sm"
                      >
                          <Save className="mr-2 h-4 w-4" />
                          Save Prompt & Flip Back
                      </button>
                  </div>
              ) : (
                  <>
                    <h3 className="font-bold text-lg mb-2 text-gray-900">{slide.title}</h3>
                    <p className="text-gray-600 text-sm whitespace-pre-wrap">{slide.content}</p>
                    
                    {/* Flip Button in Text Area */}
                    {slide.imageUrl && (
                        <button
                            onClick={(e) => { e.stopPropagation(); handleToggleFlip(slide); }}
                            className="absolute bottom-4 right-4 text-gray-400 hover:text-blue-600 p-2 rounded-full hover:bg-blue-50 transition-colors"
                            title="Edit Image Prompt"
                        >
                            <SquarePen className="h-5 w-5" />
                        </button>
                    )}
                  </>
              )}
            </div>
          </div>
        ))}
        
        {slides.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center h-64 text-gray-400 border-2 border-dashed border-gray-300 rounded-lg">
            <p>No slides yet. Start chatting to create them!</p>
          </div>
        )}
      </div>
    </div>
  );
}