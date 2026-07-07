import React, { useState, useEffect } from 'react';
import { XMarkIcon, PlusCircleIcon, TrashIcon, TagIcon } from './Icons';
import { CATEGORIES } from '../constants';
import useModalFocusTrap from '../hooks/useModalFocusTrap';

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Merge default CATEGORIES with any custom ones from localStorage
const loadCategories = (): Record<string, string[]> => {
  const base = JSON.parse(JSON.stringify(CATEGORIES)) as Record<string, string[]>;
  try {
    const custom = localStorage.getItem('customCategories');
    if (custom) {
      const parsed = JSON.parse(custom) as Record<string, string[]>;
      for (const cat in parsed) {
        if (base[cat]) {
          // Add custom subcategories that aren't already in the base
          parsed[cat].forEach(sub => {
            if (!base[cat].includes(sub)) base[cat].push(sub);
          });
        } else {
          base[cat] = parsed[cat];
        }
      }
    }
    // Apply deletions independently of custom additions — previously this was
    // nested inside `if (custom)`, so deleted subcategories reappeared on reload
    // whenever the user had no custom additions (CMP-H3).
    const deleted = localStorage.getItem('deletedSubcategories');
    if (deleted) {
      const deletedMap = JSON.parse(deleted) as Record<string, string[]>;
      for (const cat in deletedMap) {
        if (base[cat]) {
          base[cat] = base[cat].filter(sub => !deletedMap[cat].includes(sub));
        }
      }
    }
  } catch { /* ignore corrupt data */ }
  return base;
};

const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({ isOpen, onClose }) => {
  const modalRef = useModalFocusTrap<HTMLDivElement>(isOpen, onClose);
  const [activeTab, setActiveTab] = useState<string>(Object.keys(CATEGORIES)[0]);
  const [categories, setCategories] = useState<Record<string, string[]>>(loadCategories);
  const [newSubcategory, setNewSubcategory] = useState('');

  // Save custom additions/deletions to localStorage
  useEffect(() => {
    if (!isOpen) return;
    // Compute diff from defaults
    const additions: Record<string, string[]> = {};
    const deletions: Record<string, string[]> = {};
    const defaultCats = CATEGORIES as Record<string, string[]>;

    for (const cat in categories) {
      const defaults = defaultCats[cat] || [];
      const added = categories[cat].filter(s => !defaults.includes(s));
      if (added.length > 0) additions[cat] = added;
    }
    for (const cat in defaultCats) {
      const removed = defaultCats[cat].filter(s => !categories[cat]?.includes(s));
      if (removed.length > 0) deletions[cat] = removed;
    }

    if (Object.keys(additions).length > 0) {
      localStorage.setItem('customCategories', JSON.stringify(additions));
    } else {
      localStorage.removeItem('customCategories');
    }
    if (Object.keys(deletions).length > 0) {
      localStorage.setItem('deletedSubcategories', JSON.stringify(deletions));
    } else {
      localStorage.removeItem('deletedSubcategories');
    }
  }, [categories, isOpen]);

  const handleDeleteSubcategory = (cat: string, sub: string) => {
    setCategories(prev => ({
      ...prev,
      [cat]: prev[cat].filter(s => s !== sub),
    }));
  };

  const handleAddSubcategory = (cat: string) => {
    const trimmed = newSubcategory.trim();
    if (!trimmed || categories[cat].includes(trimmed)) return;
    setCategories(prev => ({
      ...prev,
      [cat]: [...prev[cat], trimmed],
    }));
    setNewSubcategory('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex justify-center items-center p-4">
      <div ref={modalRef} role="dialog" aria-modal="true" aria-label="Category manager" className="glass glass-blur rounded-2xl w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden">

        {/* HEADER */}
        <div className="p-5 sm:p-6 border-b border-app-border flex justify-between items-center flex-shrink-0">
          <div className="min-w-0">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-app-text truncate">Categories</h2>
            <p className="text-xs text-app-muted mt-1">Organize your spending categories.</p>
          </div>
          <button onClick={onClose} aria-label="Close category manager" className="grid place-items-center w-9 h-9 rounded-xl bg-surface-2 border border-app-border text-app-muted hover:text-app-text hover:border-app-border-strong transition-colors flex-shrink-0 ml-4">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-0">
          {/* Sidebar: Main Categories */}
          <div className="w-full md:w-1/3 border-b md:border-b-0 md:border-r border-app-border bg-surface-2 flex flex-row md:flex-col overflow-x-auto md:overflow-y-auto no-scrollbar flex-shrink-0">
            {Object.keys(CATEGORIES).map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveTab(cat)}
                className={`whitespace-nowrap md:whitespace-normal text-left px-4 py-3 md:p-4 text-xs font-semibold transition-colors flex items-center justify-between flex-shrink-0 md:flex-shrink ${
                  activeTab === cat ? 'bg-primary text-on-primary shadow-glow' : 'text-app-muted hover:text-app-text hover:bg-surface'
                }`}
              >
                {cat}
                <TagIcon className={`h-3 w-3 md:h-4 md:w-4 ml-2 ${activeTab === cat ? 'opacity-70' : 'opacity-30'}`} />
              </button>
            ))}
          </div>

          {/* Content: Subcategories */}
          <div className="w-full md:w-2/3 p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
            <div className="flex justify-between items-end border-b border-app-border pb-4">
              <h3 className="font-display text-lg md:text-2xl font-bold text-app-text truncate pr-2">{activeTab}</h3>
              <span className="text-[11px] font-medium tracking-[0.12em] text-app-muted flex-shrink-0 uppercase">{(categories[activeTab] || []).length} items</span>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {(categories[activeTab] || []).map((sub: string) => (
                <div key={sub} className="rounded-xl border border-app-border bg-surface-2 p-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-app-text truncate pr-4">{sub}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDeleteSubcategory(activeTab, sub)}
                      aria-label={`Delete ${sub}`}
                      className="grid place-items-center w-9 h-9 rounded-xl bg-surface-2 border border-app-border text-danger hover:bg-danger/10 hover:border-danger/40 transition-colors flex-shrink-0"
                    >
                      <TrashIcon className="h-4 w-4 md:h-5 md:w-5" />
                    </button>
                  </div>
                </div>
              ))}

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSubcategory}
                  onChange={(e) => setNewSubcategory(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddSubcategory(activeTab); }}
                  placeholder="New subcategory name"
                  className="flex-1 bg-surface-2 border border-app-border rounded-xl px-4 py-3 text-app-text placeholder:text-app-faint focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                />
                <button
                  onClick={() => handleAddSubcategory(activeTab)}
                  className="bg-surface-2 border border-app-border text-app-text hover:border-app-border-strong transition-all rounded-xl font-semibold px-4 py-3 flex items-center justify-center gap-2 flex-shrink-0"
                >
                  <PlusCircleIcon className="h-4 w-4 md:h-5 md:w-5" />
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 sm:p-6 border-t border-app-border flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full md:w-auto px-6 md:px-12 py-3 bg-primary text-on-primary shadow-glow hover:brightness-110 active:scale-[0.99] transition-all rounded-xl font-semibold"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default CategoryManagerModal;