import React, { useEffect, useRef } from 'react';

interface Note {
  id: number;
  displayPitch: string; // Staff position (e.g., "E4")
  actualPitch: string;  // Piano key (e.g., "D#4")
  x: number;
  clef: 'treble' | 'bass';
  isHit?: boolean;
  isMissed?: boolean;
  accidental?: '♯' | '♭' | '♮' | null;
}

interface StaffProps {
  notes: Note[];
  speed: number;
  hitLineX: number;
  focusedNoteIds?: number[];
  keySignature?: string;
  isCompact?: boolean;
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

export const Staff: React.FC<StaffProps> = React.memo(({ notes, speed, hitLineX, focusedNoteIds = [], keySignature = 'C Major', isCompact = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const LINE_SPACING = isCompact ? COMPACT_LINE_SPACING : DEFAULT_LINE_SPACING;
  const STEP_SPACING = LINE_SPACING / 2;
  const STAFF_PADDING = isCompact ? COMPACT_STAFF_PADDING : DEFAULT_STAFF_PADDING;
  const CLEF_X = isCompact ? COMPACT_CLEF_X : DEFAULT_CLEF_X;
  const SIG_START_X = isCompact ? COMPACT_SIG_START_X : DEFAULT_SIG_START_X;
  const SIG_STEP_X = isCompact ? COMPACT_SIG_STEP_X : DEFAULT_SIG_STEP_X;
  const BASS_OFFSET = isCompact ? COMPACT_BASS_OFFSET : DEFAULT_BASS_OFFSET;
  const canvasHeight = isCompact ? 400 : 640;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const drawClefStaff = (yOffset: number, label: string, clefSymbol: string, clefType: 'treble' | 'bass') => {
        ctx.strokeStyle = '#333';
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
        ctx.fillStyle = '#000';
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
        ctx.fillStyle = '#999';
        ctx.font = `italic ${isCompact ? 10 : 12}px Georgia, serif`;
        ctx.fillText(label, 15, yOffset + STAFF_PADDING - (isCompact ? 20 : 30));
      };

      // Draw Treble Staff
      drawClefStaff(0, 'TREBLE CLEF', '𝄞', 'treble');
      // Draw Bass Staff
      drawClefStaff(BASS_OFFSET, 'BASS CLEF', '𝄢', 'bass');

      // Draw Notes
      notes.forEach(note => {
        const yBase = note.clef === 'treble' ? 0 : BASS_OFFSET;
        const y = yBase + getNoteY(note.displayPitch, note.clef, STAFF_PADDING, LINE_SPACING);
        const isFocused = focusedNoteIds.includes(note.id);
        const isHit = note.isHit;
        const isMissed = note.isMissed;
        
        if (isHit) {
          ctx.fillStyle = '#22C55E';
          ctx.strokeStyle = '#22C55E';
        } else if (isMissed) {
          ctx.fillStyle = '#EF4444';
          ctx.strokeStyle = '#EF4444';
        } else if (isFocused) {
          ctx.fillStyle = '#EAB308';
          ctx.strokeStyle = '#000';
        } else {
          ctx.fillStyle = '#000';
          ctx.strokeStyle = '#000';
        }
        
        ctx.lineWidth = 2;
        
        const headW = isCompact ? 9 : 13;
        const headH = isCompact ? 6 : 9;

        // Scaled note head
        ctx.beginPath();
        ctx.ellipse(note.x, y, headW, headH, Math.PI / -6, 0, Math.PI * 2);
        ctx.fill();
        if (isFocused && !isHit && !isMissed) {
          ctx.stroke(); 
        }

        // Stem
        ctx.lineWidth = isCompact ? 1.2 : 1.8;
        ctx.beginPath();
        const stemXOffset = isCompact ? 8 : 12;
        const stemHeight = isCompact ? 35 : 52;
        ctx.moveTo(note.x + stemXOffset, y);
        ctx.lineTo(note.x + stemXOffset, y - stemHeight);
        ctx.stroke();

        // Ledger lines
        ctx.strokeStyle = isHit ? '#22C55E' : (isMissed ? '#EF4444' : '#000');
        const staffTop = yBase + STAFF_PADDING;
        const staffBottom = yBase + STAFF_PADDING + 4 * LINE_SPACING;
        
        const ledgerW = isCompact ? 14 : 21;

        if (y <= staffTop - STEP_SPACING) {
          for (let ly = staffTop - LINE_SPACING; ly >= y - 4; ly -= LINE_SPACING) {
            ctx.beginPath();
            ctx.moveTo(note.x - ledgerW, ly);
            ctx.lineTo(note.x + ledgerW, ly);
            ctx.stroke();
          }
        } else if (y >= staffBottom + STEP_SPACING) {
          for (let ly = staffBottom + LINE_SPACING; ly <= y + 4; ly += LINE_SPACING) {
            ctx.beginPath();
            ctx.moveTo(note.x - ledgerW, ly);
            ctx.lineTo(note.x + ledgerW, ly);
            ctx.stroke();
          }
        }

        // Accidental sign
        if (note.accidental) {
          ctx.fillStyle = isHit ? '#22C55E' : (isMissed ? '#EF4444' : '#000');
          ctx.font = `bold ${isCompact ? 36 : 54}px serif`;
          ctx.fillText(note.accidental, note.x - (isCompact ? 34 : 51), y + (isCompact ? 12 : 18));
        }
      });
    };

    draw();
  }, [notes, hitLineX, focusedNoteIds, keySignature, isCompact, LINE_SPACING, STEP_SPACING, STAFF_PADDING, CLEF_X, SIG_START_X, SIG_STEP_X, BASS_OFFSET]);

  return (
    <div className="w-full bg-white rounded-xl shadow-inner overflow-hidden border border-neutral-200">
      <canvas
        ref={canvasRef}
        width={1000}
        height={canvasHeight}
        className="w-full h-auto block"
      />
    </div>
  );
});
