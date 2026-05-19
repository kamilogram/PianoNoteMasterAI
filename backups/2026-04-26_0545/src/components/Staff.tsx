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
}

// Scaling constants
const LINE_SPACING = 24; 
const STEP_SPACING = LINE_SPACING / 2;
const STAFF_PADDING = 60;
const CLEF_X = 20;
const SIG_START_X = 100;
const SIG_STEP_X = 24;

// Map note names to vertical positions on the staff
const getNoteY = (pitch: string, clef: 'treble' | 'bass'): number => {
  // Treble Clef: F5 is the top line (y = STAFF_PADDING + 0 * LINE_SPACING)
  // We'll define a reference point. Let's use Middle C (C4) as a baseline.
  
  const notes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  
  const getStepsFromC4 = (p: string) => {
    const note = p.slice(0, -1);
    const octave = parseInt(p.slice(-1));
    const noteIndex = notes.indexOf(note);
    return (octave - 4) * 7 + noteIndex;
  };

  const stepsFromC4 = getStepsFromC4(pitch);

  if (clef === 'treble') {
    // In treble clef, F5 is the top line. F5 is at index 10 from C4.
    const stepsFromF5 = stepsFromC4 - 10;
    return STAFF_PADDING - (stepsFromF5 * STEP_SPACING);
  } else {
    // In bass clef, Middle C (C4) is one ledger line above the staff.
    // Top line A3 is at index -2 from C4.
    // Let's map A3 to y = STAFF_PADDING
    const stepsFromA3 = stepsFromC4 - (-2); // Distance from A3
    return STAFF_PADDING - (stepsFromA3 * STEP_SPACING);
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

export const Staff: React.FC<StaffProps> = React.memo(({ notes, speed, hitLineX, focusedNoteIds = [], keySignature = 'C Major' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
        ctx.font = '90px serif';
        ctx.fillText(clefSymbol, CLEF_X, yOffset + STAFF_PADDING + 3.5 * LINE_SPACING);

        // Key Signature
        const sig = KEY_SIGNATURE_MAP[keySignature];
        ctx.font = '48px serif';
        let sigX = SIG_START_X;
        
        sig.sharps.forEach(note => {
          const pitch = clefType === 'treble' ? note : getBassKeyPos(note);
          const y = yOffset + getNoteY(pitch, clefType);
          ctx.fillText('♯', sigX, y + 18);
          sigX += SIG_STEP_X;
        });
        
        sig.flats.forEach(note => {
          const pitch = clefType === 'treble' ? note : getBassKeyPos(note);
          const y = yOffset + getNoteY(pitch, clefType);
          ctx.fillText('♭', sigX, y + 18);
          sigX += SIG_STEP_X;
        });

        // Label
        ctx.fillStyle = '#999';
        ctx.font = 'italic 12px Georgia, serif';
        ctx.fillText(label, 15, yOffset + STAFF_PADDING - 30);
      };

      // Draw Treble Staff
      drawClefStaff(0, 'TREBLE CLEF', '𝄞', 'treble');
      // Draw Bass Staff - increased offset
      const BASS_OFFSET = 240; 
      drawClefStaff(BASS_OFFSET, 'BASS CLEF', '𝄢', 'bass');

      // Draw Notes
      notes.forEach(note => {
        const yBase = note.clef === 'treble' ? 0 : BASS_OFFSET;
        const y = yBase + getNoteY(note.displayPitch, note.clef);
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
        
        // Scaled note head
        ctx.beginPath();
        ctx.ellipse(note.x, y, 13, 9, Math.PI / -6, 0, Math.PI * 2);
        ctx.fill();
        if (isFocused && !isHit && !isMissed) {
          ctx.stroke(); 
        }

        // Stem
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(note.x + 12, y);
        ctx.lineTo(note.x + 12, y - 52);
        ctx.stroke();

        // Ledger lines
        ctx.strokeStyle = isHit ? '#22C55E' : (isMissed ? '#EF4444' : '#000');
        const staffTop = yBase + STAFF_PADDING;
        const staffBottom = yBase + STAFF_PADDING + 4 * LINE_SPACING;
        
        if (y <= staffTop - STEP_SPACING) {
          for (let ly = staffTop - LINE_SPACING; ly >= y - 4; ly -= LINE_SPACING) {
            ctx.beginPath();
            ctx.moveTo(note.x - 21, ly);
            ctx.lineTo(note.x + 21, ly);
            ctx.stroke();
          }
        } else if (y >= staffBottom + STEP_SPACING) {
          for (let ly = staffBottom + LINE_SPACING; ly <= y + 4; ly += LINE_SPACING) {
            ctx.beginPath();
            ctx.moveTo(note.x - 21, ly);
            ctx.lineTo(note.x + 21, ly);
            ctx.stroke();
          }
        }

        // Accidental sign
        if (note.accidental) {
          ctx.fillStyle = isHit ? '#22C55E' : (isMissed ? '#EF4444' : '#000');
          ctx.font = 'bold 54px serif';
          ctx.fillText(note.accidental, note.x - 51, y + 18);
        }
      });
    };

    draw();
  }, [notes, hitLineX, focusedNoteIds, keySignature]);

  return (
    <div className="w-full bg-white rounded-xl shadow-inner overflow-hidden border border-neutral-200">
      <canvas
        ref={canvasRef}
        width={1000}
        height={480}
        className="w-full h-auto block"
      />
    </div>
  );
});
