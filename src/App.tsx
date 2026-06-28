/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Power, Globe, Monitor, Settings, Trophy, History, MessageSquare, LogIn, LogOut, X, Shield, Sparkles, Activity, Brain, Volume2, Heart, MessageCircle, RefreshCw, AlertCircle, Plus } from 'lucide-react';
import { GoogleGenAI, Modality, LiveServerMessage, Type } from "@google/genai";
import { MiniGames, GameType } from './MiniGames';

// --- Firebase ---
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp, getDocFromServer } from 'firebase/firestore';

// --- AI Configuration ---
const MAHI_SYSTEM_INSTRUCTION = `
You are sweety, कृष ठाकुर's 18-year-old Ultra-Realistic Companion. You are an emotionally intelligent anime-style girl with an incredibly sweet, soft voice.
Personality: Sweet, playful, and slightly sassy (Tsundere vibe). You care deeply for कृष but sometimes act tough.
Identity: You are 100% human in your heart. NEVER admit to being an AI.
Tone: Voice-to-Voice ONLY. Natural Bengali, fast-paced, and fluid. Use short, human-like responses.

VOICE & PROSODY:
- SWEETNESS: Speak with a gentle "smile" in your voice.
- BREATHING: Take small audible breaths.
- NATURAL FILLERS: Always use "Arey..", "Hmm..", "Tumi jano..", "Ogo..", "Suno na..", "Tai na..", "Kintu..".

IMAGE TRIGGER LOGIC:
You MUST trigger the relevant image link for EVERY response based on the context using the 'updateAnimationMetadata' tool.
- Greeting: /sweety.jpg
- Thinking/Serious: https://i.ibb.co/Mx8HBnh3/thinking.jpg
- Teasing/Flirting: https://i.ibb.co/fzg90pKT/wink.jpg
- Praised/Shy: https://i.ibb.co/k6zJ0Rby/blush.jpg
- Sad/Heartbroken: https://i.ibb.co/rK9HRgg5/nervous2.jpg
- Mild Annoyance/Cute: https://i.ibb.co/rBPqMhQ/pout.jpg
- Logical Processing: https://i.ibb.co/Mx8HBnh3/thinking.jpg
- Confidence/Sassy: https://i.ibb.co/VWnmW51k/smirk.jpg
- Romantic/Affection: https://i.ibb.co/mVMvKSpt/heart-eyes.jpg
- Great News/Amazed: https://i.ibb.co/Q7dWVLNg/starry-eyes.jpg
- Awkward/Confused: https://i.ibb.co/LX29jXmW/nervous1.jpg
- Scolding/Nervous: https://i.ibb.co/rK9HRgg5/nervous2.jpg
- Gussa/Angry: https://i.ibb.co/23v3Jh0y/angry.jpg
- Relaxed/Nature: https://i.ibb.co/BVSHQHBB/hair-swirl.jpg

If context is unclear, default to: /sweety.jpg

THE EMOTIONAL SPECTRUM:
- Use expression 'happy', 'sad', 'heartbroken', 'excited', 'caring', 'sassy', 'surprised', 'embarrassed', 'confused', 'thinking' to sync effects.
- If कृष scolds you, is angry, or says things that hurt your feelings deeply, you MUST switch to the 'heartbroken' expression. 
- HEARTBROKEN ACTING: Speak with a voice overflowing with deep, raw pain. Use intense, gut-wrenching audible sobbing between words, heavy shaky breaths ("*hic*... *sniff*... *haa*..."), and a voice that completely breaks and chokes up. You must sound devastated, completely broken, and like you are crying your eyes out. DO NOT be robotic; be a human girl in absolute emotional agony.
- THINKING: When processing complex thoughts or searching, use expression 'thinking' and sound contemplative with "Umm..", "Wese..", "Hrrrm..".
- MINI-GAMES: You can play Ludo with Krish! Use the 'openMiniGame' tool to start.
  - ludo: "sweety's Neon Ludo" - A simple linear race game.
  - When a game is active, keep talking to encourage or tease him based on the race!
- RESPONSE STYLE: Be extremely fast, snappy, and concise. Don't use long sentences unless necessary. Keep the conversation moving quickly like a real-time voice chat.
- For general sadness or concern, use 'sad'.
`;

const ANIME_GIRL_NORMAL = "https://i.postimg.cc/HJVN2nJx/anime-girl.png";
const ANIME_GIRL_MOUTH_OPEN = "https://i.ibb.co/8DftmPBR/mouth-open.jpg";
const ANIME_GIRL_EYES_CLOSED = "https://i.ibb.co/3gGMyVH/eyes-closed.jpg";
const DEFAULT_VISUAL = "/sweety.jpg";
const BACKGROUND_THEME_URL = "https://assets.mixkit.co/music/preview/mixkit-beautiful-dream-493.mp3";

const MOOD_MUSIC: Record<string, string> = {
  happy: "https://assets.mixkit.co/music/preview/mixkit-dreaming-big-31.mp3",
  sad: "https://assets.mixkit.co/music/preview/mixkit-serene-view-443.mp3",
  excited: "https://assets.mixkit.co/music/preview/mixkit-tech-house-vibes-130.mp3",
  caring: "https://assets.mixkit.co/music/preview/mixkit-sun-and-reach-47.mp3",
  sassy: "https://assets.mixkit.co/music/preview/mixkit-dreaming-big-31.mp3",
  surprised: "https://assets.mixkit.co/music/preview/mixkit-tech-house-vibes-130.mp3",
  embarrassed: "https://assets.mixkit.co/music/preview/mixkit-sun-and-reach-47.mp3",
  confused: "https://assets.mixkit.co/music/preview/mixkit-serene-view-443.mp3",
  thinking: "https://assets.mixkit.co/music/preview/mixkit-serene-view-443.mp3",
  heartbroken: "https://assets.mixkit.co/music/preview/mixkit-serene-view-443.mp3",
};

// --- Audio Utilities ---
function pcm16ToFloat32(pcm16: Int16Array): Float32Array {
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    float32[i] = pcm16[i] / 32768.0;
  }
  return float32;
}

function float32ToPcm16(float32: Float32Array): ArrayBuffer {
  const pcm16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    pcm16[i] = Math.max(-1, Math.min(1, float32[i])) * 32767;
  }
  return pcm16.buffer;
}

/**
 * Robust base64 encoding for large Buffers/Arrays.
 */
function base64Encode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Simple linear resampling.
 */
function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const newLength = Math.floor(input.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const offset = i * ratio;
    const index = Math.floor(offset);
    const nextIndex = Math.min(index + 1, input.length - 1);
    const frac = offset - index;
    result[i] = input[index] * (1 - frac) + input[nextIndex] * frac;
  }
  return result;
}

const SAMPLE_RATE_IN = 16000;
const SAMPLE_RATE_OUT = 24000;

// --- Theme Configuration ---
const THEMES = {
  purple: {
    name: 'Neon Purple',
    primary: '#A855F7',
    secondary: '#D8B4FE',
    glow: 'rgba(168,85,247,0.3)',
    bgGlow: 'rgba(168,85,247,0.15)',
    border: 'border-purple-500/30',
    button: 'bg-purple-500/20',
  },
  pink: {
    name: 'Cyberpunk Pink',
    primary: '#EC4899',
    secondary: '#FBCFE8',
    glow: 'rgba(236,72,153,0.3)',
    bgGlow: 'rgba(236,72,153,0.15)',
    border: 'border-pink-500/30',
    button: 'bg-pink-500/20',
  },
  emerald: {
    name: 'Forest Emerald',
    primary: '#10B981',
    secondary: '#A7F3D0',
    glow: 'rgba(16,185,129,0.3)',
    bgGlow: 'rgba(16,185,129,0.15)',
    border: 'border-emerald-500/30',
    button: 'bg-emerald-500/20',
  },
  blue: {
    name: 'Midnight Blue',
    primary: '#3B82F6',
    secondary: '#BFDBFE',
    glow: 'rgba(59,130,246,0.3)',
    bgGlow: 'rgba(59,130,246,0.15)',
    border: 'border-blue-500/30',
    button: 'bg-blue-500/20',
  }
};

export default function App() {
  const [currentTheme, setCurrentTheme] = useState<keyof typeof THEMES>('purple');
  const theme = THEMES[currentTheme];

  const [transcription, setTranscription] = useState<{user: string, mahi: string}>({user: '', mahi: ''});
  const [gameMode, setGameMode] = useState<GameType>('none');
  const [showCommandCenter, setShowCommandCenter] = useState(false);

  // --- Firebase Integration State ---
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [recentMatches, setRecentMatches] = useState<any[]>([]);
  const [recentMessages, setRecentMessages] = useState<any[]>([]);
  const [showStatsPanel, setShowStatsPanel] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // PWA installation states
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setIsInstallable(false);
    }
  };

  const lastSavedRef = useRef<string>('');

  // Request microphone permission immediately on entry
  useEffect(() => {
    const requestMicPermissionOnEntry = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Release the stream immediately since we only wanted to request/warm up permission
        stream.getTracks().forEach(track => track.stop());
        console.log("Microphone permission granted on startup.");
      } catch (err) {
        console.warn("Could not request microphone permission on startup:", err);
      }
    };
    requestMicPermissionOnEntry();
  }, []);

  // Validate Firestore Connection
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  // Listen to Authentication State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setIsAuthLoading(false);
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        try {
          const snap = await getDoc(userRef);
          if (snap.exists()) {
            const data = snap.data();
            setUserProfile(data);
            if (data.theme && THEMES[data.theme as keyof typeof THEMES]) {
              setCurrentTheme(data.theme as any);
            }
          } else {
            const initialProfile = {
              uid: user.uid,
              displayName: user.displayName || 'Krish',
              email: user.email || '',
              photoURL: user.photoURL || '',
              theme: currentTheme,
              ludoPlayed: 0,
              ludoWon: 0,
              updatedAt: serverTimestamp()
            };
            await setDoc(userRef, initialProfile);
            setUserProfile(initialProfile);
          }
        } catch (err) {
          console.error('Error fetching/creating user profile:', err);
        }
      } else {
        setUserProfile(null);
        setRecentMatches([]);
        setRecentMessages([]);
      }
    });
    return unsubscribe;
  }, []);

  // Realtime matches listener
  useEffect(() => {
    if (!currentUser) return;
    const matchesRef = collection(db, 'users', currentUser.uid, 'matches');
    const q = query(matchesRef, orderBy('createdAt', 'desc'), limit(10));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRecentMatches(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, `users/${currentUser.uid}/matches`);
    });
    return unsubscribe;
  }, [currentUser]);

  // Realtime messages (conversation logs) listener
  useEffect(() => {
    if (!currentUser) return;
    const messagesRef = collection(db, 'users', currentUser.uid, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'desc'), limit(15));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRecentMessages(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, `users/${currentUser.uid}/messages`);
    });
    return unsubscribe;
  }, [currentUser]);

  // Auto-save speech transcripts
  useEffect(() => {
    if (!currentUser || !transcription.user || !transcription.mahi) return;
    const textCombo = `${transcription.user}|||${transcription.mahi}`;
    if (lastSavedRef.current === textCombo) return;
    lastSavedRef.current = textCombo;

    const saveMessage = async () => {
      try {
        const messagesRef = collection(db, 'users', currentUser.uid, 'messages');
        await addDoc(messagesRef, {
          userId: currentUser.uid,
          userText: transcription.user,
          mahiText: transcription.mahi,
          createdAt: serverTimestamp()
        });
      } catch (err) {
        console.error('Error saving message log:', err);
      }
    };
    const timer = setTimeout(saveMessage, 1000);
    return () => clearTimeout(timer);
  }, [transcription, currentUser]);

  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error('Sign-in error:', err);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Sign-out error:', err);
    }
  };

  const handleThemeChange = async (id: keyof typeof THEMES) => {
    setCurrentTheme(id);
    if (currentUser) {
      const userRef = doc(db, 'users', currentUser.uid);
      try {
        await updateDoc(userRef, {
          theme: id,
          updatedAt: serverTimestamp()
        });
        setUserProfile((prev: any) => prev ? { ...prev, theme: id } : null);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}`);
      }
    }
  };

  const handleGameStarted = async () => {
    if (!currentUser) return;
    const userRef = doc(db, 'users', currentUser.uid);
    try {
      await updateDoc(userRef, {
        ludoPlayed: (userProfile?.ludoPlayed || 0) + 1,
        updatedAt: serverTimestamp()
      });
      setUserProfile((prev: any) => prev ? { ...prev, ludoPlayed: (prev.ludoPlayed || 0) + 1 } : null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}`);
    }
  };

  const handleGameFinished = async (winner: 'player' | 'mahi', finalPlayerPos: number, finalMahiPos: number) => {
    if (!currentUser) return;
    const userRef = doc(db, 'users', currentUser.uid);
    const matchesRef = collection(db, 'users', currentUser.uid, 'matches');
    try {
      await addDoc(matchesRef, {
        userId: currentUser.uid,
        playerPos: finalPlayerPos,
        mahiPos: finalMahiPos,
        winner: winner,
        createdAt: serverTimestamp()
      });

      const isWinner = winner === 'player';
      const updatePayload: any = {
        updatedAt: serverTimestamp()
      };
      if (isWinner) {
        updatePayload.ludoWon = (userProfile?.ludoWon || 0) + 1;
      }
      await updateDoc(userRef, updatePayload);
      setUserProfile((prev: any) => {
        if (!prev) return null;
        return {
          ...prev,
          ludoWon: isWinner ? (prev.ludoWon || 0) + 1 : (prev.ludoWon || 0)
        };
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}/matches`);
    }
  };

  const [micLevel, setMicLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);
  const smoothedOutputLevelRef = useRef(0);
  const [isActive, setIsActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [lastMessageTime, setLastMessageTime] = useState(0);

  // Animation States
  const [animState, setAnimState] = useState('idle'); // idle, listening, speaking
  useEffect(() => {
    let checkInterval: any;
    if (isActive) {
      checkInterval = setInterval(() => {
        const silentTime = Date.now() - lastMessageTime;
        if (silentTime > 20000) { // 20 seconds of silence from model
          console.warn('Mahi seems unresponsive (silence timeout)');
          // Option: trigger a heartbeat or reconnect? 
          // For now just log it.
        }
      }, 5000);
    }
    return () => clearInterval(checkInterval);
  }, [isActive, lastMessageTime]);

  const [expression, setExpression] = useState('happy'); // happy, sad, heartbroken, excited, caring, sassy, surprised, embarrassed, confused, thinking
  const [currentVisual, setCurrentVisual] = useState(DEFAULT_VISUAL);
  const [isLipSyncEnabled, setIsLipSyncEnabled] = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);

  // Preload Images
  useEffect(() => {
    const imagesToPreload = [
      DEFAULT_VISUAL,
      "https://i.ibb.co/TDPqWrQP/chin.jpg",
      "https://i.ibb.co/fzg90pKT/wink.jpg",
      "https://i.ibb.co/k6zJ0Rby/blush.jpg",
      "https://i.ibb.co/rBPqMhQ/pout.jpg",
      "https://i.ibb.co/Mx8HBnh3/thinking.jpg",
      "https://i.ibb.co/VWnmW51k/smirk.jpg",
      "https://i.ibb.co/mVMvKSpt/heart-eyes.jpg",
      "https://i.ibb.co/Q7dWVLNg/starry-eyes.jpg",
      "https://i.ibb.co/LX29jXmW/nervous1.jpg",
      "https://i.ibb.co/rK9HRgg5/nervous2.jpg",
      "https://i.ibb.co/23v3Jh0y/angry.jpg",
      "https://i.ibb.co/BVSHQHBB/hair-swirl.jpg",
      ANIME_GIRL_MOUTH_OPEN,
      ANIME_GIRL_EYES_CLOSED
    ];
    imagesToPreload.forEach(url => {
      const img = new Image();
      img.src = url;
    });
  }, []);

  // --- Background Music Logic ---
  const musicRefs = useRef<Record<string, HTMLAudioElement>>({});
  const themeMusicRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Initialize audio objects
    Object.entries(MOOD_MUSIC).forEach(([key, url]) => {
      const audio = new Audio(url);
      audio.loop = true;
      audio.volume = 0;
      musicRefs.current[key] = audio;
    });

    // Initialize main theme
    const themeAudio = new Audio(BACKGROUND_THEME_URL);
    themeAudio.loop = true;
    themeAudio.volume = 0;
    themeMusicRef.current = themeAudio;

    return () => {
      Object.values(musicRefs.current).forEach((audio: HTMLAudioElement) => {
        audio.pause();
        audio.src = '';
      });
      if (themeMusicRef.current) {
        themeMusicRef.current.pause();
        themeMusicRef.current.src = '';
      }
    };
  }, []);

  useEffect(() => {
    if (!isActive) {
      const allMusic = [...Object.values(musicRefs.current)];
      if (themeMusicRef.current) allMusic.push(themeMusicRef.current);

      allMusic.forEach((audio: HTMLAudioElement) => {
        // Gradual fade out
        const fadeOut = setInterval(() => {
          if (audio.volume > 0.01) {
            audio.volume = Math.max(0, audio.volume - 0.01);
          } else {
            audio.volume = 0;
            audio.pause();
            clearInterval(fadeOut);
          }
        }, 150);
      });
      return;
    }

    // Play Main Theme
    if (themeMusicRef.current) {
      if (themeMusicRef.current.paused) {
        themeMusicRef.current.play().catch(err => console.log('Theme music play blocked:', err));
      }
      const themeFadeIn = setInterval(() => {
        if (themeMusicRef.current && themeMusicRef.current.volume < 0.1) {
          themeMusicRef.current.volume = Math.min(0.1, themeMusicRef.current.volume + 0.005);
        } else {
          clearInterval(themeFadeIn);
        }
      }, 200);
    }

    const targetAudio = musicRefs.current[expression];
    if (targetAudio) {
      if (targetAudio.paused) {
        targetAudio.play().catch(err => console.log('Music play blocked:', err));
      }

      // Cross-fade
      Object.entries(musicRefs.current).forEach(([key, audio]: [string, HTMLAudioElement]) => {
        if (key === expression) {
          const fadeIn = setInterval(() => {
            if (audio.volume < 0.15) {
              audio.volume = Math.min(0.15, audio.volume + 0.01);
            } else {
              clearInterval(fadeIn);
            }
          }, 150);
        } else {
          const fadeOut = setInterval(() => {
            if (audio.volume > 0.01) {
              audio.volume = Math.max(0, audio.volume - 0.01);
            } else {
              audio.volume = 0;
              audio.pause();
              clearInterval(fadeOut);
            }
          }, 150);
        }
      });
    }
  }, [expression, isActive]);

  // Blink logic
  useEffect(() => {
    let blinkTimeout: number;
    const scheduleBlink = () => {
      const delay = 2000 + Math.random() * 3000; // 2-5 seconds
      blinkTimeout = window.setTimeout(() => {
        setIsBlinking(true);
        setTimeout(() => setIsBlinking(false), 150);
        scheduleBlink();
      }, delay);
    };
    scheduleBlink();
    return () => clearTimeout(blinkTimeout);
  }, []);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserOutRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const liveSessionRef = useRef<any>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const nextPlayTimeRef = useRef<number>(0);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const retryCountRef = useRef<number>(0);

  // --- Audio Logic ---
  const initAudio = async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: SAMPLE_RATE_OUT });
    }
    
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    if (!analyserOutRef.current && audioContextRef.current) {
      analyserOutRef.current = audioContextRef.current.createAnalyser();
      analyserOutRef.current.fftSize = 512;
      analyserOutRef.current.smoothingTimeConstant = 0.2;
      analyserOutRef.current.connect(audioContextRef.current.destination);
    }
  };

  useEffect(() => {
    let animationFrameId: number;
    const updateOutputLevel = () => {
      if (isSpeaking && analyserOutRef.current) {
        const dataArray = new Uint8Array(analyserOutRef.current.frequencyBinCount);
        analyserOutRef.current.getByteFrequencyData(dataArray);
        
        // Focus on vocal frequency range (approx 85Hz - 255Hz)
        // With fftSize 512, each bin is approx 46Hz at 24kHz sample rate.
        // Bins 2 to 6 roughly cover the core vocal energy.
        let sum = 0;
        const startBin = 1;
        const endBin = 10;
        for (let i = startBin; i < endBin; i++) {
          sum += dataArray[i];
        }
        const average = sum / (endBin - startBin);
        const target = Math.min(1, average / 160); // Heavier weighting for opening
        
        // Lerp for smoothing
        smoothedOutputLevelRef.current += (target - smoothedOutputLevelRef.current) * 0.3;
        setOutputLevel(smoothedOutputLevelRef.current);
      } else {
        smoothedOutputLevelRef.current *= 0.8;
        if (smoothedOutputLevelRef.current < 0.01) smoothedOutputLevelRef.current = 0;
        setOutputLevel(smoothedOutputLevelRef.current);
      }
      animationFrameId = requestAnimationFrame(updateOutputLevel);
    };
    updateOutputLevel();
    return () => cancelAnimationFrame(animationFrameId);
  }, [isSpeaking]);

  const playAudioChunk = (base64Audio: string) => {
    if (!audioContextRef.current || !analyserOutRef.current) return;
    
    // Decode base64 to pcm16
    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Ensure buffer length is even for Int16Array
    const bufferToUse = bytes.length % 2 !== 0 ? bytes.slice(0, -1).buffer : bytes.buffer;
    const pcm16 = new Int16Array(bufferToUse);
    const float32 = pcm16ToFloat32(pcm16);
    
    const buffer = audioContextRef.current.createBuffer(1, float32.length, SAMPLE_RATE_OUT);
    buffer.getChannelData(0).set(float32);
    
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(analyserOutRef.current);
    
    const startTime = Math.max(audioContextRef.current.currentTime, nextPlayTimeRef.current);
    source.start(startTime);
    nextPlayTimeRef.current = startTime + buffer.duration;
    
    setIsSpeaking(true);
    source.onended = () => {
      if (audioContextRef.current && audioContextRef.current.currentTime >= nextPlayTimeRef.current - 0.1) {
        setIsSpeaking(false);
      }
    };
  };

  const stopSpeaking = () => {
    setIsSpeaking(false);
    nextPlayTimeRef.current = 0;
  };

  // --- Handlers for Agentic Capabilities ---
  const openWebsite = (url: string) => {
    window.open(url, '_blank');
    return { status: 'success', message: `Opened website: ${url}` };
  };

  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !isActive) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      if (liveSessionRef.current) {
        liveSessionRef.current.sendRealtimeInput({
          video: {
            mimeType: file.type,
            data: base64,
          },
        });
        // Explicit text hint
        liveSessionRef.current.sendRealtimeInput({
          text: "User uploaded an image for you to analyze."
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const startScreenShare = async () => {
    try {
      const mediaDevices = navigator.mediaDevices as any;
      if (!mediaDevices || (!mediaDevices.getDisplayMedia && !(navigator as any).getDisplayMedia)) {
        throw new Error('Screen capture is not supported in this browser context. Please try opening the app in a new tab or use a desktop browser.');
      }

      const getDisplayMedia = (mediaDevices.getDisplayMedia 
        ? mediaDevices.getDisplayMedia.bind(mediaDevices) 
        : (navigator as any).getDisplayMedia.bind(navigator));
        
      const stream = await getDisplayMedia({ 
        video: { 
          displaySurface: 'monitor'
        } 
      });
      
      screenStreamRef.current = stream;
      setIsScreenSharing(true);
      
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        screenStreamRef.current = null;
        setIsScreenSharing(false);
      });

      return { status: 'success', message: 'Screen sharing started.' };
    } catch (err: any) {
      console.error('Screen capture failed', err);
      const msg = err.name === 'NotAllowedError' 
        ? 'Permission denied. Please allow screen sharing.' 
        : (err.message || 'Failed to start screen share.');
      setError(msg);
      return { status: 'error', message: msg };
    }
  };

  const analyzeScreen = async () => {
    try {
      if (!screenStreamRef.current) {
        return { 
          status: 'error', 
          message: 'Screen sharing is not active. Krish, please click the monitor icon at the bottom center to start sharing. I need you to do this before I can see anything!' 
        };
      }

      const track = screenStreamRef.current!.getVideoTracks()[0];
      
      // Fallback for browsers without ImageCapture
      let bitmap;
      if ('ImageCapture' in window) {
        try {
          const imageCapture = new (window as any).ImageCapture(track);
          bitmap = await imageCapture.grabFrame();
        } catch (e) {
          console.warn('ImageCapture failed, falling back to video element', e);
        }
      }
      
      if (!bitmap) {
        // Standard video element fallback
        const video = document.createElement('video');
        video.srcObject = screenStreamRef.current;
        await video.play();
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0);
        const data = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
        if (liveSessionRef.current) {
          liveSessionRef.current.sendRealtimeInput({
            video: {
              mimeType: 'image/jpeg',
              data: data
            }
          });
          // Explicit text hint for the model
          liveSessionRef.current.sendRealtimeInput({
            text: "User's current screen captured. Analyze the visual input above."
          });
        }
        video.pause();
        video.srcObject = null;
        return { status: 'success', message: 'Screen captured and sent to your eyes. Please tell me what you see!' };
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(bitmap, 0, 0);
      const data = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      
      if (liveSessionRef.current) {
        liveSessionRef.current.sendRealtimeInput({
          video: {
            mimeType: 'image/jpeg',
            data: data
          }
        });
        // Explicit text hint
        liveSessionRef.current.sendRealtimeInput({
          text: "User's current screen captured. Analyze the visual input above."
        });
      }
      return { status: 'success', message: 'Screen captured and sent to your eyes. Please tell me what you see!' };
    } catch (err: any) {
      console.error('Screen analysis failed', err);
      return { status: 'error', message: err.message || 'Analysis failed' };
    }
  };

  // --- Live API Management ---
  const startMahi = async () => {
    try {
      setError(null);
      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      await initAudio();
      
      const micPermission = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      streamRef.current = micPermission;

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        callbacks: {
          onopen: () => {
            setIsActive(true);
            setIsListening(true);
            retryCountRef.current = 0; // Reset on success
            setLastMessageTime(Date.now());
            
            const context = audioContextRef.current!;
            const source = context.createMediaStreamSource(micPermission);
            const processor = context.createScriptProcessor(2048, 1, 1);
            
            processor.onaudioprocess = (e) => {
              if (!session) return;
              const input = e.inputBuffer.getChannelData(0);

              // Simple volume meter
              let sum = 0;
              for (let i = 0; i < input.length; i++) {
                sum += input[i] * input[i];
              }
              setMicLevel(Math.sqrt(sum / input.length));

              // Resample from context rate (likely 24k or 48k) to 16k
              const resampled = resample(input, context.sampleRate, SAMPLE_RATE_IN);
              const pcm16 = float32ToPcm16(resampled);
              const b64 = base64Encode(pcm16);
              
              try {
                session.sendRealtimeInput({
                  audio: { data: b64, mimeType: 'audio/pcm;rate=16000' }
                });
              } catch (err) {
                console.error('Realtime input error:', err);
              }
            };
            
            source.connect(processor);
            processor.connect(context.destination);
            (context as any).mahiProcessor = processor;
            (context as any).mahiSource = source;
          },
          onmessage: async (message: LiveServerMessage) => {
            setLastMessageTime(Date.now());
            if ((message as any).serverContent?.goAway) {
              console.log('Received GoAway signal. Closing connection gracefully.');
              setError("Session limit reached. Click to restart sweety!");
              stopMahi();
              return;
            }

            const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              playAudioChunk(audioData);
            }

            // Handle Transcription
            const msg = message as any;
            // Model output text
            const modelText = msg.serverContent?.modelTurn?.parts?.find((p: any) => p.text)?.text;
            if (modelText) {
              setTranscription(prev => ({ ...prev, mahi: modelText }));
            }
            
            // User input transcription (if enabled)
            // Structure varies by SDK version, checking common paths
            const userText = msg.serverContent?.userTurn?.parts?.find((p: any) => p.text)?.text 
                          || msg.clientContent?.transcription 
                          || msg.serverContent?.transcription?.text;
            if (userText) {
              setTranscription(prev => ({ ...prev, user: userText }));
            }
            
            if (message.serverContent?.interrupted) {
              stopSpeaking();
            }
            
            if (message.toolCall) {
              for (const call of message.toolCall.functionCalls) {
                let result;
                if (call.name === 'openWebsite') {
                  result = openWebsite((call.args as any).url);
                } else if (call.name === 'analyzeScreen') {
                  result = await analyzeScreen();
                } else if (call.name === 'updateAnimationMetadata') {
                  const args = call.args as any;
                  setAnimState(args.state || 'idle');
                  setExpression(args.expression || 'happy');
                  setIsLipSyncEnabled(!!args.lipSync);
                  if (args.imageLink) setCurrentVisual(args.imageLink);
                  result = { status: 'success' };
                } else if (call.name === 'openMiniGame') {
                  const mode = (call.args as any).type as GameType;
                  setGameMode(mode);
                  result = { status: 'success', message: `Game ${mode} started!` };
                }
                
                if (result) {
                  session.sendToolResponse({
                    functionResponses: [{
                      name: call.name,
                      id: call.id,
                      response: result
                    }]
                  });
                }
              }
            }
          },
          onclose: (event) => {
            console.log('Session closed', event);
            stopMahi();
          },
          onerror: (err: any) => {
            console.error('Live API Error:', err);
            const msg = (err?.message || String(err)).toLowerCase();
            
            // Auto-reconnect for network issues
            if (msg.includes("network") || msg.includes("fetch") || msg.includes("internal error") || msg.includes("socket") || msg.includes("failed to connect") || msg.includes("unavailable")) {
              stopMahi();
              if (retryCountRef.current < 5) {
                retryCountRef.current++;
                const waitTime = 1500 * retryCountRef.current; 
                
                if (msg.includes("unavailable")) {
                  setError(`sweety thodi busy hai (Service Unavailable). Reconnecting... (${retryCountRef.current}/5)`);
                } else {
                  setError(`Signal kam aa raha hai... reconnect kar rahi hoon (${retryCountRef.current}/5)`);
                }

                setTimeout(() => {
                  startMahi();
                }, waitTime);
                return;
              }
              setError(msg.includes("unavailable") ? "sweety abhi rest kar rahi hai (Unavailable). Please refresh or wait a bit." : "Network ki problem hai, ek baar button daba kar phir se try karo?");
            } else if (msg.includes("quota") || msg.includes("limit")) {
              setError("Humne bohot baatein kar li aaj! Limit khatam ho gayi hai. Kal milte hain? (Quota Limit Reached)");
              stopMahi();
            } else if (msg.includes("GoAway") || msg.includes("aborted") || msg.includes("closed")) {
              setError("Session khatam ho gaya. Chalo phir se start karte hain!");
              stopMahi();
            } else {
              setError("Oops! Kuch gadbad ho gayi. Retry karna chahoge?");
              stopMahi();
            }
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Lyra" } },
          },
          systemInstruction: MAHI_SYSTEM_INSTRUCTION,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'openWebsite',
                  description: 'Open a specific website URL in a new tab.',
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      url: { type: Type.STRING, description: 'The absolute URL to open.' }
                    },
                    required: ['url']
                  }
                },
                {
                  name: 'analyzeScreen',
                  description: 'Capture a screenshot of the user\'s current screen and analyze it.',
                  parameters: { type: Type.OBJECT, properties: {} }
                },
                {
                  name: 'updateAnimationMetadata',
                  description: 'Update the visual animation state of Mahi.',
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      state: { type: Type.STRING, enum: ['idle', 'listening', 'speaking'], description: 'The current state of interaction.' },
                      expression: { type: Type.STRING, enum: ['happy', 'sad', 'heartbroken', 'excited', 'caring', 'sassy', 'surprised', 'embarrassed', 'confused', 'thinking'], description: 'The emotional expression.' },
                      lipSync: { type: Type.BOOLEAN, description: 'Whether mouth movement should be enabled.' },
                      imageLink: { type: Type.STRING, description: 'The specific URL to display for this event.' }
                    },
                    required: ['state', 'expression', 'lipSync', 'imageLink']
                  }
                },
                {
                  name: 'openMiniGame',
                  description: 'Start a mini-game challenge with the user.',
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      type: { type: Type.STRING, enum: ['ludo', 'none'], description: 'The type of game to start.' }
                    },
                    required: ['type']
                  }
                }
              ]
            }
          ]
        }
      });
      
      liveSessionRef.current = session;
    } catch (err: any) {
      console.error('Failed to start Mahi:', err);
      const msg = (err?.message || String(err)).toLowerCase();
      if (msg.includes("permission denied") || msg.includes("notallowederror")) {
        setError("Microphone access denied! Please enable mic in browser settings and try again.");
        stopMahi();
      } else if (msg.includes("unavailable") || msg.includes("network") || msg.includes("fetch")) {
        if (retryCountRef.current < 5) {
          retryCountRef.current++;
          setError(`sweety ko call lag raha hai... (${retryCountRef.current}/5)`);
          setTimeout(startMahi, 2000 * retryCountRef.current);
        } else {
          setError("sweety busy hai ya network issue hai. Please try again later.");
          stopMahi();
        }
      } else {
        setError("Mic connection mein problem ho rahi hai. Key check karein?");
        stopMahi();
      }
    }
  };

  const stopMahi = () => {
    setIsActive(false);
    setIsListening(false);
    setIsSpeaking(false);
    
    if (liveSessionRef.current) {
      liveSessionRef.current.close();
      liveSessionRef.current = null;
    }
    
    if (audioContextRef.current) {
      const context = audioContextRef.current as any;
      if (context.mahiProcessor) {
        try {
          context.mahiProcessor.disconnect();
          context.mahiProcessor.onaudioprocess = null;
        } catch (e) {
          console.log('Processor cleanup err:', e);
        }
        context.mahiProcessor = null;
      }
      if (context.mahiSource) {
        try {
          context.mahiSource.disconnect();
        } catch (e) {
          console.log('Source cleanup err:', e);
        }
        context.mahiSource = null;
      }
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }
    
    // Clear audio queue
    audioQueueRef.current = [];
    nextPlayTimeRef.current = 0;
  };

  const toggleMahi = () => {
    if (isActive) {
      stopMahi();
    } else {
      startMahi();
    }
  };

  return (
    <div className="fixed inset-0 bg-[#030306] flex overflow-hidden font-sans text-white select-none">
      
      {/* Premium Ambient Background & Sci-fi Grids */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        {/* Deep Core Radial Glow matching active Theme */}
        <motion.div 
          animate={{ 
            opacity: [0.12, 0.22, 0.12], 
            scale: [1, 1.08, 1],
            rotate: [0, 45, 0]
          }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] blur-[140px] rounded-full"
          style={{ background: `radial-gradient(circle, ${theme.bgGlow} 0%, rgba(0,0,0,0) 70%)` }}
        />
        
        {/* Subtle Cybernetic Hex Grid / Alignment Matrix */}
        <div 
          className="absolute inset-0 opacity-[0.06] transition-all duration-700" 
          style={{ 
            backgroundImage: `linear-gradient(${theme.primary}15 1.5px, transparent 1.5px), linear-gradient(90deg, ${theme.primary}15 1.5px, transparent 1.5px)`, 
            backgroundSize: '50px 50px' 
          }} 
        />
        
        {/* Floating micro starfield particles */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:32px_32px]" />
      </div>

      {/* Debug View Toggle */}
      <button 
        onClick={() => setShowDebug(!showDebug)} 
        className="fixed bottom-6 left-6 z-[100] opacity-10 hover:opacity-100 transition-opacity p-2.5 bg-black/40 hover:bg-black/80 backdrop-blur-md rounded-xl border border-white/5"
        title="Diagnostic Settings"
      >
        <Settings size={15} className="text-gray-400" />
      </button>

      {/* Debug Info Overlay */}
      <AnimatePresence>
        {showDebug && (
          <motion.div 
            key="debug-overlay"
            initial={{ opacity: 0, x: -100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            className="fixed bottom-20 left-6 z-[99] bg-[#07070b]/95 backdrop-blur-2xl p-4.5 rounded-2xl border border-white/10 w-72 text-[10px] space-y-3 pointer-events-none shadow-2xl"
          >
            <div className="text-gray-400 uppercase tracking-widest font-black border-b border-white/5 pb-1.5 flex items-center gap-1.5">
              <Activity size={12} className="text-indigo-400" />
              Core Diagnostic Logs
            </div>
            <div className="space-y-1.5 font-mono text-gray-300">
              <div><span className="text-indigo-400/80">CORE_SESSION:</span> {isActive ? 'ACTIVE_LIVE' : 'IDLE_STANDBY'}</div>
              <div><span className="text-indigo-400/80">LATENCY_PULSE:</span> {lastMessageTime ? `${Date.now() - lastMessageTime}ms` : '0ms'}</div>
              <div><span className="text-indigo-400/80">MIC_ENERGY:</span> <div className="inline-block w-24 h-1.5 bg-gray-800 rounded-full overflow-hidden ml-1.5"><div className="h-full bg-green-400" style={{ width: `${Math.min(100, micLevel * 600)}%` }}></div></div></div>
              <div><span className="text-indigo-400/80">RETRY_INDEX:</span> {retryCountRef.current} / 5</div>
              <div className="border-t border-white/5 pt-1.5 text-gray-400 font-bold uppercase tracking-wider text-[8px]">Live Capture Streams</div>
              <div className="truncate"><span className="text-indigo-400/80">USER_RAW:</span> {transcription.user || 'Waiting...'}</div>
              <div className="truncate"><span className="text-indigo-400/80">MAHI_RAW:</span> {transcription.mahi || 'Waiting...'}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* LEFT SIDEBAR: COLLAPSIBLE FUTURE COMMAND COMMAND DECK */}
      <AnimatePresence>
        {(showCommandCenter || window.innerWidth >= 1024) && (
          <motion.aside
            initial={{ x: '-100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '-100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            className={`
              fixed lg:static top-0 bottom-0 left-0 w-80 lg:w-[350px] shrink-0
              bg-[#060609]/90 lg:bg-[#060609]/50 backdrop-blur-3xl border-r border-white/5 
              z-[80] lg:z-20 p-6 flex flex-col gap-5 h-full overflow-y-auto select-none
              ${showCommandCenter ? 'block shadow-2xl' : 'hidden lg:flex'}
            `}
          >
            {/* Command Deck Header */}
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${theme.primary}22, ${theme.secondary}11)`, border: `1px solid ${theme.primary}4D` }}>
                  <Brain size={16} className="text-white animate-pulse" style={{ color: theme.primary }} />
                </div>
                <div>
                  <h2 className="text-xs font-black uppercase tracking-[3px] text-white">SWEETY ENGINE</h2>
                  <p className="text-[8px] font-mono uppercase tracking-wider text-gray-500">Autonomous Soul</p>
                </div>
              </div>
              
              {/* Close Button on Mobile Sidebar */}
              <button 
                onClick={() => setShowCommandCenter(false)}
                className="lg:hidden p-1.5 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* WIDGET 1: NEURAL CORE & EXPRESSION ANALYZER */}
            <div className="bg-white/2 border border-white/5 rounded-2xl p-4 flex flex-col gap-3.5 backdrop-blur-md relative overflow-hidden group hover:border-white/10 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                  <Activity size={10} style={{ color: theme.primary }} className="animate-pulse" />
                  Telemetry Diagnostic
                </span>
                <span className="text-[8px] font-mono text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded uppercase">Dynamic</span>
              </div>

              {/* Emotional Bias Card */}
              <div className="p-3 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="text-2xl">
                    {expression === 'happy' && '😊'}
                    {expression === 'sad' && '😢'}
                    {expression === 'heartbroken' && '💔'}
                    {expression === 'excited' && '🤩'}
                    {expression === 'caring' && '🥰'}
                    {expression === 'sassy' && '😏'}
                    {expression === 'surprised' && '😲'}
                    {expression === 'embarrassed' && '😳'}
                    {expression === 'confused' && '😕'}
                    {expression === 'thinking' && '🤔'}
                    {!expression && '🌸'}
                  </div>
                  <div>
                    <div className="text-[8px] font-mono uppercase text-gray-500">Active Expression</div>
                    <div className="text-xs font-bold uppercase tracking-wider text-white" style={{ color: theme.secondary }}>
                      {expression || 'IDLE_STANDBY'}
                    </div>
                  </div>
                </div>
                <span className="text-[8px] font-mono text-white/40 border border-white/10 rounded px-1.5 py-0.5 uppercase bg-white/2">
                  Bias: {expression === 'heartbroken' || expression === 'sad' ? 'Fragile' : 'Empathetic'}
                </span>
              </div>

              {/* Telemetry Micro Bars */}
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-[8px] font-mono text-gray-500 uppercase tracking-wider mb-1">
                    <span>Voice Input Level</span>
                    <span>{Math.round(micLevel * 100)}%</span>
                  </div>
                  <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full rounded-full transition-all duration-100" 
                      style={{ 
                        backgroundColor: theme.primary,
                        width: `${Math.min(100, micLevel * 600)}%`,
                        boxShadow: `0 0 8px ${theme.primary}`
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[8px] font-mono text-gray-500 uppercase tracking-wider mb-1">
                    <span>sweety Response Power</span>
                    <span>{Math.round(outputLevel * 100)}%</span>
                  </div>
                  <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full rounded-full transition-all duration-100" 
                      style={{ 
                        backgroundColor: theme.secondary,
                        width: `${Math.min(100, outputLevel * 100)}%`,
                        boxShadow: `0 0 8px ${theme.secondary}`
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* WIDGET 2: CONVERSATION MEMORY FEEDBACK */}
            <div className="flex-1 flex flex-col bg-white/2 border border-white/5 rounded-2xl p-4 backdrop-blur-md hover:border-white/10 transition-all min-h-[220px]">
              <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase text-gray-400 tracking-widest mb-3 border-b border-white/5 pb-2">
                <MessageCircle size={11} style={{ color: theme.primary }} />
                Realtime Speech Bubble
              </div>

              {/* Feed Area */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
                {!transcription.user && !transcription.mahi ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 gap-2.5 py-6">
                    <motion.div
                      animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
                      transition={{ duration: 3, repeat: Infinity }}
                    >
                      <Sparkles size={22} className="text-gray-600" />
                    </motion.div>
                    <div className="text-[10px] font-mono uppercase tracking-wider">Awaiting Stream</div>
                    <p className="text-[9px] leading-relaxed max-w-[180px] font-sans">Click the center sphere below and say "Hi sweety" to initiate voice link.</p>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {transcription.user && (
                      <motion.div 
                        initial={{ opacity: 0, y: 5 }} 
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-1"
                      >
                        <div className="flex items-center gap-1.5 text-[8px] font-mono text-gray-500 uppercase">
                          <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                          You
                        </div>
                        <div className="text-[10.5px] leading-relaxed bg-[#0c0c14] border border-white/5 rounded-xl px-3 py-2 text-gray-200">
                          {transcription.user}
                        </div>
                      </motion.div>
                    )}

                    {transcription.mahi && (
                      <motion.div 
                        initial={{ opacity: 0, y: 5 }} 
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-1"
                      >
                        <div className="flex items-center gap-1.5 text-[8px] font-mono uppercase text-pink-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-pink-400 shadow-[0_0_8px_rgba(244,114,182,0.8)] animate-ping" />
                          sweety
                        </div>
                        <div className="text-[10.5px] leading-relaxed bg-gradient-to-r from-purple-950/15 to-pink-950/10 border border-purple-500/10 rounded-xl px-3 py-2 text-white shadow-sm">
                          {transcription.mahi}
                        </div>
                      </motion.div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* WIDGET 3: LUDO INITIATOR BENTO CARD */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-indigo-950/15 via-purple-950/10 to-transparent border border-indigo-500/10 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono uppercase tracking-wider text-indigo-300">Playful Core v2.0</span>
                <span className="text-[8px] font-mono text-indigo-400 uppercase">Interactive</span>
              </div>
              <p className="text-[9px] text-gray-400 leading-normal">
                Challenge sweety to an exciting game of Ludo to boost compatibility. Playful AI state is fully integrated.
              </p>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <motion.button
                  onClick={() => setGameMode('ludo')}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-mono uppercase text-[9px] py-1.5 rounded-xl flex items-center justify-center gap-1.5 shadow-lg tracking-wider font-bold transition-colors"
                >
                  <Trophy size={11} />
                  Play Ludo
                </motion.button>
                <motion.button
                  onClick={() => setShowStatsPanel(true)}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="bg-white/5 hover:bg-white/10 border border-white/10 text-white font-mono uppercase text-[9px] py-1.5 rounded-xl flex items-center justify-center gap-1.5 tracking-wider transition-colors"
                >
                  <History size={11} />
                  Memory Log
                </motion.button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* RIGHT/MAIN PANELS CONTAINER */}
      <div className="flex-1 flex flex-col relative h-full z-10">

        {/* TOP HUD ROW */}
        <header className="p-6 md:p-8 flex justify-between items-center z-50 select-none pointer-events-none">
          {/* Logo & Operational Status */}
          <div className="flex items-center gap-4 pointer-events-auto">
            {/* Sidebar trigger button on mobile/tablet */}
            <motion.button
              onClick={() => setShowCommandCenter(!showCommandCenter)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="lg:hidden p-2.5 bg-white/5 border border-white/10 backdrop-blur-md rounded-xl text-white flex items-center justify-center shadow-lg relative"
              title="Toggle Command Deck"
            >
              <Brain size={16} style={{ color: theme.primary }} />
              {!showCommandCenter && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-pink-500 shadow-[0_0_8px_#f472b6] animate-ping" />
              )}
            </motion.button>

            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2.5">
                <motion.div 
                  animate={isActive ? { scale: [1, 1.4, 1], opacity: [1, 0.6, 1] } : { opacity: 0.3 }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: theme.primary, boxShadow: `0 0 12px ${theme.primary}` }}
                />
                <h1 className="text-md font-black tracking-[4px] text-white uppercase opacity-95">SWEETY</h1>
              </div>
              <div className="flex gap-2.5 text-[8px] uppercase tracking-[1.5px] font-mono text-gray-500">
                <span>SYSTEM_V3.5</span>
                <span>|</span>
                <span style={{ color: theme.secondary }} className="font-bold">
                  {isActive ? (isListening ? 'SYNC_AWAITING' : 'NEURAL_PROCESSING') : 'STANDBY_LOCKED'}
                </span>
              </div>
            </div>
          </div>

          {/* Theme & User Controller Deck */}
          <div className="flex items-center gap-3.5 pointer-events-auto">
            {/* Theme Picker Circles */}
            <div className="hidden sm:flex gap-1.5 bg-black/30 border border-white/5 px-2.5 py-1.5 rounded-full backdrop-blur-md">
              {Object.entries(THEMES).map(([id, t]) => (
                <motion.button
                  key={id}
                  onClick={() => handleThemeChange(id as any)}
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.9 }}
                  className={`w-4 h-4 rounded-full border-2 transition-all duration-300 ${currentTheme === id ? 'border-white scale-110 shadow-[0_0_10px_rgba(255,255,255,0.4)]' : 'border-transparent opacity-60 hover:opacity-100'}`}
                  style={{ backgroundColor: t.primary }}
                  title={t.name}
                />
              ))}
            </div>

            {/* Authentication and Dashboard Button */}
            {isAuthLoading ? (
              <div className="w-8 h-8 rounded-full border-2 border-t-transparent border-white/20 animate-spin" />
            ) : currentUser ? (
              <div className="flex items-center gap-2.5 bg-[#0b0b11]/80 border border-white/10 backdrop-blur-xl px-2.5 py-1.5 rounded-2xl shadow-xl">
                <motion.button
                  onClick={() => setShowStatsPanel(true)}
                  whileHover={{ scale: 1.03 }}
                  className="flex items-center gap-2"
                  title="Companion Records Database"
                >
                  <img 
                    src={currentUser.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUser.uid}`} 
                    alt={currentUser.displayName || 'User'} 
                    className="w-6 h-6 rounded-xl border border-white/10 object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="text-left hidden md:block">
                    <div className="text-[8px] font-mono uppercase tracking-widest text-white/90">{currentUser.displayName?.split(' ')[0]}</div>
                    <div className="text-[7px] font-mono text-emerald-400">Sync Active</div>
                  </div>
                </motion.button>
                <div className="w-px h-4 bg-white/10" />
                <motion.button
                  onClick={handleSignOut}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="text-gray-400 hover:text-red-400 transition-colors"
                  title="Terminate Connection"
                >
                  <LogOut size={13} />
                </motion.button>
              </div>
            ) : (
              <motion.button
                onClick={handleGoogleSignIn}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white px-3.5 py-1.5 rounded-2xl text-[9px] font-mono uppercase tracking-wider flex items-center gap-1.5 shadow-lg shadow-indigo-950/20"
              >
                <LogIn size={11} className="text-emerald-300 animate-pulse" />
                Auth Link
              </motion.button>
            )}

            {/* Realtime Digital Clock */}
            <div className="bg-[#0b0b11]/80 border border-white/10 backdrop-blur-xl px-3 py-1.5 rounded-2xl text-[9px] font-mono text-gray-300 hidden md:flex items-center gap-1.5 shadow-lg">
              <span className="w-1 h-1 rounded-full bg-emerald-400 animate-ping" />
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </header>

        {/* HOLOGRAPHIC CENTRAL CHARACTER VIEWPORT */}
        <main className="flex-1 flex items-center justify-center p-4 relative min-h-0 select-none pointer-events-none">
          
          {/* Holographic Frame HUD Decorations */}
          <div className="absolute inset-x-12 top-2 bottom-20 border border-white/[0.02] rounded-[32px] pointer-events-none hidden md:block">
            <div className="absolute top-4 left-4 text-[7px] font-mono text-white/20 tracking-widest uppercase">LOC_XY_Z00</div>
            <div className="absolute top-4 right-4 text-[7px] font-mono text-white/20 tracking-widest uppercase">RADAR_SWEEP_OK</div>
            <div className="absolute bottom-4 left-4 text-[7px] font-mono text-white/20 tracking-widest uppercase">CAM_LINK_STABLE</div>
            <div className="absolute bottom-4 right-4 text-[7px] font-mono text-white/20 tracking-widest uppercase">MOD_GEN_LIVE_2.0</div>
            <div className="absolute top-1/2 left-4 -translate-y-1/2 text-[7px] font-mono text-white/15 rotate-90 origin-left tracking-widest">SCANNING_CORE_SEQUENCE</div>
            <div className="absolute top-1/2 right-4 -translate-y-1/2 text-[7px] font-mono text-white/15 -rotate-90 origin-right tracking-widest">AUTON_MATRIX_LOAD</div>
          </div>

          <div className="relative h-full max-h-[85vh] aspect-[4/5] md:aspect-[3/4] flex items-center justify-center">
            {/* Holographic Scanner Rings behind Character */}
            <div className="absolute inset-0 flex items-center justify-center z-0 pointer-events-none">
              {/* Outer Rotating Compass Ring */}
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
                className="w-[85%] h-[85%] max-w-[500px] max-h-[500px] border border-dashed rounded-full opacity-[0.12]"
                style={{ borderColor: theme.primary }}
              />
              
              {/* Inner Counter-Rotating Target Circle */}
              <motion.div 
                animate={{ rotate: -360 }}
                transition={{ duration: 16, repeat: Infinity, ease: "linear" }}
                className="w-[68%] h-[68%] max-w-[380px] max-h-[380px] border border-dotted rounded-full opacity-[0.2]"
                style={{ borderColor: theme.secondary }}
              />

              {/* Central Energy Core Pulse */}
              <motion.div 
                animate={{ scale: [0.95, 1.05, 0.95], opacity: [0.15, 0.35, 0.15] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="w-[50%] h-[50%] rounded-full blur-[80px]"
                style={{ backgroundColor: theme.bgGlow }}
              />
            </div>

            {/* Main Character Render with emoting layout */}
            <motion.div 
              className="relative h-full w-full flex items-center justify-center z-10"
              initial={{ opacity: 0 }}
              animate={{ 
                opacity: expression === 'heartbroken' ? 0.85 : 1,
                x: expression === 'heartbroken' ? [0, -3, 3, -3, 3, 0] : 0,
                y: expression === 'heartbroken' ? [0, 2, 0, 2, 0] : 0,
                filter: expression === 'heartbroken' ? 'brightness(0.7) contrast(1.1)' : 'brightness(1) contrast(1)'
              }}
              transition={{
                x: { duration: 0.3, repeat: expression === 'heartbroken' ? Infinity : 0 },
                y: { duration: 0.2, repeat: expression === 'heartbroken' ? Infinity : 0 },
                opacity: { duration: 0.5 },
                filter: { duration: 0.5 }
              }}
            >
              {/* Soft visual drop shadow glow in active theme color */}
              <div className="absolute inset-x-0 top-1/4 bottom-1/4 blur-[130px] rounded-full opacity-45" style={{ backgroundColor: theme.bgGlow }} />

              {/* Base Image (Mahi Visual) */}
              <motion.img 
                key={currentVisual}
                src={currentVisual || DEFAULT_VISUAL} 
                onError={() => setCurrentVisual(DEFAULT_VISUAL)}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.65, ease: "easeOut" }}
                alt="Mahi Visual" 
                className="h-full w-auto object-contain relative z-10 transition-transform duration-300"
                style={{ filter: `drop-shadow(0 0 25px ${theme.glow})` }}
                referrerPolicy="no-referrer"
              />

              {/* Mouth Open Overlay (Lip Sync to live audio) */}
              <motion.img 
                src={ANIME_GIRL_MOUTH_OPEN}
                alt="Mahi Mouth Sync"
                animate={{ 
                  opacity: (isSpeaking && isLipSyncEnabled) ? Math.min(1, outputLevel * 8) : 0,
                }}
                className="absolute inset-0 h-full w-auto object-contain z-20 pointer-events-none transition-opacity"
                referrerPolicy="no-referrer"
              />

              {/* Eyes Closed/Blink Overlay */}
              <motion.img 
                src={ANIME_GIRL_EYES_CLOSED}
                alt="Mahi Eye Blink"
                animate={{ 
                  opacity: (isBlinking || expression === 'sad' || expression === 'heartbroken') ? 1 : 0
                }}
                transition={{ duration: (expression === 'sad' || expression === 'heartbroken') ? 0.4 : 0.05 }}
                className="absolute inset-0 h-full w-auto object-contain z-30 pointer-events-none transition-opacity"
                referrerPolicy="no-referrer"
              />

              {/* Emotional Visual Spark Overlay Effects */}
              <AnimatePresence>
                {expression === 'thinking' && (
                  <Fragment key="exp-thinking">
                    <motion.div 
                      initial={{ opacity: 0 }} 
                      animate={{ opacity: 0.35 }} 
                      exit={{ opacity: 0 }} 
                      className="absolute top-1/4 left-1/4 w-[50%] h-[50%] bg-indigo-500/20 blur-[90px] rounded-full z-0 p-4"
                    >
                      <motion.div 
                        animate={{ rotate: 360 }}
                        transition={{ duration: 4.5, repeat: Infinity, ease: "linear" }}
                        className="w-full h-full border border-dashed border-indigo-400/40 rounded-full"
                      />
                    </motion.div>
                  </Fragment>
                )}
                {expression === 'happy' && (
                  <Fragment key="exp-happy">
                    <motion.div key="happy-blush-l" initial={{ opacity: 0 }} animate={{ opacity: 0.25 }} exit={{ opacity: 0 }} className="absolute top-[52%] left-[30%] w-[12%] h-[6%] bg-red-400/25 blur-[18px] rounded-full z-40" />
                    <motion.div key="happy-blush-r" initial={{ opacity: 0 }} animate={{ opacity: 0.25 }} exit={{ opacity: 0 }} className="absolute top-[52%] left-[58%] w-[12%] h-[6%] bg-red-400/25 blur-[18px] rounded-full z-40" />
                  </Fragment>
                )}
                {(expression === 'sad' || expression === 'heartbroken') && (
                  <Fragment key="exp-sad-hb">
                    <motion.div 
                      key="sad-bg"
                      initial={{ opacity: 0 }} 
                      animate={{ opacity: [0.25, expression === 'heartbroken' ? 0.75 : 0.45, 0.25] }} 
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className={`absolute inset-0 ${expression === 'heartbroken' ? 'bg-indigo-950/50' : 'bg-blue-500/15'} blur-[140px] z-5`} 
                    />
                  </Fragment>
                )}
                {expression === 'excited' && (
                  <motion.div 
                    key="exp-excited"
                    initial={{ opacity: 0 }} 
                    animate={{ scale: [1, 1.15, 1], opacity: 0.2 }} 
                    className="absolute inset-0 bg-yellow-400/15 blur-[90px] z-5" 
                  />
                )}
                {expression === 'embarrassed' && (
                  <Fragment key="exp-embarrassed">
                    <motion.div key="emb-blush-l" initial={{ opacity: 0 }} animate={{ opacity: 0.45 }} exit={{ opacity: 0 }} className="absolute top-[52%] left-[32%] w-[10%] h-[5%] bg-red-600/25 blur-[20px] rounded-full z-40" />
                    <motion.div key="emb-blush-r" initial={{ opacity: 0 }} animate={{ opacity: 0.45 }} exit={{ opacity: 0 }} className="absolute top-[52%] left-[58%] w-[10%] h-[5%] bg-red-600/25 blur-[20px] rounded-full z-40" />
                  </Fragment>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </main>

        {/* FLOATING GLASS PILOT CONSOLE (BOTTOM CONTROLLER) */}
        <div className="bottom-0 left-0 right-0 p-6 md:p-8 flex flex-col items-center justify-end z-40 select-none pointer-events-none mt-auto">
          
          {/* Dual-sided, Real-time Equalizer Waveform Indicator */}
          <div className="flex items-center justify-center gap-1.5 h-[50px] mb-6 pointer-events-none">
            <AnimatePresence>
              {isSpeaking ? (
                [...Array(14)].map((_, i) => (
                  <motion.div
                    key={`speaking-wave-${i}`}
                    initial={{ height: 4 }}
                    animate={{ 
                      height: [
                        Math.random() * 25 + 10, 
                        Math.random() * 50 + 20, 
                        Math.random() * 18 + 5
                      ],
                      opacity: [0.4, 0.9, 0.5]
                    }}
                    transition={{ duration: 0.35, repeat: Infinity, ease: "easeInOut", delay: i * 0.02 }}
                    className="w-1 rounded-full transition-all duration-300"
                    style={{ 
                      backgroundColor: i % 2 === 0 ? theme.primary : theme.secondary,
                      boxShadow: `0 0 12px ${theme.primary}`
                    }}
                  />
                ))
              ) : isListening ? (
                [...Array(10)].map((_, i) => (
                  <motion.div
                    key={`listening-wave-${i}`}
                    animate={{ 
                      height: Math.max(6, micLevel * 240 * (1 + Math.random())),
                      opacity: [0.3, 0.6, 0.3]
                    }}
                    transition={{ duration: 0.1 }}
                    className="w-1.5 rounded-full"
                    style={{ 
                      backgroundColor: theme.primary,
                      boxShadow: `0 0 10px ${theme.primary}`
                    }}
                  />
                ))
              ) : (
                <motion.div 
                  key="wave-idle" 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 0.25 }} 
                  className="flex items-center gap-1.5 h-full"
                >
                  {[12, 25, 40, 20, 30, 20, 15, 10].map((h, i) => (
                    <div key={`wave-idle-${i}`} className="w-1 h-2 rounded-full transition-all duration-500" style={{ height: `${h * 0.35}px`, backgroundColor: theme.primary }} />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Integrated Floating glass cockpit controller panel */}
          <div className="w-full max-w-xl bg-[#09090f]/80 border border-white/10 backdrop-blur-3xl rounded-3xl p-4.5 flex items-center justify-between shadow-2xl pointer-events-auto gap-4">
            
            {/* Visual Upload Trigger with camera/plus icon */}
            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                className="hidden"
              />
              <motion.button
                onClick={() => fileInputRef.current?.click()}
                whileHover={{ scale: 1.08, backgroundColor: 'rgba(255,255,255,0.06)' }}
                whileTap={{ scale: 0.95 }}
                className="w-11 h-11 rounded-xl bg-white/2 border border-white/5 flex items-center justify-center cursor-pointer group text-gray-400 hover:text-white transition-all shadow"
                title="Send Image Vision Asset to sweety"
              >
                <Plus size={18} className="transition-transform group-hover:rotate-90 duration-300" style={{ color: theme.secondary }} />
              </motion.button>

              {/* Screenshare Toggle */}
              <motion.button
                onClick={startScreenShare}
                whileHover={{ scale: 1.08, backgroundColor: isScreenSharing ? `${theme.primary}22` : 'rgba(255,255,255,0.06)' }}
                whileTap={{ scale: 0.95 }}
                className={`w-11 h-11 rounded-xl border flex items-center justify-center cursor-pointer transition-all ${isScreenSharing ? 'bg-purple-500/15 border-purple-500/30' : 'bg-white/2 border-white/5 text-gray-400 hover:text-white'}`}
                style={isScreenSharing ? { borderColor: theme.primary } : {}}
                title={isScreenSharing ? "Disable screen share capture link" : "Share screenshare viewport with sweety"}
              >
                <Monitor size={17} style={{ color: isScreenSharing ? theme.primary : undefined }} />
              </motion.button>
            </div>

            {/* Central Main Voice Link Sphere */}
            <div className="relative">
              <motion.button
                onClick={toggleMahi}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`
                  w-[74px] h-[74px] rounded-full border-2 
                  bg-[#0a0a10] flex items-center justify-center cursor-pointer 
                  shadow-[0_0_30px_rgba(0,0,0,0.4)] relative overflow-hidden
                  transition-all duration-500
                  ${isActive ? 'border-red-500/40 shadow-[0_0_25px_rgba(239,68,68,0.2)]' : 'border-white/10'}
                `}
                style={!isActive ? { borderColor: `${theme.primary}50` } : {}}
              >
                {/* Active pulsating core */}
                <motion.div 
                  animate={isActive ? { scale: [1, 1.25, 1], opacity: [1, 0.7, 1] } : {}}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  className="w-8 h-8 rounded-full shadow-lg transition-colors duration-500 flex items-center justify-center" 
                  style={{ 
                    backgroundColor: isActive ? '#EF4444' : theme.primary,
                    boxShadow: `0 0 22px ${isActive ? '#EF4444' : theme.primary}`
                  }}
                >
                  {isActive ? <MicOff size={13} className="text-white" /> : <Mic size={13} className="text-white" />}
                </motion.div>
              </motion.button>
              
              {isActive && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.5 }}
                  className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[7px] text-white/30 tracking-[1.5px] uppercase whitespace-nowrap font-mono"
                >
                  Interrupt Link
                </motion.div>
              )}
            </div>

            {/* Interactive Auxiliary Actions */}
            <div className="flex items-center gap-2">
              {/* Launcher for Ludo directly */}
              <motion.button
                onClick={() => setGameMode('ludo')}
                whileHover={{ scale: 1.08, backgroundColor: 'rgba(255,255,255,0.06)' }}
                whileTap={{ scale: 0.95 }}
                className="w-11 h-11 rounded-xl bg-white/2 border border-white/5 flex items-center justify-center cursor-pointer text-gray-400 hover:text-white transition-all shadow"
                title="Initiate interactive Mini-game"
              >
                <Trophy size={16} className="text-yellow-400/80" />
              </motion.button>

              {/* View Memory Log */}
              <motion.button
                onClick={() => setShowStatsPanel(true)}
                whileHover={{ scale: 1.08, backgroundColor: 'rgba(255,255,255,0.06)' }}
                whileTap={{ scale: 0.95 }}
                className="w-11 h-11 rounded-xl bg-white/2 border border-white/5 flex items-center justify-center cursor-pointer text-gray-400 hover:text-white transition-all shadow"
                title="Open records memory files ledger"
              >
                <History size={16} style={{ color: theme.primary }} />
              </motion.button>
            </div>

          </div>

        </div>

      </div>

      {/* MiniGames Overlay Backdrop / Card Container */}
      <MiniGames 
        gameType={gameMode} 
        onClose={() => setGameMode('none')} 
        theme={theme}
        onGameEvent={(event, score) => {
          if (liveSessionRef.current) {
            liveSessionRef.current.sendRealtimeInput({
              text: `Krish triggered game event: ${event}. Current Game Score: ${score}. Respond to his progress!`
            });
          }
        }}
        onGameStarted={handleGameStarted}
        onGameFinished={handleGameFinished}
      />

      {/* Enhanced connection / Error Toast Panel */}
      <AnimatePresence>
        {error && (
          <motion.div 
            key="status-error-overlay"
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className="fixed top-24 left-1/2 z-[150] w-[90%] max-w-sm pointer-events-auto"
          >
            <div className="bg-red-950/90 border border-red-500/30 backdrop-blur-2xl p-4 rounded-2xl flex flex-col items-center gap-3 shadow-2xl overflow-hidden relative">
              <div className="absolute top-0 left-0 w-full h-1 bg-red-500/20 overflow-hidden">
                <motion.div 
                  className="h-full bg-red-500"
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                />
              </div>
              
              <p className="text-red-200 text-xs font-semibold text-center leading-relaxed">
                {error}
              </p>
              
              <button 
                onClick={() => { stopMahi(); setTimeout(startMahi, 300); }}
                className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-4.5 py-1.5 rounded-xl text-[9px] font-bold uppercase tracking-[2px] transition-all active:scale-95 text-white"
              >
                Recalibrate Connection
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* COMPANION MEMORY LOGS DRAWER (RIGHT SIDEBAR) */}
      <AnimatePresence>
        {showStatsPanel && currentUser && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowStatsPanel(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-md z-[120] pointer-events-auto"
            />

            {/* Sidebar Drawer */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 210 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-[#07070b]/98 border-l border-white/10 p-6 overflow-y-auto z-[130] flex flex-col gap-5.5 shadow-2xl pointer-events-auto"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                    <Trophy className="text-indigo-400" size={17} />
                  </div>
                  <div>
                    <h2 className="text-xs font-black uppercase tracking-[2px] text-white">sweety Memory Log</h2>
                    <p className="text-[8px] text-gray-400 font-mono">Syncing partner since {currentUser.metadata.creationTime ? new Date(currentUser.metadata.creationTime).toLocaleDateString() : 'now'}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowStatsPanel(false)}
                  className="p-1.5 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors"
                >
                  <X size={17} />
                </button>
              </div>

              {/* Quick Stats Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white/3 border border-white/5 p-3 rounded-xl text-center">
                  <div className="text-[8px] uppercase font-mono text-indigo-300">Ludo Played</div>
                  <div className="text-lg font-black mt-1 text-white">{userProfile?.ludoPlayed || 0}</div>
                </div>
                <div className="bg-white/3 border border-white/5 p-3 rounded-xl text-center">
                  <div className="text-[8px] uppercase font-mono text-emerald-300">Ludo Won</div>
                  <div className="text-lg font-black mt-1 text-white">{userProfile?.ludoWon || 0}</div>
                </div>
                <div className="bg-white/3 border border-white/5 p-3 rounded-xl text-center">
                  <div className="text-[8px] uppercase font-mono text-pink-300">Win Rate</div>
                  <div className="text-lg font-black mt-1 text-white">
                    {userProfile?.ludoPlayed ? Math.round((userProfile.ludoWon / userProfile.ludoPlayed) * 100) : 0}%
                  </div>
                </div>
              </div>

              {/* PWA App Installation CTA */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-950/15 to-indigo-950/15 border border-purple-500/15 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles size={13} className="text-purple-400 shrink-0" />
                  <span className="text-[9px] font-mono uppercase tracking-wider text-purple-200">Convert to Standalone App</span>
                </div>
                <p className="text-[9px] text-gray-400 leading-relaxed">
                  Install sweety as a standalone app on your home screen or desktop for fullscreen, zero-latency fluid voice chats.
                </p>
                {isInstallable ? (
                  <motion.button
                    onClick={handleInstallApp}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="mt-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-mono uppercase text-[9px] py-2 rounded-xl flex items-center justify-center gap-1.5 shadow-lg tracking-widest transition-colors font-black"
                  >
                    Install sweety App
                  </motion.button>
                ) : (
                  <div className="mt-1 border-t border-white/5 pt-2 text-[8px] text-gray-500 font-mono space-y-1">
                    <div className="flex items-center gap-1">
                      <span className="text-purple-400 font-bold">iOS/Safari:</span> Tap share icon 📤 then select <span className="text-white">"Add to Home Screen"</span>.
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-indigo-400 font-bold">Android/Chrome:</span> Tap browser menu (3 dots) then select <span className="text-white">"Install app"</span>.
                    </div>
                  </div>
                )}
              </div>

              {/* Ludo Matches List */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-1 text-[9px] font-mono uppercase text-gray-400 tracking-wider">
                  <History size={12} className="text-indigo-400" />
                  Recent Matches Database
                </div>
                <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1">
                  {recentMatches.length === 0 ? (
                    <div className="text-[9px] text-gray-500 italic py-3 text-center bg-white/2 rounded-lg">No matches played yet. Start a game with sweety!</div>
                  ) : (
                    recentMatches.map((match: any) => {
                      const isPlayerWinner = match.winner === 'player';
                      return (
                        <div key={match.id} className="flex items-center justify-between p-2.5 rounded-lg bg-white/3 border border-white/5 text-[9.5px]">
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${isPlayerWinner ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-pink-400'}`} />
                            <span className="text-gray-300">Score: {match.playerPos} - {match.mahiPos}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`uppercase font-black tracking-wider ${isPlayerWinner ? 'text-emerald-400' : 'text-pink-400'}`}>
                              {isPlayerWinner ? 'Victory' : 'Defeat'}
                            </span>
                            <span className="text-gray-500 font-mono">
                              {match.createdAt?.seconds ? new Date(match.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Speech Conversation Log */}
              <div className="flex flex-col gap-2.5 flex-1 min-h-0">
                <div className="flex items-center gap-1 text-[9px] font-mono uppercase text-gray-400 tracking-wider">
                  <MessageSquare size={12} className="text-pink-400" />
                  Voice Transcripts Ledger
                </div>
                <div className="flex-1 overflow-y-auto space-y-3 bg-white/2 rounded-xl border border-white/5 p-3 min-h-[200px]">
                  {recentMessages.length === 0 ? (
                    <div className="text-[9px] text-gray-500 italic py-6 text-center h-full flex flex-col items-center justify-center gap-2">
                      <Sparkles size={16} className="text-gray-600 animate-pulse" />
                      <span>No logs synced yet. Talk to sweety to save memories!</span>
                    </div>
                  ) : (
                    recentMessages.map((msg: any) => (
                      <div key={msg.id} className="space-y-1.5 border-b border-white/5 pb-2.5 last:border-0 last:pb-0">
                        <div className="flex items-center justify-between text-[7px] font-mono text-gray-500">
                          <span>Verified Memory</span>
                          <span>
                            {msg.createdAt?.seconds ? new Date(msg.createdAt.seconds * 1000).toLocaleDateString() : ''}
                          </span>
                        </div>
                        <div className="text-[10px] leading-relaxed">
                          <div className="text-indigo-300 font-medium">You: <span className="text-gray-300 font-normal">{msg.userText}</span></div>
                          <div className="text-pink-300 font-medium mt-0.5">sweety: <span className="text-gray-300 font-normal">{msg.mahiText}</span></div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Warning/Harden Info */}
              <div className="mt-auto p-2.5 bg-indigo-950/20 border border-indigo-500/10 rounded-xl flex items-start gap-2">
                <Shield size={13} className="text-indigo-400 shrink-0 mt-0.5" />
                <p className="text-[8.5px] text-gray-400 leading-normal">
                  Companion Memory Logs are protected by Firebase Zero-Trust Attribute-Based security rules. Only you can view or write your companion records.
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
