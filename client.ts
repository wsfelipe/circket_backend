/**
 * Client.js - Cliente simples para testar o servidor Cricket
 * 
 * Uso: node client.js
 */

import WebSocket from 'ws';
import readline from 'readline';
import type { Player, RoomState, ServerMessage } from './src/types/index.js';

const WS_URL = 'ws://localhost:8080';
let ws: WebSocket | null = null;
let currentRoomCode: string | null = null;
let currentPlayerId: string | null = null;

type LogType = 'INFO' | 'SUCCESS' | 'ERROR' | 'RECEIVED' | 'SENT' | 'GAME' | 'TURN';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// ============================================================================
// Mensagens Helper
// ============================================================================

function log(type: LogType, msg: string): void {
  const icons: Record<LogType, string> = {
    INFO: '📝',
    SUCCESS: '✅',
    ERROR: '❌',
    RECEIVED: '📨',
    SENT: '📤',
    GAME: '🎮',
    TURN: '🎯',
  };
  console.log(`\n${icons[type] || '•'} [${type}] ${msg}`);
}

function sendMessage(message: Record<string, unknown>): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    log('ERROR', 'Não conectado ao servidor');
    return;
  }

  log('SENT', JSON.stringify(message));
  ws.send(JSON.stringify(message));
}

// ============================================================================
// Conectar ao servidor
// ============================================================================

function connect() {
  log('INFO', `Conectando a ${WS_URL}...`);

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    log('SUCCESS', 'Conectado ao servidor!');
    showMenu();
  };

  ws.onmessage = (event) => {
    const raw =
      typeof event.data === 'string'
        ? event.data
        : event.data instanceof ArrayBuffer
          ? Buffer.from(event.data).toString()
          : ArrayBuffer.isView(event.data)
            ? Buffer.from(event.data.buffer, event.data.byteOffset, event.data.byteLength).toString()
            : String(event.data);

    const message = JSON.parse(raw) as ServerMessage;
    handleServerMessage(message);
  };

  ws.onerror = (error) => {
    log('ERROR', `Erro WebSocket: ${error.message}`);
  };

  ws.onclose = () => {
    log('ERROR', 'Desconectado do servidor');
  };
}

// ============================================================================
// Processar mensagens do servidor
// ============================================================================

function handleServerMessage(message: ServerMessage): void {
  log('RECEIVED', `${message.type}`);

  switch (message.type) {
    case 'ROOM_CREATED':
      currentRoomCode = message.roomCode;
      currentPlayerId = message.playerId;
      log('SUCCESS', `Sala criada: ${message.roomCode}`);
      log('INFO', `ID do jogador: ${message.playerId}`);
      printRoomState(message.roomState);
      break;

    case 'ROOM_JOINED':
      currentPlayerId = message.playerId;
      log('SUCCESS', 'Entrou na sala');
      log('INFO', `ID do jogador: ${message.playerId}`);
      printRoomState(message.roomState);
      break;

    case 'ROOM_UPDATED':
      log('INFO', 'Sala atualizada');
      printRoomState(message.roomState);
      break;

    case 'GAME_STARTED':
      log('GAME', 'Jogo iniciado!');
      printRoomState(message.roomState);
      break;

    case 'YOUR_TURN':
      log('TURN', 'É sua vez!');
      printRoomState(message.roomState);
      logGameState(message.roomState);
      break;

    case 'ANNOUNCEMENT':
      log('GAME', `${message.playerName} anunciou: ${message.announcement}`);
      printRoomState(message.roomState);
      break;

    case 'CHALLENGE_RESULT':
      log('GAME', `Resultado: ${message.reason}`);
      log('INFO', `Vencedor: ${message.winner} | Perdedor: ${message.loser} (-${message.livesLost})`);
      printRoomState(message.roomState);
      break;

    case 'PLAYER_ELIMINATED':
      log('GAME', `${message.playerName} foi eliminado!`);
      printRoomState(message.roomState);
      break;

    case 'GAME_OVER':
      log('GAME', `🏆 Jogo terminou! Vencedor: ${message.winner}`);
      printRoomState(message.roomState);
      break;

    case 'PLAYER_LEFT':
      log('INFO', `${message.playerName} saiu da sala`);
      printRoomState(message.roomState);
      break;

    case 'ERROR':
      log('ERROR', message.message);
      break;

    default:
      log('INFO', JSON.stringify(message));
  }
}

// ============================================================================
// Utilitários de exibição
// ============================================================================

function printRoomState(roomState: RoomState): void {
  console.log('\n═══════════════════════════════════════');
  console.log(`Sala: ${roomState.code} | Round: ${roomState.round} | Fase: ${roomState.gamePhase}`);
  console.log('───────────────────────────────────────');

  roomState.players.forEach((p: Player) => {
    const current = p.isCurrentPlayer ? ' 👉' : '';
    const status = p.isActive ? '✓' : '✗';
    console.log(`  [${status}] ${p.name} - ❤️ ${p.lives}${current}`);
  });

  if (roomState.currentAnnouncement) {
    console.log('───────────────────────────────────────');
    console.log(`Anúncio atual: ${roomState.currentAnnouncement}`);
  }

  console.log('═══════════════════════════════════════\n');
}

function logGameState(roomState: RoomState): void {
  if (roomState.gamePhase === 'rolling') {
    console.log('→ Você pode: /roll (rolar dados)\n');
  } else if (roomState.gamePhase === 'announcing') {
    console.log('→ Você pode: /announce <jogada> (ex: /announce pair_3)\n');
  } else if (roomState.gamePhase === 'challenging') {
    console.log('→ Você pode: /buy ou /bluff\n');
  }
}

// ============================================================================
// Menu de Comandos
// ============================================================================

function showMenu() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║      🎲 Cricket Game Client v0.1       ║');
  console.log('╠════════════════════════════════════════╣');
  console.log('║ /create <nome>    - Criar sala         ║');
  console.log('║ /join <code> <nome> - Entrar na sala   ║');
  console.log('║ /start            - Iniciar jogo       ║');
  console.log('║ /roll             - Rolar dados        ║');
  console.log('║ /announce <jog>   - Anunciar jogada    ║');
  console.log('║ /buy              - Comprar            ║');
  console.log('║ /bluff            - Desafiar (bluff)   ║');
  console.log('║ /leave            - Sair da sala       ║');
  console.log('║ /help             - Mostrar ajuda      ║');
  console.log('║ /exit             - Sair              ║');
  console.log('╚════════════════════════════════════════╝\n');

  console.log('📚 Jogadas válidas:');
  console.log('  Normais: 4, 5, 6, 7, 8, 9, 10, 11');
  console.log('  Pares: pair_1, pair_2, pair_3, pair_4, pair_5, pair_6');
  console.log('  Cricket: cricket\n');

  promptCommand();
}

function promptCommand() {
  rl.question('> ', (input) => {
    const [command, ...args] = input.trim().split(' ');

    switch (command) {
      case '/create':
        const name = args.join(' ') || 'Jogador';
        sendMessage({
          type: 'CREATE_ROOM',
          playerName: name,
        });
        break;

      case '/join':
        if (args.length < 2) {
          log('ERROR', 'Uso: /join <code> <nome>');
          break;
        }
        const code = args[0];
        const joinName = args.slice(1).join(' ');
        sendMessage({
          type: 'JOIN_ROOM',
          roomCode: code,
          playerName: joinName,
        });
        break;

      case '/start':
        if (!currentRoomCode) {
          log('ERROR', 'Primeiro entrar em uma sala');
          break;
        }
        sendMessage({
          type: 'START_GAME',
          roomCode: currentRoomCode,
        });
        break;

      case '/roll':
        if (!currentRoomCode) {
          log('ERROR', 'Não está em uma sala');
          break;
        }
        sendMessage({
          type: 'ROLL_DICE',
          roomCode: currentRoomCode,
        });
        break;

      case '/announce':
        if (!currentRoomCode) {
          log('ERROR', 'Não está em uma sala');
          break;
        }
        if (args.length === 0) {
          log('ERROR', 'Uso: /announce <jogada>');
          break;
        }
        const announcement = args[0];
        sendMessage({
          type: 'ANNOUNCE',
          roomCode: currentRoomCode,
          announcement,
        });
        break;

      case '/buy':
        if (!currentRoomCode) {
          log('ERROR', 'Não está em uma sala');
          break;
        }
        sendMessage({
          type: 'CHALLENGE',
          roomCode: currentRoomCode,
          challengeType: 'BUY',
        });
        break;

      case '/bluff':
        if (!currentRoomCode) {
          log('ERROR', 'Não está em uma sala');
          break;
        }
        sendMessage({
          type: 'CHALLENGE',
          roomCode: currentRoomCode,
          challengeType: 'CALL_BLUFF',
        });
        break;

      case '/leave':
        if (!currentRoomCode) {
          log('ERROR', 'Não está em uma sala');
          break;
        }
        sendMessage({
          type: 'LEAVE_ROOM',
          roomCode: currentRoomCode,
        });
        currentRoomCode = null;
        currentPlayerId = null;
        break;

      case '/help':
        showMenu();
        break;

      case '/exit':
        log('INFO', 'Até logo!');
        rl.close();
        process.exit(0);
        break;

      case '':
        break;

      default:
        log('ERROR', `Comando desconhecido: ${command}`);
        log('INFO', 'Digite /help para ver os comandos');
    }

    promptCommand();
  });
}

// ============================================================================
// Iniciar
// ============================================================================

connect();