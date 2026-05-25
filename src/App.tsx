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
  displayPitch: string;
  actualPitch: string;
  x: number;
  beatIndex: number;
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

export default function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [ledgerLines, setLedgerLines] = useState(2);
  const [useAccidentals, setUseAccidentals] = useState(false);
  const [maxNotesPerSpawn, setMaxNotesPerSpawn] = useState(1);
  const [selectedKeySignature, setSelectedKeySignature] = useState<keyof typeof KEY_SIGNATURES | 'Random'>('C Major');
  const [activeKeySignature, setActiveKeySignature] = useState<keyof typeof KEY_SIGNATURES>('C Major');
  const activeKeySignatureRef = useRef<keyof typeof KEY_SIGNATURES>('C Major');
  const measuresPlayedRef = useRef<number>(0);
  const [score, setScore] = useState(0);
  const [notes, setNotes] = useState<Note[]>([]);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [measureId, setMeasureId] = useState(0);
  const [activePianoNotes, setActivePianoNotes] = useState<Map<string, 'hit' | 'miss' | 'default'>>(new Map());
  const [feedback, setFeedback] = useState<{ type: 'hit' | 'miss', id: number, message?: string } | null>(null);
  const [keyChangeAlert, setKeyChangeAlert] = useState<{ id: number; keyName: string } | null>(null);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    if (keyChangeAlert) {
      const timer = setTimeout(() => {
        setKeyChangeAlert(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [keyChangeAlert]);

  const notesRef = useRef<Note[]>([]);
  const currentBeatRef = useRef<number>(0);
  const lastPressBeatRef = useRef<number>(0);

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px) and (orientation: landscape)');
    const checkCompact = (e: MediaQueryList | MediaQueryListEvent) => setIsCompact(e.matches);
    checkCompact(mql);
    mql.addEventListener('change', checkCompact);
    return () => mql.removeEventListener('change', checkCompact);
  }, []);

  const handleKeySignatureChange = useCallback((val: keyof typeof KEY_SIGNATURES | 'Random') => {
    setSelectedKeySignature(val);
    if (val === 'Random') {
      measuresPlayedRef.current = 0;
      const keys = Object.keys(KEY_SIGNATURES) as Array<keyof typeof KEY_SIGNATURES>;
      const randomKey = keys[Math.floor(Math.random() * keys.length)];
      activeKeySignatureRef.current = randomKey;
      setActiveKeySignature(randomKey);
      setKeyChangeAlert({ id: Date.now(), keyName: `Losowa tonacja: ${randomKey}` });
    } else {
      activeKeySignatureRef.current = val;
      setActiveKeySignature(val);
      setKeyChangeAlert({ id: Date.now(), keyName: val });
    }
  }, []);

  const generateMeasure = useCallback(() => {
    let currentKey = activeKeySignatureRef.current;

    if (selectedKeySignature === 'Random') {
      const isNewRun = measuresPlayedRef.current === 0;
      const needsChange = !isNewRun && (measuresPlayedRef.current % 4 === 0);
      
      if (isNewRun || needsChange) {
        const keys = Object.keys(KEY_SIGNATURES) as Array<keyof typeof KEY_SIGNATURES>;
        const availableKeys = keys.filter(k => k !== currentKey);
        const randomKey = availableKeys[Math.floor(Math.random() * availableKeys.length)];
        
        currentKey = randomKey;
        activeKeySignatureRef.current = randomKey;
        setActiveKeySignature(randomKey);
        setKeyChangeAlert({ id: Date.now(), keyName: randomKey });
      }
    }
    
    measuresPlayedRef.current += 1;

    const newNotes: Note[] = [];
    const beatXs = [300, 500, 700, 900];
    const measureAccidentals = new Map<string, string>(); // displayPitch -> 'sharp' | 'flat' | 'natural'

    for (let beatIndex = 0; beatIndex < 4; beatIndex++) {
      const count = Math.floor(Math.random() * maxNotesPerSpawn) + 1;
      const xPos = beatXs[beatIndex];
      const usedNotesInBeat: { pitch: string, isTreble: boolean, abs: number }[] = [];
      const noteNames = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

      for (let i = 0; i < count; i++) {
        const isTreble = Math.random() > 0.5;
        const pool = isTreble ? getNotePool('treble', ledgerLines) : getNotePool('bass', ledgerLines);
        
        let basePitch: string = pool[0];
        let attempts = 0;

        const checkValid = (p: string) => {
          if (usedNotesInBeat.some(n => n.pitch === p)) return false;
          const pNote = p.slice(0, -1);
          const pOctave = parseInt(p.slice(-1));
          const pAbs = pOctave * 7 + noteNames.indexOf(pNote);
          
          let minAbsForClef = pAbs;
          let maxAbsForClef = pAbs;

          for (const usedN of usedNotesInBeat) {
            // Avoid seconds universally (so we don't have overlapping notes)
            if (Math.abs(pAbs - usedN.abs) === 1) return false;

            if (usedN.isTreble === isTreble) {
              minAbsForClef = Math.min(minAbsForClef, usedN.abs);
              maxAbsForClef = Math.max(maxAbsForClef, usedN.abs);
            }
          }
          
          // Constrain notes on the same clef to be within one octave (max interval of 7 diatonic steps)
          if (maxAbsForClef - minAbsForClef > 7) return false;

          return true;
        };

        do {
          basePitch = pool[Math.floor(Math.random() * pool.length)];
          attempts++;
        } while (!checkValid(basePitch) && attempts < 50);

        const pNoteInit = basePitch.slice(0, -1);
        const pOctaveInit = parseInt(basePitch.slice(-1));
        const pAbsInit = pOctaveInit * 7 + noteNames.indexOf(pNoteInit);
        usedNotesInBeat.push({ pitch: basePitch, isTreble, abs: pAbsInit });
        
        const noteName = basePitch.slice(0, -1);
        const octave = parseInt(basePitch.slice(-1));
        const sig = KEY_SIGNATURES[currentKey];
        
        let accidental: '♯' | '♭' | '♮' | null = null;
        let displayPitch = basePitch;
        let finalActualPitch = basePitch;

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

        const isSharpInSig = sig.sharps.includes(noteName);
        const isFlatInSig = sig.flats.includes(noteName);
        const sigState = isSharpInSig ? 'sharp' : (isFlatInSig ? 'flat' : 'natural');
        
        let targetMod = sigState;

        if (currentKey !== 'C Major' && sigState !== 'natural' && Math.random() > 0.8) {
          targetMod = 'natural';
        } else if (useAccidentals && Math.random() > 0.7) {
          const canHaveSharp = ['C', 'D', 'F', 'G', 'A'].includes(noteName);
          const canHaveFlat = ['D', 'E', 'G', 'A', 'B'].includes(noteName);
          
          if (Math.random() > 0.5 && canHaveSharp) {
            targetMod = 'sharp';
          } else if (canHaveFlat) {
            targetMod = 'flat';
          } else if (canHaveSharp || canHaveFlat) {
            targetMod = 'natural';
          }
        }

        if (targetMod === 'sharp') {
          finalActualPitch = getShiftedPitch(noteName, octave, 'sharp');
        } else if (targetMod === 'flat') {
          finalActualPitch = getShiftedPitch(noteName, octave, 'flat');
        } else {
          finalActualPitch = basePitch;
        }

        const currentMod = measureAccidentals.has(basePitch) ? measureAccidentals.get(basePitch) : sigState;

        if (targetMod !== currentMod) {
          if (targetMod === 'sharp') accidental = '♯';
          else if (targetMod === 'flat') accidental = '♭';
          else accidental = '♮';
          
          measureAccidentals.set(basePitch, targetMod);
        }

        newNotes.push({
          id: Date.now() + Math.random() + i + beatIndex * 10,
          displayPitch: displayPitch,
          actualPitch: finalActualPitch,
          x: xPos,
          beatIndex,
          clef: isTreble ? 'treble' : 'bass',
          accidental
        });
      }
    }
    
    notesRef.current = newNotes;
    currentBeatRef.current = 0;
    setNotes(notesRef.current);
    setCurrentBeat(0);
    setMeasureId(id => id + 1);
    setActivePianoNotes(new Map());
    lastPressBeatRef.current = 0;
  }, [useAccidentals, selectedKeySignature, maxNotesPerSpawn, ledgerLines]);

  // Regenerate on settings change
  useEffect(() => {
    if (isPlaying) {
      generateMeasure();
    }
  }, [generateMeasure, isPlaying]);

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

    const currentNotes = notesRef.current;
    let beat = currentBeatRef.current;
    
    const unplayedInBeat = currentNotes.filter(n => n.beatIndex === beat && !n.isHit);
    
    if (unplayedInBeat.length === 0) {
      return; // Waiting for new measure
    }

    const matchingNote = unplayedInBeat.find(n => n.actualPitch === pitch);

    let isLastOfBeat = false;

    if (matchingNote) {
      status = 'hit';
      setScore(s => s + 10);
      setFeedback({ type: 'hit', id: Date.now(), message: 'PERFECT!' });

      notesRef.current = currentNotes.map(n => 
        n.id === matchingNote.id ? { ...n, isHit: true } : n
      );
      
      const newUnplayed = notesRef.current.filter(n => n.beatIndex === beat && !n.isHit);
      
      if (newUnplayed.length === 0) {
        isLastOfBeat = true;
        if (beat < 3) {
          currentBeatRef.current = beat + 1;
          setCurrentBeat(beat + 1);
        } else {
          // Reached end of measure
          setTimeout(() => {
            if (isPlaying) generateMeasure(); // only generate if still playing
          }, 500);
        }
        
        // Clear piano keys shortly after beat completes
        setTimeout(() => {
          setActivePianoNotes(new Map());
        }, 150);
      }
    } else {
      status = 'miss';
      setScore(s => Math.max(0, s - 5));
      setFeedback({ type: 'miss', id: Date.now(), message: `Pressed ${pitch}` });
    }

    setNotes([...notesRef.current]);

    setActivePianoNotes(prev => {
      let next;
      // Start fresh if we are on a new beat
      if (lastPressBeatRef.current !== beat) {
        next = new Map();
        lastPressBeatRef.current = beat;
      } else {
        next = new Map(prev);
      }
      next.set(pitch, status);
      return next;
    });
  }, [isPlaying, generateMeasure]);

  const resetGame = () => {
    setScore(0);
    setNotes([]);
    notesRef.current = [];
    setCurrentBeat(0);
    currentBeatRef.current = 0;
    setIsPlaying(false);
    setStartTime(null);
    setActivePianoNotes(new Map());
    lastPressBeatRef.current = 0;
    measuresPlayedRef.current = 0;
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
            value={selectedKeySignature}
            onChange={(e) => handleKeySignatureChange(e.target.value as any)}
            className={`${isCompact ? 'text-[10px]' : 'text-xs md:text-sm'} bg-white border border-neutral-200 rounded-full px-3 py-1 shadow-sm outline-none focus:ring-2 focus:ring-blue-500`}
          >
            <option value="Random">Losowo (co 4 takty)</option>
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
            {!isCompact && <span className="text-[10px] font-bold text-neutral-400 uppercase">Max notes:</span>}
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

          <button 
            onClick={() => {
              if (!isPlaying && !startTime) {
                setStartTime(new Date().toLocaleTimeString());
                measuresPlayedRef.current = 0;
                generateMeasure();
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
        <section className={`relative rounded-xl transition-all duration-500 ${keyChangeAlert ? 'ring-4 ring-amber-400 shadow-[0_0_25px_rgba(245,158,11,0.45)]' : ''}`}>
          <Staff 
            notes={notes}
            currentBeat={currentBeat}
            keySignature={activeKeySignature}
            isCompact={isCompact}
            measureId={measureId}
          />
          
          {/* Feedback Overlay */}
          <AnimatePresence>
            {feedback && (
              <motion.div
                key={feedback.id}
                initial={{ opacity: 0, y: 10, scale: 0.8 }}
                animate={{ opacity: 1, y: -10, scale: 1.1 }}
                exit={{ opacity: 0 }}
                className={`absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 font-bold text-xl z-20 flex flex-col items-center ${
                  feedback.type === 'hit' ? 'text-green-500' : 'text-red-500'
                }`}
              >
                <span>{feedback.message}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Key Signature Change Announcement Overlay */}
          <AnimatePresence>
            {keyChangeAlert && (
              <motion.div
                key={`keychange-${keyChangeAlert.id}`}
                initial={{ opacity: 0, scale: 0.8, y: -15, filter: 'blur(4px)' }}
                animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 0.85, y: 15, filter: 'blur(4px)' }}
                transition={{ type: 'spring', damping: 14, stiffness: 120 }}
                className="absolute inset-x-4 top-1/2 -translate-y-1/2 p-4 md:p-5 rounded-2xl bg-amber-500/95 backdrop-blur-md shadow-[0_20px_50px_rgba(245,158,11,0.35)] border border-amber-300 z-30 flex items-center justify-between gap-4 max-w-sm md:max-w-md mx-auto"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 md:p-2.5 bg-white/20 rounded-xl text-white">
                    <Music className="w-5 h-5 md:w-6 md:h-6 animate-bounce" />
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="text-[9px] md:text-[10px] uppercase font-bold tracking-widest text-amber-100">Zmiana Tonacji</span>
                    <span className="text-base md:text-xl font-extrabold text-white leading-tight">
                      {keyChangeAlert.keyName}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 text-right bg-white/20 text-white rounded-full px-2.5 py-1 text-[10px] md:text-xs font-bold uppercase tracking-wider">
                  ZMIANA
                </div>
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

