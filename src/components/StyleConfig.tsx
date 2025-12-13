import React, { useState } from 'react';
import { DeckStyle } from '../types';
import { transformStyle, extractStyleFromBrand } from '../services/gemini';
import { Loader2, Wand2, AlertTriangle, X } from 'lucide-react';

interface StyleConfigProps {
  onStyleSet: (style: DeckStyle) => void;
  initialStyle?: DeckStyle;
}

export function StyleConfig({ onStyleSet, initialStyle }: StyleConfigProps) {
  const [aesthetic, setAesthetic] = useState<DeckStyle['aesthetic']>(initialStyle?.aesthetic || 'professional');
  
  // Colors
  const [color1, setColor1] = useState(initialStyle?.colors?.color1 || '#ffffff');
  const [color2, setColor2] = useState(initialStyle?.colors?.color2 || '#f3f4f6');
  const [color3, setColor3] = useState(initialStyle?.colors?.color3 || '#1f2937');
  const [accent, setAccent] = useState(initialStyle?.colors?.accent || '#3b82f6');

  const [typography, setTypography] = useState(initialStyle?.typography || '');
  const [mood, setMood] = useState(initialStyle?.mood || '');
  const [extractFrom, setExtractFrom] = useState(initialStyle?.extractFrom || '');
  const [customStyleGuide, setCustomStyleGuide] = useState(initialStyle?.customStyleGuide || '');
  const [imageResolution, setImageResolution] = useState<DeckStyle['imageResolution']>(initialStyle?.imageResolution || '2K');
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isOverloaded, setIsOverloaded] = useState(false);

  const handleExtractStyle = async () => {
      if (!extractFrom.trim()) return;
      setIsExtracting(true);
      setIsOverloaded(false);
      try {
          const extracted = await extractStyleFromBrand(extractFrom);
          if (extracted.aesthetic) setAesthetic(extracted.aesthetic as any);
          if (extracted.colors) {
              setColor1(extracted.colors.color1);
              setColor2(extracted.colors.color2);
              setColor3(extracted.colors.color3);
              setAccent(extracted.colors.accent);
          }
          if (extracted.typography) setTypography(extracted.typography);
          if (extracted.mood) setMood(extracted.mood);
      } catch (e: any) {
          console.error("Extraction failed", e);
          const errorMessage = e.toString();
          if (errorMessage.includes("503") || errorMessage.includes("overloaded")) {
              setIsOverloaded(true);
          } else {
              alert("Failed to extract style. Please try again.");
          }
      } finally {
          setIsExtracting(false);
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    setIsOverloaded(false);
    try {
      const tempStyle: DeckStyle = {
        aesthetic,
        colors: { color1, color2, color3, accent },
        typography,
        mood,
        extractFrom,
        customStyleGuide,
        generatedSystemPrompt: '', // Placeholder
        imageResolution,
      };
      
      const systemPrompt = await transformStyle(tempStyle);
      
      onStyleSet({
        ...tempStyle,
        generatedSystemPrompt: systemPrompt,
      });
    } catch (error: any) {
      console.error("Failed to generate style prompt", error);
      const errorMessage = error.toString();
      if (errorMessage.includes("503") || errorMessage.includes("overloaded")) {
          setIsOverloaded(true);
      } else {
          // Fallback
          onStyleSet({
            aesthetic,
            colors: { color1, color2, color3, accent },
            typography,
            mood,
            extractFrom,
            customStyleGuide,
            generatedSystemPrompt: `Style: ${aesthetic}. Colors: ${color1}, ${color2}, ${color3}, Accent: ${accent}. Font: ${typography}. Mood: ${mood}. Extract from: ${extractFrom}. ${customStyleGuide}`,
            imageResolution,
          });
      }
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div 
      className="p-6 bg-white rounded-lg shadow-md max-w-lg mx-auto mt-10 transition-all duration-500 ease-in-out opacity-100 translate-y-0 relative"
    >
      {/* Overload Warning Banner */}
      {isOverloaded && (
        <div className="absolute top-0 left-0 right-0 bg-amber-50 border-b border-amber-200 p-3 flex items-center justify-between z-10 rounded-t-lg animate-in slide-in-from-top-2">
            <div className="flex items-center text-amber-800 text-sm">
                <AlertTriangle className="h-4 w-4 mr-2" />
                <span>The model is overloaded. Please wait a moment before retrying.</span>
            </div>
            <button onClick={() => setIsOverloaded(false)} className="text-amber-600 hover:text-amber-800">
                <X className="h-4 w-4" />
            </button>
        </div>
      )}

      <h2 className="text-2xl font-bold mb-6 text-gray-800">Deck Style Setup</h2>
      <form onSubmit={handleSubmit} className="space-y-8">
        
        {/* Section 1: Aesthetic */}
        <section className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-700 border-b pb-2">1. Aesthetic</h3>
            <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Overall Vibe</label>
            <select
                value={aesthetic}
                onChange={(e) => setAesthetic(e.target.value as any)}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
            >
                <option value="professional">Professional</option>
                <option value="vibrant">Vibrant</option>
                <option value="minimalist">Minimalist</option>
                <option value="playful">Playful</option>
            </select>
            </div>
        </section>

        {/* Section 2: Style Details */}
        <section className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-700 border-b pb-2">2. Style Details</h3>
            
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Extract Style From (Brand/URL)</label>
                <div className="flex space-x-2">
                    <input
                        type="text"
                        value={extractFrom}
                        onChange={(e) => setExtractFrom(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                handleExtractStyle();
                            }
                        }}
                        placeholder="e.g., Apple, Nike, or https://example.com"
                        className="flex-1 p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <button
                        type="button"
                        onClick={handleExtractStyle}
                        disabled={isExtracting || !extractFrom.trim()}
                        className="bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200 transition-colors flex items-center disabled:opacity-50"
                        title="Extract style"
                    >
                        {isExtracting ? <Loader2 className="animate-spin h-4 w-4" /> : <Wand2 className="h-4 w-4" />}
                    </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">Click the wand to auto-fill colors and mood based on the brand.</p>
            </div>

            <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Color Palette</label>
            <div className="grid grid-cols-4 gap-2">
                <div>
                    <label className="block text-xs text-gray-500 mb-1">Color 1</label>
                    <input type="color" value={color1} onChange={(e) => setColor1(e.target.value)} className="w-full h-10 p-0 border-0 rounded cursor-pointer" />
                </div>
                <div>
                    <label className="block text-xs text-gray-500 mb-1">Color 2</label>
                    <input type="color" value={color2} onChange={(e) => setColor2(e.target.value)} className="w-full h-10 p-0 border-0 rounded cursor-pointer" />
                </div>
                <div>
                    <label className="block text-xs text-gray-500 mb-1">Color 3</label>
                    <input type="color" value={color3} onChange={(e) => setColor3(e.target.value)} className="w-full h-10 p-0 border-0 rounded cursor-pointer" />
                </div>
                <div>
                    <label className="block text-xs text-gray-500 mb-1">Accent</label>
                    <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="w-full h-10 p-0 border-0 rounded cursor-pointer" />
                </div>
            </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Typography</label>
                    <input
                        type="text"
                        value={typography}
                        onChange={(e) => setTypography(e.target.value)}
                        placeholder="e.g. Modern Sans"
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mood</label>
                    <input
                        type="text"
                        value={mood}
                        onChange={(e) => setMood(e.target.value)}
                        placeholder="e.g. Serious"
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Image Resolution</label>
                <select
                    value={imageResolution}
                    onChange={(e) => setImageResolution(e.target.value as any)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                >
                    <option value="1K">1K (Standard)</option>
                    <option value="2K">2K (High Quality)</option>
                    <option value="4K">4K (Ultra High Quality)</option>
                </select>
            </div>
        </section>
        
        {/* Section 3: Additional Notes */}
        <section className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-700 border-b pb-2">3. Additional Notes / Style Guide</h3>
            <div>
            <textarea
                value={customStyleGuide}
                onChange={(e) => setCustomStyleGuide(e.target.value)}
                placeholder="e.g., Use geometric shapes. Keep text minimal."
                className="w-full p-2 border border-gray-300 rounded-md h-24 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
            </div>
        </section>

        <button
          type="submit"
          disabled={isGenerating}
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center disabled:opacity-50 font-medium text-lg shadow-sm"
        >
          {isGenerating ? (
            <>
              <Loader2 className="animate-spin mr-2 h-5 w-5" />
              Processing Style...
            </>
          ) : (
            'Start Composing'
          )}
        </button>
      </form>
    </div>
  );
}
