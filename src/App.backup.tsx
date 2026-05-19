/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Piano } from './components/Piano';
import { Staff } from './components/Staff';
import { audioService } from './services/audioService';
import { Play, Pause, RotateCcw, Settings, Music, Trophy } from 'lucide-react';

interface Note {
  id: number;
  displayPitch: string; // Staff position (e.g., "E4")
  actualPitch: string;  // Piano key (e.g., "D#4")
  x: number;
  clef: 'treble' | 'bass';
  isMissed?: boolean;
  isHit?: boolean;
  accidental?: '♯' | '♭' | null;
}

const TREBLE_NOTES = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5', 'C6'];
const BASS_NOTES = ['C2', 'D2', 'E2', 'F2', 'G2', 'A2', 'B2', 'C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4'];

const KEY_SIGNATURES = {
  'C Major': { sharps: [], flats: [] },
  // Sharps
  'G Major': { sharps: ['F'], flats: [] },
  'D Major': { sharps: ['F', 'C'], flats: [] },
  'A Major': { sharps: ['F', 'C', 'G'], flats: [] },
  'E Major': { sharps: ['F', 'C', 'G', 'D'], flats: [] },
  'B Major': { sharps: ['F', 'C', 'G', 'D', 'A'], flats: [] },
  'F# Major': { sharps: ['F', 'C', 'G', 'D', 'A', 'E'], flats: [] },
  // Flats
  'F Major': { sharps: [], flats: ['B'] },
  'Bb Major': { sharps: [], flats: ['B', 'E'] },
  'Eb Major': { sharps: [], flats: ['B', 'E', 'A'] },
  'Ab Major': { sharps: [], flats: ['B', 'E', 'A', 'D'] },
  'Db Major': { sharps: [], flats: ['B', 'E', 'A', 'D', 'G'] },
  'Gb Major': { sharps: [], flats: ['B', 'E', 'A', 'D', 'G', 'C'] },
};

const HIT_LINE_X = 150;
const SPAWN_X = 1000;

export default function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [isAdaptiveSpeed, setIsAdaptiveSpeed] = useState(true);
  const [useAccidentals, setUseAccidentals] = useState(false);
  const [maxNotesPerSpawn, setMaxNotesPerSpawn] = useState(1);
  const [keySignature, setKeySignature] = useState<keyof typeof KEY_SIGNATURES>('C Major');
  const [score, setScore] = useState(0);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activePianoNotes, setActivePianoNotes] = useState<Map<string, 'hit' | 'miss' | 'default'>>(new Map());
  const [feedback, setFeedback] = useState<{ type: 'hit' | 'miss', id: number, message?: string } | null>(null);
  const [resumeFactor, setResumeFactor] = useState(1);

  const requestRef = useRef<number>(null);
  const notesRef = useRef<Note[]>([]);
  const streakRef = useRef<number>(0);
  const isWaitingRef = useRef<boolean>(false);

  const getBarrierX = useCallback(() => {
    const sig = KEY_SIGNATURES[keySignature];
    const sigCount = Math.max(sig.sharps.length, sig.flats.length);
    // Key signature starts at 80, each accidental is 16px. Add 40px buffer.
    return 80 + (sigCount * 16) + 40;
  }, [keySignature]);

  const spawnNote = useCallback(() => {
    const count = Math.floor(Math.random() * maxNotesPerSpawn) + 1;
    const newNotes: Note[] = [];
    const usedPitches = new Set<string>();

    for (let i = 0; i < count; i++) {
      const isTreble = Math.random() > 0.5;
      const pool = isTreble ? TREBLE_NOTES : BASS_NOTES;
      
      // Try to find a unique pitch for this spawn
      let basePitch = pool[Math.floor(Math.random() * pool.length)];
      let attempts = 0;
      while (usedPitches.has(basePitch) && attempts < 10) {
        basePitch = pool[Math.floor(Math.random() * pool.length)];
        attempts++;
      }
      usedPitches.add(basePitch);
      
      const noteName = basePitch.slice(0, -1);
      const octave = parseInt(basePitch.slice(-1));
      const sig = KEY_SIGNATURES[keySignature];
      
      let accidental: '♯' | '♭' | null = null;
      let displayPitch = basePitch;
      let finalActualPitch = basePitch;

      // Helper to shift pitch for internal piano logic
      const getShiftedPitch = (note: string, oct: number, shift: 'sharp' | 'flat'): string => {
        const scale = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        let index = scale.indexOf(note);
        if (shift === 'sharp') {
          index++;
        } else {
          index--;
        }
        
        let finalOct = oct;
        if (index > 11) { index = 0; finalOct++; }
        if (index < 0) { index = 11; finalOct--; }
        
        return `${scale[index]}${finalOct}`;
      };

      // Apply Key Signature
      if (sig.sharps.includes(noteName)) {
        finalActualPitch = getShiftedPitch(noteName, octave, 'sharp');
      } else if (sig.flats.includes(noteName)) {
        finalActualPitch = getShiftedPitch(noteName, octave, 'flat');
      }

      // Random Accidental Mode
      if (useAccidentals && Math.random() > 0.7) {
        const isAlreadySharp = sig.sharps.includes(noteName);
        const isAlreadyFlat = sig.flats.includes(noteName);

        const canHaveSharp = ['C', 'D', 'F', 'G', 'A'].includes(noteName) && !isAlreadySharp;
        const canHaveFlat = ['D', 'E', 'G', 'A', 'B'].includes(noteName) && !isAlreadyFlat;
        
        if (Math.random() > 0.5 && canHaveSharp) {
          accidental = '♯';
          finalActualPitch = getShiftedPitch(noteName, octave, 'sharp');
        } else if (canHaveFlat) {
          accidental = '♭';
          finalActualPitch = getShiftedPitch(noteName, octave, 'flat');
        }
      }
      
      newNotes.push({
        id: Date.now() + Math.random() + i,
        displayPitch: displayPitch,
        actualPitch: finalActualPitch,
        x: SPAWN_X,
        clef: isTreble ? 'treble' : 'bass',
        accidental
      });
    }
    
    notesRef.current = [...notesRef.current, ...newNotes];
    setNotes(notesRef.current);
  }, [useAccidentals, keySignature, maxNotesPerSpawn]);

  const gameLoop = useCallback((time: number) => {
    if (!isPlaying) return;

    const barrierX = getBarrierX();
    let shouldWait = false;

    // Check if any unplayed note is at the barrier
    const unplayed = notesRef.current.filter(n => !n.isHit && !n.isMissed);
    if (unplayed.length > 0 && isAdaptiveSpeed) {
      const earliestX = Math.min(...unplayed.map(n => n.x));
      if (earliestX <= barrierX) {
        shouldWait = true;
      }
    }

    isWaitingRef.current = shouldWait;

    // Update resume factor (gradually increase to 1)
    setResumeFactor(prev => {
      if (shouldWait) return 0;
      if (prev < 1) return Math.min(1, prev + 0.05);
      return 1;
    });

    const effectiveSpeed = shouldWait ? 0 : speed * resumeFactor;

    // Move notes
    notesRef.current = notesRef.current
      .map(note => {
        const nextX = note.x - effectiveSpeed;
        
        // Only trigger miss if we are NOT in adaptive waiting mode
        // or if the note somehow passed the barrier
        if (!note.isMissed && !note.isHit && nextX < 40) {
          setFeedback({ type: 'miss', id: Date.now(), message: 'MISS' });
          
          if (isAdaptiveSpeed) {
            setSpeed(prev => Math.max(1, prev - 0.2));
            streakRef.current = 0;
          }
          
          return { ...note, x: nextX, isMissed: true };
        }
        return { ...note, x: nextX };
      })
      .filter(note => note.x > -50);

    // Spawn new notes - based on distance for equal spacing
    const MIN_SPAWN_DISTANCE = 300; 
    const rightmostX = notesRef.current.length > 0 
      ? Math.max(...notesRef.current.map(n => n.x)) 
      : -Infinity;

    if (!shouldWait && (SPAWN_X - rightmostX >= MIN_SPAWN_DISTANCE)) {
      spawnNote();
    }

    setNotes([...notesRef.current]);
    requestRef.current = requestAnimationFrame(gameLoop);
  }, [isPlaying, speed, spawnNote, isAdaptiveSpeed, getBarrierX, resumeFactor]);

  useEffect(() => {
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(gameLoop);
    } else if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, gameLoop]);

  const handlePianoPress = useCallback((pitch: string) => {
    audioService.playNote(pitch);
    
    let status: 'hit' | 'miss' | 'default' = 'default';

    if (!isPlaying) {
      setActivePianoNotes(prev => new Map(prev).set(pitch, 'default'));
      setTimeout(() => setActivePianoNotes(prev => {
        const next = new Map(prev);
        next.delete(pitch);
        return next;
      }), 200);
      return;
    }

    // Find the earliest X position of unplayed notes
    const unplayedNotes = notesRef.current.filter(n => !n.isHit && !n.isMissed);
    if (unplayedNotes.length === 0) {
      status = 'miss';
    } else {
      const earliestX = Math.min(...unplayedNotes.map(n => n.x));
      // Find a note at this X position that matches the pressed pitch
      // We allow a small tolerance for X if they were spawned together
      const matchingNote = unplayedNotes.find(n => 
        Math.abs(n.x - earliestX) < 5 && n.actualPitch === pitch
      );

      if (matchingNote) {
        status = 'hit';
        setScore(s => s + 10);
        setFeedback({ type: 'hit', id: Date.now(), message: 'PERFECT!' });
        
        // Start moving slowly again after a hit if we were waiting
        if (isWaitingRef.current) {
          setResumeFactor(0.1);
        }

        // Adaptive Speed: Speed up on every hit, more on streak
        if (isAdaptiveSpeed) {
          streakRef.current += 1;
          // Small constant boost on every hit
          setSpeed(prev => Math.min(10, prev + 0.02));
          
          // Extra boost every 5 hits
          if (streakRef.current >= 5) {
            setSpeed(prev => Math.min(10, prev + 0.1));
            streakRef.current = 0;
          }
        }

        notesRef.current = notesRef.current.map(n => 
          n.id === matchingNote.id ? { ...n, isHit: true } : n
        );
        setNotes([...notesRef.current]);
      } else {
        status = 'miss';
        // If no matching note at the earliest X, it's a miss
        setFeedback({ type: 'miss', id: Date.now(), message: `Pressed ${pitch}` });
        
        // Adaptive Speed: Slow down on wrong note
        if (isAdaptiveSpeed) {
          setSpeed(prev => Math.max(1, prev - 0.2));
          streakRef.current = 0;
        }
      }
    }

    setActivePianoNotes(prev => {
      const next = new Map(prev);
      next.set(pitch, status);
      return next;
    });
    setTimeout(() => {
      setActivePianoNotes(prev => {
        const next = new Map(prev);
        next.delete(pitch);
        return next;
      });
    }, 200);
  }, [isPlaying, isAdaptiveSpeed]);

  const resetGame = () => {
    setScore(0);
    setNotes([]);
    notesRef.current = [];
    setIsPlaying(false);
    streakRef.current = 0;
    setSpeed(2);
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans p-2 md:p-4 flex flex-col items-center overflow-hidden">
      <header className="w-full max-w-5xl flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-1.5 rounded-lg text-white">
            <Music size={20} />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Piano Note Master</h1>
        </div>
        
        <div className="flex flex-wrap items-center justify-center gap-2 md:gap-4">
          {/* Key Signature Selector */}
          <select 
            value={keySignature}
            onChange={(e) => setKeySignature(e.target.value as any)}
            className="text-xs md:text-sm bg-white border border-neutral-200 rounded-full px-3 py-1 shadow-sm outline-none focus:ring-2 focus:ring-blue-500"
          >
            {Object.keys(KEY_SIGNATURES).map(k => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>

          {/* Accidentals Toggle */}
          <button 
            onClick={() => setUseAccidentals(!useAccidentals)}
            className={`text-xs md:text-sm px-4 py-1 rounded-full border transition-all ${
              useAccidentals ? 'bg-purple-100 border-purple-300 text-purple-700' : 'bg-white border-neutral-200 text-neutral-500'
            }`}
          >
            Accidentals: {useAccidentals ? 'ON' : 'OFF'}
          </button>

          {/* Adaptive Speed Toggle */}
          <button 
            onClick={() => setIsAdaptiveSpeed(!isAdaptiveSpeed)}
            className={`text-xs md:text-sm px-4 py-1 rounded-full border transition-all ${
              isAdaptiveSpeed ? 'bg-green-100 border-green-300 text-green-700' : 'bg-white border-neutral-200 text-neutral-500'
            }`}
          >
            Adaptive: {isAdaptiveSpeed ? 'ON' : 'OFF'}
          </button>

          {/* Max Notes Per Spawn Selector */}
          <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-full shadow-sm border border-neutral-200">
            <span className="text-[10px] font-bold text-neutral-400 uppercase">Notes:</span>
            <select 
              value={maxNotesPerSpawn}
              onChange={(e) => setMaxNotesPerSpawn(parseInt(e.target.value))}
              className="text-xs font-bold outline-none bg-transparent"
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-full shadow-sm border border-neutral-200">
            <Trophy size={16} className="text-yellow-500" />
            <span className="font-mono font-bold text-sm">{score}</span>
          </div>
          
          <div className="hidden sm:flex items-center gap-3 bg-white px-3 py-1 rounded-full shadow-sm border border-neutral-200">
            <Settings size={14} className="text-neutral-400" />
            <input 
              type="range" 
              min="1" 
              max="10" 
              step="0.5"
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              disabled={isAdaptiveSpeed}
              className="w-24 md:w-32 h-1.5 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:opacity-50"
            />
            <span className="font-mono font-bold text-xs w-6">{speed.toFixed(1)}</span>
          </div>

          <button 
            onClick={() => setIsPlaying(!isPlaying)}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full font-semibold transition-all shadow-md text-sm ${
              isPlaying 
                ? 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300' 
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            {isPlaying ? 'Pause' : 'Start'}
          </button>

          <button 
            onClick={resetGame}
            className="p-1.5 text-neutral-400 hover:text-neutral-900 transition-colors"
            title="Reset"
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </header>

      <main className="w-full max-w-5xl flex flex-col gap-4">
        {/* Staff Section */}
        <section className="relative">
          <Staff 
            notes={notes} 
            speed={speed} 
            hitLineX={HIT_LINE_X} 
            focusedNoteIds={(() => {
              const unplayed = notes.filter(n => !n.isMissed && !n.isHit);
              if (unplayed.length === 0) return [];
              const earliestX = Math.min(...unplayed.map(n => n.x));
              return unplayed.filter(n => Math.abs(n.x - earliestX) < 5).map(n => n.id);
            })()}
            keySignature={keySignature}
          />
          
          {/* Feedback Overlay */}
          <AnimatePresence>
            {feedback && (
              <motion.div
                key={feedback.id}
                initial={{ opacity: 0, y: 10, scale: 0.8 }}
                animate={{ opacity: 1, y: -10, scale: 1.1 }}
                exit={{ opacity: 0 }}
                className={`absolute left-[150px] top-1/2 -translate-y-1/2 font-bold text-xl z-20 flex flex-col items-center ${
                  feedback.type === 'hit' ? 'text-green-500' : 'text-red-500'
                }`}
              >
                <span>{feedback.message}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Piano Section */}
        <section className="w-full">
          <Piano onNotePress={handlePianoPress} activeNotes={activePianoNotes} />
        </section>
      </main>
    </div>
  );
}
