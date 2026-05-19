import React from 'react';
import { motion } from 'motion/react';

interface PianoProps {
  onNotePress: (note: string) => void;
  activeNotes: Map<string, 'hit' | 'miss' | 'default'>;
  ledgerLines: number;
  isCompact?: boolean;
}

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const Piano: React.FC<PianoProps> = React.memo(({ onNotePress, activeNotes, ledgerLines, isCompact = false }) => {
  // Determine octave range based on ledger lines
  // N=1: 2-5, N=2: 2-6, N=3+: 1-6
  const startOctave = ledgerLines >= 3 ? 1 : 2;
  const endOctave = (ledgerLines === 1) ? 5 : 6;
  
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
    if (!status) return isBlack ? 'bg-neutral-800 hover:bg-neutral-700' : 'bg-white hover:bg-neutral-100';
    
    if (status === 'hit') return 'bg-green-500';
    if (status === 'miss') return 'bg-red-500';
    return 'bg-blue-400'; // default/preview mode
  };

  const keyWidth = isCompact ? 32 : 40;
  const keyHeight = isCompact ? 140 : 176; // 44*4
  const containerHeight = isCompact ? 150 : 192; // 48*4

  return (
    <div className={`w-full bg-neutral-900 ${isCompact ? 'p-1' : 'p-4'} rounded-2xl shadow-inner overflow-x-auto custom-scrollbar`}>
      <div className={`relative flex min-w-max mx-auto`} style={{ height: `${containerHeight}px` }}>
        {/* White Keys */}
        {WHITE_KEYS.map((key) => (
          <motion.button
            key={key.name}
            whileTap={{ scale: 0.98 }}
            onClick={() => onNotePress(key.name)}
            className={`border border-neutral-300 rounded-b-lg transition-colors flex-shrink-0 relative ${getKeyColor(key.name, false)}`}
            style={{ width: `${keyWidth}px`, height: `${keyHeight}px` }}
          >
            {!isCompact && (
              <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-bold text-neutral-400">
                {key.octave}
              </span>
            )}
          </motion.button>
        ))}

        {/* Black Keys Overlay */}
        {WHITE_KEYS.map((whiteKey, index) => {
          // Check if there should be a black key after this white key
          // Black keys are after C, D, F, G, A
          const hasBlackKey = ['C', 'D', 'F', 'G', 'A'].includes(whiteKey.note);
          if (!hasBlackKey || index === WHITE_KEYS.length - 1) return null;

          const blackKeyName = `${whiteKey.note}#${whiteKey.octave}`;
          const bKeyWidth = isCompact ? 22 : 28;
          const bKeyHeight = isCompact ? 80 : 112;

          return (
            <motion.button
              key={blackKeyName}
              whileTap={{ scale: 0.95 }}
              onClick={() => onNotePress(blackKeyName)}
              className={`absolute z-10 rounded-b-md border border-black transition-colors ${getKeyColor(blackKeyName, true)}`}
              style={{
                width: `${bKeyWidth}px`,
                height: `${bKeyHeight}px`,
                left: `${(index + 1) * keyWidth - (bKeyWidth / 2)}px`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
});
