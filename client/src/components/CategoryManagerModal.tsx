import React, { useState, useEffect } from 'react';
import { PlusCircleIcon, TrashIcon, TagIcon } from './Icons';
import { CATEGORIES } from '../constants';
import { getEffectiveCategories, saveCategories } from '../utils/categories';
import { Modal, Button, IconButton, Input } from './ui';

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<string>(Object.keys(CATEGORIES)[0]);
  const [categories, setCategories] = useState<Record<string, string[]>>(getEffectiveCategories);
  const [newSubcategory, setNewSubcategory] = useState('');

  // Persist through the shared categories store (single source of truth), which
  // diffs against defaults and invalidates the cache so the expense dropdown and
  // category colors pick up the change (CMP-M24).
  useEffect(() => {
    if (!isOpen) return;
    saveCategories(categories);
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Categories"
      subtitle="Organize your spending categories."
      size="xl"
      labelledById="category-manager-title"
      bodyClassName="!p-0 flex flex-col md:flex-row !overflow-hidden min-h-0"
      footer={
        <div className="w-full flex justify-end">
          <Button onClick={onClose} className="w-full md:w-auto px-6 md:px-12 py-3">
            Done
          </Button>
        </div>
      }
    >
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
                    <IconButton
                      tone="danger"
                      onClick={() => handleDeleteSubcategory(activeTab, sub)}
                      aria-label={`Delete ${sub}`}
                      className="flex-shrink-0"
                    >
                      <TrashIcon className="h-4 w-4 md:h-5 md:w-5" />
                    </IconButton>
                  </div>
                </div>
              ))}

              <div className="flex gap-2">
                <Input
                  value={newSubcategory}
                  onChange={(e) => setNewSubcategory(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddSubcategory(activeTab); }}
                  placeholder="New subcategory name"
                  className="flex-1"
                />
                <Button
                  variant="secondary"
                  onClick={() => handleAddSubcategory(activeTab)}
                  className="px-4 py-3 flex-shrink-0"
                >
                  <PlusCircleIcon className="h-4 w-4 md:h-5 md:w-5" />
                  Add
                </Button>
              </div>
            </div>
          </div>
    </Modal>
  );
};

export default CategoryManagerModal;