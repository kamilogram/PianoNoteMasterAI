/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Piano } from './components/Piano';
import { Staff } from './components/Staff';
import { audioService } from './services/audioService';
import { audioInputService, AudioInputStatus } from './services/audioInputService';
import { Play, Pause, RotateCcw, Settings, Music, Trophy, Clock, Sun, Moon, Volume2, VolumeX, TrendingUp, History, Calendar, Trash2, X, SlidersHorizontal, Plus, ChevronDown, ChevronUp, Mic, MicOff, Radio, SkipForward, Lightbulb, HelpCircle, Info, CheckCircle2, Download, Smartphone, Laptop, Wifi, WifiOff, ArrowUp, ArrowDown, Target, CheckSquare, Square, Filter, FilterX } from 'lucide-react';

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
const CHROMATIC_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const ALL_CALIBRATION_PITCHES = Array.from({ length: 6 }, (_, i) => i + 1).flatMap(octave =>
  CHROMATIC_NOTE_NAMES.map(note => `${note}${octave}`)
);

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

export type SortField = 'score' | 'notes' | 'ledger' | 'accCount' | 'keyName' | 'useAccidentals';
export type SortOrder = 'desc' | 'asc';

export interface SortRule {
  field: SortField;
  order: SortOrder;
}

const SORT_FIELD_LABELS: Record<SortField, string> = {
  score: 'Prędkość (NPM)',
  notes: 'Liczba nut naraz',
  ledger: 'Linie dodane (kreski)',
  accCount: 'Liczba znaków (♯/♭)',
  keyName: 'Nazwa tonacji',
  useAccidentals: 'Znaki przypadkowe (Tak/Nie)'
};

const formatKeySignatureWithAccidentals = (keyName: string) => {
  if (!keyName) return '';
  if (keyName === 'Random' || keyName === 'Losowo') return 'Losowo';
  const sig = KEY_SIGNATURES[keyName as keyof typeof KEY_SIGNATURES];
  if (!sig) return keyName;
  if (sig.sharps.length > 0) {
    return `${keyName} (${sig.sharps.length}♯)`;
  }
  if (sig.flats.length > 0) {
    return `${keyName} (${sig.flats.length}♭)`;
  }
  return `${keyName} (0)`;
};

const parseConfigKey = (key: string) => {
  const parts = key.split('_');
  if (parts.length >= 4) {
    const accPart = parts[parts.length - 1];
    const ledgerPart = parts[parts.length - 2];
    const notesPart = parts[parts.length - 3];
    const keySigPart = parts.slice(0, parts.length - 3).join('_');
    
    const notesNum = parseInt(notesPart, 10) || 1;
    const ledgerNum = parseInt(ledgerPart, 10) || 0;

    let accidentalsCount = 0;
    const sig = KEY_SIGNATURES[keySigPart as keyof typeof KEY_SIGNATURES];
    if (sig) {
      accidentalsCount = sig.sharps.length + sig.flats.length;
    }

    return {
      keySignature: keySigPart,
      maxNotesPerSpawn: `${notesPart} ${notesNum === 1 ? 'nuta' : (notesNum < 5 ? 'nuty' : 'nut')}`,
      ledgerLines: `${ledgerPart} ${ledgerNum === 1 ? 'linia dodana' : (ledgerNum < 5 ? 'linie dodane' : 'linii dodanych')}`,
      useAccidentals: accPart === 'acc' ? 'Ze znakami' : 'Bez znaków',
      rawNotes: notesNum,
      rawLedger: ledgerNum,
      rawAccidentals: accPart === 'acc' ? 1 : 0,
      accidentalsCount
    };
  }
  return {
    keySignature: key,
    maxNotesPerSpawn: '',
    ledgerLines: '',
    useAccidentals: '',
    rawNotes: 1,
    rawLedger: 0,
    rawAccidentals: 0,
    accidentalsCount: 0
  };
};

const compareParsedRecords = (
  keyA: string,
  scoreA: number,
  keyB: string,
  scoreB: number,
  rules: SortRule[]
) => {
  const parsedA = parseConfigKey(keyA);
  const parsedB = parseConfigKey(keyB);

  for (const rule of rules) {
    let diff = 0;
    switch (rule.field) {
      case 'score':
        diff = scoreA - scoreB;
        break;
      case 'notes':
        diff = parsedA.rawNotes - parsedB.rawNotes;
        break;
      case 'ledger':
        diff = parsedA.rawLedger - parsedB.rawLedger;
        break;
      case 'accCount':
        diff = parsedA.accidentalsCount - parsedB.accidentalsCount;
        break;
      case 'keyName':
        diff = parsedA.keySignature.localeCompare(parsedB.keySignature, 'pl');
        break;
      case 'useAccidentals':
        diff = parsedA.rawAccidentals - parsedB.rawAccidentals;
        break;
    }
    if (diff !== 0) {
      return rule.order === 'desc' ? -diff : diff;
    }
  }
  return 0;
};

const deduplicateHistory = (items: HistoryItem[]): HistoryItem[] => {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const result: HistoryItem[] = [];
  for (const item of items) {
    if (!item) continue;
    const dateStr = (item.date || '').trim();
    const minutes = item.minutes ?? 0;
    const seconds = item.seconds ?? 0;
    const score = item.score ?? 0;
    const key = `${dateStr}_${minutes}_${seconds}_${score}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
};

const getRankForConfig = (scores: Record<string, number>, targetKey: string): number | null => {
  const targetScore = scores[targetKey];
  if (!targetScore || targetScore <= 0) return null;
  const sorted = (Object.entries(scores) as [string, number][])
    .filter(([_, scoreVal]) => scoreVal > 0)
    .sort((a, b) => b[1] - a[1]);
  const idx = sorted.findIndex(([key]) => key === targetKey);
  return idx !== -1 ? idx + 1 : null;
};

export default function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [ledgerLines, setLedgerLines] = useState<number>(() => {
    const saved = localStorage.getItem('piano_ledger_lines');
    return saved !== null ? parseInt(saved, 10) : 2;
  });
  const activeLedgerLinesRef = useRef<number>(ledgerLines);
  useEffect(() => {
    activeLedgerLinesRef.current = ledgerLines;
  }, [ledgerLines]);
  const [selectedAccidentals, setSelectedAccidentals] = useState<boolean | 'Random'>(() => {
    const saved = localStorage.getItem('piano_selected_accidentals');
    if (saved === 'Random') return 'Random';
    if (saved === 'true') return true;
    if (saved === 'false') return false;
    const legacy = localStorage.getItem('piano_use_accidentals');
    if (legacy !== null) return legacy === 'true';
    return false;
  });
  const [activeUseAccidentals, setActiveUseAccidentals] = useState<boolean>(() => {
    const saved = localStorage.getItem('piano_selected_accidentals');
    if (saved === 'true') return true;
    if (saved === 'false') return false;
    const legacy = localStorage.getItem('piano_use_accidentals');
    if (legacy !== null) return legacy === 'true';
    return false;
  });
  const activeUseAccidentalsRef = useRef<boolean>(activeUseAccidentals);

  const [selectedMaxNotes, setSelectedMaxNotes] = useState<number | 'Random'>(() => {
    const saved = localStorage.getItem('piano_selected_max_notes');
    if (saved === 'Random') return 'Random';
    if (saved !== null) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 5) return parsed;
    }
    const legacy = localStorage.getItem('piano_max_notes_per_spawn');
    if (legacy !== null) {
      const parsed = parseInt(legacy, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 5) return parsed;
    }
    return 1;
  });
  const [activeMaxNotes, setActiveMaxNotes] = useState<number>(() => {
    const saved = localStorage.getItem('piano_selected_max_notes');
    if (saved && saved !== 'Random') {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 5) return parsed;
    }
    const legacy = localStorage.getItem('piano_max_notes_per_spawn');
    if (legacy !== null) {
      const parsed = parseInt(legacy, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 5) return parsed;
    }
    return 1;
  });
  const activeMaxNotesRef = useRef<number>(activeMaxNotes);

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
  const [activePianoNotes, setActivePianoNotes] = useState<Map<string, 'hit' | 'miss' | 'wrong-octave' | 'default'>>(new Map());
  const [feedback, setFeedback] = useState<{ type: 'hit' | 'miss' | 'wrong-octave', id: number, message?: string } | null>(null);

  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => {
        setFeedback(null);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [feedback]);
  const [keyChangeAlert, setKeyChangeAlert] = useState<{
    id: number;
    keyName: string;
    maxNotesText?: string;
    accidentalsText?: string;
    prevKeyName?: string;
    prevKeyPace?: number | null;
    isNewRecord?: boolean;
    wasFirstRecord?: boolean;
    previousRecordPace?: number | null;
    missingPace?: number | null;
    rankText?: string;
    rankImproved?: boolean;
    duration?: number;
  } | null>(null);
  const keyChangeAlertRef = useRef<typeof keyChangeAlert>(null);
  useEffect(() => {
    keyChangeAlertRef.current = keyChangeAlert;
  }, [keyChangeAlert]);
  const [startRanks, setStartRanks] = useState<Record<string, number | null>>({});
  const startRanksRef = useRef<Record<string, number | null>>({});
  const startScoresRef = useRef<Record<string, number>>({});
  const segmentInitialRecordRef = useRef<number>(0);
  const segmentInitialRankRef = useRef<number | null>(null);
  const isListeningModeRef = useRef<boolean>(false);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [startDateTime, setStartDateTime] = useState<Date | null>(null);
  const [elapsedMinutes, setElapsedMinutes] = useState<number>(0);
  const [activeDurationMs, setActiveDurationMs] = useState<number>(0);
  const [showPaceTracker, setShowPaceTracker] = useState<boolean>(() => {
    return localStorage.getItem('piano_show_pace_tracker') === 'true';
  });
  const [correctHits, setCorrectHits] = useState<number>(0);
  const [currentPace, setCurrentPace] = useState<number | null>(null);
  const [paceTrend, setPaceTrend] = useState<'up' | 'down' | 'equal' | null>(null);
  const [segmentMeasuresCompleted, setSegmentMeasuresCompleted] = useState<number>(0);
  const lastMeasurePaceRef = useRef<number | null>(null);
  const [sessionBeatenKeys, setSessionBeatenKeys] = useState<Set<string>>(new Set());
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
  const highScoresRef = useRef<Record<string, number>>(highScores);
  useEffect(() => {
    highScoresRef.current = highScores;
  }, [highScores]);

  const [selectedRecordKeysForTraining, setSelectedRecordKeysForTraining] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('piano_pace_training_selected_records');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const selectedRecordKeysForTrainingRef = useRef<string[]>(selectedRecordKeysForTraining);
  useEffect(() => {
    selectedRecordKeysForTrainingRef.current = selectedRecordKeysForTraining;
    localStorage.setItem('piano_pace_training_selected_records', JSON.stringify(selectedRecordKeysForTraining));
  }, [selectedRecordKeysForTraining]);

  const [isPracticeFromRecordsActive, setIsPracticeFromRecordsActive] = useState<boolean>(() => {
    return localStorage.getItem('piano_practice_selected_records_active') === 'true';
  });
  const isPracticeFromRecordsActiveRef = useRef<boolean>(isPracticeFromRecordsActive);
  useEffect(() => {
    isPracticeFromRecordsActiveRef.current = isPracticeFromRecordsActive;
    localStorage.setItem('piano_practice_selected_records_active', String(isPracticeFromRecordsActive));
  }, [isPracticeFromRecordsActive]);

  const [audioInputStatus, setAudioInputStatus] = useState<AudioInputStatus>({
    isMidiConnected: false,
    midiDeviceName: null,
    isMicActive: false,
    detectedPitch: null,
    detectedFrequency: null,
    volumeLevel: 0,
    micError: null
  });
  const [showAudioInputModal, setShowAudioInputModal] = useState<boolean>(false);

  useEffect(() => {
    isListeningModeRef.current = audioInputStatus.isMicActive || audioInputStatus.isMidiConnected;
  }, [audioInputStatus.isMicActive, audioInputStatus.isMidiConnected]);

  // Pitch Calibration & Remapping State
  const [transposeOffset, setTransposeOffset] = useState<number>(() => {
    const saved = localStorage.getItem('piano_transpose_offset');
    return saved !== null ? parseInt(saved, 10) : 0;
  });

  const [customPitchMap, setCustomPitchMap] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('piano_custom_pitch_map');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return {};
      }
    }
    return {};
  });

  const [calibrationDetectedInput, setCalibrationDetectedInput] = useState<string>('C4');
  const [calibrationTargetOutput, setCalibrationTargetOutput] = useState<string>('C4');
  const [isCapturingInput, setIsCapturingInput] = useState<boolean>(false);
  const [showCalibrationHelp, setShowCalibrationHelp] = useState<boolean>(true);

  useEffect(() => {
    localStorage.setItem('piano_transpose_offset', transposeOffset.toString());
  }, [transposeOffset]);

  useEffect(() => {
    localStorage.setItem('piano_custom_pitch_map', JSON.stringify(customPitchMap));
  }, [customPitchMap]);

  useEffect(() => {
    if (isCapturingInput && audioInputStatus.detectedPitch) {
      setCalibrationDetectedInput(audioInputStatus.detectedPitch);
    }
  }, [isCapturingInput, audioInputStatus.detectedPitch]);

  const remapPitch = useCallback((rawPitch: string): string => {
    if (!rawPitch) return rawPitch;

    // 1. Direct custom remapping rule
    if (customPitchMap[rawPitch]) {
      return customPitchMap[rawPitch];
    }

    // 2. Transpose offset in semitones
    if (transposeOffset !== 0) {
      const noteName = rawPitch.replace(/-?\d+$/, '');
      const octMatch = rawPitch.match(/-?\d+$/);
      const octave = parseInt(octMatch ? octMatch[0] : '4', 10);
      const idx = CHROMATIC_NOTE_NAMES.indexOf(noteName);
      if (idx !== -1) {
        const midi = (octave + 1) * 12 + idx + transposeOffset;
        if (midi >= 0 && midi <= 127) {
          const newNoteName = CHROMATIC_NOTE_NAMES[midi % 12];
          const newOctave = Math.floor(midi / 12) - 1;
          return `${newNoteName}${newOctave}`;
        }
      }
    }

    return rawPitch;
  }, [transposeOffset, customPitchMap]);

  const handleAddCalibrationRule = () => {
    if (!calibrationDetectedInput || !calibrationTargetOutput) return;
    setCustomPitchMap(prev => ({
      ...prev,
      [calibrationDetectedInput]: calibrationTargetOutput
    }));
    setIsCapturingInput(false);
  };

  const handleRemoveCalibrationRule = (detected: string) => {
    setCustomPitchMap(prev => {
      const next = { ...prev };
      delete next[detected];
      return next;
    });
  };

  const handleResetCalibration = () => {
    setTransposeOffset(0);
    setCustomPitchMap({});
  };

  const startDateTimeRef = useRef<Date | null>(null);
  const scoreRef = useRef<number>(0);
  const activeDurationMsRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);
  const correctHitsRef = useRef<number>(0);
  const segmentStartHitsRef = useRef<number>(0);
  const segmentStartDurationMsRef = useRef<number>(0);
  const segmentMeasuresCompletedRef = useRef<number>(0);

  useEffect(() => {
    startDateTimeRef.current = startDateTime;
    scoreRef.current = score;
    activeDurationMsRef.current = activeDurationMs;
    isPlayingRef.current = isPlaying;
    correctHitsRef.current = correctHits;
  }, [startDateTime, score, activeDurationMs, isPlaying, correctHits]);

  // Screen Wake Lock API to prevent screen dimming/sleeping when mic is active or session is playing
  useEffect(() => {
    let wakeLockSentinel: any = null;

    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && (audioInputStatus.isMicActive || isPlaying)) {
        try {
          wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
        } catch (err) {
          // Ignore error if wake lock fails or is unsupported/rejected
        }
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && (audioInputStatus.isMicActive || isPlaying)) {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockSentinel) {
        wakeLockSentinel.release().catch(() => {});
      }
    };
  }, [audioInputStatus.isMicActive, isPlaying]);

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
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) {
              currentHistory = parsed;
            }
          } catch (e) {
            currentHistory = [];
          }
        }
        const updated = deduplicateHistory([item, ...currentHistory]).slice(0, 50);
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
  const [showRecordsModal, setShowRecordsModal] = useState(false);
  const [showClearRecordsConfirm, setShowClearRecordsConfirm] = useState(false);
  const [showPracticeModeLockDialog, setShowPracticeModeLockDialog] = useState(false);
  const [showOfflineModal, setShowOfflineModal] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [sortRules, setSortRules] = useState<SortRule[]>([
    { field: 'score', order: 'desc' },
    { field: 'notes', order: 'desc' },
    { field: 'ledger', order: 'desc' }
  ]);
  const [showAdvancedSortPanel, setShowAdvancedSortPanel] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(true);
  const [recordFilters, setRecordFilters] = useState<{
    keySignature: string;
    notes: string;
    ledger: string;
    accidentals: string;
  }>({
    keySignature: 'all',
    notes: 'all',
    ledger: 'all',
    accidentals: 'all'
  });
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    const saved = localStorage.getItem('piano_practice_history');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return deduplicateHistory(parsed);
        }
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  const handleDeleteHistoryItem = (idToDelete: string) => {
    setHistory(prev => {
      const updated = prev.filter(item => item.id !== idToDelete);
      localStorage.setItem('piano_practice_history', JSON.stringify(updated));
      return updated;
    });
  };

  const handleCleanDuplicates = () => {
    setHistory(prev => {
      const cleaned = deduplicateHistory(prev);
      localStorage.setItem('piano_practice_history', JSON.stringify(cleaned));
      return cleaned;
    });
  };

  const handleDeleteRecord = (keyToDelete: string) => {
    setHighScores(prev => {
      const next = { ...prev };
      delete next[keyToDelete];
      localStorage.setItem('piano_pace_high_scores', JSON.stringify(next));
      return next;
    });
    setSelectedRecordKeysForTraining(prev => prev.filter(k => k !== keyToDelete));
  };

  const handleClearAllRecords = () => {
    setHighScores({});
    highScoresRef.current = {};
    startRanksRef.current = {};
    startScoresRef.current = {};
    setStartRanks({});
    localStorage.removeItem('piano_pace_high_scores');
    setSelectedRecordKeysForTraining([]);
    setIsPracticeFromRecordsActive(false);
    setShowClearRecordsConfirm(false);
  };

  const toggleRecordKeyForTraining = useCallback((key: string) => {
    setSelectedRecordKeysForTraining(prev => {
      if (prev.includes(key)) {
        return prev.filter(k => k !== key);
      } else {
        return [...prev, key];
      }
    });
  }, []);

  const selectAllRecordsForTraining = useCallback(() => {
    const allKeys = (Object.entries(highScoresRef.current) as [string, number][])
      .filter(([_, scoreVal]) => scoreVal > 0)
      .map(([k]) => k);
    setSelectedRecordKeysForTraining(allKeys);
  }, []);

  const deselectAllRecordsForTraining = useCallback(() => {
    setSelectedRecordKeysForTraining([]);
    setIsPracticeFromRecordsActive(false);
  }, []);

  const handleDisablePracticeFromRecords = useCallback(() => {
    setIsPracticeFromRecordsActive(false);
    isPracticeFromRecordsActiveRef.current = false;
    setShowPracticeModeLockDialog(false);
  }, []);

  const keyToUse = isPracticeFromRecordsActive ? activeKeySignature : (selectedKeySignature === 'Random' ? activeKeySignature : selectedKeySignature);
  const maxNotesToUse = isPracticeFromRecordsActive ? activeMaxNotes : (selectedMaxNotes === 'Random' ? activeMaxNotes : selectedMaxNotes);
  const accidentalsToUse = isPracticeFromRecordsActive ? activeUseAccidentals : (selectedAccidentals === 'Random' ? activeUseAccidentals : selectedAccidentals);
  const ledgerToUse = isPracticeFromRecordsActive ? (activeLedgerLinesRef.current ?? ledgerLines) : ledgerLines;
  const configKey = `${keyToUse}_${maxNotesToUse}_${ledgerToUse}_${accidentalsToUse ? 'acc' : 'noacc'}`;
  const configRecord = highScores[configKey] || 0;

  const allValidRecords = useMemo(() => {
    return (Object.entries(highScores) as [string, number][])
      .filter(([_, scoreVal]) => scoreVal > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [highScores]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (recordFilters.keySignature !== 'all') count++;
    if (recordFilters.notes !== 'all') count++;
    if (recordFilters.ledger !== 'all') count++;
    if (recordFilters.accidentals !== 'all') count++;
    return count;
  }, [recordFilters]);

  const resetRecordFilters = useCallback(() => {
    setRecordFilters({
      keySignature: 'all',
      notes: 'all',
      ledger: 'all',
      accidentals: 'all'
    });
  }, []);

  const sortedRecordsForModal = useMemo(() => {
    return (Object.entries(highScores) as [string, number][])
      .filter(([_, scoreVal]) => scoreVal > 0)
      .sort(([keyA, scoreA], [keyB, scoreB]) =>
        compareParsedRecords(keyA, scoreA, keyB, scoreB, sortRules)
      );
  }, [highScores, sortRules]);

  const availableKeysInRecords = useMemo(() => {
    const keysSet = new Set<string>();
    sortedRecordsForModal.forEach(([k]) => {
      const parsed = parseConfigKey(k);
      if (parsed && parsed.keySignature) {
        keysSet.add(parsed.keySignature);
      }
    });
    const orderMap = Object.keys(KEY_SIGNATURES);
    return Array.from(keysSet).sort((a, b) => {
      const idxA = orderMap.indexOf(a);
      const idxB = orderMap.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [sortedRecordsForModal]);

  const filteredRecords = useMemo(() => {
    return sortedRecordsForModal.filter(([key]) => {
      const parsed = parseConfigKey(key);
      if (!parsed) return true;
      if (recordFilters.keySignature !== 'all' && parsed.keySignature !== recordFilters.keySignature) {
        return false;
      }
      if (recordFilters.notes !== 'all' && parsed.rawNotes !== parseInt(recordFilters.notes, 10)) {
        return false;
      }
      if (recordFilters.ledger !== 'all' && parsed.rawLedger !== parseInt(recordFilters.ledger, 10)) {
        return false;
      }
      if (recordFilters.accidentals !== 'all') {
        const isAcc = parsed.rawAccidentals === 1;
        if (recordFilters.accidentals === 'acc' && !isAcc) return false;
        if (recordFilters.accidentals === 'noacc' && isAcc) return false;
      }
      return true;
    });
  }, [sortedRecordsForModal, recordFilters]);

  const selectFilteredRecordsForTraining = useCallback(() => {
    const visibleKeys = filteredRecords.map(([k]) => k);
    setSelectedRecordKeysForTraining(prev => Array.from(new Set([...prev, ...visibleKeys])));
  }, [filteredRecords]);

  const deselectFilteredRecordsForTraining = useCallback(() => {
    const visibleKeySet = new Set(filteredRecords.map(([k]) => k));
    setSelectedRecordKeysForTraining(prev => prev.filter(k => !visibleKeySet.has(k)));
  }, [filteredRecords]);

  const currentConfigRank = useMemo(() => {
    if (configRecord <= 0) return null;
    const index = allValidRecords.findIndex(([key]) => key === configKey);
    return index !== -1 ? index + 1 : null;
  }, [allValidRecords, configKey, configRecord]);

  const projectedRank = useMemo(() => {
    if (currentPace === null || currentPace <= 0) return null;
    const simScores: Record<string, number> = {
      ...highScores,
      [configKey]: Math.max(currentPace, highScores[configKey] || 0)
    };
    return getRankForConfig(simScores, configKey);
  }, [currentPace, highScores, configKey]);

  const initialRank = useMemo(() => {
    if (startRanks[configKey] !== undefined) {
      return startRanks[configKey];
    }
    return currentConfigRank;
  }, [startRanks, configKey, currentConfigRank]);

  useEffect(() => {
    if (isPlaying && configKey) {
      if (startRanksRef.current[configKey] === undefined) {
        startRanksRef.current[configKey] = currentConfigRank;
        setStartRanks(prev => ({
          ...prev,
          [configKey]: currentConfigRank
        }));
      }
      if (startScoresRef.current[configKey] === undefined) {
        startScoresRef.current[configKey] = highScoresRef.current[configKey] || 0;
      }
    }
  }, [isPlaying, configKey, currentConfigRank]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    const checkStandalone = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
      setIsInstalled(isStandalone);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    checkStandalone();

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleInstallPWA = async () => {
    if (!deferredPrompt) return;
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } catch (err) {
      console.warn('Install error:', err);
    }
  };

  useEffect(() => {
    localStorage.setItem('piano_show_pace_tracker', String(showPaceTracker));
  }, [showPaceTracker]);

  useEffect(() => {
    localStorage.setItem('piano_ledger_lines', String(ledgerLines));
  }, [ledgerLines]);

  useEffect(() => {
    localStorage.setItem('piano_selected_accidentals', String(selectedAccidentals));
    localStorage.setItem('piano_use_accidentals', String(activeUseAccidentals));
  }, [selectedAccidentals, activeUseAccidentals]);

  useEffect(() => {
    localStorage.setItem('piano_selected_max_notes', String(selectedMaxNotes));
    localStorage.setItem('piano_max_notes_per_spawn', String(maxNotesToUse));
  }, [selectedMaxNotes, maxNotesToUse]);

  useEffect(() => {
    localStorage.setItem('piano_selected_key_signature', selectedKeySignature);
  }, [selectedKeySignature]);

  useEffect(() => {
    localStorage.setItem('piano_sound_enabled', String(soundEnabled));
  }, [soundEnabled]);

  const resetSegmentPace = useCallback(() => {
    segmentStartHitsRef.current = correctHitsRef.current;
    segmentStartDurationMsRef.current = activeDurationMsRef.current;
    segmentMeasuresCompletedRef.current = 0;
    setSegmentMeasuresCompleted(0);
    lastMeasurePaceRef.current = null;
    setCurrentPace(null);
    setPaceTrend(null);
  }, []);

  useEffect(() => {
    // Reset segment-specific pace variables on parameter changes
    resetSegmentPace();
  }, [selectedKeySignature, selectedMaxNotes, selectedAccidentals, ledgerLines, resetSegmentPace]);

  const calculateAndSavePace = useCallback(() => {
    const startDateTimeVal = startDateTimeRef.current;
    if (!startDateTimeVal) return;

    segmentMeasuresCompletedRef.current += 1;
    const measuresCount = segmentMeasuresCompletedRef.current;
    setSegmentMeasuresCompleted(measuresCount);

    const segmentHits = correctHitsRef.current - segmentStartHitsRef.current;
    const segmentDurationMs = activeDurationMsRef.current - segmentStartDurationMsRef.current;
    const segmentDurationSecs = segmentDurationMs / 1000;

    if (segmentDurationSecs < 1 || segmentHits <= 0) {
      setCurrentPace(null);
      setPaceTrend(null);
      lastMeasurePaceRef.current = null;
      return;
    }

    // Pace = correct notes per minute (NPM) for current segment (live preview)
    const pace = (segmentHits * 60) / segmentDurationSecs;
    setCurrentPace(pace);

    // Calculate trend compared to previous measure's pace
    if (lastMeasurePaceRef.current !== null) {
      const prevFixed = Number(lastMeasurePaceRef.current.toFixed(2));
      const currFixed = Number(pace.toFixed(2));
      if (currFixed > prevFixed) {
        setPaceTrend('up');
      } else if (currFixed < prevFixed) {
        setPaceTrend('down');
      } else {
        setPaceTrend('equal');
      }
    } else {
      setPaceTrend('equal');
    }
    lastMeasurePaceRef.current = pace;

    // After 4th measure, and on every subsequent measure (>= 4), check and save/update record
    if (measuresCount >= 4) {
      const currentKey = activeKeySignatureRef.current;
      const currentMaxNotes = activeMaxNotesRef.current;
      const currentAccidentals = activeUseAccidentalsRef.current;
      const currentLedger = activeLedgerLinesRef.current;
      const activeConfigKey = `${currentKey}_${currentMaxNotes}_${currentLedger}_${currentAccidentals ? 'acc' : 'noacc'}`;

      const currentRecord = highScoresRef.current[activeConfigKey] || 0;
      if (pace > currentRecord) {
        const nextHighScores = {
          ...highScoresRef.current,
          [activeConfigKey]: pace,
        };
        highScoresRef.current = nextHighScores;
        setHighScores(nextHighScores);
        localStorage.setItem('piano_pace_high_scores', JSON.stringify(nextHighScores));
        setSessionBeatenKeys(prev => {
          const next = new Set(prev);
          next.add(activeConfigKey);
          return next;
        });
      }
    }
  }, [selectedKeySignature, selectedMaxNotes, selectedAccidentals, ledgerLines]);

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
      const updated = deduplicateHistory([newItem, ...prev]).slice(0, 50);
      localStorage.setItem('piano_practice_history', JSON.stringify(updated));
      return updated;
    });
  }, [startDateTime, score, activeDurationMs]);

  useEffect(() => {
    if (!isPlaying) return;

    let lastTime = Date.now();

    const handleResetTime = () => {
      lastTime = Date.now();
    };

    document.addEventListener('visibilitychange', handleResetTime);
    window.addEventListener('blur', handleResetTime);
    window.addEventListener('focus', handleResetTime);

    const interval = setInterval(() => {
      const now = Date.now();
      const delta = now - lastTime;
      lastTime = now;

      const isDocumentActive = !document.hidden;
      const isModalOpen = showHistory || showRecordsModal || Boolean(keyChangeAlert) || showPracticeModeLockDialog;

      if (isDocumentActive && !isModalOpen && delta > 0 && delta <= 1500) {
        setActiveDurationMs(prev => {
          const nextVal = prev + delta;
          setElapsedMinutes(Math.floor(nextVal / 60000));
          return nextVal;
        });
      }
    }, 200);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleResetTime);
      window.removeEventListener('blur', handleResetTime);
      window.removeEventListener('focus', handleResetTime);
    };
  }, [isPlaying, showHistory, showRecordsModal, keyChangeAlert, showPracticeModeLockDialog]);

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
    } else {
      setHistory(prev => {
        const cleaned = deduplicateHistory(prev);
        if (cleaned.length !== prev.length) {
          localStorage.setItem('piano_practice_history', JSON.stringify(cleaned));
        }
        return cleaned;
      });
    }
  }, [showHistory]);

  const dismissKeyChangeAlert = useCallback(() => {
    setKeyChangeAlert(null);
    keyChangeAlertRef.current = null;
    segmentStartHitsRef.current = correctHitsRef.current;
    segmentStartDurationMsRef.current = activeDurationMsRef.current;
    setCurrentPace(null);
  }, []);

  useEffect(() => {
    if (!keyChangeAlert) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        dismissKeyChangeAlert();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keyChangeAlert, dismissKeyChangeAlert]);

  const notesRef = useRef<Note[]>([]);
  const currentBeatRef = useRef<number>(0);
  const lastPressBeatRef = useRef<number>(0);
  const wrongPitchesInCurrentBeatRef = useRef<{ beat: number; pitches: Set<string> }>({ beat: 0, pitches: new Set() });

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px) and (orientation: landscape)');
    const checkCompact = (e: MediaQueryList | MediaQueryListEvent) => setIsCompact(e.matches);
    checkCompact(mql);
    mql.addEventListener('change', checkCompact);
    return () => mql.removeEventListener('change', checkCompact);
  }, []);

  const createFinishedSegmentSummary = useCallback((
    finishedKey: string, 
    finishedMaxNotes: number, 
    finishedUseAccidentals: boolean,
    finishedLedgerLinesParam?: number
  ) => {
    const ledger = finishedLedgerLinesParam !== undefined ? finishedLedgerLinesParam : activeLedgerLinesRef.current;
    const finishedConfigKey = `${finishedKey}_${finishedMaxNotes}_${ledger}_${finishedUseAccidentals ? 'acc' : 'noacc'}`;
    const hitsInKey = correctHitsRef.current - segmentStartHitsRef.current;
    const durationInKeyMs = activeDurationMsRef.current - segmentStartDurationMsRef.current;
    const durationInKeySecs = durationInKeyMs / 1000;

    let keyPace: number | null = null;
    let isNewRecord = false;
    let wasFirstRecord = false;
    let rankText: string | undefined = undefined;
    let rankImproved = false;

    const initialScore = segmentInitialRecordRef.current > 0
      ? segmentInitialRecordRef.current
      : (startScoresRef.current[finishedConfigKey] !== undefined
          ? startScoresRef.current[finishedConfigKey]
          : (highScoresRef.current[finishedConfigKey] || 0));
    const initialRank = segmentInitialRankRef.current !== null
      ? segmentInitialRankRef.current
      : (startRanksRef.current[finishedConfigKey] !== undefined
          ? startRanksRef.current[finishedConfigKey]
          : (initialScore > 0 ? getRankForConfig(highScoresRef.current, finishedConfigKey) : null));
    const previousRecordPace = initialScore > 0 ? initialScore : null;

    if (durationInKeySecs >= 1 && hitsInKey > 0) {
      keyPace = (hitsInKey * 60) / durationInKeySecs;
      const currentScores = highScoresRef.current;

      if (initialScore <= 0 || keyPace > initialScore) {
        isNewRecord = true;
        wasFirstRecord = initialScore <= 0;
        const nextHighScores = { ...currentScores, [finishedConfigKey]: keyPace };
        highScoresRef.current = nextHighScores;
        setHighScores(nextHighScores);
        localStorage.setItem('piano_pace_high_scores', JSON.stringify(nextHighScores));
        setSessionBeatenKeys(prev => new Set(prev).add(finishedConfigKey));

        const newRank = getRankForConfig(nextHighScores, finishedConfigKey);

        if (initialRank !== null && newRank !== null) {
          if (initialRank !== newRank) {
            rankText = `#${initialRank} -> #${newRank}`;
            rankImproved = newRank < initialRank;
          } else {
            rankText = `#${newRank}`;
            rankImproved = false;
          }
        } else if (initialRank === null && newRank !== null) {
          rankText = `brak -> #${newRank}`;
          rankImproved = true;
        } else if (newRank !== null) {
          rankText = `#${newRank}`;
        }

        startScoresRef.current[finishedConfigKey] = keyPace;
        startRanksRef.current[finishedConfigKey] = newRank;
      } else {
        isNewRecord = false;
        rankText = initialRank !== null ? `#${initialRank}` : 'brak';
      }
    } else {
      if (initialRank !== null) {
        rankText = `#${initialRank}`;
      }
    }

    const missingPace = (!isNewRecord && keyPace !== null && previousRecordPace !== null && previousRecordPace > keyPace)
      ? Number((previousRecordPace - keyPace).toFixed(2))
      : null;

    const accLabel = finishedUseAccidentals ? 'ze znakami' : 'bez znaków';
    return {
      prevKeyName: `${finishedKey} (N${finishedMaxNotes}, ${accLabel})`,
      prevKeyPace: keyPace,
      isNewRecord,
      wasFirstRecord,
      previousRecordPace,
      missingPace,
      rankText,
      rankImproved
    };
  }, [ledgerLines]);

  const handleKeySignatureChange = useCallback((val: keyof typeof KEY_SIGNATURES | 'Random') => {
    if (isPracticeFromRecordsActiveRef.current) {
      setShowPracticeModeLockDialog(true);
      return;
    }
    setSelectedKeySignature(val);
    const wasPlaying = isPlayingRef.current;
    const finishedKey = activeKeySignatureRef.current;
    const finishedMaxNotes = activeMaxNotesRef.current;
    const finishedAccidentals = activeUseAccidentalsRef.current;
    const hitsInKey = correctHitsRef.current - segmentStartHitsRef.current;
    const durationInKeyMs = activeDurationMsRef.current - segmentStartDurationMsRef.current;

    let summary: ReturnType<typeof createFinishedSegmentSummary> | null = null;
    if (wasPlaying && hitsInKey > 0 && durationInKeyMs >= 1000) {
      summary = createFinishedSegmentSummary(finishedKey, finishedMaxNotes, finishedAccidentals);
    }

    const accidentalsToUse = selectedAccidentals === 'Random' ? activeUseAccidentalsRef.current : selectedAccidentals;

    if (val === 'Random') {
      measuresPlayedRef.current = 0;
      const keys = Object.keys(KEY_SIGNATURES) as Array<keyof typeof KEY_SIGNATURES>;
      const randomKey = keys[Math.floor(Math.random() * keys.length)];
      activeKeySignatureRef.current = randomKey;
      setActiveKeySignature(randomKey);
      segmentStartHitsRef.current = correctHitsRef.current;
      segmentStartDurationMsRef.current = activeDurationMsRef.current;
      segmentMeasuresCompletedRef.current = 0;
      setSegmentMeasuresCompleted(0);
      lastMeasurePaceRef.current = null;
      setCurrentPace(null);
      setPaceTrend(null);

      const nextConfigKey = `${randomKey}_${finishedMaxNotes}_${ledgerLines}_${accidentalsToUse ? 'acc' : 'noacc'}`;
      const nextScore = highScoresRef.current[nextConfigKey] || 0;
      const rankVal = getRankForConfig(highScoresRef.current, nextConfigKey);
      segmentInitialRecordRef.current = nextScore;
      segmentInitialRankRef.current = rankVal;
      startRanksRef.current[nextConfigKey] = rankVal;
      startScoresRef.current[nextConfigKey] = nextScore;
      setStartRanks(prev => ({ ...prev, [nextConfigKey]: rankVal }));

      if (wasPlaying) {
        setKeyChangeAlert({
          id: Date.now(),
          keyName: `Losowa tonacja: ${randomKey}`,
          prevKeyName: summary?.prevKeyName,
          prevKeyPace: summary?.prevKeyPace,
          isNewRecord: summary?.isNewRecord,
          wasFirstRecord: summary?.wasFirstRecord,
          previousRecordPace: summary?.previousRecordPace,
          missingPace: summary?.missingPace,
          rankText: summary?.rankText,
          rankImproved: summary?.rankImproved,
        });
      }
    } else {
      activeKeySignatureRef.current = val;
      setActiveKeySignature(val);
      segmentStartHitsRef.current = correctHitsRef.current;
      segmentStartDurationMsRef.current = activeDurationMsRef.current;
      segmentMeasuresCompletedRef.current = 0;
      setSegmentMeasuresCompleted(0);
      lastMeasurePaceRef.current = null;
      setCurrentPace(null);
      setPaceTrend(null);

      const nextConfigKey = `${val}_${finishedMaxNotes}_${ledgerLines}_${accidentalsToUse ? 'acc' : 'noacc'}`;
      const nextScore = highScoresRef.current[nextConfigKey] || 0;
      const rankVal = getRankForConfig(highScoresRef.current, nextConfigKey);
      segmentInitialRecordRef.current = nextScore;
      segmentInitialRankRef.current = rankVal;
      startRanksRef.current[nextConfigKey] = rankVal;
      startScoresRef.current[nextConfigKey] = nextScore;
      setStartRanks(prev => ({ ...prev, [nextConfigKey]: rankVal }));

      if (wasPlaying) {
        setKeyChangeAlert({
          id: Date.now(),
          keyName: val,
          prevKeyName: summary?.prevKeyName,
          prevKeyPace: summary?.prevKeyPace,
          isNewRecord: summary?.isNewRecord,
          wasFirstRecord: summary?.wasFirstRecord,
          previousRecordPace: summary?.previousRecordPace,
          missingPace: summary?.missingPace,
          rankText: summary?.rankText,
          rankImproved: summary?.rankImproved,
        });
      }
    }
  }, [createFinishedSegmentSummary, ledgerLines, selectedAccidentals]);

  const handleMaxNotesChange = useCallback((val: number | 'Random') => {
    if (isPracticeFromRecordsActiveRef.current) {
      setShowPracticeModeLockDialog(true);
      return;
    }
    setSelectedMaxNotes(val);
    const wasPlaying = isPlayingRef.current;
    const finishedKey = activeKeySignatureRef.current;
    const finishedMaxNotes = activeMaxNotesRef.current;
    const finishedAccidentals = activeUseAccidentalsRef.current;
    const hitsInKey = correctHitsRef.current - segmentStartHitsRef.current;
    const durationInKeyMs = activeDurationMsRef.current - segmentStartDurationMsRef.current;

    let summary: ReturnType<typeof createFinishedSegmentSummary> | null = null;
    if (wasPlaying && hitsInKey > 0 && durationInKeyMs >= 1000) {
      summary = createFinishedSegmentSummary(finishedKey, finishedMaxNotes, finishedAccidentals);
    }

    const accidentalsToUse = selectedAccidentals === 'Random' ? activeUseAccidentalsRef.current : selectedAccidentals;

    if (val === 'Random') {
      measuresPlayedRef.current = 0;
      const possible = [1, 2, 3, 4, 5];
      const randomNotes = possible[Math.floor(Math.random() * possible.length)];
      activeMaxNotesRef.current = randomNotes;
      setActiveMaxNotes(randomNotes);
      segmentStartHitsRef.current = correctHitsRef.current;
      segmentStartDurationMsRef.current = activeDurationMsRef.current;
      segmentMeasuresCompletedRef.current = 0;
      setSegmentMeasuresCompleted(0);
      lastMeasurePaceRef.current = null;
      setCurrentPace(null);
      setPaceTrend(null);

      const nextConfigKey = `${finishedKey}_${randomNotes}_${ledgerLines}_${accidentalsToUse ? 'acc' : 'noacc'}`;
      const nextScore = highScoresRef.current[nextConfigKey] || 0;
      const rankVal = getRankForConfig(highScoresRef.current, nextConfigKey);
      segmentInitialRecordRef.current = nextScore;
      segmentInitialRankRef.current = rankVal;
      startRanksRef.current[nextConfigKey] = rankVal;
      startScoresRef.current[nextConfigKey] = nextScore;
      setStartRanks(prev => ({ ...prev, [nextConfigKey]: rankVal }));

      if (wasPlaying) {
        setKeyChangeAlert({
          id: Date.now(),
          keyName: selectedKeySignature === 'Random' ? `Losowa: ${activeKeySignatureRef.current}` : activeKeySignatureRef.current,
          maxNotesText: `Maks. nut: ${randomNotes} (Losowo)`,
          prevKeyName: summary?.prevKeyName,
          prevKeyPace: summary?.prevKeyPace,
          isNewRecord: summary?.isNewRecord,
          wasFirstRecord: summary?.wasFirstRecord,
          previousRecordPace: summary?.previousRecordPace,
          missingPace: summary?.missingPace,
          rankText: summary?.rankText,
          rankImproved: summary?.rankImproved,
        });
      }
    } else {
      activeMaxNotesRef.current = val;
      setActiveMaxNotes(val);
      segmentStartHitsRef.current = correctHitsRef.current;
      segmentStartDurationMsRef.current = activeDurationMsRef.current;
      segmentMeasuresCompletedRef.current = 0;
      setSegmentMeasuresCompleted(0);
      lastMeasurePaceRef.current = null;
      setCurrentPace(null);
      setPaceTrend(null);

      const nextConfigKey = `${finishedKey}_${val}_${ledgerLines}_${accidentalsToUse ? 'acc' : 'noacc'}`;
      const nextScore = highScoresRef.current[nextConfigKey] || 0;
      const rankVal = getRankForConfig(highScoresRef.current, nextConfigKey);
      segmentInitialRecordRef.current = nextScore;
      segmentInitialRankRef.current = rankVal;
      startRanksRef.current[nextConfigKey] = rankVal;
      startScoresRef.current[nextConfigKey] = nextScore;
      setStartRanks(prev => ({ ...prev, [nextConfigKey]: rankVal }));

      if (wasPlaying) {
        setKeyChangeAlert({
          id: Date.now(),
          keyName: selectedKeySignature === 'Random' ? `Losowa: ${activeKeySignatureRef.current}` : activeKeySignatureRef.current,
          maxNotesText: `Maks. nut: ${val}`,
          prevKeyName: summary?.prevKeyName,
          prevKeyPace: summary?.prevKeyPace,
          isNewRecord: summary?.isNewRecord,
          wasFirstRecord: summary?.wasFirstRecord,
          previousRecordPace: summary?.previousRecordPace,
          missingPace: summary?.missingPace,
          rankText: summary?.rankText,
          rankImproved: summary?.rankImproved,
        });
      }
    }
  }, [createFinishedSegmentSummary, selectedKeySignature, ledgerLines, selectedAccidentals]);

  const handleAccidentalsChange = useCallback((val: boolean | 'Random') => {
    if (isPracticeFromRecordsActiveRef.current) {
      setShowPracticeModeLockDialog(true);
      return;
    }
    setSelectedAccidentals(val);
    const wasPlaying = isPlayingRef.current;
    const finishedKey = activeKeySignatureRef.current;
    const finishedMaxNotes = activeMaxNotesRef.current;
    const finishedAccidentals = activeUseAccidentalsRef.current;
    const hitsInKey = correctHitsRef.current - segmentStartHitsRef.current;
    const durationInKeyMs = activeDurationMsRef.current - segmentStartDurationMsRef.current;

    let summary: ReturnType<typeof createFinishedSegmentSummary> | null = null;
    if (wasPlaying && hitsInKey > 0 && durationInKeyMs >= 1000) {
      summary = createFinishedSegmentSummary(finishedKey, finishedMaxNotes, finishedAccidentals);
    }

    if (val === 'Random') {
      measuresPlayedRef.current = 0;
      const randomAcc = Math.random() < 0.5;
      activeUseAccidentalsRef.current = randomAcc;
      setActiveUseAccidentals(randomAcc);
      segmentStartHitsRef.current = correctHitsRef.current;
      segmentStartDurationMsRef.current = activeDurationMsRef.current;
      segmentMeasuresCompletedRef.current = 0;
      setSegmentMeasuresCompleted(0);
      lastMeasurePaceRef.current = null;
      setCurrentPace(null);
      setPaceTrend(null);

      const nextConfigKey = `${finishedKey}_${finishedMaxNotes}_${ledgerLines}_${randomAcc ? 'acc' : 'noacc'}`;
      const nextScore = highScoresRef.current[nextConfigKey] || 0;
      const rankVal = getRankForConfig(highScoresRef.current, nextConfigKey);
      segmentInitialRecordRef.current = nextScore;
      segmentInitialRankRef.current = rankVal;
      startRanksRef.current[nextConfigKey] = rankVal;
      startScoresRef.current[nextConfigKey] = nextScore;
      setStartRanks(prev => ({ ...prev, [nextConfigKey]: rankVal }));

      if (wasPlaying) {
        setKeyChangeAlert({
          id: Date.now(),
          keyName: selectedKeySignature === 'Random' ? `Losowa: ${activeKeySignatureRef.current}` : activeKeySignatureRef.current,
          maxNotesText: selectedMaxNotes === 'Random' ? `Maks. nut: ${activeMaxNotesRef.current}` : undefined,
          accidentalsText: `Znaki: ${randomAcc ? 'WŁ' : 'WYŁ'} (Losowo)`,
          prevKeyName: summary?.prevKeyName,
          prevKeyPace: summary?.prevKeyPace,
          isNewRecord: summary?.isNewRecord,
          wasFirstRecord: summary?.wasFirstRecord,
          previousRecordPace: summary?.previousRecordPace,
          missingPace: summary?.missingPace,
          rankText: summary?.rankText,
          rankImproved: summary?.rankImproved,
        });
      }
    } else {
      activeUseAccidentalsRef.current = val;
      setActiveUseAccidentals(val);
      segmentStartHitsRef.current = correctHitsRef.current;
      segmentStartDurationMsRef.current = activeDurationMsRef.current;
      segmentMeasuresCompletedRef.current = 0;
      setSegmentMeasuresCompleted(0);
      lastMeasurePaceRef.current = null;
      setCurrentPace(null);
      setPaceTrend(null);

      const nextConfigKey = `${finishedKey}_${finishedMaxNotes}_${ledgerLines}_${val ? 'acc' : 'noacc'}`;
      const nextScore = highScoresRef.current[nextConfigKey] || 0;
      const rankVal = getRankForConfig(highScoresRef.current, nextConfigKey);
      segmentInitialRecordRef.current = nextScore;
      segmentInitialRankRef.current = rankVal;
      startRanksRef.current[nextConfigKey] = rankVal;
      startScoresRef.current[nextConfigKey] = nextScore;
      setStartRanks(prev => ({ ...prev, [nextConfigKey]: rankVal }));

      if (wasPlaying) {
        setKeyChangeAlert({
          id: Date.now(),
          keyName: selectedKeySignature === 'Random' ? `Losowa: ${activeKeySignatureRef.current}` : activeKeySignatureRef.current,
          maxNotesText: selectedMaxNotes === 'Random' ? `Maks. nut: ${activeMaxNotesRef.current}` : undefined,
          accidentalsText: `Znaki: ${val ? 'WŁ' : 'WYŁ'}`,
          prevKeyName: summary?.prevKeyName,
          prevKeyPace: summary?.prevKeyPace,
          isNewRecord: summary?.isNewRecord,
          wasFirstRecord: summary?.wasFirstRecord,
          previousRecordPace: summary?.previousRecordPace,
          missingPace: summary?.missingPace,
          rankText: summary?.rankText,
          rankImproved: summary?.rankImproved,
        });
      }
    }
  }, [createFinishedSegmentSummary, selectedKeySignature, selectedMaxNotes, ledgerLines]);

  const handleLedgerLinesChange = useCallback((val: number) => {
    if (isPracticeFromRecordsActiveRef.current) {
      setShowPracticeModeLockDialog(true);
      return;
    }
    setLedgerLines(val);
  }, []);

  const handleApplyRecordConfig = useCallback((keyToApply: string) => {
    const parsed = parseConfigKey(keyToApply);
    if (!parsed) return;

    setIsPracticeFromRecordsActive(false);
    isPracticeFromRecordsActiveRef.current = false;

    if (parsed.keySignature === 'Random' || parsed.keySignature === 'Losowo') {
      handleKeySignatureChange('Random');
    } else if (KEY_SIGNATURES[parsed.keySignature as keyof typeof KEY_SIGNATURES]) {
      handleKeySignatureChange(parsed.keySignature as keyof typeof KEY_SIGNATURES);
    }

    handleMaxNotesChange(parsed.rawNotes);
    setLedgerLines(parsed.rawLedger);
    handleAccidentalsChange(parsed.rawAccidentals === 1);

    setShowRecordsModal(false);
  }, [handleKeySignatureChange, handleMaxNotesChange, handleAccidentalsChange]);

  const generateMeasure = useCallback(() => {
    let currentKey = activeKeySignatureRef.current;
    let currentMaxNotes = activeMaxNotesRef.current;
    let currentAccidentals = activeUseAccidentalsRef.current;
    let currentLedger = activeLedgerLinesRef.current;

    const isCustomPool = isPracticeFromRecordsActiveRef.current && selectedRecordKeysForTrainingRef.current.length > 0;
    const isRandomKey = selectedKeySignature === 'Random';
    const isRandomNotes = selectedMaxNotes === 'Random';
    const isRandomAccidentals = selectedAccidentals === 'Random';

    if (isCustomPool) {
      const isNewRun = measuresPlayedRef.current === 0;
      const needsChange = !isNewRun && (measuresPlayedRef.current % 4 === 0);
      const pool = selectedRecordKeysForTrainingRef.current.filter(k => (highScoresRef.current[k] || 0) > 0);
      const effectivePool = pool.length > 0 ? pool : selectedRecordKeysForTrainingRef.current;
      const currentConfigKey = `${currentKey}_${currentMaxNotes}_${currentLedger}_${currentAccidentals ? 'acc' : 'noacc'}`;
      const isAlreadyInPool = effectivePool.includes(currentConfigKey);

      if (needsChange || (isNewRun && !isAlreadyInPool)) {
        let nextConfigKeyToApply: string;
        if (effectivePool.length > 1) {
          const differentPool = effectivePool.filter(k => k !== currentConfigKey);
          const candidates = differentPool.length > 0 ? differentPool : effectivePool;
          nextConfigKeyToApply = candidates[Math.floor(Math.random() * candidates.length)];
        } else {
          nextConfigKeyToApply = effectivePool[0];
        }

        const parsed = parseConfigKey(nextConfigKeyToApply);
        const nextKey = (parsed.keySignature as keyof typeof KEY_SIGNATURES) || currentKey;
        const nextMaxNotes = parsed.rawNotes || currentMaxNotes;
        const nextAccidentals = parsed.rawAccidentals === 1;
        const nextLedger = parsed.rawLedger !== undefined ? parsed.rawLedger : currentLedger;

        if (needsChange) {
          const finishedKey = currentKey;
          const finishedMaxNotes = currentMaxNotes;
          const finishedAccidentals = currentAccidentals;
          const finishedLedger = currentLedger;
          const summary = createFinishedSegmentSummary(finishedKey, finishedMaxNotes, finishedAccidentals, finishedLedger);

          setKeyChangeAlert({
            id: Date.now(),
            keyName: nextKey,
            maxNotesText: `Maks. nut: ${nextMaxNotes}`,
            accidentalsText: `Znaki: ${nextAccidentals ? 'WŁ' : 'WYŁ'}`,
            prevKeyName: summary.prevKeyName,
            prevKeyPace: summary.prevKeyPace,
            isNewRecord: summary.isNewRecord,
            wasFirstRecord: summary.wasFirstRecord,
            previousRecordPace: summary.previousRecordPace,
            missingPace: summary.missingPace,
            rankText: summary.rankText,
            rankImproved: summary.rankImproved,
          });
        }

        currentKey = nextKey;
        activeKeySignatureRef.current = nextKey;
        setActiveKeySignature(nextKey);
        setSelectedKeySignature(nextKey);

        currentMaxNotes = nextMaxNotes;
        activeMaxNotesRef.current = nextMaxNotes;
        setActiveMaxNotes(nextMaxNotes);
        setSelectedMaxNotes(nextMaxNotes);

        currentAccidentals = nextAccidentals;
        activeUseAccidentalsRef.current = nextAccidentals;
        setActiveUseAccidentals(nextAccidentals);
        setSelectedAccidentals(nextAccidentals);

        currentLedger = nextLedger;
        activeLedgerLinesRef.current = nextLedger;
        setLedgerLines(nextLedger);

        const nextConfigKey = `${nextKey}_${nextMaxNotes}_${nextLedger}_${nextAccidentals ? 'acc' : 'noacc'}`;
        const currentScores = highScoresRef.current;
        const nextScore = currentScores[nextConfigKey] || 0;
        const rankVal = getRankForConfig(currentScores, nextConfigKey);
        segmentInitialRecordRef.current = nextScore;
        segmentInitialRankRef.current = rankVal;
        startRanksRef.current[nextConfigKey] = rankVal;
        startScoresRef.current[nextConfigKey] = nextScore;
        setStartRanks(prev => ({ ...prev, [nextConfigKey]: rankVal }));

        segmentStartHitsRef.current = correctHitsRef.current;
        segmentStartDurationMsRef.current = activeDurationMsRef.current;
        segmentMeasuresCompletedRef.current = 0;
        setSegmentMeasuresCompleted(0);
        lastMeasurePaceRef.current = null;
        setCurrentPace(null);
        setPaceTrend(null);
      }
    } else if (isRandomKey || isRandomNotes || isRandomAccidentals) {
      const isNewRun = measuresPlayedRef.current === 0;
      const needsChange = !isNewRun && (measuresPlayedRef.current % 4 === 0);
      
      if (isNewRun || needsChange) {
        let nextKey = currentKey;
        let nextMaxNotes = currentMaxNotes;
        let nextAccidentals = currentAccidentals;

        if (isRandomKey) {
          const keys = Object.keys(KEY_SIGNATURES) as Array<keyof typeof KEY_SIGNATURES>;
          const availableKeys = keys.filter(k => k !== currentKey);
          nextKey = availableKeys[Math.floor(Math.random() * availableKeys.length)];
        }

        if (isRandomNotes) {
          const possible = [1, 2, 3, 4, 5];
          const availableNotes = possible.filter(n => n !== currentMaxNotes);
          nextMaxNotes = availableNotes[Math.floor(Math.random() * availableNotes.length)];
        }

        if (isRandomAccidentals) {
          nextAccidentals = isNewRun ? (Math.random() < 0.5) : !currentAccidentals;
        }
        
        if (needsChange) {
          const finishedKey = currentKey;
          const finishedMaxNotes = currentMaxNotes;
          const finishedAccidentals = currentAccidentals;
          const finishedLedger = activeLedgerLinesRef.current;
          const summary = createFinishedSegmentSummary(finishedKey, finishedMaxNotes, finishedAccidentals, finishedLedger);

          setKeyChangeAlert({
            id: Date.now(),
            keyName: nextKey,
            maxNotesText: isRandomNotes ? `Maks. nut: ${nextMaxNotes}` : undefined,
            accidentalsText: isRandomAccidentals ? `Znaki: ${nextAccidentals ? 'WŁ' : 'WYŁ'}` : undefined,
            prevKeyName: summary.prevKeyName,
            prevKeyPace: summary.prevKeyPace,
            isNewRecord: summary.isNewRecord,
            wasFirstRecord: summary.wasFirstRecord,
            previousRecordPace: summary.previousRecordPace,
            missingPace: summary.missingPace,
            rankText: summary.rankText,
            rankImproved: summary.rankImproved,
          });
        }

        currentKey = nextKey;
        activeKeySignatureRef.current = nextKey;
        setActiveKeySignature(nextKey);

        currentMaxNotes = nextMaxNotes;
        activeMaxNotesRef.current = nextMaxNotes;
        setActiveMaxNotes(nextMaxNotes);

        currentAccidentals = nextAccidentals;
        activeUseAccidentalsRef.current = nextAccidentals;
        setActiveUseAccidentals(nextAccidentals);

        const nextConfigKey = `${nextKey}_${nextMaxNotes}_${ledgerLines}_${nextAccidentals ? 'acc' : 'noacc'}`;
        const currentScores = highScoresRef.current;
        const nextScore = currentScores[nextConfigKey] || 0;
        const rankVal = getRankForConfig(currentScores, nextConfigKey);
        segmentInitialRecordRef.current = nextScore;
        segmentInitialRankRef.current = rankVal;
        startRanksRef.current[nextConfigKey] = rankVal;
        startScoresRef.current[nextConfigKey] = nextScore;
        setStartRanks(prev => ({ ...prev, [nextConfigKey]: rankVal }));

        segmentStartHitsRef.current = correctHitsRef.current;
        segmentStartDurationMsRef.current = activeDurationMsRef.current;
        segmentMeasuresCompletedRef.current = 0;
        setSegmentMeasuresCompleted(0);
        lastMeasurePaceRef.current = null;
        setCurrentPace(null);
        setPaceTrend(null);
      }
    }
    
    measuresPlayedRef.current += 1;

    const newNotes: Note[] = [];
    const beatXs = [300, 500, 700, 900];
    const measureAccidentals = new Map<string, string>(); // displayPitch -> 'sharp' | 'flat' | 'natural'
    const useAccidentalsForNotes = activeUseAccidentalsRef.current;

    for (let beatIndex = 0; beatIndex < 4; beatIndex++) {
      const count = Math.floor(Math.random() * activeMaxNotesRef.current) + 1;
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
        const recurringNotesWithAccidentals = useAccidentalsForNotes ? newNotes.filter(
          n => n.clef === (isTreble ? 'treble' : 'bass') && n.accidental !== null && n.accidental !== undefined
        ) : [];
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

        const clefKey = isTreble ? 'treble' : 'bass';
        const accidentalKey = `${clefKey}_${basePitch}`;

        const hasMeasureAccidental = measureAccidentals.has(accidentalKey);
        const existingMeasureMod = measureAccidentals.get(accidentalKey);

        if (useAccidentalsForNotes) {
          if (hasMeasureAccidental && existingMeasureMod && Math.random() < 0.90) {
            // Keep the existing modification 90% of the time, so cancellations/changes are rare
            targetMod = existingMeasureMod;
          } else {
            if (currentKey !== 'C Major' && sigState !== 'natural' && Math.random() > 0.8) {
              if (isAccidentalAllowed(noteName, 'natural', currentKey)) {
                targetMod = 'natural';
              }
            } else if (Math.random() > 0.7) {
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
        }

        if (targetMod === 'sharp') {
          finalActualPitch = getShiftedPitch(noteName, octave, 'sharp');
        } else if (targetMod === 'flat') {
          finalActualPitch = getShiftedPitch(noteName, octave, 'flat');
        } else {
          finalActualPitch = basePitch;
        }

        const currentMod = measureAccidentals.has(accidentalKey) ? measureAccidentals.get(accidentalKey) : sigState;

        if (targetMod !== currentMod) {
          if (targetMod === 'sharp') accidental = '♯';
          else if (targetMod === 'flat') accidental = '♭';
          else accidental = '♮';
          
          measureAccidentals.set(accidentalKey, targetMod);
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
  }, [createFinishedSegmentSummary, selectedKeySignature, selectedMaxNotes, selectedAccidentals, ledgerLines]);

  const startTrainingSelectedRecords = useCallback((keysToUse?: string[]) => {
    const rawPool = keysToUse || selectedRecordKeysForTrainingRef.current;
    const pool = rawPool.filter(k => (highScoresRef.current[k] || 0) > 0);
    if (pool.length === 0) return;

    setIsPracticeFromRecordsActive(true);
    isPracticeFromRecordsActiveRef.current = true;
    setShowRecordsModal(false);

    // Pick first random key from pool
    const chosenKey = pool[Math.floor(Math.random() * pool.length)];
    const parsed = parseConfigKey(chosenKey);
    if (parsed) {
      if (KEY_SIGNATURES[parsed.keySignature as keyof typeof KEY_SIGNATURES]) {
        activeKeySignatureRef.current = parsed.keySignature as keyof typeof KEY_SIGNATURES;
        setActiveKeySignature(parsed.keySignature as keyof typeof KEY_SIGNATURES);
        setSelectedKeySignature(parsed.keySignature as keyof typeof KEY_SIGNATURES);
      }
      activeMaxNotesRef.current = parsed.rawNotes;
      setActiveMaxNotes(parsed.rawNotes);
      setSelectedMaxNotes(parsed.rawNotes);
      activeUseAccidentalsRef.current = parsed.rawAccidentals === 1;
      setActiveUseAccidentals(parsed.rawAccidentals === 1);
      setSelectedAccidentals(parsed.rawAccidentals === 1);
      activeLedgerLinesRef.current = parsed.rawLedger;
      setLedgerLines(parsed.rawLedger);

      const startConfigKey = `${parsed.keySignature}_${parsed.rawNotes}_${parsed.rawLedger}_${parsed.rawAccidentals === 1 ? 'acc' : 'noacc'}`;
      const currentRec = highScoresRef.current[startConfigKey] || 0;
      const currentRk = currentRec > 0 ? getRankForConfig(highScoresRef.current, startConfigKey) : null;
      segmentInitialRecordRef.current = currentRec;
      segmentInitialRankRef.current = currentRk;
      startScoresRef.current[startConfigKey] = currentRec;
      startRanksRef.current[startConfigKey] = currentRk;
    }

    measuresPlayedRef.current = 0;
    segmentStartHitsRef.current = 0;
    segmentStartDurationMsRef.current = 0;
    segmentMeasuresCompletedRef.current = 0;
    setSegmentMeasuresCompleted(0);
    lastMeasurePaceRef.current = null;
    setCurrentPace(null);
    setPaceTrend(null);

    // Prepare the exercise ready on the staff, but wait for explicit Start click
    setIsPlaying(false);
    isPlayingRef.current = false;
    setStartTime(null);
    setStartDateTime(null);
    setElapsedMinutes(0);
    setActiveDurationMs(0);
    activeDurationMsRef.current = 0;
    setCorrectHits(0);
    correctHitsRef.current = 0;

    generateMeasure();
  }, [generateMeasure]);

  // Regenerate only when settings are manually changed while playing
  const isSettingsInitialMount = useRef(true);
  useEffect(() => {
    if (isSettingsInitialMount.current) {
      isSettingsInitialMount.current = false;
      return;
    }
    if (isPlayingRef.current && !isPracticeFromRecordsActiveRef.current) {
      generateMeasure();
    }
  }, [selectedAccidentals, selectedKeySignature, selectedMaxNotes, ledgerLines, generateMeasure]);

const PITCH_CLASS_MAP: Record<string, number> = {
  'C': 0, 'B#': 0,
  'C#': 1, 'DB': 1,
  'D': 2,
  'D#': 3, 'EB': 3,
  'E': 4, 'FB': 4,
  'F': 5, 'E#': 5,
  'F#': 6, 'GB': 6,
  'G': 7,
  'G#': 8, 'AB': 8,
  'A': 9,
  'A#': 10, 'BB': 10,
  'B': 11, 'CB': 11,
};

const getPitchClass = (p: string): number | null => {
  if (!p) return null;
  const noteName = p.replace(/-?\d+$/, '').toUpperCase();
  return PITCH_CLASS_MAP[noteName] ?? null;
};

  const handlePianoPress = useCallback((pitch: string, isFromAudioInput = false) => {
    if (soundEnabled) {
      audioService.playNote(pitch);
    }
    
    let status: 'hit' | 'miss' | 'wrong-octave' | 'default' = 'default';

    if (!isPlaying || showHistory || keyChangeAlertRef.current) {
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

    // Reset wrong pitches tracking if we moved to a new beat
    if (wrongPitchesInCurrentBeatRef.current.beat !== beat) {
      wrongPitchesInCurrentBeatRef.current = { beat, pitches: new Set() };
    }
    
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
    const isListeningModeActive = isFromAudioInput || isListeningModeRef.current || audioInputStatus.isMicActive || audioInputStatus.isMidiConnected;

    if (matchingNote) {
      status = 'hit';
      setScore(s => s + 10);
      setCorrectHits(c => {
        const next = c + 1;
        correctHitsRef.current = next;
        return next;
      });
      setFeedback({ type: 'hit', id: Date.now(), message: 'Dobrze' });

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
            if (isPlayingRef.current) {
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
      // Prevent duplicate penalties for the exact same wrong pitch on the current beat
      if (wrongPitchesInCurrentBeatRef.current.pitches.has(pitch)) {
        return;
      }
      wrongPitchesInCurrentBeatRef.current.pitches.add(pitch);

      const pressedPitchClass = getPitchClass(pitch);
      const wrongOctaveNote = pressedPitchClass !== null
        ? unplayedInBeat.find(n => getPitchClass(n.actualPitch) === pressedPitchClass)
        : undefined;

      if (wrongOctaveNote) {
        status = 'wrong-octave';
        // In listening mode (playing on physical instrument with mic/MIDI), do not deduct points
        // and do not show wrong-octave feedback cloud
        if (!isListeningModeActive) {
          setScore(s => Math.max(0, s - 3));
          setFeedback({ 
            type: 'wrong-octave', 
            id: Date.now(), 
            message: 'Inna oktawa' 
          });
        }
      } else {
        status = 'miss';
        // In listening mode, do not deduct points for wrong sound or ambient room noise,
        // and do not show miss feedback cloud
        if (!isListeningModeActive) {
          setScore(s => Math.max(0, s - 5));
          setFeedback({ 
            type: 'miss', 
            id: Date.now(), 
            message: 'Nietrafione' 
          });
        }
      }

      // Auto-clear wrong key highlight after 450ms so keyboard stays clean while waiting
      setTimeout(() => {
        setActivePianoNotes(prev => {
          const currentStatus = prev.get(pitch);
          if (currentStatus === 'miss' || currentStatus === 'wrong-octave') {
            const next = new Map(prev);
            next.delete(pitch);
            return next;
          }
          return prev;
        });
      }, 450);
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
  }, [isPlaying, generateMeasure, soundEnabled, showHistory, calculateAndSavePace, audioInputStatus.isMicActive, audioInputStatus.isMidiConnected]);

  const skipCurrentBeat = useCallback(() => {
    const beat = currentBeatRef.current;
    
    // Mark all notes in current beat as hit/skipped
    notesRef.current = notesRef.current.map(n => 
      n.beatIndex === beat ? { ...n, isHit: true } : n
    );
    setNotes([...notesRef.current]);
    setActivePianoNotes(new Map());
    wrongPitchesInCurrentBeatRef.current = { beat: beat + 1, pitches: new Set() };

    if (beat < 3) {
      currentBeatRef.current = beat + 1;
      setCurrentBeat(beat + 1);
    } else {
      // Reached end of measure -> generate next measure
      calculateAndSavePace();
      generateMeasure();
    }

    setFeedback({ type: 'wrong-octave', id: Date.now(), message: 'Pominięto uderzenie' });
  }, [calculateAndSavePace, generateMeasure]);

  const handlePianoPressRef = useRef(handlePianoPress);
  useEffect(() => {
    handlePianoPressRef.current = handlePianoPress;
  }, [handlePianoPress]);

  const remapPitchRef = useRef(remapPitch);
  useEffect(() => {
    remapPitchRef.current = remapPitch;
  }, [remapPitch]);

  useEffect(() => {
    audioInputService.setCallbacks(
      (pitch) => {
        const calibratedPitch = remapPitchRef.current(pitch);
        handlePianoPressRef.current(calibratedPitch, true);
      },
      (status) => {
        setAudioInputStatus(status);
      }
    );

    audioInputService.initMidi();
  }, []);

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
    activeDurationMsRef.current = 0;
    setActivePianoNotes(new Map());
    lastPressBeatRef.current = 0;
    measuresPlayedRef.current = 0;
    setCorrectHits(0);
    correctHitsRef.current = 0;
    segmentStartHitsRef.current = 0;
    segmentStartDurationMsRef.current = 0;
    segmentMeasuresCompletedRef.current = 0;
    setSegmentMeasuresCompleted(0);
    lastMeasurePaceRef.current = null;
    setCurrentPace(null);
    setPaceTrend(null);
    setKeyChangeAlert(null);
    keyChangeAlertRef.current = null;
    startRanksRef.current = {};
    startScoresRef.current = {};
    setStartRanks({});
    segmentInitialRecordRef.current = 0;
    segmentInitialRankRef.current = null;
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
                <TrendingUp size={12} className="text-blue-500 animate-pulse shrink-0" />
                <span>Aktualne tempo:</span>
                <strong className={`flex items-center gap-1 font-extrabold ${isDarkMode ? 'text-zinc-100' : 'text-neutral-900'}`}>
                  <span>{currentPace !== null ? `${currentPace.toFixed(2)} NPM` : '—'}</span>
                  {currentPace !== null && paceTrend && (
                    <span className="inline-flex items-center shrink-0 ml-0.5" title={
                      paceTrend === 'up'
                        ? 'Tempo wzrosło w porównaniu do poprzedniego taktu'
                        : paceTrend === 'down'
                        ? 'Tempo spadło w porównaniu do poprzedniego taktu'
                        : 'Tempo bez zmian w porównaniu do poprzedniego taktu'
                    }>
                      {paceTrend === 'up' && (
                        <ArrowUp size={13} className="text-emerald-500 stroke-[3]" />
                      )}
                      {paceTrend === 'down' && (
                        <ArrowDown size={13} className="text-rose-500 stroke-[3]" />
                      )}
                      {paceTrend === 'equal' && (
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-neutral-400 dark:bg-zinc-500" />
                      )}
                    </span>
                  )}
                </strong>
              </div>
              <div className={`w-px h-3 ${isDarkMode ? 'bg-zinc-800' : 'bg-neutral-200'}`} />
              <button
                onClick={() => setShowRecordsModal(true)}
                className="flex items-center gap-1.5 hover:opacity-90 cursor-pointer group transition-all"
                title={
                  (() => {
                    const effectiveRank = (currentPace !== null && projectedRank !== null) ? projectedRank : currentConfigRank;
                    if (currentPace !== null && segmentMeasuresCompleted > 0 && segmentMeasuresCompleted < 4 && projectedRank !== null) {
                      return `Aktualne tempo (${currentPace.toFixed(2)} NPM) daje pozycję #${projectedRank} w tabeli. Rekord zapisze się po 4. takcie.`;
                    }
                    if (effectiveRank) {
                      return `Pozycja #${effectiveRank} z ${allValidRecords.length} zapisanych rekordów. Kliknij, aby otworzyć tabelę.`;
                    }
                    return 'Kliknij, aby zobaczyć i zarządzać wszystkimi rekordami prędkości';
                  })()
                }
              >
                <Trophy size={12} className="text-amber-500 group-hover:scale-110 transition-transform shrink-0" />
                <span className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-semibold text-xs">Rekord parametrów:</span>
                  {(() => {
                    const effectiveRank = (currentPace !== null && projectedRank !== null) ? projectedRank : currentConfigRank;
                    if (effectiveRank) {
                      return (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-400 text-black font-black text-[11px] shadow-xs tracking-tight">
                          {initialRank && initialRank !== effectiveRank ? (
                            <>
                              <span>#{initialRank} -&gt; #{effectiveRank}</span>
                              {effectiveRank < initialRank && (
                                <span className="text-emerald-950 font-black text-xs leading-none" title="Awans w rankingu!">
                                  ▲
                                </span>
                              )}
                            </>
                          ) : initialRank === null && effectiveRank ? (
                            <>
                              <span>brak -&gt; #{effectiveRank}</span>
                              <span className="text-emerald-950 font-black text-xs leading-none" title="Nowy rekord w rankingu!">
                                ▲
                              </span>
                            </>
                          ) : (
                            <span>#{effectiveRank}</span>
                          )}
                        </span>
                      );
                    }
                    return (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-neutral-200 dark:bg-zinc-800 text-black dark:text-zinc-100 font-bold text-[11px]">
                        <span>brak</span>
                      </span>
                    );
                  })()}
                </span>
                <strong className={`font-extrabold text-xs ml-0.5 ${
                  sessionBeatenKeys.has(configKey)
                    ? 'text-emerald-600 dark:text-emerald-400 animate-pulse'
                    : (isDarkMode ? 'text-zinc-200' : 'text-neutral-800')
                }`}>
                  {configRecord > 0 ? `${configRecord.toFixed(2)} NPM` : '—'}
                </strong>
              </button>
            </div>
          )}

          {isPracticeFromRecordsActive && (
            <div className={`w-full flex items-center justify-between gap-1.5 px-2.5 py-0.5 rounded-lg border transition-all h-7 overflow-hidden flex-nowrap ${
              isDarkMode 
                ? 'bg-amber-950/40 border-amber-500/40 text-amber-200' 
                : 'bg-amber-50 border-amber-300 text-amber-900'
            }`}>
              <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
                <Target size={13} className="text-amber-500 animate-pulse shrink-0" />
                <span className="text-[11px] sm:text-xs truncate font-medium">
                  <span className="hidden sm:inline">Trening rekordów:</span>
                  <span className="sm:hidden">Trening:</span>{' '}
                  <strong className="text-amber-500 dark:text-amber-400 font-black">
                    {selectedRecordKeysForTraining.filter(k => (highScores[k] || 0) > 0).length}
                  </strong>{' '}
                  {(() => {
                    const count = selectedRecordKeysForTraining.filter(k => (highScores[k] || 0) > 0).length;
                    return count === 1 ? 'zestaw' : (count < 5 ? 'zestawy' : 'zestawów');
                  })()}{' '}
                  <span className="text-[10px] opacity-75 hidden sm:inline">(rotacja co 4 takty)</span>
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setShowRecordsModal(true)}
                  className="text-[10px] sm:text-[11px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/30 whitespace-nowrap cursor-pointer transition-colors leading-none"
                  title="Zarządzaj wybranymi rekordami do ćwiczeń"
                >
                  Zmień
                </button>
                <button
                  onClick={() => setIsPracticeFromRecordsActive(false)}
                  className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-neutral-500 dark:text-zinc-400 hover:text-red-500 transition-colors cursor-pointer leading-none"
                  title="Wyłącz tryb treningu wybranych rekordów"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          )}

          <div className={`flex flex-wrap items-center justify-center ${isCompact ? 'gap-1 md:gap-2' : 'gap-2 md:gap-4'} w-full sm:w-auto`}>
          {/* Key Signature Selector */}
          <select 
            value={isPracticeFromRecordsActive ? activeKeySignature : selectedKeySignature}
            onMouseDown={(e) => {
              if (isPracticeFromRecordsActive) {
                e.preventDefault();
                setShowPracticeModeLockDialog(true);
              }
            }}
            onChange={(e) => {
              if (isPracticeFromRecordsActive) {
                setShowPracticeModeLockDialog(true);
                return;
              }
              handleKeySignatureChange(e.target.value as any);
            }}
            className={`${isCompact ? 'text-[10px]' : 'text-xs md:text-sm'} rounded-full px-3 py-1 shadow-sm outline-none focus:ring-2 focus:ring-blue-500 border transition-all ${
              isPracticeFromRecordsActive ? 'cursor-pointer ring-1 ring-amber-500/50 font-bold' : ''
            } ${
              isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-neutral-200 text-neutral-900'
            }`}
            title={isPracticeFromRecordsActive ? `Ćwiczona tonacja: ${activeKeySignature} (kliknij, aby zarządzać trybem)` : undefined}
          >
            {!isPracticeFromRecordsActive && (
              <option value="Random" className={isDarkMode ? 'bg-zinc-900 text-zinc-100' : ''}>Losowo (co 4 takty)</option>
            )}
            {Object.keys(KEY_SIGNATURES).map(k => (
              <option key={k} value={k} className={isDarkMode ? 'bg-zinc-900 text-zinc-100' : ''}>{k}</option>
            ))}
          </select>

          {/* Accidentals Selector */}
          <div 
            onClick={() => {
              if (isPracticeFromRecordsActive) {
                setShowPracticeModeLockDialog(true);
              }
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full shadow-sm border transition-all ${
              isPracticeFromRecordsActive ? 'cursor-pointer ring-1 ring-amber-500/50' : ''
            } ${
              isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-200' : 'bg-white border-neutral-200 text-neutral-900'
            }`}
            title={
              isPracticeFromRecordsActive
                ? `Znaki przygodne w tym rekordzie: ${activeUseAccidentals ? 'WŁ' : 'WYŁ'} (kliknij, aby zarządzać trybem)`
                : (selectedAccidentals === 'Random' ? `Znaki przypadkowe: Losowo (aktualnie ${activeUseAccidentals ? 'WŁ' : 'WYŁ'}, co 4 takty)` : `Znaki przypadkowe: ${activeUseAccidentals ? 'WŁ' : 'WYŁ'}`)
            }
          >
            {!isCompact && <span className={`text-[10px] font-bold uppercase ${isDarkMode ? 'text-zinc-500' : 'text-neutral-400'}`}>Znaki:</span>}
            <select 
              value={isPracticeFromRecordsActive ? (activeUseAccidentals ? 'ON' : 'OFF') : (selectedAccidentals === 'Random' ? 'Random' : (selectedAccidentals ? 'ON' : 'OFF'))}
              onMouseDown={(e) => {
                if (isPracticeFromRecordsActive) {
                  e.preventDefault();
                  setShowPracticeModeLockDialog(true);
                }
              }}
              onChange={(e) => {
                if (isPracticeFromRecordsActive) {
                  setShowPracticeModeLockDialog(true);
                  return;
                }
                const val = e.target.value;
                if (val === 'Random') {
                  handleAccidentalsChange('Random');
                } else if (val === 'ON') {
                  handleAccidentalsChange(true);
                } else {
                  handleAccidentalsChange(false);
                }
              }}
              className={`${isCompact ? 'text-[10px]' : 'text-xs'} font-bold outline-none bg-transparent cursor-pointer ${isDarkMode ? 'text-zinc-200 [&>option]:bg-zinc-900 [&>option]:text-zinc-100' : 'text-neutral-900'}`}
            >
              {!isPracticeFromRecordsActive && (
                <option value="Random" className={isDarkMode ? 'bg-zinc-900 text-zinc-100' : ''}>
                  Losowo
                </option>
              )}
              <option value="ON" className={isDarkMode ? 'bg-zinc-900 text-zinc-100' : ''}>
                WŁ (ON)
              </option>
              <option value="OFF" className={isDarkMode ? 'bg-zinc-900 text-zinc-100' : ''}>
                WYŁ (OFF)
              </option>
            </select>
            {selectedAccidentals === 'Random' && !isPracticeFromRecordsActive ? (
              <span 
                className={`text-[10px] font-black px-1.5 py-0.5 rounded leading-none shrink-0 ${
                  activeUseAccidentals
                    ? 'bg-purple-500 text-white'
                    : (isDarkMode ? 'bg-zinc-800 text-zinc-400' : 'bg-neutral-200 text-neutral-600')
                }`} 
                title="Obecnie wylosowany stan znaków przypadkowych (zmienia się co 4 takty)"
              >
                {activeUseAccidentals ? 'WŁ' : 'WYŁ'}
              </span>
            ) : (
              <span className={`w-2 h-2 rounded-full shrink-0 ${activeUseAccidentals ? 'bg-purple-500' : 'bg-neutral-300 dark:bg-zinc-600'}`} />
            )}
          </div>

          {/* Ledger Lines Selector */}
          <div 
            onClick={() => {
              if (isPracticeFromRecordsActive) {
                setShowPracticeModeLockDialog(true);
              }
            }}
            className={`flex items-center gap-2 px-3 py-1 rounded-full shadow-sm border transition-all ${
              isPracticeFromRecordsActive ? 'cursor-pointer ring-1 ring-amber-500/50' : ''
            } ${
              isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-200' : 'bg-white border-neutral-200 text-neutral-900'
            }`}
            title={isPracticeFromRecordsActive ? `Linie dodane w tym rekordzie: ${ledgerLines} (kliknij, aby zarządzać trybem)` : undefined}
          >
            {!isCompact && <span className={`text-[10px] font-bold uppercase ${isDarkMode ? 'text-zinc-500' : 'text-neutral-400'}`}>Lines:</span>}
            <select 
              value={ledgerLines}
              onMouseDown={(e) => {
                if (isPracticeFromRecordsActive) {
                  e.preventDefault();
                  setShowPracticeModeLockDialog(true);
                }
              }}
              onChange={(e) => {
                if (isPracticeFromRecordsActive) {
                  setShowPracticeModeLockDialog(true);
                  return;
                }
                handleLedgerLinesChange(parseInt(e.target.value));
              }}
              className={`${isCompact ? 'text-[10px]' : 'text-xs'} font-bold outline-none bg-transparent cursor-pointer ${isDarkMode ? 'text-zinc-200 [&>option]:bg-zinc-900 [&>option]:text-zinc-200' : 'text-neutral-900'}`}
            >
              {[1, 2, 3, 4, 5].map(v => (
                <option key={v} value={v} className={isDarkMode ? 'bg-zinc-900 text-zinc-100' : ''}>{isCompact ? `L${v}` : v}</option>
              ))}
            </select>
          </div>

          {/* Max Notes Per Spawn Selector */}
          <div 
            onClick={() => {
              if (isPracticeFromRecordsActive) {
                setShowPracticeModeLockDialog(true);
              }
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full shadow-sm border transition-all ${
              isPracticeFromRecordsActive ? 'cursor-pointer ring-1 ring-amber-500/50' : ''
            } ${
              isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-200' : 'bg-white border-neutral-200 text-neutral-900'
            }`}
            title={
              isPracticeFromRecordsActive 
                ? `Maks. nut w tym rekordzie: ${activeMaxNotes} (kliknij, aby zarządzać trybem)` 
                : (selectedMaxNotes === 'Random' ? `Maks. nut: Losowo (aktualnie ${activeMaxNotes}, co 4 takty)` : `Maks. nut: ${selectedMaxNotes}`)
            }
          >
            {!isCompact && <span className={`text-[10px] font-bold uppercase ${isDarkMode ? 'text-zinc-500' : 'text-neutral-400'}`}>Nut:</span>}
            <select 
              value={isPracticeFromRecordsActive ? activeMaxNotes : selectedMaxNotes}
              onMouseDown={(e) => {
                if (isPracticeFromRecordsActive) {
                  e.preventDefault();
                  setShowPracticeModeLockDialog(true);
                }
              }}
              onChange={(e) => {
                if (isPracticeFromRecordsActive) {
                  setShowPracticeModeLockDialog(true);
                  return;
                }
                handleMaxNotesChange(e.target.value === 'Random' ? 'Random' : parseInt(e.target.value, 10));
              }}
              className={`${isCompact ? 'text-[10px]' : 'text-xs'} font-bold outline-none bg-transparent cursor-pointer ${isDarkMode ? 'text-zinc-200 [&>option]:bg-zinc-900 [&>option]:text-zinc-200' : 'text-neutral-900'}`}
            >
              {!isPracticeFromRecordsActive && (
                <option value="Random" className={isDarkMode ? 'bg-zinc-900 text-zinc-100' : ''}>
                  Losowo
                </option>
              )}
              {[1, 2, 3, 4, 5].map(v => (
                <option key={v} value={v} className={isDarkMode ? 'bg-zinc-900 text-zinc-100' : ''}>{v}</option>
              ))}
            </select>
            {selectedMaxNotes === 'Random' && !isPracticeFromRecordsActive && (
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-400 text-black leading-none shrink-0" title="Obecnie wylosowana maksymalna ilość nut w takcie">
                {activeMaxNotes}
              </span>
            )}
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

          {/* Audio / MIDI Input Listening Toggle Button */}
          <button 
            onClick={() => setShowAudioInputModal(true)}
            className={`flex items-center gap-1.5 ${isCompact ? 'text-[10px] px-2 py-1' : 'text-xs md:text-sm px-3.5 py-1'} rounded-full border transition-all shadow-sm ${
              audioInputStatus.isMicActive || audioInputStatus.isMidiConnected
                ? (isDarkMode ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-300 ring-2 ring-emerald-500/20' : 'bg-emerald-50 border-emerald-400 text-emerald-800 ring-2 ring-emerald-300/40')
                : (isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200' : 'bg-white border-neutral-200 text-neutral-600 hover:text-neutral-900')
            }`}
            title="Słuchanie pianina i kalibracja dźwięków (Mikrofon / MIDI)"
          >
            {audioInputStatus.isMicActive ? (
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
            ) : audioInputStatus.isMidiConnected ? (
              <Radio size={isCompact ? 12 : 14} className="text-emerald-500 shrink-0" />
            ) : (
              <Mic size={isCompact ? 12 : 14} className="shrink-0" />
            )}
            <span className="font-semibold whitespace-nowrap">
              {audioInputStatus.isMicActive
                ? (isCompact ? 'Mic WŁ' : 'Słucham')
                : audioInputStatus.isMidiConnected
                ? (isCompact ? 'MIDI' : 'MIDI WŁ')
                : (isCompact ? 'Słuchaj' : 'Słuchaj (Mic/MIDI)')}
            </span>
            {audioInputStatus.isMicActive && (
              <span className="font-mono font-bold text-[11px] bg-emerald-500/20 text-emerald-400 dark:text-emerald-300 px-1 py-0.5 rounded min-w-[30px] inline-block text-center shrink-0">
                {audioInputStatus.detectedPitch ? remapPitch(audioInputStatus.detectedPitch) : '—'}
              </span>
            )}
            {(transposeOffset !== 0 || Object.keys(customPitchMap).length > 0) && (
              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" title="Kalibracja dźwięków jest aktywna" />
            )}
          </button>

          {/* Skip Beat Button - visible only in listening mode (Mic or MIDI) during play, placed in top bar so it never obscures staff notes */}
          {isPlaying && (audioInputStatus.isMicActive || audioInputStatus.isMidiConnected) && (
            <button
              onClick={skipCurrentBeat}
              className={`flex items-center gap-1.5 ${isCompact ? 'text-[10px] px-2.5 py-1' : 'text-xs md:text-sm px-3.5 py-1'} rounded-full font-semibold transition-all shadow-sm border ${
                isDarkMode
                  ? 'bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border-amber-600/50 shadow-amber-950/30'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300 shadow-amber-200/40'
              }`}
              title="Pomiń to uderzenie nut (np. nierozpoznany dźwięk mikrofonu lub brak klawisza)"
            >
              <SkipForward className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20 shrink-0" />
              <span className="whitespace-nowrap">{isCompact ? 'Pomiń' : 'Pomiń uderzenie'}</span>
            </button>
          )}

          <div 
            className={`flex items-center gap-2 px-3 py-1 rounded-full shadow-sm border transition-all ${
              isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-200' : 'bg-white border-neutral-200 text-neutral-900'
            }`}
            title={audioInputStatus.isMicActive || audioInputStatus.isMidiConnected ? "Tryb słuchania: brak kar punktowych za błędne dźwięki i hałas otoczenia" : "Punkty"}
          >
            <Trophy size={isCompact ? 12 : 16} className="text-yellow-500" />
            <span className={`font-mono font-bold ${isCompact ? 'text-xs' : 'text-sm'}`}>{score}</span>
          </div>

          {/* Exercise Duration badge (positioned in top header so it never obscures staff notes) */}
          {startTime && (
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full shadow-sm border transition-all text-xs ${
              isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-white border-neutral-200 text-neutral-700'
            }`}>
              <Clock size={isCompact ? 12 : 14} className="text-blue-500 shrink-0" />
              <span className="font-medium whitespace-nowrap">
                {startTime} <span className="opacity-75">({elapsedMinutes} min)</span>
              </span>
            </div>
          )}

          <button 
            onClick={() => {
              if (isPlaying) {
                // We are pausing! Save the session.
                saveSessionToHistory();
                setStartTime(null);
                setStartDateTime(null);
                setElapsedMinutes(0);
                setActiveDurationMs(0);
                activeDurationMsRef.current = 0;
              } else {
                if (!startTime) {
                  const now = new Date();
                  setStartTime(now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
                  setStartDateTime(now);
                  setElapsedMinutes(0);
                  setActiveDurationMs(0);
                  activeDurationMsRef.current = 0;
                  setCorrectHits(0);
                  correctHitsRef.current = 0;
                  segmentStartHitsRef.current = 0;
                  segmentStartDurationMsRef.current = 0;
                  segmentMeasuresCompletedRef.current = 0;
                  setSegmentMeasuresCompleted(0);
                  lastMeasurePaceRef.current = null;
                  setCurrentPace(null);
                  setPaceTrend(null);
                  measuresPlayedRef.current = 0;
                  let keyToUse = isPracticeFromRecordsActiveRef.current ? activeKeySignatureRef.current : (selectedKeySignature === 'Random' ? activeKeySignatureRef.current : selectedKeySignature);
                  let maxNotesToUse = isPracticeFromRecordsActiveRef.current ? activeMaxNotesRef.current : (selectedMaxNotes === 'Random' ? activeMaxNotesRef.current : selectedMaxNotes);
                  let accidentalsToUse = isPracticeFromRecordsActiveRef.current ? activeUseAccidentalsRef.current : (selectedAccidentals === 'Random' ? activeUseAccidentalsRef.current : selectedAccidentals);
                  let ledgerToUse = activeLedgerLinesRef.current;

                  if (isPracticeFromRecordsActiveRef.current && selectedRecordKeysForTrainingRef.current.length > 0) {
                    const pool = selectedRecordKeysForTrainingRef.current.filter(k => (highScoresRef.current[k] || 0) > 0);
                    const effectivePool = pool.length > 0 ? pool : selectedRecordKeysForTrainingRef.current;
                    const currentConfigKey = `${keyToUse}_${maxNotesToUse}_${ledgerToUse}_${accidentalsToUse ? 'acc' : 'noacc'}`;
                    const isAlreadyInPool = effectivePool.includes(currentConfigKey);

                    if ((!isAlreadyInPool || notesRef.current.length === 0) && effectivePool.length > 0) {
                      const chosen = effectivePool[Math.floor(Math.random() * effectivePool.length)];
                      const parsed = parseConfigKey(chosen);
                      if (parsed) {
                        if (KEY_SIGNATURES[parsed.keySignature as keyof typeof KEY_SIGNATURES]) {
                          keyToUse = parsed.keySignature as keyof typeof KEY_SIGNATURES;
                          activeKeySignatureRef.current = keyToUse;
                          setActiveKeySignature(keyToUse);
                          setSelectedKeySignature(keyToUse);
                        }
                        maxNotesToUse = parsed.rawNotes;
                        activeMaxNotesRef.current = maxNotesToUse;
                        setActiveMaxNotes(maxNotesToUse);
                        setSelectedMaxNotes(maxNotesToUse);
                        accidentalsToUse = parsed.rawAccidentals === 1;
                        activeUseAccidentalsRef.current = accidentalsToUse;
                        setActiveUseAccidentals(accidentalsToUse);
                        setSelectedAccidentals(accidentalsToUse);
                        ledgerToUse = parsed.rawLedger;
                        activeLedgerLinesRef.current = ledgerToUse;
                        setLedgerLines(ledgerToUse);
                      }
                    }
                  }

                  const startConfigKey = `${keyToUse}_${maxNotesToUse}_${ledgerToUse}_${accidentalsToUse ? 'acc' : 'noacc'}`;
                  const currentRec = highScoresRef.current[startConfigKey] || 0;
                  const currentRk = currentRec > 0 ? getRankForConfig(highScoresRef.current, startConfigKey) : null;
                  segmentInitialRecordRef.current = currentRec;
                  segmentInitialRankRef.current = currentRk;
                  startScoresRef.current[startConfigKey] = currentRec;
                  startRanksRef.current[startConfigKey] = currentRk;
                  if (startRanksRef.current[configKey] === undefined) {
                    startRanksRef.current[configKey] = currentConfigRank;
                    setStartRanks(prev => ({
                      ...prev,
                      [configKey]: currentConfigRank
                    }));
                  }
                  if (notesRef.current.length === 0) {
                    generateMeasure();
                  }
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
            onClick={() => setShowRecordsModal(true)}
            className={`p-1.5 rounded-full transition-colors ${isDarkMode ? 'text-amber-400 hover:text-amber-300 bg-zinc-800/80 hover:bg-zinc-700' : 'text-amber-600 hover:text-amber-700 bg-white hover:bg-neutral-100/80'} border border-neutral-200 shadow-sm`}
            title="Tabela rekordów prędkości"
          >
            <Trophy size={isCompact ? 14 : 16} />
          </button>

          <button 
            onClick={() => setShowHistory(true)}
            className={`p-1.5 rounded-full transition-colors ${isDarkMode ? 'text-zinc-400 hover:text-zinc-200 bg-zinc-800/80 hover:bg-zinc-700' : 'text-neutral-500 hover:text-neutral-900 bg-white hover:bg-neutral-100/80'} border border-neutral-200 shadow-sm`}
            title="Historia ostatnich ćwiczeń"
          >
            <History size={isCompact ? 14 : 16} />
          </button>

          <button 
            onClick={() => setShowOfflineModal(true)}
            className={`relative p-1.5 rounded-full transition-colors ${
              !isOnline
                ? 'bg-amber-500/20 text-amber-500 border-amber-500/50'
                : deferredPrompt
                ? 'bg-blue-600/15 text-blue-500 border-blue-500/40 hover:bg-blue-600/25'
                : (isDarkMode ? 'text-zinc-400 hover:text-zinc-200 bg-zinc-800/80 hover:bg-zinc-700' : 'text-neutral-500 hover:text-neutral-900 bg-white hover:bg-neutral-100/80')
            } border border-neutral-200 shadow-sm`}
            title={!isOnline ? "Tryb Offline (Brak połączenia)" : "Praca offline i instalacja aplikacji (PWA)"}
          >
            {!isOnline ? (
              <WifiOff size={isCompact ? 14 : 16} className="text-amber-500 animate-pulse" />
            ) : deferredPrompt ? (
              <Download size={isCompact ? 14 : 16} className="text-blue-500 animate-bounce" />
            ) : (
              <Download size={isCompact ? 14 : 16} />
            )}
            {!isOnline && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 border-2 border-zinc-950" />
            )}
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
          {/* Feedback Pill - Centered on top border outside the canvas frame so it never obscures any notes */}
          <AnimatePresence>
            {feedback && (!(audioInputStatus.isMicActive || audioInputStatus.isMidiConnected) || feedback.type === 'hit') && (
              <motion.div
                key={feedback.id}
                initial={{ opacity: 0, y: -6, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.9 }}
                transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                className={`absolute -top-3.5 left-1/2 -translate-x-1/2 z-30 px-3 py-0.5 rounded-full text-xs font-bold shadow-md border pointer-events-none transition-all flex items-center gap-1.5 ${
                  feedback.type === 'hit'
                    ? 'bg-emerald-600 text-white border-emerald-400/50 shadow-emerald-500/20'
                    : feedback.type === 'wrong-octave'
                    ? 'bg-amber-500 text-white border-amber-300/50 shadow-amber-500/20'
                    : 'bg-rose-600 text-white border-rose-400/50 shadow-rose-500/20'
                }`}
              >
                <span>{feedback.message}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <Staff 
            notes={notes}
            currentBeat={currentBeat}
            keySignature={activeKeySignature}
            isCompact={isCompact}
            measureId={measureId}
            isDarkMode={isDarkMode}
            isListeningMode={audioInputStatus.isMicActive || audioInputStatus.isMidiConnected}
            maxNotes={activeMaxNotes}
          />

          {/* Key Signature Change Announcement Overlay - covers full staff to hide notes until dismissed */}
          <AnimatePresence>
            {keyChangeAlert && (
              <motion.div
                key={`keychange-${keyChangeAlert.id}`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: 'spring', damping: 22, stiffness: 260 }}
                className="absolute inset-0 z-40 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-zinc-950/95 dark:bg-zinc-950/98 backdrop-blur-md rounded-xl border-2 border-amber-500/50 shadow-2xl overflow-y-auto"
              >
                <div className="relative w-full max-w-sm sm:max-w-md p-3.5 sm:p-5 rounded-2xl bg-zinc-900/95 border border-amber-500/40 text-white shadow-2xl flex flex-col gap-2.5 sm:gap-3.5 my-auto pointer-events-auto">
                  {/* Top Bar with Title and Close 'X' Button */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-400 shrink-0">
                        <Music className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase font-bold tracking-wider text-amber-400">
                          Nowa tonacja i parametry
                        </div>
                        <div className="text-base sm:text-lg font-black text-white flex items-center gap-1.5 sm:gap-2 flex-wrap truncate">
                          <span>{keyChangeAlert.keyName}</span>
                          {keyChangeAlert.maxNotesText && (
                            <span className="text-[11px] bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-400/30">
                              {keyChangeAlert.maxNotesText}
                            </span>
                          )}
                          {keyChangeAlert.accidentalsText && (
                            <span className="text-[11px] bg-purple-500/25 text-purple-300 font-bold px-2 py-0.5 rounded-full border border-purple-400/40">
                              {keyChangeAlert.accidentalsText}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Close (X) button */}
                    <button
                      onClick={dismissKeyChangeAlert}
                      className="p-1.5 sm:p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-300 hover:text-white border border-zinc-700 transition-all shrink-0 cursor-pointer"
                      title="Zamknij i rozpocznij (Esc / Enter / Spacja)"
                      aria-label="Zamknij i rozpocznij"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {/* Finishing Key Performance Summary */}
                  {keyChangeAlert.prevKeyName && (
                    <div className="w-full p-2.5 sm:p-3 rounded-xl bg-zinc-950/80 border border-zinc-800 flex flex-col gap-1.5 sm:gap-2 text-xs text-zinc-200">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        Podsumowanie poprzedniej tonacji
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-zinc-300">
                          Tonacja: <span className="text-white font-bold">{keyChangeAlert.prevKeyName}</span>
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] uppercase font-bold text-zinc-400">Twoja prędkość:</span>
                          <strong className="font-mono font-black text-amber-400 text-xs sm:text-sm">
                            {keyChangeAlert.prevKeyPace !== undefined && keyChangeAlert.prevKeyPace !== null
                              ? `${keyChangeAlert.prevKeyPace.toFixed(2)} NPM`
                              : '—'}
                          </strong>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-zinc-800/80">
                        {/* Status czy rekord został pobity */}
                        <div className="flex items-center gap-2">
                          {keyChangeAlert.isNewRecord ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="px-2 py-0.5 rounded-md bg-emerald-400 text-black text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-xs">
                                🏆 {keyChangeAlert.wasFirstRecord ? 'Nowy rekord!' : 'Rekord pobity!'}
                              </span>
                              {keyChangeAlert.previousRecordPace && !keyChangeAlert.wasFirstRecord && keyChangeAlert.prevKeyPace && (
                                <span className="text-[10px] text-emerald-400 font-mono font-bold">
                                  (+{(keyChangeAlert.prevKeyPace - keyChangeAlert.previousRecordPace).toFixed(2)} NPM)
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
                              <span className="px-1.5 py-0.5 rounded-md bg-zinc-800 text-zinc-300 text-[10px] font-medium border border-zinc-700">
                                Nie pobito rekordu
                              </span>
                              {keyChangeAlert.previousRecordPace ? (
                                <div className="flex items-center gap-1 text-[11px]">
                                  <span className="text-zinc-400 text-[10px] uppercase font-bold">Rekord:</span>
                                  <strong className="text-amber-300 font-mono font-bold">
                                    {keyChangeAlert.previousRecordPace.toFixed(2)} NPM
                                  </strong>
                                </div>
                              ) : null}
                            </div>
                          )}
                        </div>

                        {/* Z którego miejsca na które rekord zawędrował */}
                        {keyChangeAlert.rankText && (
                          <div className="flex items-center gap-1 font-mono font-black text-[10px] bg-zinc-800/90 text-amber-300 px-2 py-0.5 rounded-md border border-zinc-700 shrink-0 ml-auto">
                            <span className="text-[9px] font-sans font-medium text-zinc-400 mr-0.5 uppercase tracking-wider">
                              Miejsce:
                            </span>
                            <span>{keyChangeAlert.rankText}</span>
                            {keyChangeAlert.rankImproved && (
                              <span className="text-emerald-400 font-black text-xs leading-none">
                                ▲
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Informational tip */}
                  <div className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                    <Clock size={13} className="text-amber-400 shrink-0" />
                    <span>Czas dla nowej tonacji zacznie się liczyć po kliknięciu krzyżyka lub przycisku poniżej.</span>
                  </div>

                  {/* Prominent Action Button */}
                  <button
                    onClick={dismissKeyChangeAlert}
                    className="w-full py-2 sm:py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 active:scale-[0.99] text-zinc-950 font-black text-xs sm:text-sm tracking-wide shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <span>Rozpocznij nową tonację</span>
                    <span className="text-[10px] bg-black/20 text-zinc-950 px-1.5 py-0.5 rounded-md font-mono font-bold">✕</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Piano Section */}
        <section className="w-full relative shrink-0">
          <Piano onNotePress={handlePianoPress} activeNotes={activePianoNotes} ledgerLines={ledgerLines} isCompact={isCompact} isDarkMode={isDarkMode} />
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

                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] uppercase font-bold text-neutral-800 dark:text-zinc-400 tracking-wider">Wynik</span>
                          <span className="text-sm font-mono font-black text-blue-600 dark:text-blue-400">+{item.score}</span>
                        </div>
                        <button
                          onClick={() => handleDeleteHistoryItem(item.id)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            isDarkMode ? 'hover:bg-red-950/50 text-zinc-500 hover:text-red-400' : 'hover:bg-red-50 text-neutral-400 hover:text-red-600'
                          }`}
                          title="Usuń ten wpis z historii"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              {history.length > 0 && (
                <div className={`p-3 border-t flex items-center justify-between gap-2 ${
                  isDarkMode ? 'border-zinc-800 bg-zinc-950/20' : 'border-neutral-100 bg-neutral-50/20'
                }`}>
                  <button
                    onClick={handleCleanDuplicates}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                      isDarkMode
                        ? 'border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                        : 'border-neutral-200 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
                    }`}
                    title="Usuń powtarzające się wpisy w historii"
                  >
                    Wyczyść duplikaty
                  </button>

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

        {/* Speed Records Modal */}
        {showRecordsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className={`relative w-full max-w-lg rounded-2xl shadow-2xl border flex flex-col max-h-[85vh] overflow-hidden ${
                isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-100 shadow-black/80' : 'bg-white border-neutral-200 text-neutral-900 shadow-neutral-300'
              }`}
            >
              {/* Header */}
              <div className={`p-4 border-b flex items-center justify-between ${
                isDarkMode ? 'border-zinc-800' : 'border-neutral-100'
              }`}>
                <div className="flex items-center gap-2">
                  <Trophy className="text-amber-500 w-5 h-5" />
                  <div>
                    <h2 className="text-lg font-bold tracking-tight">Tabela rekordów prędkości</h2>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">NPM - Nuty Na Minutę dla poszczególnych opcji</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowRecordsModal(false)}
                  className={`p-1.5 rounded-full transition-colors ${
                    isDarkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-neutral-100 text-neutral-500'
                  }`}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Advanced Multi-Criteria Sort Control Bar */}
              {(Object.entries(highScores) as [string, number][]).filter(([_, scoreVal]) => scoreVal > 0).length > 0 && (
                <div className={`px-4 py-2.5 border-b text-xs flex flex-col gap-2 ${
                  isDarkMode ? 'border-zinc-800 bg-zinc-950/40' : 'border-neutral-100 bg-neutral-50/70'
                }`}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <button
                      onClick={() => setShowAdvancedSortPanel(prev => !prev)}
                      className="flex items-center gap-1.5 font-bold text-neutral-800 dark:text-zinc-200 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                    >
                      <SlidersHorizontal size={14} className="text-amber-500" />
                      <span>Zaawansowane sortowanie ({sortRules.length} {sortRules.length === 1 ? 'warunek' : (sortRules.length < 5 ? 'warunki' : 'warunków')})</span>
                      {showAdvancedSortPanel ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>

                    <div className="flex items-center gap-1 text-[11px] flex-wrap">
                      <span className="text-neutral-400 dark:text-zinc-500 mr-1 hidden sm:inline">Presety:</span>
                      <button
                        onClick={() => setSortRules([{ field: 'score', order: 'desc' }])}
                        className={`px-2 py-0.5 rounded-md font-medium transition-all border ${
                          sortRules.length === 1 && sortRules[0].field === 'score' && sortRules[0].order === 'desc'
                            ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/40 font-bold'
                            : (isDarkMode ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200' : 'bg-white border-neutral-200 text-neutral-600 hover:text-neutral-900')
                        }`}
                        title="Sortuj tylko po prędkości NPM (malejąco)"
                      >
                        ⚡ Prędkość
                      </button>
                      <button
                        onClick={() => setSortRules([
                          { field: 'notes', order: 'desc' },
                          { field: 'ledger', order: 'desc' },
                          { field: 'score', order: 'desc' }
                        ])}
                        className={`px-2 py-0.5 rounded-md font-medium transition-all border ${
                          sortRules.length === 3 && sortRules[0].field === 'notes' && sortRules[1].field === 'ledger'
                            ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/40 font-bold'
                            : (isDarkMode ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200' : 'bg-white border-neutral-200 text-neutral-600 hover:text-neutral-900')
                        }`}
                        title="Sortuj wg trudności: najpierw ilość nut, potem linie dodane, potem prędkość"
                      >
                        🎼 Trudność
                      </button>
                      <button
                        onClick={() => setSortRules([
                          { field: 'accCount', order: 'desc' },
                          { field: 'keyName', order: 'asc' },
                          { field: 'score', order: 'desc' }
                        ])}
                        className={`px-2 py-0.5 rounded-md font-medium transition-all border ${
                          sortRules.length === 3 && sortRules[0].field === 'accCount'
                            ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/40 font-bold'
                            : (isDarkMode ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200' : 'bg-white border-neutral-200 text-neutral-600 hover:text-neutral-900')
                        }`}
                        title="Sortuj po ilości znaków przykluczowych, nazwie tonacji i prędkości"
                      >
                        🎵 Tonacja
                      </button>
                    </div>
                  </div>

                  {/* Expandable Multi-Level Sort Rules Builder */}
                  {showAdvancedSortPanel && (
                    <div className={`mt-2 p-3 rounded-xl border flex flex-col gap-2.5 animate-in fade-in slide-in-from-top-1 duration-200 ${
                      isDarkMode ? 'bg-zinc-950/90 border-zinc-800' : 'bg-white border-neutral-200 shadow-xs'
                    }`}>
                      <div className="text-[10px] font-bold text-neutral-400 dark:text-zinc-500 uppercase tracking-wider">
                        Kolejność kryteriów (priorytet od góry do dołu):
                      </div>

                      {sortRules.map((rule, index) => {
                        const availableFields: SortField[] = [
                          'score', 'notes', 'ledger', 'accCount', 'keyName', 'useAccidentals'
                        ];

                        return (
                          <div key={index} className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                            <span className="text-[11px] font-bold text-amber-500 shrink-0 w-10">
                              #{index + 1}.
                            </span>

                            {/* Select field */}
                            <select
                              value={rule.field}
                              onChange={(e) => {
                                const newField = e.target.value as SortField;
                                setSortRules(prev => prev.map((r, idx) => idx === index ? { ...r, field: newField } : r));
                              }}
                              className={`flex-1 text-xs px-2.5 py-1.5 rounded-lg border font-medium focus:outline-hidden ${
                                isDarkMode ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-neutral-50 border-neutral-300 text-neutral-800'
                              }`}
                            >
                              {availableFields.map(f => (
                                <option key={f} value={f} disabled={sortRules.some((r, idx) => idx !== index && r.field === f)}>
                                  {SORT_FIELD_LABELS[f]}
                                </option>
                              ))}
                            </select>

                            {/* Select direction */}
                            <select
                              value={rule.order}
                              onChange={(e) => {
                                const newOrder = e.target.value as SortOrder;
                                setSortRules(prev => prev.map((r, idx) => idx === index ? { ...r, order: newOrder } : r));
                              }}
                              className={`text-xs px-2.5 py-1.5 rounded-lg border font-semibold focus:outline-hidden ${
                                isDarkMode ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-neutral-50 border-neutral-300 text-neutral-800'
                              }`}
                            >
                              <option value="desc">Malejąco ↓</option>
                              <option value="asc">Rosnąco ↑</option>
                            </select>

                            {/* Move up/down buttons */}
                            <div className="flex items-center gap-0.5">
                              <button
                                disabled={index === 0}
                                onClick={() => {
                                  setSortRules(prev => {
                                    const next = [...prev];
                                    const temp = next[index - 1];
                                    next[index - 1] = next[index];
                                    next[index] = temp;
                                    return next;
                                  });
                                }}
                                className={`p-1.5 rounded-md transition-colors disabled:opacity-30 ${
                                  isDarkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-neutral-100 text-neutral-600'
                                }`}
                                title="Przesuń priorytet wyżej"
                              >
                                <ChevronUp size={14} />
                              </button>
                              <button
                                disabled={index === sortRules.length - 1}
                                onClick={() => {
                                  setSortRules(prev => {
                                    const next = [...prev];
                                    const temp = next[index + 1];
                                    next[index + 1] = next[index];
                                    next[index] = temp;
                                    return next;
                                  });
                                }}
                                className={`p-1.5 rounded-md transition-colors disabled:opacity-30 ${
                                  isDarkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-neutral-100 text-neutral-600'
                                }`}
                                title="Przesuń priorytet niżej"
                              >
                                <ChevronDown size={14} />
                              </button>
                            </div>

                            {/* Delete rule button */}
                            {sortRules.length > 1 && (
                              <button
                                onClick={() => {
                                  setSortRules(prev => prev.filter((_, idx) => idx !== index));
                                }}
                                className="p-1.5 rounded-md transition-colors text-red-500 hover:bg-red-500/10"
                                title="Usuń ten warunek"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>
                        );
                      })}

                      {sortRules.length < 6 && (
                        <button
                          onClick={() => {
                            const used = new Set(sortRules.map(r => r.field));
                            const available: SortField[] = ['score', 'notes', 'ledger', 'accCount', 'keyName', 'useAccidentals'];
                            const nextUnused = available.find(f => !used.has(f));
                            if (nextUnused) {
                              setSortRules(prev => [...prev, { field: nextUnused, order: 'desc' }]);
                            }
                          }}
                          className="mt-1 self-start flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                        >
                          <Plus size={14} /> Dodaj kolejny warunek sortowania
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Filter Parameters Control Bar */}
              {(Object.entries(highScores) as [string, number][]).filter(([_, scoreVal]) => scoreVal > 0).length > 0 && (
                <div className={`px-4 py-2.5 border-b text-xs flex flex-col gap-2 ${
                  isDarkMode ? 'border-zinc-800 bg-zinc-950/60' : 'border-neutral-100 bg-neutral-50/50'
                }`}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setShowFilterPanel(prev => !prev)}
                      className="flex items-center gap-1.5 font-bold text-neutral-800 dark:text-zinc-200 hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer"
                    >
                      <Filter size={14} className={activeFiltersCount > 0 ? 'text-amber-500 animate-pulse' : 'text-zinc-400'} />
                      <span>Filtruj parametry</span>
                      {activeFiltersCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-black leading-none">
                          {activeFiltersCount} {activeFiltersCount === 1 ? 'aktywny' : 'aktywne'}
                        </span>
                      )}
                      <span className="text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
                        (widoczne: <strong className="font-bold text-amber-500">{filteredRecords.length}</strong> z {allValidRecords.length})
                      </span>
                      {showFilterPanel ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>

                    {activeFiltersCount > 0 && (
                      <button
                        type="button"
                        onClick={resetRecordFilters}
                        className="flex items-center gap-1 text-[11px] font-semibold text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                        title="Zresetuj wszystkie filtry parametrów"
                      >
                        <FilterX size={13} />
                        <span>Wyczyść filtry</span>
                      </button>
                    )}
                  </div>

                  {/* Filter Selectors Grid */}
                  {showFilterPanel && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 animate-in fade-in duration-150">
                      {/* Key Signature Filter */}
                      <div className="flex flex-col gap-1">
                        <div className="text-[10px] font-bold text-neutral-400 dark:text-zinc-500 uppercase flex items-center justify-between">
                          <span>Tonacja</span>
                          {recordFilters.keySignature !== 'all' && (
                            <button
                              type="button"
                              onClick={() => setRecordFilters(prev => ({ ...prev, keySignature: 'all' }))}
                              className="text-amber-500 hover:underline lowercase font-semibold cursor-pointer"
                            >
                              reset
                            </button>
                          )}
                        </div>
                        <select
                          value={recordFilters.keySignature}
                          onChange={(e) => setRecordFilters(prev => ({ ...prev, keySignature: e.target.value }))}
                          className={`w-full text-xs px-2 py-1.5 rounded-lg border outline-none focus:ring-1 focus:ring-amber-500 transition-colors ${
                            recordFilters.keySignature !== 'all'
                              ? 'border-amber-500/60 bg-amber-500/10 text-amber-600 dark:text-amber-300 font-bold'
                              : (isDarkMode ? 'bg-zinc-800/90 border-zinc-700 text-zinc-200' : 'bg-white border-neutral-300 text-neutral-800')
                          }`}
                        >
                          <option value="all">Wszystkie ({allValidRecords.length})</option>
                          {availableKeysInRecords.map(k => (
                            <option key={k} value={k}>
                              {k} ({allValidRecords.filter(([recKey]) => parseConfigKey(recKey)?.keySignature === k).length})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Max Notes Filter */}
                      <div className="flex flex-col gap-1">
                        <div className="text-[10px] font-bold text-neutral-400 dark:text-zinc-500 uppercase flex items-center justify-between">
                          <span>Ilość nut</span>
                          {recordFilters.notes !== 'all' && (
                            <button
                              type="button"
                              onClick={() => setRecordFilters(prev => ({ ...prev, notes: 'all' }))}
                              className="text-amber-500 hover:underline lowercase font-semibold cursor-pointer"
                            >
                              reset
                            </button>
                          )}
                        </div>
                        <select
                          value={recordFilters.notes}
                          onChange={(e) => setRecordFilters(prev => ({ ...prev, notes: e.target.value }))}
                          className={`w-full text-xs px-2 py-1.5 rounded-lg border outline-none focus:ring-1 focus:ring-amber-500 transition-colors ${
                            recordFilters.notes !== 'all'
                              ? 'border-amber-500/60 bg-amber-500/10 text-amber-600 dark:text-amber-300 font-bold'
                              : (isDarkMode ? 'bg-zinc-800/90 border-zinc-700 text-zinc-200' : 'bg-white border-neutral-300 text-neutral-800')
                          }`}
                        >
                          <option value="all">Wszystkie (1-5)</option>
                          {[1, 2, 3, 4, 5].map(n => {
                            const count = allValidRecords.filter(([recKey]) => parseConfigKey(recKey)?.rawNotes === n).length;
                            return (
                              <option key={n} value={String(n)} disabled={count === 0}>
                                {n} {n === 1 ? 'nuta' : (n < 5 ? 'nuty' : 'nut')} ({count})
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      {/* Ledger Lines Filter */}
                      <div className="flex flex-col gap-1">
                        <div className="text-[10px] font-bold text-neutral-400 dark:text-zinc-500 uppercase flex items-center justify-between">
                          <span>Linie dodane</span>
                          {recordFilters.ledger !== 'all' && (
                            <button
                              type="button"
                              onClick={() => setRecordFilters(prev => ({ ...prev, ledger: 'all' }))}
                              className="text-amber-500 hover:underline lowercase font-semibold cursor-pointer"
                            >
                              reset
                            </button>
                          )}
                        </div>
                        <select
                          value={recordFilters.ledger}
                          onChange={(e) => setRecordFilters(prev => ({ ...prev, ledger: e.target.value }))}
                          className={`w-full text-xs px-2 py-1.5 rounded-lg border outline-none focus:ring-1 focus:ring-amber-500 transition-colors ${
                            recordFilters.ledger !== 'all'
                              ? 'border-amber-500/60 bg-amber-500/10 text-amber-600 dark:text-amber-300 font-bold'
                              : (isDarkMode ? 'bg-zinc-800/90 border-zinc-700 text-zinc-200' : 'bg-white border-neutral-300 text-neutral-800')
                          }`}
                        >
                          <option value="all">Wszystkie (1-5)</option>
                          {[1, 2, 3, 4, 5].map(l => {
                            const count = allValidRecords.filter(([recKey]) => parseConfigKey(recKey)?.rawLedger === l).length;
                            return (
                              <option key={l} value={String(l)} disabled={count === 0}>
                                {l} {l === 1 ? 'linia' : (l < 5 ? 'linie' : 'linii')} ({count})
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      {/* Accidentals Filter */}
                      <div className="flex flex-col gap-1">
                        <div className="text-[10px] font-bold text-neutral-400 dark:text-zinc-500 uppercase flex items-center justify-between">
                          <span>Znaki</span>
                          {recordFilters.accidentals !== 'all' && (
                            <button
                              type="button"
                              onClick={() => setRecordFilters(prev => ({ ...prev, accidentals: 'all' }))}
                              className="text-amber-500 hover:underline lowercase font-semibold cursor-pointer"
                            >
                              reset
                            </button>
                          )}
                        </div>
                        <select
                          value={recordFilters.accidentals}
                          onChange={(e) => setRecordFilters(prev => ({ ...prev, accidentals: e.target.value }))}
                          className={`w-full text-xs px-2 py-1.5 rounded-lg border outline-none focus:ring-1 focus:ring-amber-500 transition-colors ${
                            recordFilters.accidentals !== 'all'
                              ? 'border-amber-500/60 bg-amber-500/10 text-amber-600 dark:text-amber-300 font-bold'
                              : (isDarkMode ? 'bg-zinc-800/90 border-zinc-700 text-zinc-200' : 'bg-white border-neutral-300 text-neutral-800')
                          }`}
                        >
                          <option value="all">Wszystkie</option>
                          <option value="acc">
                            WŁ (ze znakami) ({allValidRecords.filter(([recKey]) => parseConfigKey(recKey)?.rawAccidentals === 1).length})
                          </option>
                          <option value="noacc">
                            WYŁ (bez znaków) ({allValidRecords.filter(([recKey]) => parseConfigKey(recKey)?.rawAccidentals === 0).length})
                          </option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Training with Selected Records Bar */}
              {(Object.entries(highScores) as [string, number][]).filter(([_, scoreVal]) => scoreVal > 0).length > 0 && (
                <div className={`px-4 py-3 border-b text-xs flex flex-col gap-2.5 ${
                  isPracticeFromRecordsActive
                    ? (isDarkMode ? 'bg-amber-950/25 border-amber-500/30' : 'bg-amber-50 border-amber-200')
                    : (isDarkMode ? 'border-zinc-800 bg-zinc-950/50' : 'border-neutral-100 bg-neutral-50/80')
                }`}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Target className={`w-4 h-4 shrink-0 ${isPracticeFromRecordsActive ? 'text-amber-400 animate-pulse' : 'text-zinc-400'}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-neutral-900 dark:text-zinc-100">
                            Ćwicz wybrane rekordy
                          </span>
                          {isPracticeFromRecordsActive && (
                            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-400 text-black shadow-xs">
                              Aktywny
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-neutral-500 dark:text-zinc-400">
                          Zaznacz rekordy poniżej. Gra co 4 takty będzie losować parametry wyłącznie z tej wybranej puli.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-auto">
                      {isPracticeFromRecordsActive && (
                        <button
                          onClick={() => setIsPracticeFromRecordsActive(false)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-red-500/40 text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                        >
                          Wyłącz tryb
                        </button>
                      )}
                      <button
                        onClick={() => startTrainingSelectedRecords()}
                        disabled={selectedRecordKeysForTraining.filter(k => (highScores[k] || 0) > 0).length === 0}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-md cursor-pointer ${
                          selectedRecordKeysForTraining.filter(k => (highScores[k] || 0) > 0).length > 0
                            ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black active:scale-95 shadow-amber-500/20'
                            : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700'
                        }`}
                        title={
                          selectedRecordKeysForTraining.filter(k => (highScores[k] || 0) > 0).length === 0
                            ? 'Zaznacz przynajmniej jeden rekord z listy poniżej'
                            : 'Przygotuj ćwiczenie z rotacją po zaznaczonych rekordach (rozpoczęcie po naciśnięciu Start)'
                        }
                      >
                        <Play size={13} fill="currentColor" />
                        <span>
                          Ćwicz zaznaczone ({selectedRecordKeysForTraining.filter(k => (highScores[k] || 0) > 0).length})
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Selection helpers: Select all, Deselect, Counter */}
                  <div className="flex items-center justify-between gap-2 text-[11px] pt-1 border-t border-zinc-800/40">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={activeFiltersCount > 0 ? selectFilteredRecordsForTraining : selectAllRecordsForTraining}
                        className="text-amber-500 hover:underline font-semibold cursor-pointer"
                      >
                        {activeFiltersCount > 0 ? `Zaznacz widoczne (${filteredRecords.length})` : 'Zaznacz wszystkie'}
                      </button>
                      <span className="text-zinc-500">•</span>
                      <button
                        onClick={activeFiltersCount > 0 ? deselectFilteredRecordsForTraining : deselectAllRecordsForTraining}
                        className="text-zinc-400 hover:underline font-medium cursor-pointer"
                      >
                        {activeFiltersCount > 0 ? 'Odznacz widoczne' : 'Odznacz wszystkie'}
                      </button>
                    </div>
                    <span className="text-zinc-400 font-mono text-[11px] shrink-0">
                      Wybrano: <strong className="text-amber-400 font-bold">{selectedRecordKeysForTraining.filter(k => (highScores[k] || 0) > 0).length}</strong> z {allValidRecords.length}
                    </span>
                  </div>
                </div>
              )}

              {/* List of records */}
              <div className="p-3 sm:p-4 overflow-y-auto flex-1 custom-scrollbar space-y-1.5">
                {allValidRecords.length === 0 ? (
                  <div className="text-center py-10 flex flex-col items-center justify-center gap-2">
                    <Trophy className={`w-8 h-8 ${isDarkMode ? 'text-zinc-700' : 'text-neutral-300'}`} />
                    <p className={`text-sm ${isDarkMode ? 'text-zinc-400' : 'text-neutral-500'}`}>
                      Brak zapisanych rekordów prędkości.
                    </p>
                    <p className={`text-xs ${isDarkMode ? 'text-zinc-600' : 'text-neutral-400'} max-w-xs`}>
                      Graj z włączonym śledzeniem tempa, aby automatycznie ustanawiać rekordy prędkości dla poszczególnych tonacji i opcji.
                    </p>
                  </div>
                ) : filteredRecords.length === 0 ? (
                  <div className="text-center py-10 flex flex-col items-center justify-center gap-2">
                    <FilterX className="w-8 h-8 text-amber-500/70" />
                    <p className={`text-sm font-bold ${isDarkMode ? 'text-zinc-200' : 'text-neutral-800'}`}>
                      Brak rekordów spełniających wybrane filtry
                    </p>
                    <p className={`text-xs ${isDarkMode ? 'text-zinc-400' : 'text-neutral-500'} max-w-xs`}>
                      Zmień ustawienia filtrów powyżej lub kliknij przycisk poniżej, aby zresetować filtrowanie.
                    </p>
                    <button
                      type="button"
                      onClick={resetRecordFilters}
                      className="mt-2 px-3 py-1.5 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-400 text-black transition-colors cursor-pointer"
                    >
                      Wyczyść filtry ({activeFiltersCount})
                    </button>
                  </div>
                ) : (
                  filteredRecords.map(([key, scoreVal], idx) => {
                    const parsed = parseConfigKey(key);
                      const isCurrentConfig = key === configKey;
                      const isBeatenInSession = sessionBeatenKeys.has(key);
                      const isSelectedForTraining = selectedRecordKeysForTraining.includes(key);

                      return (
                        <div
                          key={key}
                          className={`px-3 py-2 rounded-xl border flex justify-between items-center transition-all gap-2 sm:gap-3 ${
                            isSelectedForTraining
                              ? (isDarkMode ? 'ring-1 ring-amber-500/50 bg-amber-950/20 border-amber-500/40' : 'ring-1 ring-amber-400 bg-amber-50/70 border-amber-300')
                              : isBeatenInSession
                              ? (isDarkMode ? 'bg-emerald-950/20 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'bg-emerald-50/90 border-emerald-300')
                              : isCurrentConfig
                              ? (isDarkMode ? 'bg-amber-950/25 border-amber-500/50' : 'bg-amber-50/80 border-amber-300')
                              : (isDarkMode ? 'bg-zinc-950/40 border-zinc-800/80 hover:bg-zinc-950/80' : 'bg-neutral-50/50 border-neutral-200/80 hover:bg-neutral-50')
                          }`}
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {/* Checkbox for training pool */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleRecordKeyForTraining(key);
                              }}
                              className={`p-0.5 rounded-md transition-colors cursor-pointer shrink-0 ${
                                isSelectedForTraining
                                  ? 'text-amber-500 bg-amber-500/20'
                                  : (isDarkMode ? 'text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800' : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-200')
                              }`}
                              title={isSelectedForTraining ? 'Odznacz z puli treningu' : 'Zaznacz do puli treningu (losowanie co 4 takty)'}
                            >
                              {isSelectedForTraining ? (
                                <CheckSquare size={16} className="text-amber-500" />
                              ) : (
                                <Square size={16} />
                              )}
                            </button>

                            <span className="text-xs font-black px-1.5 py-0.5 rounded-md bg-neutral-200 dark:bg-zinc-800 text-black dark:text-zinc-100 font-mono shrink-0">
                              #{idx + 1}
                            </span>

                            {/* Horizontally aligned details */}
                            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                              <span className="font-bold text-xs sm:text-sm text-neutral-900 dark:text-zinc-100 shrink-0">
                                {formatKeySignatureWithAccidentals(parsed.keySignature)}
                              </span>

                              <span className={`px-1.5 py-0.5 rounded text-[10px] sm:text-[11px] border shrink-0 ${
                                isDarkMode ? 'bg-zinc-800/80 border-zinc-700/80 text-zinc-300' : 'bg-white border-neutral-200 text-neutral-600'
                              }`}>
                                {parsed.maxNotesPerSpawn}
                              </span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] sm:text-[11px] border shrink-0 ${
                                isDarkMode ? 'bg-zinc-800/80 border-zinc-700/80 text-zinc-300' : 'bg-white border-neutral-200 text-neutral-600'
                              }`}>
                                {parsed.ledgerLines}
                              </span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] sm:text-[11px] border shrink-0 ${
                                isDarkMode ? 'bg-zinc-800/80 border-zinc-700/80 text-zinc-300' : 'bg-white border-neutral-200 text-neutral-600'
                              }`}>
                                {parsed.useAccidentals}
                              </span>

                              {isSelectedForTraining && (
                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-500 border border-amber-500/40 shrink-0">
                                  Do treningu
                                </span>
                              )}
                              {isCurrentConfig && (
                                <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-400 text-black shadow-xs shrink-0">
                                  Aktualne {initialRank && initialRank !== idx + 1 ? `(#${initialRank} -> #${idx + 1})` : ''}
                                </span>
                              )}
                              {isBeatenInSession && (
                                <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-500 text-black animate-pulse shrink-0">
                                  Pobity w tej sesji!
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                            <div className="flex items-baseline gap-1 text-right">
                              <span className="text-[9px] uppercase font-bold text-neutral-400 dark:text-zinc-500 tracking-wider">
                                Rekord:
                              </span>
                              <span className={`text-xs sm:text-sm font-mono font-black ${
                                isBeatenInSession
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : (isDarkMode ? 'text-zinc-200' : 'text-neutral-800')
                              }`}>
                                {scoreVal.toFixed(2)} NPM
                              </span>
                            </div>

                            {/* Button to apply parameters */}
                            {isCurrentConfig ? (
                              <button
                                onClick={() => setShowRecordsModal(false)}
                                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                  isDarkMode
                                    ? 'bg-amber-950/40 text-amber-400 hover:bg-amber-900/50'
                                    : 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                                }`}
                                title="Te parametry są aktualnie wybrane (kliknij, aby zamknąć)"
                              >
                                <CheckCircle2 size={16} />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleApplyRecordConfig(key)}
                                className={`p-1.5 rounded-lg transition-colors cursor-pointer active:scale-95 ${
                                  isDarkMode
                                    ? 'hover:bg-blue-950/60 text-zinc-400 hover:text-blue-400'
                                    : 'hover:bg-blue-50 text-neutral-400 hover:text-blue-600'
                                }`}
                                title="Ustaw te parametry i ćwicz"
                              >
                                <Play size={16} fill="currentColor" />
                              </button>
                            )}

                            <button
                              onClick={() => handleDeleteRecord(key)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                isDarkMode ? 'hover:bg-red-950/50 text-zinc-500 hover:text-red-400' : 'hover:bg-red-50 text-neutral-400 hover:text-red-600'
                              }`}
                              title="Usuń ten rekord"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>

              {/* Footer */}
              {(Object.entries(highScores) as [string, number][]).filter(([_, scoreVal]) => scoreVal > 0).length > 0 && (
                <div className={`p-3 border-t flex items-center justify-end ${
                  isDarkMode ? 'border-zinc-800 bg-zinc-950/20' : 'border-neutral-100 bg-neutral-50/20'
                }`}>
                  {showClearRecordsConfirm ? (
                    <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto justify-between sm:justify-end animate-in fade-in slide-in-from-bottom-1 duration-200">
                      <span className="text-xs font-bold text-red-600 dark:text-red-400">
                        Czy na pewno chcesz usunąć wszystkie rekordy?
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleClearAllRecords}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600 text-white hover:bg-red-700 transition-colors shadow-xs"
                        >
                          Tak, usuń
                        </button>
                        <button
                          onClick={() => setShowClearRecordsConfirm(false)}
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
                      onClick={() => setShowClearRecordsConfirm(true)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-500/10 transition-all border border-transparent hover:border-red-500/20"
                    >
                      Usuń wszystkie rekordy
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Audio & MIDI Input Modal */}
      <AnimatePresence>
        {showAudioInputModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAudioInputModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-xs"
            />

            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className={`relative z-10 w-full max-w-lg p-6 rounded-2xl border shadow-2xl transition-colors max-h-[88vh] overflow-y-auto ${
                isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-neutral-200 text-neutral-900'
              }`}
            >
              <div className="flex items-center justify-between pb-4 border-b border-zinc-800/20 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
                    <Mic size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-base">Słuchanie & Kalibracja Instrumentu</h3>
                    <p className="text-xs text-neutral-500 dark:text-zinc-400">Mikrofon, USB MIDI i dopasowanie dźwięków</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAudioInputModal(false)}
                  className={`p-1.5 rounded-full transition-colors ${
                    isDarkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-neutral-100 text-neutral-500'
                  }`}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-4 space-y-4">
                {/* Microphone Section */}
                <div className={`p-4 rounded-xl border transition-all ${
                  audioInputStatus.isMicActive
                    ? (isDarkMode ? 'bg-emerald-950/30 border-emerald-500/40' : 'bg-emerald-50/80 border-emerald-300')
                    : (isDarkMode ? 'bg-zinc-950/40 border-zinc-800' : 'bg-neutral-50 border-neutral-200')
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {audioInputStatus.isMicActive ? <Mic size={18} className="text-emerald-500" /> : <MicOff size={18} className="text-neutral-400" />}
                      <span className="font-semibold text-sm">Mikrofon (Detekcja dźwięku)</span>
                    </div>

                    <button
                      onClick={async () => {
                        if (audioInputStatus.isMicActive) {
                          audioInputService.stopMicrophone();
                        } else {
                          await audioInputService.startMicrophone();
                        }
                      }}
                      className={`px-3 py-1 text-xs font-bold rounded-full transition-all ${
                        audioInputStatus.isMicActive
                          ? 'bg-red-500 text-white hover:bg-red-600'
                          : 'bg-emerald-600 text-white hover:bg-emerald-700'
                      }`}
                    >
                      {audioInputStatus.isMicActive ? 'Wyłącz' : 'Włącz mikrofon'}
                    </button>
                  </div>

                  <p className="text-xs text-neutral-500 dark:text-zinc-400 leading-relaxed mb-3">
                    Graj na prawdziwym pianinie lub keyboardzie. Mikrofon wykryje częstotliwość i automatycznie rozpozna zagraną nutę.
                  </p>

                  {audioInputStatus.micError && (
                    <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-xs mb-2">
                      ⚠️ {audioInputStatus.micError}
                    </div>
                  )}

                  {audioInputStatus.isMicActive && (
                    <div className="space-y-2 pt-2 border-t border-emerald-500/20">
                      {/* Audio Level Visualizer Bar */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase text-neutral-400 dark:text-zinc-500">Sygnał:</span>
                        <div className="flex-1 h-2 rounded-full bg-neutral-200 dark:bg-zinc-800 overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 transition-all duration-75"
                            style={{ width: `${Math.min(100, audioInputStatus.volumeLevel * 100)}%` }}
                          />
                        </div>
                      </div>

                      {/* Live Pitch Feedback */}
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-neutral-500 dark:text-zinc-400">Wykryta nuta surowa:</span>
                        <span className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                          {audioInputStatus.detectedPitch
                            ? `${audioInputStatus.detectedPitch} (${audioInputStatus.detectedFrequency} Hz)`
                            : 'Graj dźwięk...'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-neutral-500 dark:text-zinc-400">Nuta po kalibracji:</span>
                        <span className="font-mono font-black text-sm text-blue-600 dark:text-blue-400">
                          {audioInputStatus.detectedPitch
                            ? remapPitch(audioInputStatus.detectedPitch)
                            : '—'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* MIDI USB Section */}
                <div className={`p-4 rounded-xl border transition-all ${
                  audioInputStatus.isMidiConnected
                    ? (isDarkMode ? 'bg-blue-950/30 border-blue-500/40' : 'bg-blue-50/80 border-blue-300')
                    : (isDarkMode ? 'bg-zinc-950/40 border-zinc-800' : 'bg-neutral-50 border-neutral-200')
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Radio size={18} className={audioInputStatus.isMidiConnected ? 'text-blue-500' : 'text-neutral-400'} />
                    <span className="font-semibold text-sm">Keyboard / Pianino USB MIDI</span>
                  </div>

                  <p className="text-xs text-neutral-500 dark:text-zinc-400 leading-relaxed mb-3">
                    Podłącz cyfrowe pianino przez kabel USB. Przeglądarka automatycznie odczyta wciskane klawisze bez opóźnień.
                  </p>

                  <div className="flex items-center justify-between text-xs pt-2 border-t border-zinc-800/20 dark:border-zinc-800">
                    <span className="text-neutral-500 dark:text-zinc-400">Stan połączenia:</span>
                    <span className={`font-semibold ${audioInputStatus.isMidiConnected ? 'text-blue-600 dark:text-blue-400' : 'text-neutral-400'}`}>
                      {audioInputStatus.isMidiConnected
                        ? `🔌 Podłączono: ${audioInputStatus.midiDeviceName || 'MIDI Device'}`
                        : 'Nie wykryto urządzenia USB MIDI'}
                    </span>
                  </div>
                </div>

                {/* Instrument Sound Calibration & Remapping Section */}
                <div className={`p-4 rounded-xl border transition-all ${
                  transposeOffset !== 0 || Object.keys(customPitchMap).length > 0
                    ? (isDarkMode ? 'bg-amber-950/20 border-amber-500/40' : 'bg-amber-50/80 border-amber-300')
                    : (isDarkMode ? 'bg-zinc-950/40 border-zinc-800' : 'bg-neutral-50 border-neutral-200')
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal size={18} className={transposeOffset !== 0 || Object.keys(customPitchMap).length > 0 ? "text-amber-500" : "text-neutral-400"} />
                      <span className="font-semibold text-sm">Kalibracja i Remapowanie Dźwięków</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setShowCalibrationHelp(prev => !prev)}
                        className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold transition-all border ${
                          showCalibrationHelp
                            ? (isDarkMode ? 'bg-blue-950/60 border-blue-500/60 text-blue-300' : 'bg-blue-100 border-blue-300 text-blue-700')
                            : (isDarkMode ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200' : 'bg-neutral-100 border-neutral-300 text-neutral-600 hover:text-neutral-900')
                        }`}
                        title="Pokaż lub ukryj podpowiedź jak skalibrować dźwięki"
                      >
                        <Lightbulb size={13} className={showCalibrationHelp ? "text-amber-400 fill-amber-400/30" : ""} />
                        <span>Instrukcja</span>
                        {showCalibrationHelp ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                      {(transposeOffset !== 0 || Object.keys(customPitchMap).length > 0) && (
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                          AKTYWNA
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-neutral-500 dark:text-zinc-400 leading-relaxed mb-3">
                    Jeśli dźwięki z Twojego pianina nie pasują do nut w aplikacji (np. wyemitowany dźwięk wskazuje inną oktawę lub ton), ustaw przesunięcie lub przypisz klawisze ręcznie.
                  </p>

                  {/* Step-by-Step Calibration Help Guide Box */}
                  <AnimatePresence>
                    {showCalibrationHelp && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className={`overflow-hidden mb-3.5 rounded-xl border ${
                          isDarkMode
                            ? 'bg-blue-950/25 border-blue-500/30 text-blue-100'
                            : 'bg-blue-50/90 border-blue-200 text-neutral-800 shadow-xs'
                        }`}
                      >
                        <div className="p-3.5 space-y-2.5">
                          <div className="flex items-center gap-2 pb-2 border-b border-blue-500/20">
                            <Lightbulb size={16} className="text-amber-500 shrink-0" />
                            <h4 className="font-bold text-xs text-blue-700 dark:text-blue-300">
                              Jak łatwo skalibrować dźwięki instrumentu?
                            </h4>
                          </div>

                          <div className="space-y-2 text-xs leading-relaxed">
                            {/* Step 1 */}
                            <div className="flex items-start gap-2">
                              <span className="font-mono font-bold text-[11px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5">
                                1
                              </span>
                              <div>
                                <strong className="text-neutral-900 dark:text-zinc-100">Włącz mikrofon i zagraj nutę:</strong>
                                <p className="text-neutral-600 dark:text-zinc-300 text-[11px] mt-0.5">
                                  Kliknij <em>„Włącz mikrofon”</em> powyżej i zagraj dźwięk na pianinie. Zobacz pole <strong>„Wykryta nuta surowa”</strong> (np. grasz C4, a mikrofon widzi C3 lub C5).
                                </p>
                              </div>
                            </div>

                            {/* Step 2 */}
                            <div className="flex items-start gap-2">
                              <span className="font-mono font-bold text-[11px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5">
                                2
                              </span>
                              <div className="space-y-1.5">
                                <strong className="text-neutral-900 dark:text-zinc-100">Wybierz sposób kalibracji:</strong>
                                
                                <div className={`p-2 rounded-lg border text-[11px] ${
                                  isDarkMode ? 'bg-zinc-900/60 border-zinc-800' : 'bg-white/90 border-blue-100'
                                }`}>
                                  <span className="font-bold text-amber-600 dark:text-amber-400 block mb-0.5">
                                    🎹 Opcja A: Całe pianino jest przesunięte o oktawę
                                  </span>
                                  <p className="text-neutral-600 dark:text-zinc-400">
                                    Kliknij <strong>-12 (oktawa)</strong> w Transpozycji ogólnej, jeśli aplikacja wykrywa dźwięki za wysoko, lub <strong>+12</strong> jeśli za nisko.
                                  </p>
                                </div>

                                <div className={`p-2 rounded-lg border text-[11px] ${
                                  isDarkMode ? 'bg-zinc-900/60 border-zinc-800' : 'bg-white/90 border-blue-100'
                                }`}>
                                  <span className="font-bold text-blue-600 dark:text-blue-400 block mb-0.5">
                                    🎯 Opcja B: Tylko pojedynczy klawisz jest mylony (np. B2 wykrywane jako B3)
                                  </span>
                                  <ol className="list-decimal list-inside space-y-0.5 text-neutral-600 dark:text-zinc-400">
                                    <li>Kliknij niebieski przycisk <strong>„🎙️ Uchwyć z gry”</strong> (zaświeci się na czerwono).</li>
                                    <li>Zagraj problematyczny klawisz na pianinie (ustawi się w lewym polu).</li>
                                    <li>W prawym polu wybierz nutę, którą ten klawisz ma faktycznie oznaczać (np. <strong>B2</strong>).</li>
                                    <li>Kliknij <strong>„+ Dodaj”</strong>.</li>
                                  </ol>
                                </div>
                              </div>
                            </div>

                            {/* Step 3 */}
                            <div className="flex items-start gap-2">
                              <span className="font-mono font-bold text-[11px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5">
                                3
                              </span>
                              <div>
                                <strong className="text-neutral-900 dark:text-zinc-100">Sprawdź rezultat:</strong>
                                <p className="text-neutral-600 dark:text-zinc-300 text-[11px] mt-0.5">
                                  Zagraj klawisz ponownie – w polu <strong>„Nuta po kalibracji”</strong> oraz w <strong>„Podglądzie na żywo”</strong> pojawi się już właściwa nuta, która trafi do gry.
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-blue-500/15 flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-zinc-400">
                            <Radio size={13} className="text-blue-500 shrink-0" />
                            <span>
                              <strong>Porada MIDI:</strong> Jeśli posiadasz keyboard/pianino ze złączem USB, podłącz je kablem USB do urządzenia — komunikacja cyfrowa nie wymaga mikrofonu ani kalibracji.
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* 1. Global Transpose Offset */}
                  <div className={`p-3 rounded-xl border mb-3 ${
                    isDarkMode ? 'bg-zinc-900/80 border-zinc-800' : 'bg-white border-neutral-200 shadow-xs'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold flex items-center gap-1.5 flex-wrap">
                        <span>Transpozycja ogólna (półtony):</span>
                        <span className={`font-mono text-xs px-2 py-0.5 rounded ${
                          transposeOffset === 0
                            ? (isDarkMode ? 'bg-zinc-800 text-zinc-400' : 'bg-neutral-100 text-neutral-600')
                            : 'bg-amber-500 text-white font-bold'
                        }`}>
                          {transposeOffset > 0 ? `+${transposeOffset}` : transposeOffset} {transposeOffset === 0 ? '(Brak)' : (Math.abs(transposeOffset) === 12 ? '(1 oktawa)' : 'półtonów')}
                        </span>
                      </label>
                      {transposeOffset !== 0 && (
                        <button
                          onClick={() => setTransposeOffset(0)}
                          className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
                        >
                          <RotateCcw size={12} /> Resetuj
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {[-12, -2, -1, 0, 1, 2, 12].map(offset => (
                        <button
                          key={offset}
                          onClick={() => setTransposeOffset(offset)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${
                            transposeOffset === offset
                              ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                              : (isDarkMode
                                  ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                                  : 'bg-neutral-100 border-neutral-200 text-neutral-700 hover:bg-neutral-200')
                          }`}
                        >
                          {offset === 0 ? '0' : (offset > 0 ? `+${offset}` : offset)}
                          {Math.abs(offset) === 12 ? ' (oktawa)' : ''}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 2. Custom Key/Note Mapping Rules */}
                  <div className={`p-3 rounded-xl border mb-3 ${
                    isDarkMode ? 'bg-zinc-900/80 border-zinc-800' : 'bg-white border-neutral-200 shadow-xs'
                  }`}>
                    <h4 className="text-xs font-bold mb-2">Ręczne przypisanie konkretnej nuty</h4>
                    
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-3">
                      {/* Source/Detected Note */}
                      <div className="flex-1 flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-neutral-500 dark:text-zinc-400">Słychać z pianina:</span>
                          <button
                            onClick={() => setIsCapturingInput(prev => !prev)}
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-all ${
                              isCapturingInput
                                ? 'bg-red-500 text-white animate-pulse'
                                : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20'
                            }`}
                          >
                            {isCapturingInput ? '🔴 Nasłuchuję...' : '🎙️ Uchwyć z gry'}
                          </button>
                        </div>
                        <select
                          value={calibrationDetectedInput}
                          onChange={(e) => setCalibrationDetectedInput(e.target.value)}
                          className={`text-xs px-2.5 py-1.5 rounded-lg border font-mono font-bold focus:outline-hidden ${
                            isDarkMode ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-neutral-50 border-neutral-300 text-neutral-900'
                          }`}
                        >
                          {ALL_CALIBRATION_PITCHES.map(p => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </div>

                      <span className="text-xs font-bold text-center sm:pt-4 text-amber-500">➔</span>

                      {/* Target/Expected Note */}
                      <div className="flex-1 flex flex-col gap-1">
                        <span className="text-[10px] font-semibold text-neutral-500 dark:text-zinc-400">Oznacza w aplikacji:</span>
                        <select
                          value={calibrationTargetOutput}
                          onChange={(e) => setCalibrationTargetOutput(e.target.value)}
                          className={`text-xs px-2.5 py-1.5 rounded-lg border font-mono font-bold focus:outline-hidden ${
                            isDarkMode ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-neutral-50 border-neutral-300 text-neutral-900'
                          }`}
                        >
                          {ALL_CALIBRATION_PITCHES.map(p => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </div>

                      <button
                        onClick={handleAddCalibrationRule}
                        className="sm:self-end px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs transition-all shadow-xs flex items-center justify-center gap-1 shrink-0 mt-1 sm:mt-0"
                      >
                        <Plus size={14} /> Dodaj
                      </button>
                    </div>

                    {/* List of mapped rules */}
                    {Object.keys(customPitchMap).length > 0 ? (
                      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                        {Object.entries(customPitchMap).map(([detected, target]) => (
                          <div
                            key={detected}
                            className={`flex items-center justify-between p-2 rounded-lg text-xs font-mono border ${
                              isDarkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-neutral-50 border-neutral-200'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-neutral-600 dark:text-zinc-300">{detected}</span>
                              <span className="text-amber-500 font-bold">➔</span>
                              <span className="font-extrabold text-blue-600 dark:text-blue-400">{target}</span>
                            </div>
                            <button
                              onClick={() => handleRemoveCalibrationRule(detected)}
                              className="p-1 rounded text-neutral-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                              title="Usuń tę regułę"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-neutral-400 dark:text-zinc-500 italic">
                        Brak indywidualnych reguł mapowania.
                      </p>
                    )}
                  </div>

                  {/* Live test readout */}
                  <div className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                    isDarkMode ? 'bg-zinc-950/60 border-zinc-800' : 'bg-neutral-100/70 border-neutral-200'
                  }`}>
                    <span className="text-neutral-500 dark:text-zinc-400 font-medium">Podgląd na żywo:</span>
                    <div className="flex items-center gap-2 font-mono font-bold">
                      <span className="text-neutral-600 dark:text-zinc-400">
                        {audioInputStatus.detectedPitch || '—'}
                      </span>
                      <span className="text-amber-500">➔</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-extrabold text-sm">
                        {audioInputStatus.detectedPitch ? remapPitch(audioInputStatus.detectedPitch) : '—'}
                      </span>
                    </div>
                  </div>

                  {/* Reset all calibration */}
                  {(transposeOffset !== 0 || Object.keys(customPitchMap).length > 0) && (
                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={handleResetCalibration}
                        className="text-xs text-red-500 hover:underline flex items-center gap-1 font-semibold"
                      >
                        <RotateCcw size={12} /> Wyczyść całą kalibrację
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowAudioInputModal(false)}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-all shadow-md"
                >
                  Gotowe
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Offline & PWA Installation Modal */}
        {showOfflineModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`w-full max-w-lg rounded-2xl shadow-2xl p-6 border max-h-[90vh] overflow-y-auto ${
                isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-neutral-200 text-neutral-900'
              }`}
            >
              <div className="flex items-center justify-between pb-4 border-b border-neutral-200 dark:border-zinc-800">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-blue-600/10 text-blue-500 border border-blue-500/20">
                    <Download size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-base">Praca Offline i Instalacja PWA</h3>
                    <p className="text-xs text-neutral-500 dark:text-zinc-400">
                      Używaj aplikacji bez dostępu do internetu
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowOfflineModal(false)}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-zinc-200 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-5 space-y-4">
                {/* Status Box */}
                <div className={`p-4 rounded-xl border flex items-center justify-between ${
                  !isOnline
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${!isOnline ? 'bg-amber-500/20' : 'bg-emerald-500/20'}`}>
                      {!isOnline ? <WifiOff size={18} /> : <Wifi size={18} />}
                    </div>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider">
                        {!isOnline ? 'Aktualny stan: Tryb Offline' : 'Aktualny stan: Online'}
                      </div>
                      <div className="text-xs opacity-90">
                        Pamięć podręczna Service Worker jest aktywna. Aplikacja działa bez internetu.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Direct One-Click Install Button if supported by browser */}
                {deferredPrompt && (
                  <div className="p-4 rounded-xl bg-gradient-to-r from-blue-600/15 via-blue-500/10 to-indigo-600/15 border border-blue-500/30">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-bold text-sm text-blue-700 dark:text-blue-300">
                          Zainstaluj aplikację na urządzeniu
                        </div>
                        <div className="text-xs text-neutral-600 dark:text-zinc-400">
                          Dodaj skrót na pulpicie i uruchamiaj w osobnym oknie bez przeglądarki.
                        </div>
                      </div>
                      <button
                        onClick={handleInstallPWA}
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all shrink-0 cursor-pointer active:scale-95"
                      >
                        Zainstaluj teraz
                      </button>
                    </div>
                  </div>
                )}

                {isInstalled && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300 font-semibold">
                    <CheckCircle2 size={16} />
                    Aplikacja jest uruchomiona w trybie autonomicznym (zainstalowana PWA).
                  </div>
                )}

                {/* Installation Guides for platforms */}
                <div className="space-y-2.5">
                  <div className="text-xs font-bold text-neutral-500 dark:text-zinc-400 uppercase tracking-wider">
                    Jak zainstalować lub otworzyć offline:
                  </div>

                  {/* Desktop */}
                  <div className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
                    isDarkMode ? 'bg-zinc-950/40 border-zinc-800' : 'bg-neutral-50 border-neutral-200'
                  }`}>
                    <div className="flex items-center gap-2 font-bold text-sm text-neutral-800 dark:text-zinc-200">
                      <Laptop size={16} className="text-blue-500" />
                      <span>Komputer (Chrome / Edge / Brave / Opera)</span>
                    </div>
                    <p className="text-neutral-600 dark:text-zinc-400 leading-relaxed">
                      1. Na pasku adresu przeglądarki (po prawej stronie) kliknij ikonę <strong>Instaluj aplikację</strong> (monitor ze strzałką w dół).<br />
                      2. Lub w menu przeglądarki wybierz <em>„Zapisz i udostępnij”</em> ➔ <em>„Zainstaluj aplikację Piano Note Master”</em>.<br />
                      3. Skrót pojawi się w menu Start i na pulpicie. Aplikacja będzie uruchamiać się bez internetu.
                    </p>
                  </div>

                  {/* Android */}
                  <div className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
                    isDarkMode ? 'bg-zinc-950/40 border-zinc-800' : 'bg-neutral-50 border-neutral-200'
                  }`}>
                    <div className="flex items-center gap-2 font-bold text-sm text-neutral-800 dark:text-zinc-200">
                      <Smartphone size={16} className="text-emerald-500" />
                      <span>Smartfon / Tablet Android (Chrome / Edge)</span>
                    </div>
                    <p className="text-neutral-600 dark:text-zinc-400 leading-relaxed">
                      Dotknij ikony menu (<strong>⋮</strong>) w prawym górnym rogu ➔ wybierz <strong>„Zainstaluj aplikację”</strong> lub <strong>„Dodaj do ekranu głównego”</strong>.
                    </p>
                  </div>

                  {/* iOS Safari */}
                  <div className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
                    isDarkMode ? 'bg-zinc-950/40 border-zinc-800' : 'bg-neutral-50 border-neutral-200'
                  }`}>
                    <div className="flex items-center gap-2 font-bold text-sm text-neutral-800 dark:text-zinc-200">
                      <Smartphone size={16} className="text-indigo-500" />
                      <span>iPhone / iPad (Przeglądarka Safari)</span>
                    </div>
                    <p className="text-neutral-600 dark:text-zinc-400 leading-relaxed">
                      1. W dolnym pasku przeglądarki Safari kliknij przycisk <strong>Udostępnij</strong> (kwadrat ze strzałką w górę <strong>⎋</strong>).<br />
                      2. Przewiń w dół i wybierz opcję <strong>„Do ekranu początkowego”</strong> (Add to Home Screen).
                    </p>
                  </div>

                  {/* ZIP export */}
                  <div className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
                    isDarkMode ? 'bg-zinc-950/40 border-zinc-800' : 'bg-neutral-50 border-neutral-200'
                  }`}>
                    <div className="flex items-center gap-2 font-bold text-sm text-neutral-800 dark:text-zinc-200">
                      <Info size={16} className="text-amber-500" />
                      <span>Pobranie jako pliki ZIP na własny komputer</span>
                    </div>
                    <p className="text-neutral-600 dark:text-zinc-400 leading-relaxed">
                      Możesz w każdej chwili pobrać całe archiwum przez menu <strong>Export ➔ ZIP</strong> w Google AI Studio i uruchomić poleceniem <code className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-zinc-800 font-mono text-[11px]">npm run dev</code>.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowOfflineModal(false)}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-all shadow-md cursor-pointer"
                >
                  Zamknij
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Practice Mode Locked Dialog */}
        {showPracticeModeLockDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className={`w-full max-w-md rounded-2xl p-6 shadow-2xl border text-center flex flex-col items-center gap-4 ${
                isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-100 shadow-black/80' : 'bg-white border-neutral-200 text-neutral-900 shadow-neutral-300'
              }`}
            >
              <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
                <Target size={26} className="animate-pulse" />
              </div>

              <div>
                <h3 className="text-base sm:text-lg font-black tracking-tight mb-2">
                  Tryb ćwiczeń wybranych rekordów jest aktywny
                </h3>
                <p className={`text-xs sm:text-sm leading-relaxed ${isDarkMode ? 'text-zinc-400' : 'text-neutral-600'}`}>
                  Aktualnie trwa ćwiczenie wybranych rekordów (parametry losują się automatycznie co 4 takty z wybranej puli).
                  <br /><br />
                  Aby ręcznie zmienić parametry (tonację, znaki przygodne, linie dodane lub ilość nut), musisz najpierw <strong>wyłączyć tryb ćwiczeń wybranych rekordów</strong>.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full pt-2">
                <button
                  type="button"
                  onClick={handleDisablePracticeFromRecords}
                  className="w-full sm:flex-1 py-2.5 px-4 rounded-xl text-xs font-black bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-lg shadow-red-600/20 transition-all cursor-pointer active:scale-95"
                >
                  Wyłącz tryb ćwiczeń
                </button>
                <button
                  type="button"
                  onClick={() => setShowPracticeModeLockDialog(false)}
                  className={`w-full sm:flex-1 py-2.5 px-4 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                    isDarkMode ? 'border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300' : 'border-neutral-300 bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
                  }`}
                >
                  Zostaw włączony
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

