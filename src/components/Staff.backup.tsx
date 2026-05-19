import React, { useEffect, useRef } from 'react';

interface Note {
  id: number;
  displayPitch: string; // Staff position (e.g., "E4")
  actualPitch: string;  // Piano key (e.g., "D#4")
  x: number;
  clef: 'treble' | 'bass';
  isHit?: boolean;
  isMissed?: boolean;
  accidental?: '♯' | '♭' | null;
}

interface StaffProps {
  notes: Note[];
  speed: number;
  hitLineX: number;
  focusedNoteIds?: number[];
  keySignature?: string;
}

// Map note names to vertical positions on the staff
const getNoteY = (pitch: string, clef: 'treble' | 'bass'): number => {
  // We use the displayPitch which is always a natural note (e.g., "E4")
  const baseNote = pitch; 
  // Spacing is 16px per line, so 8px per step (e.g., F5 to E5 is 8px)
  // Treble Clef: F5 is the top line (y=40)
  const trebleMap: Record<string, number> = {
    'D6': 0, 'C6': 8, 'B5': 16, 'A5': 24, 'G5': 32, 'F5': 40, 'E5': 48, 'D5': 56, 'C5': 64, 'B4': 72, 'A4': 80, 'G4': 88, 'F4': 96, 'E4': 104, 'D4': 112, 'C4': 120
  };
  // Bass Clef: A3 is the top line (y=40)
  const bassMap: Record<string, number> = {
    'F4': 0, 'E4': 8, 'D4': 16, 'C4': 24, 'B3': 32, 'A3': 40, 'G3': 48, 'F3': 56, 'E3': 64, 'D3': 72, 'C3': 80, 'B2': 88, 'A2': 96, 'G2': 104, 'F2': 112, 'E2': 120, 'D2': 128, 'C2': 136
  };
  
  return clef === 'treble' ? (trebleMap[baseNote] || 72) : (bassMap[baseNote] || 72);
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
        ctx.lineWidth = 1.2;
        
        // Draw 5 lines - spacing 16px
        for (let i = 0; i < 5; i++) {
          const y = yOffset + i * 16 + 40;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(canvas.width, y);
          ctx.stroke();
        }

        // Clef Symbol - smaller
        ctx.fillStyle = '#000';
        ctx.font = '60px serif';
        ctx.fillText(clefSymbol, 20, yOffset + 95);

        // Key Signature
        const sig = KEY_SIGNATURE_MAP[keySignature];
        ctx.font = '32px serif';
        let sigX = 80;
        
        sig.sharps.forEach(note => {
          // Standard positions for sharps in key signature
          const pitch = clefType === 'treble' ? note : getBassKeyPos(note);
          const y = yOffset + getNoteY(pitch, clefType);
          ctx.fillText('♯', sigX, y + 12);
          sigX += 16;
        });
        
        sig.flats.forEach(note => {
          // Standard positions for flats in key signature
          const pitch = clefType === 'treble' ? note : getBassKeyPos(note);
          const y = yOffset + getNoteY(pitch, clefType);
          ctx.fillText('♭', sigX, y + 12);
          sigX += 16;
        });

        // Label - smaller
        ctx.fillStyle = '#999';
        ctx.font = 'italic 10px Georgia, serif';
        ctx.fillText(label, 10, yOffset + 20);
      };

      // Draw Treble Staff
      drawClefStaff(0, 'TREBLE CLEF', '𝄞', 'treble');
      // Draw Bass Staff
      drawClefStaff(160, 'BASS CLEF', '𝄢', 'bass');

      // Draw Notes
      notes.forEach(note => {
        const yBase = note.clef === 'treble' ? 0 : 160;
        const y = yBase + getNoteY(note.displayPitch, note.clef);
        const isFocused = focusedNoteIds.includes(note.id);
        const isHit = note.isHit;
        const isMissed = note.isMissed;
        
        if (isHit) {
          ctx.fillStyle = '#22C55E'; // Green-500
          ctx.strokeStyle = '#22C55E';
        } else if (isMissed) {
          ctx.fillStyle = '#EF4444'; // Red-500
          ctx.strokeStyle = '#EF4444';
        } else if (isFocused) {
          ctx.fillStyle = '#EAB308'; // Yellow-600
          ctx.strokeStyle = '#000';
        } else {
          ctx.fillStyle = '#000';
          ctx.strokeStyle = '#000';
        }
        
        ctx.lineWidth = 1.5;
        
        // Slightly smaller note head
        ctx.beginPath();
        ctx.ellipse(note.x, y, 9, 6, Math.PI / -6, 0, Math.PI * 2);
        ctx.fill();
        if (isFocused && !isHit && !isMissed) {
          ctx.stroke(); 
        }

        // Stem - slightly thinner and shorter
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(note.x + 8, y);
        ctx.lineTo(note.x + 8, y - 35);
        ctx.stroke();

        // Ledger lines - wider
        ctx.strokeStyle = isHit ? '#22C55E' : (isMissed ? '#EF4444' : '#000');
        const staffTop = yBase + 40;
        const staffBottom = yBase + 40 + 4 * 16;
        
        // Draw ledger lines if note is above or below the staff
        if (y <= staffTop - 8) {
          for (let ly = staffTop - 16; ly >= y - 4; ly -= 16) {
            ctx.beginPath();
            ctx.moveTo(note.x - 14, ly);
            ctx.lineTo(note.x + 14, ly);
            ctx.stroke();
          }
        } else if (y >= staffBottom + 8) {
          for (let ly = staffBottom + 16; ly <= y + 4; ly += 16) {
            ctx.beginPath();
            ctx.moveTo(note.x - 14, ly);
            ctx.lineTo(note.x + 14, ly);
            ctx.stroke();
          }
        }

        // Accidental sign (only if explicitly set)
        if (note.accidental) {
          ctx.font = 'bold 36px serif';
          ctx.fillText(note.accidental, note.x - 34, y + 12);
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
        height={320}
        className="w-full h-auto block"
      />
    </div>
  );
});
