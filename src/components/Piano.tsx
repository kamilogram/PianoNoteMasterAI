import React, { useRef, useEffect } from 'react';
import { motion } from 'motion/react';

interface PianoProps {
  onNotePress: (note: string) => void;
  activeNotes: Map<string, 'hit' | 'miss' | 'default'>;
  ledgerLines: number;
  isCompact?: boolean;
  isDarkMode?: boolean;
}

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const Piano: React.FC<PianoProps> = React.memo(({ onNotePress, activeNotes, ledgerLines, isCompact = false, isDarkMode = false }) => {
  // Determine octave range based on ledger lines
  // N=1: 2-5, N=2+: 1-6 (starting at octave 1 ensures B1 is available for flat keys like Gb/Eb is)
  const startOctave = ledgerLines >= 2 ? 1 : 2;
  const endOctave = (ledgerLines === 1) ? 5 : 6;
  
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // If purely vertical scrolling, translate to horizontal scroll
      if (e.deltaY !== 0 && Math.abs(e.deltaX) < Math.abs(e.deltaY)) {
        e.preventDefault();
        container.scrollLeft += e.deltaY;
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  const octaves = [];
  for (let i = startOctave; i <= endOctave; i++) {
    octaves.push(i);
  }

  const ALL_KEYS = octaves.flatMap((octave) =>
    NOTES.map((note) => ({
      name: `${note}${octave}`,
      note,
      octave,
      isBlack: note.includes('#'),
    }))
  );

  const WHITE_KEYS = ALL_KEYS.filter(k => !k.isBlack);

  const getKeyColor = (keyName: string, isBlack: boolean) => {
    const status = activeNotes.get(keyName);
    if (!status) {
      if (isBlack) {
        return isDarkMode ? 'bg-neutral-950 hover:bg-neutral-900' : 'bg-neutral-800 hover:bg-neutral-700';
      } else {
        return isDarkMode ? 'bg-zinc-200 hover:bg-zinc-300' : 'bg-white hover:bg-neutral-100';
      }
    }
    
    if (status === 'hit') return 'bg-green-500';
    if (status === 'miss') return 'bg-red-500';
    return 'bg-blue-400'; // default/preview mode
  };

  const keyHeight = isCompact ? 140 : 176; // 44*4
  const containerHeight = isCompact ? 150 : 192; // 48*4

  return (
    <div 
      ref={containerRef}
      className={`w-full transition-colors duration-500 ${isDarkMode ? 'bg-zinc-950 border border-zinc-850' : 'bg-neutral-900'} ${isCompact ? 'p-1' : 'p-4'} rounded-2xl shadow-inner overflow-x-auto custom-scrollbar`}
    >
      <div className={`relative flex min-w-max md:min-w-full mx-auto`} style={{ height: `${containerHeight}px` }}>
        {WHITE_KEYS.map((whiteKey, index) => {
          const hasBlackKey = ['C', 'D', 'F', 'G', 'A'].includes(whiteKey.note);
          const showBlackKey = hasBlackKey && index < WHITE_KEYS.length - 1;
          const blackKeyName = showBlackKey ? `${whiteKey.note}#${whiteKey.octave}` : '';

          return (
            <div 
              key={whiteKey.name}
              className={`relative flex-shrink-0 flex justify-center ${isCompact ? 'w-[32px] min-w-[32px] md:w-auto md:flex-1' : 'w-[40px] min-w-[40px] md:w-auto md:flex-1'}`}
            >
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => onNotePress(whiteKey.name)}
                className={`w-full border rounded-b-lg transition-colors relative ${isDarkMode ? 'border-zinc-400' : 'border-neutral-300'} ${getKeyColor(whiteKey.name, false)}`}
                style={{ height: `${keyHeight}px` }}
              >
                {whiteKey.name === 'C4' && (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5 pointer-events-none" title="Środek klawiatury (C4)">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500 ring-4 ring-blue-500/20 shadow-sm" />
                  </div>
                )}
                <span className={`absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-bold ${isDarkMode ? 'text-zinc-500' : 'text-neutral-400'}`}>
                  {whiteKey.octave}
                </span>
              </motion.button>

              {showBlackKey && (
                <div
                  className={`absolute z-10 top-0 ${
                    isCompact 
                      ? 'right-[-11px] md:right-[-13px] w-[22px] md:w-[26px]' 
                      : 'right-[-14px] md:right-[-16px] w-[28px] md:w-[32px]'
                  }`}
                  style={{
                    height: `${isCompact ? 80 : 112}px`,
                  }}
                >
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onNotePress(blackKeyName)}
                    className={`w-full h-full rounded-b-md border border-black transition-colors ${getKeyColor(blackKeyName, true)}`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
