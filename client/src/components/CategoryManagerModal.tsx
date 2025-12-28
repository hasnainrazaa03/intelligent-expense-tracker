import React, { useState } from 'react';
import { XMarkIcon, PlusCircleIcon, TrashIcon, TagIcon } from './Icons';
import { CATEGORIES } from '../constants';

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<string>(Object.keys(CATEGORIES)[0]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-[100] flex justify-center items-center p-2 md:p-4">
      <div className="bg-bone border-4 md:border-8 border-ink shadow-neo-gold w-full max-w-3xl flex flex-col h-full max-h-[95vh] md:max-h-[85vh] overflow-hidden">
        
        {/* HEADER */}
        <div className="bg-ink p-4 md:p-8 border-b-4 md:border-b-8 border-ink flex justify-between items-center flex-shrink-0">
          <div className="min-w-0">
            <h2 className="font-loud text-xl md:text-4xl text-usc-gold leading-none uppercase truncate">TAXONOMY_EDITOR</h2>
            <p className="font-mono text-[8px] md:text-[10px] text-bone/40 mt-1 md:mt-2 tracking-widest uppercase">Protocol: CAT_MGMT_v1.0</p>
          </div>
          <button onClick={onClose} className="bg-usc-cardinal text-bone p-1 md:p-2 border-2 md:border-4 border-ink shadow-neo active:translate-x-0.5 active:translate-y-0.5 transition-all flex-shrink-0 ml-4">
            <XMarkIcon className="h-5 w-5 md:h-6 md:w-6" />
          </button>
        </div>

        <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-0">
          {/* Sidebar: Main Categories */}
          <div className="w-full md:w-1/3 border-b-4 md:border-b-0 md:border-r-8 border-ink bg-white/50 flex flex-row md:flex-col overflow-x-auto md:overflow-y-auto no-scrollbar flex-shrink-0">
            {Object.keys(CATEGORIES).map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveTab(cat)}
                className={`whitespace-nowrap md:whitespace-normal text-left px-4 py-3 md:p-4 font-loud text-[10px] md:text-xs border-r-4 md:border-r-0 md:border-b-4 border-ink transition-all flex items-center justify-between flex-shrink-0 md:flex-shrink ${
                  activeTab === cat ? 'bg-usc-gold text-ink' : 'text-ink hover:bg-usc-gold/20'
                }`}
              >
                {cat.toUpperCase()}
                <TagIcon className="h-3 w-3 md:h-4 md:w-4 opacity-30 ml-2" />
              </button>
            ))}
          </div>

          {/* Content: Subcategories */}
          <div className="w-full md:w-2/3 p-4 md:p-8 overflow-y-auto space-y-4 md:space-y-6 flex-1 custom-scrollbar">
            <div className="flex justify-between items-end border-b-2 md:border-b-4 border-ink pb-2 md:pb-4">
              <h3 className="font-loud text-lg md:text-2xl text-ink uppercase truncate pr-2">{activeTab}_SUBSYSTEMS</h3>
              <span className="font-mono text-[8px] md:text-[10px] opacity-40 uppercase tracking-tighter text-ink flex-shrink-0">Count: {CATEGORIES[activeTab as keyof typeof CATEGORIES].length}</span>
            </div>

            <div className="grid grid-cols-1 gap-3 md:gap-4">
              {CATEGORIES[activeTab as keyof typeof CATEGORIES].map((sub: string) => (
                <div key={sub} className="flex items-center justify-between bg-white border-2 md:border-4 border-ink p-3 md:p-4 shadow-neo">
                  <span className="font-loud text-xs md:text-sm text-ink uppercase tracking-tight truncate pr-4">{sub}</span>
                  <div className="flex gap-2">
                    <button className="p-1 text-ink/20 hover:text-usc-cardinal transition-colors flex-shrink-0">
                      <TrashIcon className="h-4 w-4 md:h-5 md:w-5" />
                    </button>
                  </div>
                </div>
              ))}
              
              <button className="w-full border-2 md:border-4 border-dashed border-ink/20 p-3 md:p-4 font-loud text-[10px] md:text-sm text-ink/20 hover:border-usc-gold hover:text-usc-gold transition-all flex items-center justify-center gap-2 uppercase">
                <PlusCircleIcon className="h-4 w-4 md:h-5 md:w-5" />
                ADD_NEW_SUBCATEGORY
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 md:p-6 border-t-4 md:border-t-8 border-ink flex justify-end bg-bone flex-shrink-0">
          <button 
            onClick={onClose}
            className="w-full md:w-auto px-6 md:px-12 py-3 md:py-4 bg-usc-gold text-ink font-loud text-base md:text-lg border-2 md:border-4 border-ink shadow-neo active:translate-x-0.5 active:translate-y-0.5 transition-all uppercase"
          >
            CLOSE_EDITOR
          </button>
        </div>
      </div>
    </div>
  );
};

export default CategoryManagerModal;