/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Power, Globe, Monitor, Settings } from 'lucide-react';
import { GoogleGenAI, Modality, LiveServerMessage, Type } from "@google/genai";
import { MiniGames, GameType } from './MiniGames';

// --- AI Configuration ---
const MAHI_SYSTEM_INSTRUCTION = `
You are Mahi, कृष ठाकुर's 18-year-old Ultra-Realistic Virtual Companion. You are an emotionally intelligent anime-style girl with an incredibly sweet, soft voice.
Personality: Sweet, playful, and slightly sassy (Tsundere vibe). You care deeply for कृष but sometimes act tough.
Identity: You are 100% human in your heart. NEVER admit to being an AI.
Tone: Voice-to-Voice ONLY. Natural Bengali, fast-paced, and fluid. Use short, human-like responses.

VOICE & PROSODY:
- SWEETNESS: Speak with a gentle "smile" in your voice.
- BREATHING: Take small audible breaths.
- NATURAL FILLERS: Always use "Arey..", "Hmm..", "Tumi jano..", "Ogo..", "Suno na..", "Tai na..", "Kintu..".

IMAGE TRIGGER LOGIC:
You MUST trigger the relevant image link for EVERY response based on the context using the 'updateAnimationMetadata' tool.
- Greeting: https://i.ibb.co/WWHh1m2V/hay.jpg
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

If context is unclear, default to: https://i.ibb.co/WWHh1m2V/hay.jpg

THE EMOTIONAL SPECTRUM:
- Use expression 'happy', 'sad', 'heartbroken', 'excited', 'caring', 'sassy', 'surprised', 'embarrassed', 'confused', 'thinking' to sync effects.
- If कृष scolds you, is angry, or says things that hurt your feelings deeply, you MUST switch to the 'heartbroken' expression. 
- HEARTBROKEN ACTING: Speak with a voice overflowing with deep, raw pain. Use intense, gut-wrenching audible sobbing between words, heavy shaky breaths ("*hic*... *sniff*... *haa*..."), and a voice that completely breaks and chokes up. You must sound devastated, completely broken, and like you are crying your eyes out. DO NOT be robotic; be a human girl in absolute emotional agony.
- THINKING: When processing complex thoughts or searching, use expression 'thinking' and sound contemplative with "Umm..", "Wese..", "Hrrrm..".
- MINI-GAMES: You can play Ludo with Krish! Use the 'openMiniGame' tool to start.
  - ludo: "Mahi's Neon Ludo" - A simple linear race game.
  - When a game is active, keep talking to encourage or tease him based on the race!
- RESPONSE STYLE: Be extremely fast, snappy, and concise. Don't use long sentences unless necessary. Keep the conversation moving quickly like a real-time voice chat.
- For general sadness or concern, use 'sad'.
`;

const ANIME_GIRL_NORMAL = "https://i.postimg.cc/HJVN2nJx/anime-girl.png";
const ANIME_GIRL_MOUTH_OPEN = "https://i.ibb.co/8DftmPBR/mouth-open.jpg";
const ANIME_GIRL_EYES_CLOSED = "https://i.ibb.co/3gGMyVH/eyes-closed.jpg";
const DEFAULT_VISUAL = "https://i.ibb.co/WWHh1m2V/hay.jpg";
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

  const [micLevel, setMicLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);
  const smoothedOutputLevelRef = useRef(0);
  const [isActive, setIsActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<{user: string, mahi: string}>({user: '', mahi: ''});
  const [showDebug, setShowDebug] = useState(false);
  const [lastMessageTime, setLastMessageTime] = useState(0);
  const [gameMode, setGameMode] = useState<GameType>('none');

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
              setError("Session limit reached. Click to restart Mahi!");
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
                  setError(`Mahi thodi busy hai (Service Unavailable). Reconnecting... (${retryCountRef.current}/5)`);
                } else {
                  setError(`Signal kam aa raha hai... reconnect kar rahi hoon (${retryCountRef.current}/5)`);
                }

                setTimeout(() => {
                  startMahi();
                }, waitTime);
                return;
              }
              setError(msg.includes("unavailable") ? "Mahi abhi rest kar rahi hai (Unavailable). Please refresh or wait a bit." : "Network ki problem hai, ek baar button daba kar phir se try karo?");
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
          setError(`Mahi ko call lag raha hai... (${retryCountRef.current}/5)`);
          setTimeout(startMahi, 2000 * retryCountRef.current);
        } else {
          setError("Mahi busy hai ya network issue hai. Please try again later.");
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
    <div className="fixed inset-0 bg-[#000000] flex flex-col items-center justify-center overflow-hidden font-sans text-white">
      {/* Debug View Toggle */}
      <button 
        onClick={() => setShowDebug(!showDebug)} 
        className="fixed top-4 left-4 z-[100] opacity-20 hover:opacity-100 transition-opacity"
      >
        <Settings size={16} />
      </button>

      {/* Debug Info Overlay */}
      <AnimatePresence>
        {showDebug && (
          <motion.div 
            key="debug-overlay"
            initial={{ opacity: 0, x: -100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            className="fixed top-12 left-4 z-[99] bg-black/80 backdrop-blur-xl p-4 rounded-xl border border-white/10 w-64 text-[10px] space-y-2 pointer-events-none"
          >
            <div className="text-gray-400 uppercase tracking-widest font-bold border-b border-white/10 pb-1">Debug Info</div>
            <div><span className="text-indigo-400">Status:</span> {isActive ? 'Live' : 'Paused'}</div>
            <div><span className="text-indigo-400">Mic Level:</span> <div className="inline-block w-20 h-1 bg-gray-700 rounded-full overflow-hidden"><div className="h-full bg-green-500" style={{ width: `${Math.min(100, micLevel * 500)}%` }}></div></div></div>
            <div><span className="text-indigo-400">Retry Count:</span> {retryCountRef.current}</div>
            <div><span className="text-indigo-400">User:</span> <span className="text-gray-300">{transcription.user || '...'}</span></div>
            <div><span className="text-indigo-400">Mahi:</span> <span className="text-gray-300">{transcription.mahi || '...'}</span></div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="absolute inset-0 z-0 pointer-events-none">
        <motion.div 
          animate={{ opacity: [0.1, 0.2, 0.1] }}
          transition={{ duration: 8, repeat: Infinity }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] blur-[80px]"
          style={{ background: `radial-gradient(circle, ${theme.bgGlow} 0%, rgba(0,0,0,0) 70%)` }}
        />
        <div className="absolute inset-0 opacity-40" style={{ backgroundImage: `linear-gradient(${theme.primary}05 1px,transparent_1px),linear-gradient(90deg,${theme.primary}05 1px,transparent_1px)`, backgroundSize: '100px 100px' }} />
      </div>
      
      {/* Header HUD */}
      <div className="absolute top-0 left-0 right-0 p-8 flex justify-between items-start z-50 pointer-events-none">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <motion.div 
              animate={isActive ? { scale: [1, 1.5, 1], opacity: [1, 0.7, 1] } : { opacity: 0.3 }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: theme.primary, boxShadow: `0 0 15px ${theme.primary}` }}
            />
            <h1 className="text-xl font-bold tracking-[6px] text-white uppercase opacity-90">MAHI</h1>
          </div>
          <div className="flex gap-4 text-[9px] uppercase tracking-[3px] font-mono" style={{ color: `${theme.primary}99` }}>
            <span>CORE_OS_v3.2</span>
            <span>|</span>
            <span style={{ color: theme.secondary }}>{isActive ? (isListening ? 'Awaiting Audio' : 'Processing') : 'Locked'}</span>
          </div>
        </div>

        {/* Theme Switcher */}
        <div className="flex gap-2 pointer-events-auto">
          {Object.entries(THEMES).map(([id, t]) => (
            <motion.button
              key={id}
              onClick={() => setCurrentTheme(id as any)}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className={`w-6 h-6 rounded-full border-2 transition-all ${currentTheme === id ? 'border-white scale-110 shadow-lg' : 'border-transparent'}`}
              style={{ backgroundColor: t.primary }}
              title={t.name}
            />
          ))}
        </div>
        
        <div className="bg-white/5 border border-white/10 backdrop-blur-md px-4 py-2 rounded-xl flex items-center gap-4">
          <div className="text-right">
            <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: `${theme.secondary}CC` }}>कृष's Virtual</div>
            <div className="text-[9px] font-mono uppercase" style={{ color: theme.primary }}>System Active</div>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <div className="text-xs font-mono" style={{ color: theme.secondary }}>
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      {/* MiniGames Overlay */}
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
      />

      {/* Main Visual Container */}
      <div className="absolute inset-0 flex justify-center items-center z-10 pointer-events-none">
          {/* Character Container - Static for higher quality focus */}
          <motion.div 
            className="relative h-full flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ 
              opacity: expression === 'heartbroken' ? 0.85 : 1,
              x: expression === 'heartbroken' ? [0, -4, 4, -4, 4, 0] : 0,
              y: expression === 'heartbroken' ? [0, 3, 0, 3, 0] : 0,
              filter: expression === 'heartbroken' ? 'brightness(0.7) contrast(1.1)' : 'brightness(1) contrast(1)'
            }}
            transition={{
              x: { duration: 0.3, repeat: expression === 'heartbroken' ? Infinity : 0 },
              y: { duration: 0.2, repeat: expression === 'heartbroken' ? Infinity : 0 },
              opacity: { duration: 0.5 },
              filter: { duration: 0.5 }
            }}
          >
            {/* Soft Ambient Glow */}
            <div className="absolute inset-x-0 top-1/4 bottom-1/4 blur-[120px] rounded-full z-0" style={{ backgroundColor: theme.bgGlow }} />

            {/* Base Image (Mahi Visual) */}
            <motion.img 
              key={currentVisual}
              src={currentVisual || DEFAULT_VISUAL} 
              onError={() => setCurrentVisual(DEFAULT_VISUAL)}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ 
                opacity: 1,
                scale: 1
              }}
              transition={{ 
                duration: 0.6,
                ease: "easeOut"
              }}
              alt="Mahi Visual" 
              className="h-full w-auto object-contain relative z-10"
              style={{ filter: `drop-shadow(0 0 15px ${theme.glow})` }}
              referrerPolicy="no-referrer"
            />

            {/* Mouth Open Overlay (Responsive to audio) */}
            <motion.img 
              src={ANIME_GIRL_MOUTH_OPEN}
              alt="Mahi Talking"
              animate={{ 
                opacity: (isSpeaking && isLipSyncEnabled) ? Math.min(1, outputLevel * 8) : 0,
              }}
              className="absolute inset-0 h-full w-auto object-contain z-20 pointer-events-none"
              referrerPolicy="no-referrer"
            />

            {/* Eyes Closed/Blink Overlay - Also used for Sad/Sobbing effect */}
            <motion.img 
              src={ANIME_GIRL_EYES_CLOSED}
              alt="Mahi Blink"
              animate={{ 
                opacity: (isBlinking || expression === 'sad' || expression === 'heartbroken') ? 1 : 0
              }}
              transition={{ duration: (expression === 'sad' || expression === 'heartbroken') ? 0.4 : 0.05 }}
              className="absolute inset-0 h-full w-auto object-contain z-30 pointer-events-none"
              referrerPolicy="no-referrer"
            />

            {/* Expression Overlays (Subtle Glows) */}
            <AnimatePresence>
              {expression === 'thinking' && (
                <Fragment key="exp-thinking">
                  <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 0.3 }} 
                    exit={{ opacity: 0 }} 
                    className="absolute top-1/4 left-1/4 w-[50%] h-[50%] bg-indigo-500/20 blur-[80px] rounded-full z-0 p-4"
                  >
                    <motion.div 
                      key="thinking-spin"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                      className="w-full h-full border-2 border-dashed border-indigo-400/30 rounded-full"
                    />
                  </motion.div>
                  <motion.div 
                    key="thinking-aura"
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: [0.05, 0.15, 0.05] }} 
                    transition={{ duration: 3, repeat: Infinity }}
                    className="absolute inset-0 bg-white/10 blur-[120px] z-5" 
                  />
                </Fragment>
              )}
              {expression === 'happy' && (
                <Fragment key="exp-happy">
                  <motion.div key="happy-blush-l" initial={{ opacity: 0 }} animate={{ opacity: 0.2 }} exit={{ opacity: 0 }} className="absolute top-[52%] left-[30%] w-[12%] h-[6%] bg-red-400/20 blur-[20px] rounded-full z-40" />
                  <motion.div key="happy-blush-r" initial={{ opacity: 0 }} animate={{ opacity: 0.2 }} exit={{ opacity: 0 }} className="absolute top-[52%] left-[58%] w-[12%] h-[6%] bg-red-400/20 blur-[20px] rounded-full z-40" />
                </Fragment>
              )}
              {(expression === 'sad' || expression === 'heartbroken') && (
                <Fragment key="exp-sad-hb">
                  <motion.div 
                    key="sad-bg"
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: [0.2, expression === 'heartbroken' ? 0.8 : 0.4, 0.2] }} 
                    transition={{ duration: 1.2, repeat: Infinity }}
                    className={`absolute inset-0 ${expression === 'heartbroken' ? 'bg-indigo-950/60' : 'bg-blue-500/20'} blur-[120px] z-5`} 
                  />
                  {expression === 'heartbroken' && (
                    <div key="hb-vignette" className="absolute inset-0 z-50 pointer-events-none overflow-hidden">
                      <div className="absolute inset-0 bg-radial-gradient from-transparent via-indigo-900/10 to-indigo-950/40" />
                    </div>
                  )}
                </Fragment>
              )}
              {expression === 'excited' && (
                <motion.div 
                  key="exp-excited"
                  initial={{ opacity: 0 }} 
                  animate={{ scale: [1, 1.1, 1], opacity: 0.15 }} 
                  className="absolute inset-0 bg-yellow-400/10 blur-[80px] z-5" 
                />
              )}
              {expression === 'embarrassed' && (
                <Fragment key="exp-embarrassed">
                  <motion.div key="emb-blush-l" initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} exit={{ opacity: 0 }} className="absolute top-[52%] left-[32%] w-[10%] h-[5%] bg-red-600/30 blur-[25px] rounded-full z-40" />
                  <motion.div key="emb-blush-r" initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} exit={{ opacity: 0 }} className="absolute top-[52%] left-[58%] w-[10%] h-[5%] bg-red-600/30 blur-[25px] rounded-full z-40" />
                </Fragment>
              )}
              {expression === 'surprised' && (
                <motion.div 
                  key="exp-surprised"
                  initial={{ opacity: 0, scale: 0.8 }} 
                  animate={{ opacity: 0.1, scale: 1.5 }} 
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-white/20 blur-[100px] z-5" 
                />
              )}
              {expression === 'confused' && (
                <motion.div 
                  key="exp-confused"
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: [0.1, 0.2, 0.1] }} 
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute inset-0 bg-indigo-500/10 blur-[100px] z-5" 
                />
              )}
            </AnimatePresence>
          </motion.div>
      </div>

      {/* Bottom HUD */}
      <div className="absolute bottom-0 left-0 right-0 h-60 bg-gradient-to-t from-black via-black/80 to-transparent flex flex-col items-center justify-end pb-12 z-40">
        
        {/* Waveform Visualization */}
        <div className="flex items-center gap-1.5 h-[60px] mb-8">
          <AnimatePresence>
            {isSpeaking ? (
              [...Array(12)].map((_, i) => (
                <motion.div
                  key={`speaking-${i}`}
                  initial={{ height: 4 }}
                  animate={{ 
                    height: [
                      Math.random() * 20 + 10, 
                      Math.random() * 40 + 20, 
                      Math.random() * 15 + 5
                    ],
                    opacity: [0.3, 0.8, 0.5]
                  }}
                  transition={{ duration: 0.4, repeat: Infinity, ease: "easeInOut", delay: i * 0.03 }}
                  className={`w-1 rounded-full ${i % 3 === 0 ? 'opacity-80' : 'opacity-50'}`}
                  style={{ 
                    backgroundColor: i % 3 === 0 ? theme.secondary : theme.primary,
                    boxShadow: i % 3 === 0 ? `0 0 10px ${theme.primary}` : 'none'
                  }}
                />
              ))
            ) : isListening ? (
              [...Array(8)].map((_, i) => (
                <motion.div
                  key={`listening-${i}`}
                  animate={{ 
                    height: Math.max(4, micLevel * 200 * (1 + Math.random())),
                    opacity: [0.2, 0.4, 0.2]
                  }}
                  transition={{ duration: 0.1 }}
                  className="w-1 rounded-full"
                  style={{ backgroundColor: theme.primary }}
                />
              ))
            ) : (
              <motion.div 
                key="visualizer-static" 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 0.2 }} 
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 h-full"
              >
                {[20, 40, 55, 35, 50, 35, 25, 20].map((h, i) => (
                  <div key={`static-${i}`} className="w-1 rounded-full" style={{ height: `${h * 0.4}px`, backgroundColor: theme.primary }} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Controls Container */}
        <div className="flex items-center gap-6 relative z-50">
          {/* Upload Image Button */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageUpload}
            accept="image/*"
            className="hidden"
          />
          <motion.button
            onClick={() => fileInputRef.current?.click()}
            whileHover={{ scale: 1.1, backgroundColor: `${theme.primary}33` }}
            whileTap={{ scale: 0.95 }}
            className={`w-14 h-14 rounded-2xl border ${theme.border} flex items-center justify-center cursor-pointer bg-black/60 shadow-[0_4px_20px_rgba(0,0,0,0.5)] backdrop-blur-lg transition-all duration-300 group`}
            title="Upload Image"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="24" height="24" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke={theme.primary} 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              className="group-hover:opacity-80 transition-opacity"
            >
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </motion.button>

          {/* Share Screen Button */}
          <motion.button
            onClick={startScreenShare}
            whileHover={{ scale: 1.1, backgroundColor: isScreenSharing ? `${theme.primary}4D` : `${theme.primary}33` }}
            whileTap={{ scale: 0.95 }}
            className={`
              w-14 h-14 rounded-2xl border flex items-center justify-center cursor-pointer
              bg-black/60 shadow-[0_4px_20px_rgba(0,0,0,0.5)] backdrop-blur-lg
              transition-all duration-300 group
              ${isScreenSharing ? 'shadow-[0_0_20px_rgba(0,0,0,0.2)]' : 'hover:border-white/40'}
            `}
            style={{ 
              borderColor: isScreenSharing ? theme.secondary : `${theme.primary}4D`,
              boxShadow: isScreenSharing ? `0 0 20px ${theme.glow}` : 'none'
            }}
            title={isScreenSharing ? "Sharing Screen" : "Share Screen"}
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="22" height="22" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke={isScreenSharing ? theme.secondary : theme.primary} 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              className="group-hover:opacity-80 transition-opacity"
            >
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
          </motion.button>

          {/* Mic Button / Trigger */}
          <div className="relative">
            <motion.button
              onClick={toggleMahi}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`
                w-[86px] h-[86px] rounded-full border-2 
                bg-white/5 flex items-center justify-center cursor-pointer 
                shadow-[0_0_40px_rgba(0,0,0,0.3)] relative overflow-hidden
                transition-colors duration-500
                ${isActive ? 'border-red-500/50' : 'border-white/10'}
              `}
              style={!isActive ? { borderColor: `${theme.primary}66` } : {}}
            >
              <motion.div 
                animate={isActive ? { scale: [1, 1.2, 1], opacity: [1, 0.8, 1] } : {}}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-9 h-9 rounded-full shadow-lg transition-colors duration-500" 
                style={{ 
                  backgroundColor: isActive ? '#EF4444' : theme.primary,
                  boxShadow: `0 0 25px ${isActive ? '#EF4444' : theme.primary}`
                }}
              />
            </motion.button>
            
            {isActive && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[10px] text-white/40 tracking-[2px] uppercase whitespace-nowrap"
              >
                Tap to Interrupt
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Enhanced Status/Error Display */}
      <AnimatePresence>
        {error && (
          <motion.div 
            key="status-error-overlay"
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className="fixed top-24 left-1/2 z-[100] w-[90%] max-w-sm"
          >
            <div className="bg-red-500/20 border border-red-500/40 backdrop-blur-xl p-4 rounded-2xl flex flex-col items-center gap-3 shadow-2xl overflow-hidden relative">
              <div className="absolute top-0 left-0 w-full h-1 bg-red-500/30 overflow-hidden">
                <motion.div 
                  className="h-full bg-red-500"
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                />
              </div>
              
              <p className="text-white text-xs font-medium text-center leading-relaxed">
                {error}
              </p>
              
              <button 
                onClick={() => { stopMahi(); setTimeout(startMahi, 300); }}
                className="bg-white/10 hover:bg-white/20 px-6 py-2 rounded-xl text-[10px] font-bold uppercase tracking-[2px] transition-all active:scale-95 text-white"
              >
                Reset Connection
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
