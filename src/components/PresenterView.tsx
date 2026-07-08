import React, { useState, useEffect, useRef } from 'react';
import { Slide } from '../types';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

interface PresenterViewProps {
  slides: Slide[];
  initialSlideIndex: number;
  onExit: () => void;
}

export function PresenterView({ slides, initialSlideIndex, onExit }: PresenterViewProps) {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(initialSlideIndex);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Attempt to enter fullscreen on mount
    const enterFullscreen = async () => {
        if (containerRef.current) {
            try {
                await containerRef.current.requestFullscreen();
            } catch (err) {
                console.warn("Error attempting to enable fullscreen:", err);
            }
        }
    };
    enterFullscreen();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        setCurrentSlideIndex(prev => Math.min(prev + 1, slides.length - 1));
      } else if (e.key === 'ArrowLeft') {
        setCurrentSlideIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Escape') {
        // Fullscreen exit is handled by browser, but we also want to exit component state
        // if user hits Escape. However, browser consumes Escape to exit fullscreen first.
        // If we are NOT in fullscreen (e.g. user exited or it failed), Escape should call onExit.
        if (!document.fullscreenElement) {
             onExit();
        }
      }
    };

    // Listen for fullscreen change to handle 'Escape' key exiting fullscreen
    const handleFullscreenChange = () => {
        if (!document.fullscreenElement) {
            onExit();
        }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    
    return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('fullscreenchange', handleFullscreenChange);
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        }
    };
  }, [slides.length, onExit]);

  const currentSlide = slides[currentSlideIndex];

  if (!currentSlide) {
    return (
      <div className="fixed inset-0 bg-black text-white flex items-center justify-center">
        No slides to present.
        <button onClick={onExit} className="absolute top-4 right-4 text-white p-2 rounded-full hover:bg-gray-800">
          <X className="h-6 w-6" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="fixed inset-0 bg-black text-white flex flex-col justify-center items-center overflow-hidden">
      {/* Exit Button */}
      <button onClick={onExit} className="absolute top-4 right-4 text-white/50 hover:text-white p-2 rounded-full hover:bg-white/10 z-50 transition-colors">
        <X className="h-6 w-6" />
      </button>

      {/* Slide Content */}
      <div className="w-full h-full flex flex-col justify-center items-center bg-black">
        {currentSlide.imageUrl ? (
          <img src={currentSlide.imageUrl} alt={currentSlide.title} className="w-full h-full object-contain" />
        ) : (
          <div className="flex flex-col items-center justify-center p-16 text-center max-w-4xl">
            <h2 className="text-5xl font-bold mb-8 text-white leading-tight">{currentSlide.title}</h2>
            <p className="text-2xl text-gray-300 whitespace-pre-wrap leading-relaxed">{currentSlide.content}</p>
          </div>
        )}

        {/* Navigation - Hidden if only one slide */}
        {slides.length > 1 && (
            <>
                <button 
                    onClick={() => setCurrentSlideIndex(prev => Math.max(prev - 1, 0))}
                    disabled={currentSlideIndex === 0}
                    className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/20 p-3 rounded-full hover:bg-white/40 disabled:opacity-50 disabled:cursor-not-allowed z-50"
                >
                    <ChevronLeft className="h-8 w-8" />
                </button>
                <button 
                    onClick={() => setCurrentSlideIndex(prev => Math.min(prev + 1, slides.length - 1))}
                    disabled={currentSlideIndex === slides.length - 1}
                    className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/20 p-3 rounded-full hover:bg-white/40 disabled:opacity-50 disabled:cursor-not-allowed z-50"
                >
                    <ChevronRight className="h-8 w-8" />
                </button>
            </>
        )}
      </div>
      
      {/* Slide Number */}
      <div className="absolute bottom-4 text-gray-400 text-sm">
          {currentSlideIndex + 1} / {slides.length}
      </div>
    </div>
  );
}
