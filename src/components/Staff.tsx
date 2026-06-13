import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface Note {
  id: number;
  displayPitch: string;
  actualPitch: string;
  x: number;
  beatIndex: number;
  clef: 'treble' | 'bass';
  isHit?: boolean;
  isMissed?: boolean;
  accidental?: '♯' | '♭' | '♮' | null;
}

interface StaffProps {
  notes: Note[];
  currentBeat?: number;
  keySignature?: string;
  isCompact?: boolean;
  measureId?: number;
  isDarkMode?: boolean;
  children?: React.ReactNode;
}

// Scaling constants
const DEFAULT_LINE_SPACING = 24; 
const DEFAULT_STAFF_PADDING = 120;
const DEFAULT_CLEF_X = 20;
const DEFAULT_SIG_START_X = 100;
const DEFAULT_SIG_STEP_X = 24;
const DEFAULT_BASS_OFFSET = 320;

const COMPACT_LINE_SPACING = 16;
const COMPACT_STAFF_PADDING = 60;
const COMPACT_CLEF_X = 15;
const COMPACT_SIG_START_X = 70;
const COMPACT_SIG_STEP_X = 16;
const COMPACT_BASS_OFFSET = 200;

// Map note names to vertical positions on the staff
const getNoteY = (pitch: string, clef: 'treble' | 'bass', padding: number, spacing: number): number => {
  const stepSpacing = spacing / 2;
  const notes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  
  const getStepsFromC4 = (p: string) => {
    const note = p.slice(0, -1);
    const octave = parseInt(p.slice(-1));
    const noteIndex = notes.indexOf(note);
    return (octave - 4) * 7 + noteIndex;
  };

  const stepsFromC4 = getStepsFromC4(pitch);

  if (clef === 'treble') {
    const stepsFromF5 = stepsFromC4 - 10;
    return padding - (stepsFromF5 * stepSpacing);
  } else {
    const stepsFromA3 = stepsFromC4 - (-2);
    return padding - (stepsFromA3 * stepSpacing);
  }
};

const KEY_SIGNATURE_MAP: Record<string, { sharps: string[], flats: string[] }> = {
  'C Major': { sharps: [], flats: [] },
  'G Major': { sharps: ['F5'], flats: [] },
  'D Major': { sharps: ['F5', 'C5'], flats: [] },
  'A Major': { sharps: ['F5', 'C5', 'G5'], flats: [] },
  'E Major': { sharps: ['F5', 'C5', 'G5', 'D5'], flats: [] },
  'B Major': { sharps: ['F5', 'C5', 'G5', 'D5', 'A4'], flats: [] },
  'F# Major': { sharps: ['F5', 'C5', 'G5', 'D5', 'A4', 'E5'], flats: [] },
  'F Major': { sharps: [], flats: ['B4'] },
  'Bb Major': { sharps: [], flats: ['B4', 'E5'] },
  'Eb Major': { sharps: [], flats: ['B4', 'E5', 'A4'] },
  'Ab Major': { sharps: [], flats: ['B4', 'E5', 'A4', 'D5'] },
  'Db Major': { sharps: [], flats: ['B4', 'E5', 'A4', 'D5', 'G4'] },
  'Gb Major': { sharps: [], flats: ['B4', 'E5', 'A4', 'D5', 'G4', 'C5'] },
};

// Standard bass clef positions for key signature (offset from treble)
const getBassKeyPos = (pitch: string): string => {
  const note = pitch.slice(0, -1);
  const octave = parseInt(pitch.slice(-1));
  return `${note}${octave - 2}`;
};

export const Staff: React.FC<StaffProps> = React.memo(({ notes, currentBeat = 0, keySignature = 'C Major', isCompact = false, measureId = 0, isDarkMode = false, children }) => {
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const fgCanvasRef = useRef<HTMLCanvasElement>(null);

  const LINE_SPACING = isCompact ? COMPACT_LINE_SPACING : DEFAULT_LINE_SPACING;
  const STEP_SPACING = LINE_SPACING / 2;
  const STAFF_PADDING = isCompact ? COMPACT_STAFF_PADDING : DEFAULT_STAFF_PADDING;
  const CLEF_X = isCompact ? COMPACT_CLEF_X : DEFAULT_CLEF_X;
  const SIG_START_X = isCompact ? COMPACT_SIG_START_X : DEFAULT_SIG_START_X;
  const SIG_STEP_X = isCompact ? COMPACT_SIG_STEP_X : DEFAULT_SIG_STEP_X;
  const BASS_OFFSET = isCompact ? COMPACT_BASS_OFFSET : DEFAULT_BASS_OFFSET;
  const canvasHeight = isCompact ? 400 : 640;

  // Colors based on dark mode
  const lineStrokeColor = isDarkMode ? 'rgba(255, 255, 255, 0.25)' : '#333333';
  const primaryFillColor = isDarkMode ? '#f4f4f5' : '#000000'; // zinc-100 vs black
  const secondaryTextColor = isDarkMode ? '#a1a1aa' : '#999999'; // zinc-400 vs grey-400
  const barlineStrokeColor = isDarkMode ? 'rgba(255, 255, 255, 0.4)' : '#000000';
  const activeHighlightColor = isDarkMode ? 'rgba(251, 191, 36, 0.18)' : '#FEF08A'; // amber light glow vs yellow

  // Background Canvas Effect (Lines, Clefs, Key Signature)
  useEffect(() => {
    const canvas = bgCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw active beat highlight behind lines
    const activeNotes = notes.filter(n => n.beatIndex === currentBeat);
    if (activeNotes.length > 0) {
      const minX = Math.min(...activeNotes.map(n => n.x));
      const maxX = Math.max(...activeNotes.map(n => n.x));
      const centerX = (minX + maxX) / 2;
      const rectWidth = isCompact ? 80 : 120;
      
      ctx.fillStyle = activeHighlightColor; // theme active selector
      
      const staffTop = STAFF_PADDING - 50;
      const staffBottom = BASS_OFFSET + STAFF_PADDING + 4 * LINE_SPACING + 50;
      const rectHeight = staffBottom - staffTop;
      
      ctx.fillRect(centerX - rectWidth / 2, staffTop, rectWidth, rectHeight);
    }
    
    const drawClefStaff = (yOffset: number, label: string, clefSymbol: string, clefType: 'treble' | 'bass') => {
      ctx.strokeStyle = lineStrokeColor;
      ctx.lineWidth = 1.8;
      
      // Draw 5 lines
      for (let i = 0; i < 5; i++) {
        const y = yOffset + i * LINE_SPACING + STAFF_PADDING;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Clef Symbol
      ctx.fillStyle = primaryFillColor;
      ctx.font = `${isCompact ? 60 : 90}px serif`;
      ctx.fillText(clefSymbol, CLEF_X, yOffset + STAFF_PADDING + 3.5 * LINE_SPACING);

      // Key Signature
      const sig = KEY_SIGNATURE_MAP[keySignature];
      ctx.font = `${isCompact ? 32 : 48}px serif`;
      let sigX = SIG_START_X;
      
      sig.sharps.forEach(note => {
        const pitch = clefType === 'treble' ? note : getBassKeyPos(note);
        const y = yOffset + getNoteY(pitch, clefType, STAFF_PADDING, LINE_SPACING);
        ctx.fillText('♯', sigX, y + (isCompact ? 12 : 18));
        sigX += SIG_STEP_X;
      });
      
      sig.flats.forEach(note => {
        const pitch = clefType === 'treble' ? note : getBassKeyPos(note);
        const y = yOffset + getNoteY(pitch, clefType, STAFF_PADDING, LINE_SPACING);
        ctx.fillText('♭', sigX, y + (isCompact ? 12 : 18));
        sigX += SIG_STEP_X;
      });

      // Label
      ctx.fillStyle = secondaryTextColor;
      ctx.font = `italic ${isCompact ? 10 : 12}px Georgia, serif`;
      ctx.fillText(label, 15, yOffset + STAFF_PADDING - (isCompact ? 20 : 30));
    };

    // Draw Treble Staff
    drawClefStaff(0, 'TREBLE CLEF', '𝄞', 'treble');
    // Draw Bass Staff
    drawClefStaff(BASS_OFFSET, 'BASS CLEF', '𝄢', 'bass');

    // Draw final measure barline connecting both staves
    const staffTop = STAFF_PADDING;
    const staffBottom = BASS_OFFSET + STAFF_PADDING + 4 * LINE_SPACING;
    
    ctx.beginPath();
    ctx.moveTo(980, staffTop);
    ctx.lineTo(980, staffBottom);
    ctx.strokeStyle = barlineStrokeColor;
    ctx.lineWidth = isCompact ? 1.5 : 2;
    ctx.stroke();

    // Draw initial measure barline (before clefs)
    ctx.beginPath();
    ctx.moveTo(0, staffTop);
    ctx.lineTo(0, staffBottom);
    ctx.stroke();
  }, [notes, currentBeat, keySignature, isCompact, LINE_SPACING, STAFF_PADDING, CLEF_X, SIG_START_X, SIG_STEP_X, BASS_OFFSET, isDarkMode]);

  // Foreground Canvas Effect (Notes, Accidentals, Ledger Lines)
  useEffect(() => {
    const canvas = fgCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const primaryNoteColor = isDarkMode ? '#f4f4f5' : '#000000';
    const ledgerLineColor = isDarkMode ? 'rgba(255, 255, 255, 0.4)' : '#000000';

    notes.forEach(note => {
      ctx.globalAlpha = note.isHit ? 0.2 : 1.0;

      const yBase = note.clef === 'treble' ? 0 : BASS_OFFSET;
      const y = yBase + getNoteY(note.displayPitch, note.clef, STAFF_PADDING, LINE_SPACING);
      
      ctx.fillStyle = primaryNoteColor;
      ctx.strokeStyle = primaryNoteColor;
      
      ctx.lineWidth = 2;
      
      const headW = isCompact ? 9 : 13;
      const headH = isCompact ? 6 : 9;

      // Scaled note head
      ctx.beginPath();
      ctx.ellipse(note.x, y, headW, headH, Math.PI / -6, 0, Math.PI * 2);
      ctx.fill();

      // Stem
      ctx.lineWidth = isCompact ? 1.2 : 1.8;
      ctx.beginPath();
      const stemXOffset = isCompact ? 8 : 12;
      const stemHeight = isCompact ? 35 : 52;
      ctx.moveTo(note.x + stemXOffset, y);
      ctx.lineTo(note.x + stemXOffset, y - stemHeight);
      ctx.stroke();

      // Ledger lines
      ctx.strokeStyle = ledgerLineColor;
      const staffTopLine = yBase + STAFF_PADDING;
      const staffBottomLine = yBase + STAFF_PADDING + 4 * LINE_SPACING;
      
      const ledgerW = isCompact ? 14 : 21;

      if (y <= staffTopLine - STEP_SPACING) {
        for (let ly = staffTopLine - LINE_SPACING; ly >= y - 4; ly -= LINE_SPACING) {
          ctx.beginPath();
          ctx.moveTo(note.x - ledgerW, ly);
          ctx.lineTo(note.x + ledgerW, ly);
          ctx.stroke();
        }
      } else if (y >= staffBottomLine + STEP_SPACING) {
        for (let ly = staffBottomLine + LINE_SPACING; ly <= y + 4; ly += LINE_SPACING) {
          ctx.beginPath();
          ctx.moveTo(note.x - ledgerW, ly);
          ctx.lineTo(note.x + ledgerW, ly);
          ctx.stroke();
        }
      }

      // Accidental sign
      if (note.accidental) {
        ctx.fillStyle = primaryNoteColor;
        ctx.font = `bold ${isCompact ? 36 : 54}px serif`;
        ctx.fillText(note.accidental, note.x - (isCompact ? 34 : 51), y + (isCompact ? 12 : 18));
      }
      
      ctx.globalAlpha = 1.0;
    });

  }, [notes, currentBeat, isCompact, keySignature, LINE_SPACING, STEP_SPACING, STAFF_PADDING, BASS_OFFSET, isDarkMode]);

  return (
    <div className={`w-full md:h-full flex items-center justify-center transition-colors duration-500 rounded-xl shadow-inner overflow-hidden border relative ${isCompact ? 'aspect-[1000/400]' : 'aspect-[1000/640]'} md:aspect-auto ${isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-neutral-200'}`}>
      <canvas
        key={`bg-${isDarkMode ? 'dark' : 'light'}`}
        ref={bgCanvasRef}
        width={1000}
        height={canvasHeight}
        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
      />
      {children}
      <AnimatePresence mode="popLayout">
        <motion.div
          key={measureId}
          initial={{ opacity: 0, filter: 'blur(8px)', scale: 0.98 }}
          animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }}
          exit={{ opacity: 0, filter: 'blur(8px)', scale: 1.02 }}
          transition={{ duration: 0.4, ease: 'easeInOut' }}
          className="absolute inset-0 w-full h-full flex items-center justify-center pointer-events-none z-10"
        >
          <canvas
            key={isDarkMode ? 'dark' : 'light'}
            ref={fgCanvasRef}
            width={1000}
            height={canvasHeight}
            className="w-full h-full object-contain pointer-events-none"
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
});
