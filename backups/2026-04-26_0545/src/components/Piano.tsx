import React from 'react';
import { motion } from 'motion/react';

interface PianoProps {
  onNotePress: (note: string) => void;
  activeNotes: Map<string, 'hit' | 'miss' | 'default'>;
}

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const OCTAVES = [2, 3, 4, 5, 6]; // Expanded range to match pools

const ALL_KEYS = OCTAVES.flatMap((octave) =>
  NOTES.map((note) => ({
    name: `${note}${octave}`,
    note,
    octave,
    isBlack: note.includes('#'),
  }))
);

const WHITE_KEYS = ALL_KEYS.filter(k => !k.isBlack);

export const Piano: React.FC<PianoProps> = React.memo(({ onNotePress, activeNotes }) => {
  const getKeyColor = (keyName: string, isBlack: boolean) => {
    const status = activeNotes.get(keyName);
    if (!status) return isBlack ? 'bg-neutral-800 hover:bg-neutral-700' : 'bg-white hover:bg-neutral-100';
    
    if (status === 'hit') return 'bg-green-500';
    if (status === 'miss') return 'bg-red-500';
    return 'bg-blue-400'; // default/preview mode
  };

  return (
    <div className="w-full bg-neutral-900 p-4 rounded-2xl shadow-inner overflow-x-auto custom-scrollbar">
      <div className="relative flex min-w-max h-48 mx-auto">
        {/* White Keys */}
        {WHITE_KEYS.map((key) => (
          <motion.button
            key={key.name}
            whileTap={{ scale: 0.98 }}
            onClick={() => onNotePress(key.name)}
            className={`w-10 h-44 border border-neutral-300 rounded-b-lg transition-colors flex-shrink-0 relative ${getKeyColor(key.name, false)}`}
          >
            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-bold text-neutral-400">
              {key.octave}
            </span>
          </motion.button>
        ))}

        {/* Black Keys Overlay */}
        {WHITE_KEYS.map((whiteKey, index) => {
          // Check if there should be a black key after this white key
          // Black keys are after C, D, F, G, A
          const hasBlackKey = ['C', 'D', 'F', 'G', 'A'].includes(whiteKey.note);
          if (!hasBlackKey || index === WHITE_KEYS.length - 1) return null;

          const blackKeyName = `${whiteKey.note}#${whiteKey.octave}`;

          return (
            <motion.button
              key={blackKeyName}
              whileTap={{ scale: 0.95 }}
              onClick={() => onNotePress(blackKeyName)}
              className={`absolute z-10 w-7 h-28 rounded-b-md border border-black transition-colors ${getKeyColor(blackKeyName, true)}`}
              style={{
                left: `${(index + 1) * 40 - 14}px`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
});
