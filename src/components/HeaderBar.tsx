import React from 'react';
import { Download } from 'lucide-react';

export type StudioView = 'patchbay' | 'modMatrix' | 'guide' | 'embed' | 'midi' | 'about' | 'presets';

interface HeaderBarProps {
  activeView: StudioView;
  onSelectView: (view: StudioView) => void;
  onExportJson: () => void;
  patchName: string;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  activeView,
  onSelectView,
  onExportJson,
  patchName,
}) => {
  const navItems: { id: StudioView; label: string }[] = [
    { id: 'patchbay', label: 'Patchbay' },
    { id: 'modMatrix', label: 'Mod Matrix' },
    { id: 'guide', label: 'Guide' },
    { id: 'embed', label: 'Embed & API' },
    { id: 'midi', label: 'MIDI Setup' },
    { id: 'about', label: 'About' },
  ];

  return (
    <header className="h-13 shrink-0 bg-white dark:bg-[#07090E] border-b border-slate-200 dark:border-slate-800/90 px-4 lg:px-6 flex items-center justify-between gap-4 lg:gap-8">
      {/* Zone 1: Single text element wordmark */}
      <button
        type="button"
        onClick={() => onSelectView('patchbay')}
        className="text-base lg:text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 text-left focus-visible:outline-2 focus-visible:outline-amber-500 rounded"
        title={`Active patch: ${patchName}`}
      >
        Timbre Lab
      </button>

      {/* Zone 2: Single-line workspace navigation links */}
      <nav className="hidden md:flex items-center gap-4 lg:gap-6 text-sm font-medium">
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectView(item.id)}
              className={`py-1.5 whitespace-nowrap shrink-0 border-b-2 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-cyan-500 ${
                isActive
                  ? 'border-amber-600 dark:border-amber-500 text-slate-900 dark:text-slate-100'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Single primary CTA */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onExportJson}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 active:scale-[0.98] rounded-md transition-all duration-150 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Export JSON</span>
        </button>
      </div>
    </header>
  );
};
