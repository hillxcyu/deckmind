import React, { useState } from 'react';
import { Slide, DeckStyle } from '../types';
import { generateSlideImage } from '../services/gemini';
import { exportToPPTX, exportToPDF } from '../services/export';
import { Loader2, RefreshCw, Image as ImageIcon, AlertCircle, Download, FileText, Presentation } from 'lucide-react';

interface DeckPreviewProps {
  slides: Slide[];
  style: DeckStyle;
  onSlideUpdate: (id: string, updates: Partial<Slide>) => void;
}

export function DeckPreview({ slides, style, onSlideUpdate }: DeckPreviewProps) {
  const [isExporting, setIsExporting] = useState(false);
  
  const handleGenerateImage = async (slide: Slide) => {
    onSlideUpdate(slide.id, { status: 'generating' });
    try {
      const imageUrl = await generateSlideImage(slide, style);
      onSlideUpdate(slide.id, { imageUrl, status: 'completed' });
    } catch (error) {
      console.error("Failed to generate image", error);
      onSlideUpdate(slide.id, { status: 'failed' });
    }
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
            onClick={handleGenerateAll}
            className="flex-1 md:flex-none justify-center bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 transition-colors flex items-center shadow-sm text-sm"
            >
            <ImageIcon className="mr-2 h-4 w-4" />
            <span className="whitespace-nowrap">Generate Images</span>
            </button>
            
            <div className="relative group flex-1 md:flex-none">
                <button className="w-full justify-center bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors flex items-center shadow-sm text-sm">
                    <Download className="mr-2 h-4 w-4" />
                    Export
                </button>
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-20 hidden group-hover:block border border-gray-200">
                    <button 
                        onClick={handleExportPPTX}
                        disabled={isExporting}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                    >
                        <Presentation className="mr-2 h-4 w-4 text-orange-500" />
                        PowerPoint (.pptx)
                    </button>
                    <button 
                         onClick={() => alert("To export to Google Slides, please upload the generated .pptx file to Google Drive and open it with Google Slides.")}
                         className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                    >
                        <FileText className="mr-2 h-4 w-4 text-yellow-500" />
                        Google Slides
                    </button>
                    <button 
                        onClick={handleExportPDF}
                        disabled={isExporting}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                    >
                        <FileText className="mr-2 h-4 w-4 text-red-500" />
                        PDF
                    </button>
                </div>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {slides.map((slide, index) => (
          <div 
            key={slide.id} 
            className="bg-white rounded-lg shadow-md overflow-hidden flex flex-col transition-all duration-300 hover:shadow-lg"
          >
            <div className="relative aspect-video bg-gray-200 group">
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
              
              {/* Overlay Actions - Only show if not generating */}
              {slide.status !== 'generating' && (
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button
                        onClick={() => handleGenerateImage(slide)}
                        className="bg-white text-gray-900 px-3 py-1 rounded-full text-sm font-medium hover:bg-gray-100 flex items-center"
                    >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        {slide.imageUrl ? 'Regenerate' : 'Generate'}
                    </button>
                </div>
              )}
            </div>
            
            <div className="p-4 flex-1">
              <h3 className="font-bold text-lg mb-2 text-gray-900">{slide.title}</h3>
              <p className="text-gray-600 text-sm whitespace-pre-wrap">{slide.content}</p>
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
