/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Piano } from './components/Piano';
import { Staff } from './components/Staff';
import { audioService } from './services/audioService';
import { Play, Pause, RotateCcw, Settings, Music, Trophy, Clock } from 'lucide-react';

interface Note {
  id: number;
  displayPitch: string; // Staff position (e.g., "E4")
  actualPitch: string;  // Piano key (e.g., "D#4")
  x: number;
  clef: 'treble' | 'bass';
  isMissed?: boolean;
  isHit?: boolean;
  accidental?: '♯' | '♭' | '♮' | null;
}

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

const NOTE_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

const getNotePool = (clef: 'treble' | 'bass', ledgerLines: number) => {
  const pool: string[] = [];
  
  if (clef === 'treble') {
    // Treble staff lines: E4 to F5
    // Below: D4 (space), C4 (1 line), B3 (space), A3 (2 lines), G3 (space), F3 (3 lines), E3 (space), D3 (4 lines), C3 (space), B2 (5 lines)
    const minNoteIndex = 2 - ledgerLines * 2; // B2 is index 6 in oct 2.
    // Above: G5 (space), A5 (1 line), B5 (space), C6 (2 lines), D6 (space), E6 (3 lines), F6 (space), G6 (4 lines), A6 (space), B6 (5 lines)
    const maxNoteIndex = 3 + ledgerLines * 2; // B6 is index 6 in oct 6.
    
    // Let's just hardcode the ranges for clarity as requested (up to 5 lines)
    const ranges: Record<number, { min: string, max: string }> = {
      1: { min: 'C4', max: 'A5' },
      2: { min: 'A3', max: 'C6' },
      3: { min: 'F3', max: 'E6' },
      4: { min: 'D3', max: 'G6' },
      5: { min: 'B2', max: 'B6' }
    };
    const r = ranges[ledgerLines] || ranges[2];
    return generateRange(r.min, r.max);
  } else {
    const ranges: Record<number, { min: string, max: string }> = {
      1: { min: 'E2', max: 'C4' },
      2: { min: 'C2', max: 'E4' },
      3: { min: 'A1', max: 'G4' },
      4: { min: 'F1', max: 'B4' },
      5: { min: 'D1', max: 'D5' }
    };
    const r = ranges[ledgerLines] || ranges[2];
    return generateRange(r.min, r.max);
  }
};

const generateRange = (start: string, end: string) => {
  const res: string[] = [];
  const startNote = start.slice(0, -1);
  const startOct = parseInt(start.slice(-1));
  const endNote = end.slice(0, -1);
  const endOct = parseInt(end.slice(-1));
  
  let currNote = startNote;
  let currOct = startOct;
  
  while (currOct < endOct || (currOct === endOct && NOTE_NAMES.indexOf(currNote) <= NOTE_NAMES.indexOf(endNote))) {
    res.push(`${currNote}${currOct}`);
    let nextIdx = NOTE_NAMES.indexOf(currNote) + 1;
    if (nextIdx === 7) {
      nextIdx = 0;
      currOct++;
    }
    currNote = NOTE_NAMES[nextIdx];
  }
  return res;
};

const HIT_LINE_X = 350;
const SPAWN_X = 1200;

export default function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [isAdaptiveSpeed, setIsAdaptiveSpeed] = useState(true);
  const [ledgerLines, setLedgerLines] = useState(2);
  const [useAccidentals, setUseAccidentals] = useState(false);
  const [maxNotesPerSpawn, setMaxNotesPerSpawn] = useState(1);
  const [keySignature, setKeySignature] = useState<keyof typeof KEY_SIGNATURES>('C Major');
  const [score, setScore] = useState(0);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activePianoNotes, setActivePianoNotes] = useState<Map<string, 'hit' | 'miss' | 'default'>>(new Map());
  const [feedback, setFeedback] = useState<{ type: 'hit' | 'miss', id: number, message?: string } | null>(null);
  const [resumeFactor, setResumeFactor] = useState(1);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [isCompact, setIsCompact] = useState(false);

  const requestRef = useRef<number>(null);
  const notesRef = useRef<Note[]>([]);
  const streakRef = useRef<number>(0);
  const isWaitingRef = useRef<boolean>(false);

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px) and (orientation: landscape)');
    const checkCompact = (e: MediaQueryList | MediaQueryListEvent) => setIsCompact(e.matches);
    checkCompact(mql);
    mql.addEventListener('change', checkCompact);
    return () => mql.removeEventListener('change', checkCompact);
  }, []);

  const getBarrierX = useCallback(() => {
    const sig = KEY_SIGNATURES[keySignature];
    const sigCount = Math.max(sig.sharps.length, sig.flats.length);
    // Increased buffer from left: Clef (~80px) + Key Sig (sigCount * 24) + 120px safety
    return 80 + (sigCount * 24) + 120;
  }, [keySignature]);

  const spawnNote = useCallback(() => {
    const count = Math.floor(Math.random() * maxNotesPerSpawn) + 1;
    const newNotes: Note[] = [];
    const usedPitches = new Set<string>();

    for (let i = 0; i < count; i++) {
      const isTreble = Math.random() > 0.5;
      const tPool = getNotePool('treble', ledgerLines);
      const bPool = getNotePool('bass', ledgerLines);
      const pool = isTreble ? tPool : bPool;
      
      // Try to find a unique pitch for this spawn (Variant 1: No neighbors)
      let basePitch: string;
      let attempts = 0;
      const notes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

      const checkValid = (p: string) => {
        if (usedPitches.has(p)) return false;
        const pNote = p.slice(0, -1);
        const pOctave = parseInt(p.slice(-1));
        const pAbs = pOctave * 7 + notes.indexOf(pNote);
        
        for (const usedP of usedPitches) {
          const uNote = usedP.slice(0, -1);
          const uOctave = parseInt(usedP.slice(-1));
          const uAbs = uOctave * 7 + notes.indexOf(uNote);
          if (Math.abs(pAbs - uAbs) === 1) return false;
        }
        return true;
      };

      do {
        basePitch = pool[Math.floor(Math.random() * pool.length)];
        attempts++;
      } while (!checkValid(basePitch) && attempts < 20);

      usedPitches.add(basePitch);
      
      const noteName = basePitch.slice(0, -1);
      const octave = parseInt(basePitch.slice(-1));
      const sig = KEY_SIGNATURES[keySignature];
      
      let accidental: '♯' | '♭' | '♮' | null = null;
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
      const isSharpInSig = sig.sharps.includes(noteName);
      const isFlatInSig = sig.flats.includes(noteName);

      if (isSharpInSig) {
        finalActualPitch = getShiftedPitch(noteName, octave, 'sharp');
      } else if (isFlatInSig) {
        finalActualPitch = getShiftedPitch(noteName, octave, 'flat');
      }

      // Natural Sign Logic (Kasowniki)
      // If note is in key signature, randomly cancel it with a natural sign
      if (keySignature !== 'C Major' && (isSharpInSig || isFlatInSig) && Math.random() > 0.8) {
        accidental = '♮';
        finalActualPitch = basePitch; // Natural pitch (reset to base)
      } else if (useAccidentals && Math.random() > 0.7) {
        // Random Accidental Mode (only if natural sign wasn't applied)
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
  }, [useAccidentals, keySignature, maxNotesPerSpawn, ledgerLines]);

  const gameLoop = useCallback((time: number) => {
    if (!isPlaying) return;

    const barrierX = getBarrierX();
    const BRAKE_DISTANCE = 200; // Distance to begin deceleration
    
    const unplayed = notesRef.current.filter(n => !n.isHit && !n.isMissed);
    const earliestX = unplayed.length > 0 ? Math.min(...unplayed.map(n => n.x)) : Infinity;
    
    // Movement Physics: Smooth distance-based deceleration
    const distanceToStop = Math.max(0, earliestX - barrierX);
    const isAtBarrier = isAdaptiveSpeed && distanceToStop === 0;
    const TARGET_RESUME = isAdaptiveSpeed && distanceToStop < BRAKE_DISTANCE 
      ? (distanceToStop / BRAKE_DISTANCE) 
      : 1;

    setResumeFactor(prev => {
      const diff = TARGET_RESUME - prev;
      // Use higher easing for acceleration, lower for deceleration
      const easing = TARGET_RESUME > prev ? 0.08 : 0.05;
      const next = prev + diff * easing;
      
      // Speed update logic: if notes have come to a standstill (next close to 0) 
      // and haven't been cleared, decrease speed.
      if (isAdaptiveSpeed && prev > 0.01 && next <= 0.01) {
        // Find notes that are currently at the barrier
        const currentClusterIdx = notesRef.current.findIndex(n => !n.isHit && !n.isMissed);
        if (currentClusterIdx !== -1) {
          const clusterX = notesRef.current[currentClusterIdx].x;
          const stillInCluster = notesRef.current.some(n => 
            !n.isHit && !n.isMissed && Math.abs(n.x - clusterX) < 15
          );
          
          if (stillInCluster) {
            // Cluster reached stop point and is still active. Decrease speed.
            setSpeed(prevSpeed => Math.max(1, prevSpeed - 0.2));
            streakRef.current = 0;
          }
        }
      }
      
      return next;
    });

    isWaitingRef.current = isAtBarrier;
    const effectiveSpeed = speed * (resumeFactor < 0.005 ? 0 : resumeFactor);

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

    if (!isAtBarrier && (SPAWN_X - rightmostX >= MIN_SPAWN_DISTANCE)) {
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
        
        // Start moving again after a hit
        if (isWaitingRef.current) {
          // Push it slightly to trigger movement if last in cluster
          setResumeFactor(prev => Math.max(prev, 0.05));
        }

        // Adaptive Speed: Speed up ONLY if we are CLEARING the cluster while it's still moving
        // (i.e., resumeFactor is relatively high)
        if (isAdaptiveSpeed) {
          // We check if this was the last note in the current visual cluster
          const otherInCluster = unplayedNotes.some(n => 
            n.id !== matchingNote.id && Math.abs(n.x - earliestX) < 10
          );

          if (!otherInCluster) {
            // Cluster cleared!
            // If the cluster was cleared while moving (resumeFactor > 0.5), increase speed
            if (resumeFactor > 0.5) {
              streakRef.current += 1;
              setSpeed(prev => Math.min(10, prev + 0.05 + (streakRef.current > 3 ? 0.1 : 0)));
            }
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
    setStartTime(null);
  };

  return (
    <div className={`min-h-screen bg-neutral-50 text-neutral-900 font-sans flex flex-col items-center overflow-hidden transition-all duration-500 ${isCompact ? 'p-1' : 'p-2 md:p-4'}`}>
      <header className={`w-full max-w-5xl md:landscape:max-w-none xl:max-w-5xl flex flex-col sm:flex-row justify-between items-center gap-2 md:gap-4 ${isCompact ? 'mb-1' : 'mb-4'}`}>
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-1.5 rounded-lg text-white">
            <Music size={isCompact ? 16 : 20} />
          </div>
          <h1 className={`${isCompact ? 'text-lg' : 'text-xl'} font-bold tracking-tight`}>Piano Note Master</h1>
        </div>
        
        <div className={`flex flex-wrap items-center justify-center ${isCompact ? 'gap-1 md:gap-2' : 'gap-2 md:gap-4'}`}>
          {/* Key Signature Selector */}
          <select 
            value={keySignature}
            onChange={(e) => setKeySignature(e.target.value as any)}
            className={`${isCompact ? 'text-[10px]' : 'text-xs md:text-sm'} bg-white border border-neutral-200 rounded-full px-3 py-1 shadow-sm outline-none focus:ring-2 focus:ring-blue-500`}
          >
            {Object.keys(KEY_SIGNATURES).map(k => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>

          {/* Accidentals Toggle */}
          <button 
            onClick={() => setUseAccidentals(!useAccidentals)}
            className={`${isCompact ? 'text-[10px] px-2' : 'text-xs md:text-sm px-4'} py-1 rounded-full border transition-all ${
              useAccidentals ? 'bg-purple-100 border-purple-300 text-purple-700' : 'bg-white border-neutral-200 text-neutral-500'
            }`}
          >
            {isCompact ? 'Acc' : 'Accidentals'}: {useAccidentals ? 'ON' : 'OFF'}
          </button>

          {/* Adaptive Speed Toggle */}
          <button 
            onClick={() => setIsAdaptiveSpeed(!isAdaptiveSpeed)}
            className={`${isCompact ? 'text-[10px] px-2' : 'text-xs md:text-sm px-4'} py-1 rounded-full border transition-all ${
              isAdaptiveSpeed ? 'bg-green-100 border-green-300 text-green-700' : 'bg-white border-neutral-200 text-neutral-500'
            }`}
          >
            {isCompact ? 'Adapt' : 'Adaptive'}: {isAdaptiveSpeed ? 'ON' : 'OFF'}
          </button>

          {/* Ledger Lines Selector */}
          <div className={`flex items-center gap-2 bg-white px-3 py-1 rounded-full shadow-sm border border-neutral-200`}>
            {!isCompact && <span className="text-[10px] font-bold text-neutral-400 uppercase">Lines:</span>}
            <select 
              value={ledgerLines}
              onChange={(e) => setLedgerLines(parseInt(e.target.value))}
              className={`${isCompact ? 'text-[10px]' : 'text-xs'} font-bold outline-none bg-transparent`}
            >
              {[1, 2, 3, 4, 5].map(v => (
                <option key={v} value={v}>{isCompact ? `L${v}` : v}</option>
              ))}
            </select>
          </div>

          {/* Max Notes Per Spawn Selector */}
          <div className={`flex items-center gap-2 bg-white px-3 py-1 rounded-full shadow-sm border border-neutral-200`}>
            {!isCompact && <span className="text-[10px] font-bold text-neutral-400 uppercase">Notes:</span>}
            <select 
              value={maxNotesPerSpawn}
              onChange={(e) => setMaxNotesPerSpawn(parseInt(e.target.value))}
              className={`${isCompact ? 'text-[10px]' : 'text-xs'} font-bold outline-none bg-transparent`}
            >
              <option value={1}>{isCompact ? 'N1' : '1'}</option>
              <option value={2}>{isCompact ? 'N2' : '2'}</option>
              <option value={3}>{isCompact ? 'N3' : '3'}</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-full shadow-sm border border-neutral-200">
            <Trophy size={isCompact ? 12 : 16} className="text-yellow-500" />
            <span className={`font-mono font-bold ${isCompact ? 'text-xs' : 'text-sm'}`}>{score}</span>
          </div>
          
          <div className="hidden lg:flex items-center gap-3 bg-white px-3 py-1 rounded-full shadow-sm border border-neutral-200">
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
            onClick={() => {
              if (!isPlaying && !startTime) {
                setStartTime(new Date().toLocaleTimeString());
              }
              setIsPlaying(!isPlaying);
            }}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full font-semibold transition-all shadow-md ${isCompact ? 'text-[10px] px-2 py-1' : 'text-sm'} ${
              isPlaying 
                ? 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300' 
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isPlaying ? <Pause size={isCompact ? 12 : 16} /> : <Play size={isCompact ? 12 : 16} />}
            {isPlaying ? (isCompact ? 'Pause' : 'Pause') : (isCompact ? 'Start' : 'Start')}
          </button>

          <button 
            onClick={resetGame}
            className={`p-1.5 text-neutral-400 hover:text-neutral-900 transition-colors ${isCompact ? 'hidden' : ''}`}
            title="Reset"
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </header>

      <main className={`w-full max-w-5xl md:landscape:max-w-none xl:max-w-5xl flex flex-col ${isCompact ? 'gap-1' : 'gap-4'}`}>
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
            isCompact={isCompact}
          />
          
          {/* Feedback Overlay */}
          <AnimatePresence>
            {feedback && (
              <motion.div
                key={feedback.id}
                initial={{ opacity: 0, y: 10, scale: 0.8 }}
                animate={{ opacity: 1, y: -10, scale: 1.1 }}
                exit={{ opacity: 0 }}
                className={`absolute left-[350px] top-1/2 -translate-y-1/2 font-bold text-xl z-20 flex flex-col items-center ${
                  feedback.type === 'hit' ? 'text-green-500' : 'text-red-500'
                }`}
              >
                <span>{feedback.message}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Piano Section */}
        <section className="w-full relative">
          <Piano onNotePress={handlePianoPress} activeNotes={activePianoNotes} ledgerLines={ledgerLines} isCompact={isCompact} />
          
          {startTime && (
            <div className="absolute -top-6 left-0 flex items-center gap-1.5 text-neutral-400 bg-neutral-50 px-2 py-0.5 rounded-md border border-neutral-100 italic transition-all animate-in fade-in slide-in-from-bottom-2 duration-700">
              <Clock size={12} />
              <span className="text-[10px] font-medium uppercase tracking-wider">Start learning: {startTime}</span>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

