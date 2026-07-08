import React, { useEffect, useState } from 'react';
import { deckStore, SavedDeckMetadata } from '../services/deckStore';
import { Loader2, Trash2, FolderOpen, Save } from 'lucide-react';

interface DeckManagerProps {
  onLoad: (id: number) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function DeckManager({ onLoad, isOpen, onClose }: DeckManagerProps) {
  const [decks, setDecks] = useState<SavedDeckMetadata[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadDecks();
    }
  }, [isOpen]);

  const loadDecks = async () => {
    setLoading(true);
    try {
      const list = await deckStore.list();
      setDecks(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this deck?")) {
      await deckStore.delete(id);
      loadDecks();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-blue-600" />
            Saved Decks
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">Close</button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center p-4"><Loader2 className="animate-spin text-gray-400" /></div>
          ) : decks.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No saved decks found.</p>
          ) : (
            <div className="space-y-2">
              {decks.map(deck => (
                <div 
                  key={deck.id} 
                  onClick={() => onLoad(deck.id)}
                  className="p-3 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-200 cursor-pointer flex justify-between items-center group transition-all"
                >
                  <div>
                    <h3 className="font-semibold text-gray-800">{deck.title}</h3>
                    <p className="text-xs text-gray-500">Updated: {new Date(deck.updated_at).toLocaleString()}</p>
                  </div>
                  <button 
                    onClick={(e) => handleDelete(deck.id, e)}
                    className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                    title="Delete Deck"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
