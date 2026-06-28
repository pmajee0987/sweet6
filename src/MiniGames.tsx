import React, { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Star, Music, Brain, X, CheckCircle2, AlertCircle, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6, User, Bot } from 'lucide-react';

export type GameType = 'ludo' | 'none';

interface MiniGamesProps {
  gameType: GameType;
  onClose: () => void;
  onGameEvent: (event: string, score: number) => void;
  theme: {
    primary: string;
    secondary: string;
    accent: string;
  };
}

const BOARD_SIZE = 15; // Small linear board for quick play

const DICE_ICONS = [Dice1, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];

export function MiniGames({ gameType, onClose, onGameEvent, theme }: MiniGamesProps) {
  // --- Ludo State ---
  const [playerPos, setPlayerPos] = useState(0);
  const [mahiPos, setMahiPos] = useState(0);
  const [turn, setTurn] = useState<'player' | 'mahi'>('player');
  const [diceRoll, setDiceRoll] = useState(1);
  const [isRolling, setIsRolling] = useState(false);
  const [winner, setWinner] = useState<'player' | 'mahi' | null>(null);

  const rollDice = () => {
    if (isRolling || winner || turn !== 'player') return;
    performRoll('player');
  };

  const performRoll = (who: 'player' | 'mahi') => {
    setIsRolling(true);
    let rolls = 0;
    const interval = setInterval(() => {
      setDiceRoll(Math.floor(Math.random() * 6) + 1);
      rolls++;
      if (rolls > 10) {
        clearInterval(interval);
        const finalValue = Math.floor(Math.random() * 6) + 1;
        setDiceRoll(finalValue);
        setIsRolling(false);
        movePiece(who, finalValue);
      }
    }, 80);
  };

  const movePiece = (who: 'player' | 'mahi', value: number) => {
    if (who === 'player') {
      const next = Math.min(BOARD_SIZE, playerPos + value);
      setPlayerPos(next);
      onGameEvent('player_moved', next);
      if (next === BOARD_SIZE) {
        setWinner('player');
        onGameEvent('player_won', 100);
      } else {
        setTurn('mahi');
      }
    } else {
      const next = Math.min(BOARD_SIZE, mahiPos + value);
      setMahiPos(next);
      onGameEvent('mahi_moved', next);
      if (next === BOARD_SIZE) {
        setWinner('mahi');
        onGameEvent('mahi_won', 0);
      } else {
        setTurn('player');
      }
    }
  };

  // Mahi's AI Turn
  useEffect(() => {
    if (turn === 'mahi' && !winner && gameType === 'ludo') {
      const timer = setTimeout(() => {
        performRoll('mahi');
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [turn, winner, gameType]);

  if (gameType === 'none') return null;

  const DiceIcon = DICE_ICONS[diceRoll];

  return (
    <motion.div 
      initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
      animate={{ opacity: 1, backdropFilter: 'blur(10px)' }}
      exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
      className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/40"
    >
      <div className="relative w-full max-w-xl bg-[#0a0a0c] border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <Trophy className="text-yellow-400" />
            <h2 className="text-lg font-bold tracking-tight uppercase">Mahi's Neon Ludo</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Board View */}
        <div className="p-8 flex-1 flex flex-col items-center justify-center gap-12">
          
          {/* Track */}
          <div className="w-full relative flex items-center justify-between h-20 bg-white/5 rounded-2xl border border-white/10 p-4">
            <div className="absolute inset-0 flex divide-x divide-white/5">
              {[...Array(BOARD_SIZE + 1)].map((_, i) => (
                <div key={i} className="flex-1 h-full" />
              ))}
            </div>
            
            {/* Player Piece */}
            <motion.div 
              animate={{ x: `${(playerPos / BOARD_SIZE) * 90}%` }}
              transition={{ type: 'spring', stiffness: 100 }}
              className="absolute z-20 top-2"
            >
              <div className="w-8 h-8 rounded-full bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.5)] flex items-center justify-center border border-white/20">
                <User size={14} />
              </div>
              <div className="text-[8px] uppercase font-bold text-center mt-1 text-indigo-300">You</div>
            </motion.div>

            {/* Mahi Piece */}
            <motion.div 
              animate={{ x: `${(mahiPos / BOARD_SIZE) * 90}%` }}
              transition={{ type: 'spring', stiffness: 100 }}
              className="absolute z-20 bottom-2"
            >
              <div className="w-8 h-8 rounded-full bg-pink-500 shadow-[0_0_15px_rgba(236,72,153,0.5)] flex items-center justify-center border border-white/20">
                <Bot size={14} />
              </div>
              <div className="text-[8px] uppercase font-bold text-center mt-1 text-pink-300">Mahi</div>
            </motion.div>

            {/* Finish Line Indicator */}
            <div className="absolute right-0 top-0 bottom-0 w-8 bg-green-500/10 flex items-center justify-center border-l border-green-500/20">
               <Trophy size={14} className="text-green-500/50" />
            </div>
          </div>

          {/* Dice & Status */}
          <div className="flex flex-col items-center gap-6">
            <AnimatePresence mode="wait">
              {winner ? (
                <motion.div 
                  key="winner"
                  initial={{ scale: 0 }} 
                  animate={{ scale: 1 }}
                  className="flex flex-col items-center gap-2"
                >
                  <Trophy size={48} className="text-yellow-400" />
                  <h3 className="text-2xl font-black uppercase text-white">
                    {winner === 'player' ? "You Won!" : "Mahi Won!"}
                  </h3>
                  <button 
                    onClick={() => { setPlayerPos(0); setMahiPos(0); setWinner(null); setTurn('player'); }}
                    className="mt-4 px-6 py-2 bg-indigo-600 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-indigo-500 transition-colors"
                  >
                    Play Again
                  </button>
                </motion.div>
              ) : (
                <div className="flex items-center gap-12">
                   <div className={`flex flex-col items-center gap-2 transition-opacity ${turn === 'player' ? 'opacity-100' : 'opacity-30'}`}>
                      <User className="text-indigo-400" />
                      <span className="text-[10px] uppercase font-bold tracking-widest">You</span>
                   </div>

                   <motion.button
                     whileHover={{ scale: turn === 'player' ? 1.1 : 1 }}
                     whileTap={{ scale: turn === 'player' ? 0.9 : 1 }}
                     onClick={rollDice}
                     disabled={turn !== 'player' || isRolling}
                     className={`w-24 h-24 rounded-3xl flex flex-col items-center justify-center gap-2 border-2 transition-all cursor-pointer relative
                       ${turn === 'player' ? 'border-indigo-500 bg-indigo-500/10' : 'border-white/10 bg-white/5 opacity-50'}
                       ${isRolling ? 'animate-pulse' : ''}
                     `}
                   >
                     <motion.div
                       animate={isRolling ? { rotate: [0, 90, 180, 270, 360] } : {}}
                       transition={{ duration: 0.2, repeat: Infinity, ease: 'linear' }}
                     >
                       <DiceIcon size={40} className={turn === 'player' ? 'text-indigo-400' : 'text-gray-400'} />
                     </motion.div>
                     <span className="text-[9px] uppercase font-black">{isRolling ? 'Rolling...' : turn === 'player' ? 'Tap To Roll' : "Mahi's Turn"}</span>
                   </motion.button>

                   <div className={`flex flex-col items-center gap-2 transition-opacity ${turn === 'mahi' ? 'opacity-100' : 'opacity-30'}`}>
                      <Bot className="text-pink-400" />
                      <span className="text-[10px] uppercase font-bold tracking-widest">Mahi</span>
                   </div>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-white/5 text-center">
          <p className="text-[10px] text-gray-400 tracking-wider">
            Ludo: A race to the end with Mahi!
          </p>
        </div>
      </div>
    </motion.div>
  );
}

