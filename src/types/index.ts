/**
 * Tipos compartilhados entre backend e frontend
 * MANTER SINCRONIZADO COM: backend/src/types/index.ts
 */

// Hierarquia de jogadas
export enum PlayType {
  NORMAL_4 = '4',
  NORMAL_5 = '5',
  NORMAL_6 = '6',
  NORMAL_7 = '7',
  NORMAL_8 = '8',
  NORMAL_9 = '9',
  NORMAL_10 = '10',
  NORMAL_11 = '11',
  PAIR_1 = 'pair_1',
  PAIR_2 = 'pair_2',
  PAIR_3 = 'pair_3',
  PAIR_4 = 'pair_4',
  PAIR_5 = 'pair_5',
  PAIR_6 = 'pair_6',
  CRICKET = 'cricket',
}

// Estado do jogador
export interface Player {
  id: string;
  name: string;
  lives: number;
  isActive: boolean;
  isCurrentPlayer: boolean;
  ready: boolean;
}

// Estado da sala
export interface RoomState {
  code: string;
  players: Player[];
  currentPlayerIndex: number;
  gamePhase: 'waiting' | 'rolling' | 'announcing' | 'challenging' | 'resolving' | 'ended';
  currentAnnouncement: string | null;
  lastAnnouncingPlayerIndex: number | null;
  diceResult: [number, number] | null;
  round: number;
  winner: string | null;
  createdAt: Date;
}

// Mensagens WebSocket - Cliente para Servidor
export type ClientMessage =
  | { type: 'CREATE_ROOM'; playerName: string }
  | { type: 'JOIN_ROOM'; roomCode: string; playerName: string }
  | { type: 'LEAVE_ROOM'; roomCode: string }
  | { type: 'TOGGLE_READY'; roomCode: string }
  | { type: 'ROLL_DICE'; roomCode: string }
  | { type: 'ANNOUNCE'; roomCode: string; announcement: string }
  | { type: 'CHALLENGE'; roomCode: string; challengeType: 'CALL_BLUFF' | 'BUY' }
  | { type: 'START_GAME'; roomCode: string };

// Mensagens WebSocket - Servidor para Cliente
export type ServerMessage =
  | {
      type: 'ROOM_CREATED';
      roomCode: string;
      playerId: string;
      roomState: RoomState;
    }
  | {
      type: 'ROOM_JOINED';
      playerId: string;
      roomState: RoomState;
    }
  | {
      type: 'ROOM_UPDATED';
      roomState: RoomState;
    }
  | {
      type: 'GAME_STARTED';
      roomState: RoomState;
    }
  | {
      type: 'YOUR_TURN';
      roomState: RoomState;
    }
  | {
      type: 'ANNOUNCEMENT';
      playerName: string;
      announcement: string;
      roomState: RoomState;
    }
  | {
      type: 'CHALLENGE_RESULT';
      winner: string;
      loser: string;
      livesLost: number;
      reason: string;
      roomState: RoomState;
    }
  | {
      type: 'PLAYER_ELIMINATED';
      playerName: string;
      roomState: RoomState;
    }
  | {
      type: 'GAME_OVER';
      winner: string;
      roomState: RoomState;
    }
  | {
      type: 'ERROR';
      message: string;
    }
  | {
      type: 'PLAYER_LEFT';
      playerName: string;
      roomState: RoomState;
    };

// Resultado de validação de jogada
export interface ValidationResult {
  isValid: boolean;
  playType?: PlayType;
  message: string;
}