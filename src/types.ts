export interface Slide {
  id: string;
  title: string;
  content: string;
  visualDescription: string;
  imageUrl?: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
}

export interface Deck {
  slides: Slide[];
  style: DeckStyle;
}

export interface DeckStyle {
  aesthetic: 'vibrant' | 'professional' | 'minimalist' | 'playful' | 'custom';
  colors: {
    color1: string;
    color2: string;
    color3: string;
    accent: string;
  };
  typography: string;
  mood: string;
  extractFrom: string;
  customStyleGuide: string;
  generatedSystemPrompt: string; // The transformed structured representation
  imageResolution?: '1K' | '2K' | '4K';
}

export interface Message {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  attachment?: {
    name: string;
    type: string;
    data: string; // Base64
  };
}
