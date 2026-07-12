/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Piano } from './components/Piano';
import { Staff } from './components/Staff';
import { audioService } from './services/audioService';
import { Play, Pause, RotateCcw, Settings, Music, Trophy, Clock, Sun, Moon, Volume2, VolumeX, TrendingUp, History, Calendar } from 'lucide-react';

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

interface HistoryItem {
  id: string;
  date: string;
  minutes: number;
  seconds: number;
  score: number;
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

const isAccidentalAllowed = (noteName: string, mod: 'sharp' | 'flat' | 'natural', keyName: string): boolean => {
  if (keyName === 'C Major') return true;
  const sig = KEY_SIGNATURES[keyName as keyof typeof KEY_SIGNATURES];
  if (!sig) return true;

  const baseSemitones: Record<string, number> = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 };
  
  const getScalePitchClass = (name: string): number => {
    let semitone = baseSemitones[name];
    if (sig.sharps.includes(name)) {
      semitone = (semitone + 1) % 12;
    } else if (sig.flats.includes(name)) {
      semitone = (semitone - 1 + 12) % 12;
    }
    return semitone;
  };

  let candidateSemitone = baseSemitones[noteName];
  if (mod === 'sharp') {
    candidateSemitone = (candidateSemitone + 1) % 12;
  } else if (mod === 'flat') {
    candidateSemitone = (candidateSemitone - 1 + 12) % 12;
  }

  // Find if any other diatonic note in the key's scale maps to this semitone class
  for (const name of NOTE_NAMES) {
    if (name !== noteName) {
      if (getScalePitchClass(name) === candidateSemitone) {
        return false;
      }
    }
  }

  return true;
};

export default function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [ledgerLines, setLedgerLines] = useState<number>(() => {
    const saved = localStorage.getItem('piano_ledger_lines');
    return saved !== null ? parseInt(saved, 10) : 2;
  });
  const [useAccidentals, setUseAccidentals] = useState<boolean>(() => {
    return localStorage.getItem('piano_use_accidentals') === 'true';
  });
  const [maxNotesPerSpawn, setMaxNotesPerSpawn] = useState<number>(() => {
    const saved = localStorage.getItem('piano_max_notes_per_spawn');
    return saved !== null ? parseInt(saved, 10) : 1;
  });
  const [selectedKeySignature, setSelectedKeySignature] = useState<keyof typeof KEY_SIGNATURES | 'Random'>(() => {
    const saved = localStorage.getItem('piano_selected_key_signature');
    return (saved as any) || 'C Major';
  });
  const [activeKeySignature, setActiveKeySignature] = useState<keyof typeof KEY_SIGNATURES>(() => {
    const saved = localStorage.getItem('piano_selected_key_signature');
    if (saved && saved !== 'Random' && KEY_SIGNATURES[saved as keyof typeof KEY_SIGNATURES]) {
      return saved as keyof typeof KEY_SIGNATURES;
    }
    return 'C Major';
  });
  const activeKeySignatureRef = useRef<keyof typeof KEY_SIGNATURES>(activeKeySignature);
  const measuresPlayedRef = useRef<number>(0);
  const [score, setScore] = useState(0);
  const [notes, setNotes] = useState<Note[]>([]);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [measureId, setMeasureId] = useState(0);
  const [activePianoNotes, setActivePianoNotes] = useState<Map<string, 'hit' | 'miss' | 'default'>>(new Map());
  const [feedback, setFeedback] = useState<{ type: 'hit' | 'miss', id: number, message?: string } | null>(null);
  const [keyChangeAlert, setKeyChangeAlert] = useState<{ id: number; keyName: string } | null>(null);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [startDateTime, setStartDateTime] = useState<Date | null>(null);
  const [elapsedMinutes, setElapsedMinutes] = useState<number>(0);
  const [activeDurationMs, setActiveDurationMs] = useState<number>(0);
  const [showPaceTracker, setShowPaceTracker] = useState<boolean>(() => {
    return localStorage.getItem('piano_show_pace_tracker') === 'true';
  });
  const [correctHits, setCorrectHits] = useState<number>(0);
  const [currentPace, setCurrentPace] = useState<number | null>(null);
  const [highScores, setHighScores] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('piano_pace_high_scores');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return {};
      }
    }
    return {};
  });

  const startDateTimeRef = useRef<Date | null>(null);
  const scoreRef = useRef<number>(0);
  const activeDurationMsRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);
  const correctHitsRef = useRef<number>(0);

  useEffect(() => {
    startDateTimeRef.current = startDateTime;
    scoreRef.current = score;
    activeDurationMsRef.current = activeDurationMs;
    isPlayingRef.current = isPlaying;
    correctHitsRef.current = correctHits;
  }, [startDateTime, score, activeDurationMs, isPlaying, correctHits]);

  useEffect(() => {
    const handleUnload = () => {
      const isPlayingVal = isPlayingRef.current;
      const startDateTimeVal = startDateTimeRef.current;
      const durationMs = activeDurationMsRef.current;
      const scoreVal = scoreRef.current;

      if (isPlayingVal && startDateTimeVal && durationMs >= 3000) {
        const minutes = Math.floor(durationMs / 60000);
        const seconds = Math.floor((durationMs % 60000) / 1000);
        
        const formattedDate = startDateTimeVal.toLocaleString('pl-PL', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        const item: HistoryItem = {
          id: `${startDateTimeVal.getTime()}_${Date.now()}`,
          date: formattedDate,
          minutes,
          seconds,
          score: scoreVal
        };

        const saved = localStorage.getItem('piano_practice_history');
        let currentHistory: HistoryItem[] = [];
        if (saved) {
          try {
            currentHistory = JSON.parse(saved);
          } catch (e) {
            currentHistory = [];
          }
        }
        const updated = [item, ...currentHistory].slice(0, 50);
        localStorage.setItem('piano_practice_history', JSON.stringify(updated));
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
    };
  }, []);

  const [isCompact, setIsCompact] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('piano_sound_enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('piano_note_master_dark_mode');
    if (saved !== null) {
      return saved === 'true';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const [showHistory, setShowHistory] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    const saved = localStorage.getItem('piano_practice_history');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  const configKey = `${selectedKeySignature}_${maxNotesPerSpawn}_${ledgerLines}_${useAccidentals ? 'acc' : 'noacc'}`;
  const configRecord = highScores[configKey] || 0;

  useEffect(() => {
    localStorage.setItem('piano_show_pace_tracker', String(showPaceTracker));
  }, [showPaceTracker]);

  useEffect(() => {
    localStorage.setItem('piano_ledger_lines', String(ledgerLines));
  }, [ledgerLines]);

  useEffect(() => {
    localStorage.setItem('piano_use_accidentals', String(useAccidentals));
  }, [useAccidentals]);

  useEffect(() => {
    localStorage.setItem('piano_max_notes_per_spawn', String(maxNotesPerSpawn));
  }, [maxNotesPerSpawn]);

  useEffect(() => {
    localStorage.setItem('piano_selected_key_signature', selectedKeySignature);
  }, [selectedKeySignature]);

  useEffect(() => {
    localStorage.setItem('piano_sound_enabled', String(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    // Reset session-specific pace variables on parameter changes
    setCorrectHits(0);
    setCurrentPace(null);
  }, [selectedKeySignature, maxNotesPerSpawn, ledgerLines, useAccidentals]);

  const calculateAndSavePace = useCallback(() => {
    const startDateTimeVal = startDateTimeRef.current;
    if (!startDateTimeVal) return;
    const elapsedSecs = activeDurationMsRef.current / 1000;
    if (elapsedSecs < 1) return; // Prevent dividing by extremely short times

    // Pace = correct notes per minute (NPM)
    const pace = (correctHitsRef.current * 60) / elapsedSecs;
    setCurrentPace(pace);

    // Update record if beaten
    const currentRecord = highScores[configKey] || 0;
    if (pace > currentRecord) {
      const nextHighScores = {
        ...highScores,
        [configKey]: pace,
      };
      setHighScores(nextHighScores);
      localStorage.setItem('piano_pace_high_scores', JSON.stringify(nextHighScores));
    }
  }, [configKey, highScores]);

  const saveSessionToHistory = useCallback(() => {
    if (!startDateTime) return;
    const durationMs = activeDurationMs;
    if (durationMs < 3000) return; // ignore sessions shorter than 3 seconds
    
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    const formattedDate = startDateTime.toLocaleString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const newItem: HistoryItem = {
      id: `${startDateTime.getTime()}_${Date.now()}`,
      date: formattedDate,
      minutes,
      seconds,
      score: score
    };

    setHistory(prev => {
      const updated = [newItem, ...prev].slice(0, 50);
      localStorage.setItem('piano_practice_history', JSON.stringify(updated));
      return updated;
    });
  }, [startDateTime, score, activeDurationMs]);

  useEffect(() => {
    if (!isPlaying) return;

    let lastTime = Date.now();
    const interval = setInterval(() => {
      const now = Date.now();
      const delta = now - lastTime;
      lastTime = now;

      if (!showHistory) {
        setActiveDurationMs(prev => {
          const nextVal = prev + delta;
          setElapsedMinutes(Math.floor(nextVal / 60000));
          return nextVal;
        });
      }
    }, 200);

    return () => clearInterval(interval);
  }, [isPlaying, showHistory]);

  useEffect(() => {
    localStorage.setItem('piano_note_master_dark_mode', String(isDarkMode));
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (!showHistory) {
      setShowClearConfirm(false);
    }
  }, [showHistory]);

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
        let isTreble = Math.random() > 0.5;
        if (count === 5) {
          const trebleCount = usedNotesInBeat.filter(n => n.isTreble).length;
          const bassCount = usedNotesInBeat.filter(n => !n.isTreble).length;
          if (trebleCount === 4) {
            isTreble = false;
          } else if (bassCount === 4) {
            isTreble = true;
          }
        }
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
            } else {
              // Avoid situation where bass notes are higher or equal to treble notes (and vice-versa)
              if (isTreble && pAbs <= usedN.abs) return false;
              if (!isTreble && pAbs >= usedN.abs) return false;
            }
          }
          
          // Constrain notes on the same clef to be within one octave (max interval of 7 diatonic steps)
          if (maxAbsForClef - minAbsForClef > 7) return false;

          return true;
        };

        // If a previously generated note in this measure got an accidental, increase the probability of repeating it
        const recurringNotesWithAccidentals = newNotes.filter(
          n => n.clef === (isTreble ? 'treble' : 'bass') && n.accidental !== null && n.accidental !== undefined
        );
        let chosenFromRecurring = false;
        
        // 60% chance to repeat a note with an accidental from previously generated beats in this measure
        if (recurringNotesWithAccidentals.length > 0 && Math.random() < 0.6) {
          const candidatePitches = Array.from(new Set(recurringNotesWithAccidentals.map(n => n.displayPitch)));
          const validCandidates = candidatePitches.filter(p => checkValid(p));
          if (validCandidates.length > 0) {
            basePitch = validCandidates[Math.floor(Math.random() * validCandidates.length)];
            chosenFromRecurring = true;
          }
        }

        if (!chosenFromRecurring) {
          do {
            basePitch = pool[Math.floor(Math.random() * pool.length)];
            attempts++;
          } while (!checkValid(basePitch) && attempts < 50);
        }

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

        const hasMeasureAccidental = measureAccidentals.has(basePitch);
        const existingMeasureMod = measureAccidentals.get(basePitch);

        if (hasMeasureAccidental && existingMeasureMod && Math.random() < 0.90) {
          // Keep the existing modification 90% of the time, so cancellations/changes are rare
          targetMod = existingMeasureMod;
        } else {
          if (currentKey !== 'C Major' && sigState !== 'natural' && Math.random() > 0.8) {
            if (isAccidentalAllowed(noteName, 'natural', currentKey)) {
              targetMod = 'natural';
            }
          } else if (useAccidentals && Math.random() > 0.7) {
            const canHaveSharp = ['C', 'D', 'F', 'G', 'A'].includes(noteName);
            const canHaveFlat = ['D', 'E', 'G', 'A', 'B'].includes(noteName);
            
            const validOptions: ('sharp' | 'flat' | 'natural')[] = [];
            if (canHaveSharp && isAccidentalAllowed(noteName, 'sharp', currentKey)) {
              validOptions.push('sharp');
            }
            if (canHaveFlat && isAccidentalAllowed(noteName, 'flat', currentKey)) {
              validOptions.push('flat');
            }
            if (isAccidentalAllowed(noteName, 'natural', currentKey)) {
              validOptions.push('natural');
            }

            if (validOptions.length > 0) {
              targetMod = validOptions[Math.floor(Math.random() * validOptions.length)];
            } else {
              targetMod = sigState;
            }
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
    if (soundEnabled) {
      audioService.playNote(pitch);
    }
    
    let status: 'hit' | 'miss' | 'default' = 'default';

    if (!isPlaying || showHistory) {
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
    
    const notesInBeat = currentNotes.filter(n => n.beatIndex === beat);
    const unplayedInBeat = notesInBeat.filter(n => !n.isHit);
    
    if (unplayedInBeat.length === 0) {
      return; // Waiting for new measure
    }

    const matchingNote = unplayedInBeat.find(n => n.actualPitch === pitch);

    // If the pitch is part of the current beat but has already been fully played/hit,
    // ignore the press instead of counting it as a miss (prevents double-tap penalties)
    const isAlreadyHitInBeat = notesInBeat.some(n => n.actualPitch === pitch && n.isHit);
    if (!matchingNote && isAlreadyHitInBeat) {
      return;
    }

    let isLastOfBeat = false;

    if (matchingNote) {
      status = 'hit';
      setScore(s => s + 10);
      setCorrectHits(c => c + 1);
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
            if (isPlaying) {
              calculateAndSavePace();
              generateMeasure(); // only generate if still playing
            }
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
  }, [isPlaying, generateMeasure, soundEnabled, showHistory, calculateAndSavePace]);

  const resetGame = () => {
    saveSessionToHistory();
    setScore(0);
    setNotes([]);
    notesRef.current = [];
    setCurrentBeat(0);
    currentBeatRef.current = 0;
    setIsPlaying(false);
    setStartTime(null);
    setStartDateTime(null);
    setElapsedMinutes(0);
    setActiveDurationMs(0);
    setActivePianoNotes(new Map());
    lastPressBeatRef.current = 0;
    measuresPlayedRef.current = 0;
    setCorrectHits(0);
    setCurrentPace(null);
  };

  const totalSecs = history.reduce((acc, item) => acc + ((item.minutes ?? 0) * 60 + (item.seconds ?? 0)), 0);
  const totalMins = Math.floor(totalSecs / 60);
  const remSecs = totalSecs % 60;
  const totalScore = history.reduce((acc, item) => acc + (item.score ?? 0), 0);

  const activeMinutes = Math.floor(activeDurationMs / 60000);
  const activeSeconds = Math.floor((activeDurationMs % 60000) / 1000);

  return (
    <div className={`min-h-[100dvh] md:h-[100dvh] font-sans flex flex-col items-center overflow-x-hidden overflow-y-auto md:overflow-hidden transition-all duration-500 w-full ${isDarkMode ? 'bg-zinc-950 text-zinc-100' : 'bg-neutral-50 text-neutral-900'} ${isCompact ? 'p-1' : 'p-2 md:p-4'}`}>
      <header className={`w-full shrink-0 flex flex-col sm:flex-row justify-between items-center gap-2 md:gap-4 ${isCompact ? 'mb-1' : 'mb-4'}`}>
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-1.5 rounded-lg text-white">
            <Music size={isCompact ? 16 : 20} />
          </div>
          <h1 className={`${isCompact ? 'text-lg' : 'text-xl'} font-bold tracking-tight`}>Piano Note Master</h1>
        </div>
        
        <div className="flex flex-col items-center sm:items-end gap-1.5 w-full sm:w-auto">
          {showPaceTracker && (
            <div className={`flex items-center gap-3 text-[11px] md:text-xs font-mono px-3 py-1 rounded-full shadow-xs transition-all animate-in fade-in slide-in-from-top-1 duration-300 ${
              isDarkMode 
                ? 'bg-zinc-900 border border-zinc-800 text-zinc-300' 
                : 'bg-white border border-neutral-200 text-neutral-600'
            }`}>
              <div className="flex items-center gap-1.5">
                <TrendingUp size={12} className="text-blue-500 animate-pulse" />
                <span>Aktualne tempo:</span>
                <strong className={isDarkMode ? 'text-zinc-100 font-extrabold' : 'text-neutral-900 font-extrabold'}>
                  {currentPace !== null ? `${currentPace.toFixed(1)} NPM` : '—'}
                </strong>
              </div>
              <div className={`w-px h-3 ${isDarkMode ? 'bg-zinc-800' : 'bg-neutral-200'}`} />
              <div className="flex items-center gap-1.5">
                <Trophy size={11} className="text-amber-500" />
                <span>Rekord dla parametrów:</span>
                <strong className="text-emerald-600 dark:text-emerald-400 font-extrabold">
                  {configRecord > 0 ? `${configRecord.toFixed(1)} NPM` : '—'}
                </strong>
              </div>
            </div>
          )}

          <div className={`flex flex-wrap items-center justify-center ${isCompact ? 'gap-1 md:gap-2' : 'gap-2 md:gap-4'} w-full sm:w-auto`}>
          {/* Key Signature Selector */}
          <select 
            value={selectedKeySignature}
            onChange={(e) => handleKeySignatureChange(e.target.value as any)}
            className={`${isCompact ? 'text-[10px]' : 'text-xs md:text-sm'} rounded-full px-3 py-1 shadow-sm outline-none focus:ring-2 focus:ring-blue-500 border transition-all ${
              isDarkMode ? 'bg-zinc-900 border-zinc-805 text-zinc-100' : 'bg-white border-neutral-200 text-neutral-900'
            }`}
          >
            <option value="Random" className={isDarkMode ? 'bg-zinc-900 text-zinc-100' : ''}>Losowo (co 4 takty)</option>
            {Object.keys(KEY_SIGNATURES).map(k => (
              <option key={k} value={k} className={isDarkMode ? 'bg-zinc-900 text-zinc-100' : ''}>{k}</option>
            ))}
          </select>

          {/* Accidentals Toggle */}
          <button 
            onClick={() => setUseAccidentals(!useAccidentals)}
            className={`${isCompact ? 'text-[10px] px-2' : 'text-xs md:text-sm px-4'} py-1 rounded-full border transition-all ${
              useAccidentals 
                ? (isDarkMode ? 'bg-purple-950/40 border-purple-800/80 text-purple-300' : 'bg-purple-100 border-purple-300 text-purple-700') 
                : (isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200' : 'bg-white border-neutral-200 text-neutral-500')
            }`}
          >
            {isCompact ? 'Acc' : 'Accidentals'}: {useAccidentals ? 'ON' : 'OFF'}
          </button>

          {/* Ledger Lines Selector */}
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full shadow-sm border transition-all ${
            isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-200' : 'bg-white border-neutral-200 text-neutral-900'
          }`}>
            {!isCompact && <span className={`text-[10px] font-bold uppercase ${isDarkMode ? 'text-zinc-500' : 'text-neutral-400'}`}>Lines:</span>}
            <select 
              value={ledgerLines}
              onChange={(e) => setLedgerLines(parseInt(e.target.value))}
              className={`${isCompact ? 'text-[10px]' : 'text-xs'} font-bold outline-none bg-transparent ${isDarkMode ? 'text-zinc-200 [&>option]:bg-zinc-900 [&>option]:text-zinc-205' : 'text-neutral-900'}`}
            >
              {[1, 2, 3, 4, 5].map(v => (
                <option key={v} value={v} className={isDarkMode ? 'bg-zinc-900 text-zinc-100' : ''}>{isCompact ? `L${v}` : v}</option>
              ))}
            </select>
          </div>

          {/* Max Notes Per Spawn Selector */}
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full shadow-sm border transition-all ${
            isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-200' : 'bg-white border-neutral-200 text-neutral-900'
          }`}>
            {!isCompact && <span className={`text-[10px] font-bold uppercase ${isDarkMode ? 'text-zinc-500' : 'text-neutral-400'}`}>Max notes:</span>}
            <select 
              value={maxNotesPerSpawn}
              onChange={(e) => setMaxNotesPerSpawn(parseInt(e.target.value))}
              className={`${isCompact ? 'text-[10px]' : 'text-xs'} font-bold outline-none bg-transparent ${isDarkMode ? 'text-zinc-200 [&>option]:bg-zinc-900 [&>option]:text-zinc-205' : 'text-neutral-900'}`}
            >
              {[1, 2, 3, 4, 5].map(v => (
                <option key={v} value={v} className={isDarkMode ? 'bg-zinc-900 text-zinc-100' : ''}>{isCompact ? `N${v}` : v}</option>
              ))}
            </select>
          </div>

          {/* Pace Tracker Toggle */}
          <button 
            onClick={() => setShowPaceTracker(!showPaceTracker)}
            className={`${isCompact ? 'text-[10px] px-2' : 'text-xs md:text-sm px-4'} py-1 rounded-full border transition-all ${
              showPaceTracker 
                ? (isDarkMode ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300' : 'bg-emerald-100 border-emerald-300 text-emerald-700') 
                : (isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200' : 'bg-white border-neutral-200 text-neutral-500')
            }`}
          >
            {isCompact ? 'Tempo' : 'Śledzenie tempa'}: {showPaceTracker ? 'WŁ' : 'WYŁ'}
          </button>

          <div className={`flex items-center gap-2 px-3 py-1 rounded-full shadow-sm border transition-all ${
            isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-200' : 'bg-white border-neutral-200 text-neutral-900'
          }`}>
            <Trophy size={isCompact ? 12 : 16} className="text-yellow-500" />
            <span className={`font-mono font-bold ${isCompact ? 'text-xs' : 'text-sm'}`}>{score}</span>
          </div>

          <button 
            onClick={() => {
              if (isPlaying) {
                // We are pausing! Save the session.
                saveSessionToHistory();
                setStartTime(null);
                setStartDateTime(null);
                setElapsedMinutes(0);
                setActiveDurationMs(0);
              } else {
                if (!startTime) {
                  const now = new Date();
                  setStartTime(now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
                  setStartDateTime(now);
                  setElapsedMinutes(0);
                  setActiveDurationMs(0);
                  measuresPlayedRef.current = 0;
                  generateMeasure();
                }
              }
              setIsPlaying(!isPlaying);
            }}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full font-semibold transition-all shadow-md ${isCompact ? 'text-[10px] px-2 py-1' : 'text-sm'} ${
              isPlaying 
                ? (isDarkMode ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300') 
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isPlaying ? <Pause size={isCompact ? 12 : 16} /> : <Play size={isCompact ? 12 : 16} />}
            {isPlaying ? (isCompact ? 'Pause' : 'Pause') : (isCompact ? 'Start' : 'Start')}
          </button>

          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`p-1.5 rounded-full transition-colors ${isDarkMode ? 'text-yellow-400 hover:text-yellow-300 bg-zinc-800/80 hover:bg-zinc-700' : 'text-neutral-500 hover:text-neutral-900 bg-white hover:bg-neutral-100/80'} border border-neutral-200 shadow-sm`}
            title={isDarkMode ? "Włącz tryb jasny" : "Włącz tryb ciemny"}
          >
            {isDarkMode ? <Sun size={isCompact ? 14 : 16} /> : <Moon size={isCompact ? 14 : 16} />}
          </button>

          <button 
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-1.5 rounded-full transition-colors ${isDarkMode ? 'bg-zinc-800/80 hover:bg-zinc-700' : 'bg-white hover:bg-neutral-100/80'} border ${soundEnabled ? (isDarkMode ? 'text-zinc-400 hover:text-zinc-200 border-zinc-700' : 'text-neutral-500 hover:text-neutral-900 border-neutral-200') : 'border-red-500/50 text-red-500 hover:text-red-600'} shadow-sm`}
            title={soundEnabled ? "Wycisz dźwięki" : "Włącz dźwięki"}
          >
            {soundEnabled ? <Volume2 size={isCompact ? 14 : 16} /> : <VolumeX size={isCompact ? 14 : 16} />}
          </button>

          <button 
            onClick={() => setShowHistory(true)}
            className={`p-1.5 rounded-full transition-colors ${isDarkMode ? 'text-zinc-400 hover:text-zinc-200 bg-zinc-800/80 hover:bg-zinc-700' : 'text-neutral-500 hover:text-neutral-900 bg-white hover:bg-neutral-100/80'} border border-neutral-200 shadow-sm`}
            title="Historia ostatnich ćwiczeń"
          >
            <History size={isCompact ? 14 : 16} />
          </button>

          <button 
            onClick={resetGame}
            className={`p-1.5 transition-colors ${isCompact ? 'hidden' : ''} ${isDarkMode ? 'text-zinc-500 hover:text-zinc-200' : 'text-neutral-400 hover:text-neutral-900'}`}
            title="Reset"
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </div>
    </header>

      <main className={`w-full flex flex-col flex-1 min-h-0 ${isCompact ? 'gap-1' : 'gap-4'}`}>


        {/* Staff Section */}
        <section className={`relative md:flex-1 md:min-h-0 rounded-xl transition-all duration-500 w-full ${keyChangeAlert ? 'ring-4 ring-amber-400 shadow-[0_0_25px_rgba(245,158,11,0.45)]' : ''}`}>
          <Staff 
            notes={notes}
            currentBeat={currentBeat}
            keySignature={activeKeySignature}
            isCompact={isCompact}
            measureId={measureId}
            isDarkMode={isDarkMode}
          >
            {/* Feedback Overlay */}
            <AnimatePresence>
              {feedback && (
                <motion.div
                  key={feedback.id}
                  initial={{ opacity: 0, y: 10, scale: 0.8 }}
                  animate={{ opacity: 1, y: -10, scale: 1.1 }}
                  exit={{ opacity: 0 }}
                  className={`absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 font-bold text-xl md:text-2xl z-0 flex flex-col items-center pointer-events-none drop-shadow-md ${
                    feedback.type === 'hit' ? 'text-green-500' : 'text-red-500'
                  }`}
                >
                  <span>{feedback.message}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </Staff>

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
        <section className="w-full relative shrink-0">
          <Piano onNotePress={handlePianoPress} activeNotes={activePianoNotes} ledgerLines={ledgerLines} isCompact={isCompact} isDarkMode={isDarkMode} />
          
          {startTime && (
            <div className={`absolute -top-8 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-xs transition-all animate-in fade-in slide-in-from-bottom-2 duration-700 z-10 ${
              isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-white border-neutral-200/80 text-neutral-700'
            }`}>
              <Clock size={14} className="text-blue-500" />
              <span className="text-xs font-medium">Rozpoczęto o: <strong className={`font-semibold ${isDarkMode ? 'text-zinc-100' : 'text-neutral-900'}`}>{startTime} ({elapsedMinutes} min)</strong></span>
            </div>
          )}
        </section>
      </main>

      {/* History Dialog Overlay */}
      <AnimatePresence>
        {showHistory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
              className="absolute inset-0 bg-black/65 backdrop-blur-xs"
            />

            {/* Modal Content */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className={`relative w-full max-w-lg rounded-2xl shadow-2xl border flex flex-col max-h-[80vh] overflow-hidden ${
                isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-100 shadow-black/80' : 'bg-white border-neutral-200 text-neutral-900 shadow-neutral-300'
              }`}
            >
              {/* Header */}
              <div className={`p-4 border-b flex items-center justify-between ${
                isDarkMode ? 'border-zinc-800' : 'border-neutral-100'
              }`}>
                <div className="flex items-center gap-2">
                  <Clock className="text-blue-500 w-5 h-5" />
                  <h2 className="text-lg font-bold tracking-tight">Historia ostatnich ćwiczeń</h2>
                </div>
                <button
                  onClick={() => setShowHistory(false)}
                  className={`p-1.5 rounded-full transition-colors ${
                    isDarkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-neutral-100 text-neutral-500'
                  }`}
                >
                  ✕
                </button>
              </div>

              {/* Stats Summary Panel */}
              {(history.length > 0 || startDateTime) && (
                <div className={`px-4 py-3 border-b flex justify-around items-center gap-4 text-center ${
                  isDarkMode ? 'border-zinc-800/60 bg-zinc-950/35' : 'border-neutral-100 bg-neutral-50/50'
                }`}>
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-neutral-800 dark:text-zinc-400 tracking-wider">Łączny czas gry</span>
                    <strong className="text-sm font-black text-blue-600 dark:text-blue-400">
                      {totalMins} min {remSecs} sek
                    </strong>
                  </div>
                  <div className={`w-px h-8 ${isDarkMode ? 'bg-zinc-800' : 'bg-neutral-200'}`} />
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-neutral-800 dark:text-zinc-400 tracking-wider">Liczba sesji</span>
                    <strong className="text-sm font-black text-neutral-900 dark:text-zinc-200">
                      {history.length}
                    </strong>
                  </div>
                  <div className={`w-px h-8 ${isDarkMode ? 'bg-zinc-800' : 'bg-neutral-200'}`} />
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-neutral-800 dark:text-zinc-400 tracking-wider">Zdobyte punkty</span>
                    <strong className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                      {totalScore}
                    </strong>
                  </div>
                </div>
              )}

              {/* List */}
              <div className="p-4 overflow-y-auto flex-1 custom-scrollbar space-y-3">
                {/* Active/In-Progress Session */}
                {startDateTime && (
                  <div
                    className={`p-3 rounded-xl border border-dashed flex justify-between items-center transition-all animate-pulse ${
                      isDarkMode ? 'bg-blue-950/20 border-blue-800/50 text-blue-300' : 'bg-blue-50/50 border-blue-200 text-blue-900'
                    }`}
                  >
                    <div className="flex flex-col gap-1.5 items-start">
                      <span className="text-xs font-bold text-blue-800 dark:text-blue-400 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        Aktualna sesja (w toku)
                      </span>
                      <div className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border ${
                        isDarkMode 
                          ? 'bg-blue-950/60 text-blue-100 border-blue-800/60' 
                          : 'bg-blue-900 text-white border-blue-950 shadow-xs'
                      }`}>
                        <Clock size={12} className="text-blue-300 dark:text-blue-400" />
                        <span>
                          Czas gry: <strong className="font-extrabold text-white">{activeMinutes} min {activeSeconds} sek</strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] uppercase font-bold text-neutral-800 dark:text-zinc-400 tracking-wider">Wynik</span>
                        <span className="text-sm font-mono font-black text-blue-600 dark:text-blue-400">+{score}</span>
                      </div>
                    </div>
                  </div>
                )}

                {history.length === 0 && !startDateTime ? (
                  <div className="text-center py-10 flex flex-col items-center justify-center gap-2">
                    <Music className={`w-8 h-8 ${isDarkMode ? 'text-zinc-700' : 'text-neutral-300'}`} />
                    <p className={`text-sm ${isDarkMode ? 'text-zinc-400' : 'text-neutral-500'}`}>
                      Brak zapisanych sesji ćwiczeń.
                    </p>
                    <p className={`text-xs ${isDarkMode ? 'text-zinc-600' : 'text-neutral-400'} max-w-xs`}>
                      Zacznij grać i kliknij Pause lub Reset, aby zapisać swoją sesję w historii.
                    </p>
                  </div>
                ) : (
                  history.map((item) => (
                    <div
                      key={item.id}
                      className={`p-3 rounded-xl border flex justify-between items-center transition-all ${
                        isDarkMode ? 'bg-zinc-950/40 border-zinc-800/80 hover:bg-zinc-950/80' : 'bg-neutral-50/50 border-neutral-200/80 hover:bg-neutral-50'
                      }`}
                    >
                      <div className="flex flex-col gap-2 items-start">
                        <div className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border ${
                          isDarkMode 
                            ? 'bg-zinc-900 text-zinc-100 border-zinc-850' 
                            : 'bg-zinc-800 text-white border-zinc-900 shadow-xs'
                        }`}>
                          <Calendar size={12} className="text-blue-300 dark:text-blue-400 shrink-0" />
                          <span>
                            Data: <strong className="font-extrabold text-white">{item.date}</strong>
                          </span>
                        </div>
                        <div className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border ${
                          isDarkMode 
                            ? 'bg-zinc-900 text-zinc-100 border-zinc-850' 
                            : 'bg-zinc-800 text-white border-zinc-900 shadow-xs'
                        }`}>
                          <Clock size={12} className="text-blue-300 dark:text-blue-400" />
                          <span>
                            Czas gry: <strong className="font-extrabold text-white">{(item.minutes ?? 0)} min {(item.seconds ?? 0)} sek</strong>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] uppercase font-bold text-neutral-800 dark:text-zinc-400 tracking-wider">Wynik</span>
                          <span className="text-sm font-mono font-black text-blue-600 dark:text-blue-400">+{item.score}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              {history.length > 0 && (
                <div className={`p-3 border-t flex items-center justify-end ${
                  isDarkMode ? 'border-zinc-800 bg-zinc-950/20' : 'border-neutral-100 bg-neutral-50/20'
                }`}>
                  {showClearConfirm ? (
                    <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto justify-between sm:justify-end animate-in fade-in slide-in-from-bottom-1 duration-200">
                      <span className="text-xs font-bold text-red-600 dark:text-red-400">
                        Czy na pewno chcesz usunąć całą historię?
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setHistory([]);
                            localStorage.removeItem('piano_practice_history');
                            setShowClearConfirm(false);
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600 text-white hover:bg-red-700 transition-colors shadow-xs"
                        >
                          Tak, usuń
                        </button>
                        <button
                          onClick={() => setShowClearConfirm(false)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                            isDarkMode 
                              ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700' 
                              : 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-100'
                          }`}
                        >
                          Anuluj
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowClearConfirm(true)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-500/10 transition-all border border-transparent hover:border-red-500/20"
                    >
                      Wyczyść historię
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

