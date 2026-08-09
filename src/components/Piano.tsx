import React, { useRef, useEffect, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface PianoProps {
  onNotePress: (note: string) => void;
  activeNotes: Map<string, 'hit' | 'miss' | 'default'>;
  ledgerLines: number;
  isCompact?: boolean;
  isDarkMode?: boolean;
}

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

interface KeyButtonProps {
  keyName: string;
  isBlack: boolean;
  status: 'hit' | 'miss' | 'default' | undefined;
  onClick: () => void;
  isDarkMode: boolean;
  className: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

const KeyButton: React.FC<KeyButtonProps> = ({
  keyName,
  isBlack,
  status,
  onClick,
  isDarkMode,
  className,
  style,
  children
}) => {
  const [prevStatus, setPrevStatus] = useState<'hit' | 'miss' | 'default' | undefined>(status);
  const [clearingState, setClearingState] = useState<{
    id: number;
    colorClass: string;
  } | null>(null);

  // Synchronous state update during render prevents 1-frame flickering
  if (status !== prevStatus) {
    setPrevStatus(status);
    if (prevStatus && !status) {
      let colorClass = 'bg-blue-400';
      if (prevStatus === 'hit') colorClass = 'bg-green-500';
      if (prevStatus === 'miss') colorClass = 'bg-red-500';

      setClearingState({
        id: Date.now() + Math.random(),
        colorClass
      });
    } else if (status) {
      setClearingState(null);
    }
  }

  const handleGuillotineComplete = () => {
    setClearingState(null);
  };

  const baseKeyBg = isBlack
    ? (isDarkMode ? 'bg-neutral-950 hover:bg-neutral-900' : 'bg-neutral-800 hover:bg-neutral-700')
    : (isDarkMode ? 'bg-zinc-200 hover:bg-zinc-300' : 'bg-white hover:bg-neutral-100');

  let activeColorBg = '';
  if (status === 'hit') activeColorBg = 'bg-green-500';
  else if (status === 'miss') activeColorBg = 'bg-red-500';
  else if (status === 'default') activeColorBg = 'bg-blue-400';

  const rootBgClass = status ? activeColorBg : baseKeyBg;

  return (
    <motion.button
      whileTap={{ scale: isBlack ? 0.95 : 0.98 }}
      onClick={onClick}
      className={`relative overflow-hidden ${className} ${rootBgClass}`}
      style={style}
    >
      {/* Color fade layer: brightens to white (or darkens to black) simultaneously during guillotine drop */}
      <AnimatePresence>
        {clearingState && !status && (
          <motion.div
            key={`color-${clearingState.id}`}
            initial={{ opacity: 1, filter: 'brightness(1)' }}
            animate={{
              opacity: 0,
              filter: isBlack ? 'brightness(0.1)' : 'brightness(2.2)'
            }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 0.52,
              ease: [0.45, 0, 0.75, 0.9]
            }}
            className={`absolute inset-0 pointer-events-none z-0 ${clearingState.colorClass}`}
          />
        )}
      </AnimatePresence>

      {/* Falling Angled Guillotine overlay animation when color is cleared */}
      <AnimatePresence>
        {clearingState && !status && (
          <motion.div
            key={`guillotine-${clearingState.id}`}
            initial={{ y: '-100%' }}
            animate={{ y: '0%' }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 0.52,
              ease: [0.45, 0, 0.75, 0.9] // Slower, realistic gravity acceleration
            }}
            onAnimationComplete={handleGuillotineComplete}
            className={`absolute left-0 right-0 top-0 w-full h-[calc(100%+16px)] pointer-events-none z-10 ${
              isBlack
                ? (isDarkMode ? 'bg-neutral-950' : 'bg-neutral-800')
                : (isDarkMode ? 'bg-zinc-200' : 'bg-white')
            }`}
            style={{
              clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 16px), 0 100%)'
            }}
          />
        )}
      </AnimatePresence>

      <div className="relative z-20 w-full h-full flex flex-col items-center justify-between pointer-events-none">
        {children}
      </div>
    </motion.button>
  );
};

export const Piano: React.FC<PianoProps> = React.memo(({ onNotePress, activeNotes, ledgerLines, isCompact = false, isDarkMode = false }) => {
  // Determine octave range based on ledger lines
  // N=1: 2-5, N=2+: 1-6 (starting at octave 1 ensures B1 is available for flat keys like Gb/Eb is)
  const startOctave = ledgerLines >= 2 ? 1 : 2;
  const endOctave = (ledgerLines === 1) ? 5 : 6;
  
  const containerRef = useRef<HTMLDivElement>(null);
  const c4Ref = useRef<HTMLDivElement>(null);

  const centerC4 = useCallback(() => {
    const container = containerRef.current;
    const c4El = c4Ref.current;
    if (container && c4El) {
      const offsetLeft = c4El.offsetLeft;
      const offsetWidth = c4El.offsetWidth;
      const containerWidth = container.offsetWidth;
      container.scrollLeft = offsetLeft + offsetWidth / 2 - containerWidth / 2;
    }
  }, []);

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

  useEffect(() => {
    centerC4();
    // Use a small delay to allow UI rendering to settle and apply correct scroll position
    const timer = setTimeout(centerC4, 100);

    window.addEventListener('resize', centerC4);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', centerC4);
    };
  }, [ledgerLines, isCompact, centerC4]);

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

          const whiteStatus = activeNotes.get(whiteKey.name);
          const blackStatus = showBlackKey ? activeNotes.get(blackKeyName) : undefined;

          return (
            <div 
              key={whiteKey.name}
              ref={whiteKey.name === 'C4' ? c4Ref : undefined}
              className={`relative flex-shrink-0 flex justify-center ${isCompact ? 'w-[32px] min-w-[32px] md:w-auto md:flex-1' : 'w-[40px] min-w-[40px] md:w-auto md:flex-1'}`}
            >
              <KeyButton
                keyName={whiteKey.name}
                isBlack={false}
                status={whiteStatus}
                onClick={() => onNotePress(whiteKey.name)}
                isDarkMode={isDarkMode}
                className={`w-full border rounded-b-lg ${isDarkMode ? 'border-zinc-400' : 'border-neutral-300'}`}
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
              </KeyButton>

              {showBlackKey && (
                <div
                  className={`absolute z-30 top-0 ${
                    isCompact 
                      ? 'right-[-11px] md:right-[-13px] w-[22px] md:w-[26px]' 
                      : 'right-[-14px] md:right-[-16px] w-[28px] md:w-[32px]'
                  }`}
                  style={{
                    height: `${isCompact ? 80 : 112}px`,
                  }}
                >
                  <KeyButton
                    keyName={blackKeyName}
                    isBlack={true}
                    status={blackStatus}
                    onClick={() => onNotePress(blackKeyName)}
                    isDarkMode={isDarkMode}
                    className="w-full h-full rounded-b-md border border-black"
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

