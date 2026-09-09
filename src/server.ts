import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMessage, Player, RoomState, ServerMessage } from './types/index.js';

type RoomPhase = RoomState['gamePhase'];

type Room = {
  code: string;
  players: Player[];
  currentPlayerIndex: number;
  gamePhase: RoomPhase;
  currentAnnouncement: string | null;
  lastAnnouncingPlayerIndex: number | null;
  diceResult: [number, number] | null;
  round: number;
  winner: string | null;
  createdAt: Date;
  sockets: Map<string, WebSocket>;
};

const rooms = new Map<string, Room>();
const playerToRoom = new Map<string, string>();

const port = Number(process.env.PORT ?? 8080);
const server = new WebSocketServer({ port });

function getRandomCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function getRoom(code: string): Room | undefined {
  return rooms.get(code);
}

function serializeRoom(room: Room, revealDice = false): RoomState {
  return {
    code: room.code,
    players: room.players.map((player) => ({
      ...player,
      isCurrentPlayer: room.players[room.currentPlayerIndex]?.id === player.id,
    })),
    currentPlayerIndex: room.currentPlayerIndex,
    gamePhase: room.gamePhase,
    currentAnnouncement: room.currentAnnouncement,
    lastAnnouncingPlayerIndex: room.lastAnnouncingPlayerIndex,
    diceResult: revealDice ? room.diceResult : null,
    round: room.round,
    winner: room.winner,
    createdAt: room.createdAt,
  };
}

function sendToSocket(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function broadcastRoom(room: Room, message: ServerMessage): void {
  room.sockets.forEach((socket) => sendToSocket(socket, message));
}

function sendTurn(room: Room, player: Player): void {
  const socket = room.sockets.get(player.id);
  if (socket) {
    sendToSocket(socket, {
      type: 'YOUR_TURN',
      roomState: serializeRoom(room, room.gamePhase === 'announcing'),
    });
  }
}

function getNextActivePlayerIndex(room: Room, startIndex: number): number {
  for (let offset = 1; offset <= room.players.length; offset += 1) {
    const index = (startIndex + offset) % room.players.length;
    if (room.players[index]?.isActive) return index;
  }

  return startIndex;
}

function isAnnouncementTruth(announcement: string, dice1: number, dice2: number): boolean {
  const value = dice1 + dice2;
  const cricket = (dice1 === 1 && dice2 === 2) || (dice1 === 2 && dice2 === 1);
  const pair = dice1 === dice2;

  if (announcement === 'cricket') return cricket;
  if (announcement === 'pair_1' || announcement === 'pair_2' || announcement === 'pair_3' || announcement === 'pair_4' || announcement === 'pair_5' || announcement === 'pair_6') {
    return pair && Number(announcement.replace('pair_', '')) === dice1;
  }

  const numberAnnouncement = Number(announcement);
  if (!Number.isNaN(numberAnnouncement)) {
    return value === numberAnnouncement;
  }

  const actualPlayRank = (() => {
    if (cricket) return 14;
    if (pair) return 7 + dice1;
    return value - 4;
  })();

  const announcedPlayRank = announcement === 'cricket'
    ? 14
    : announcement.startsWith('pair_')
      ? 7 + Number(announcement.replace('pair_', ''))
      : Number(announcement) - 4;

  return actualPlayRank >= announcedPlayRank;
}

function getAnnouncementRank(announcement: string): number {
  if (announcement === 'cricket') return 14;
  if (announcement.startsWith('pair_')) return 7 + Number(announcement.replace('pair_', ''));

  const numberAnnouncement = Number(announcement);
  return numberAnnouncement >= 4 && numberAnnouncement <= 11 ? numberAnnouncement - 4 : -1;
}

function isValidAnnouncement(announcement: unknown, previousAnnouncement: string | null): announcement is string {
  if (typeof announcement !== 'string' || getAnnouncementRank(announcement) < 0) return false;
  if (!previousAnnouncement) return true;

  return getAnnouncementRank(announcement) >= getAnnouncementRank(previousAnnouncement);
}

function rollForCurrentPlayer(room: Room): void {
  room.diceResult = [
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
  ];
  room.gamePhase = 'announcing';
  broadcastRoom(room, {
    type: 'YOUR_TURN',
    roomState: serializeRoom(room),
  });

  const currentPlayer = room.players[room.currentPlayerIndex];
  if (currentPlayer) sendTurn(room, currentPlayer);
}

function handleChallenge(room: Room, currentPlayer: Player): void {
  const announcerIndex = room.lastAnnouncingPlayerIndex ?? room.currentPlayerIndex;
  const announcer = room.players[announcerIndex];

  if (!announcer || !room.currentAnnouncement || !room.diceResult) {
    broadcastRoom(room, {
      type: 'ERROR',
      message: 'Não há anúncio ou dados para desafiar.',
    });
    return;
  }

  const dice1 = room.diceResult[0];
  const dice2 = room.diceResult[1];
  const reason = isAnnouncementTruth(room.currentAnnouncement, dice1, dice2)
    ? `O anúncio "${room.currentAnnouncement}" era verdadeiro. ${currentPlayer.name} perdeu.`
    : `O anúncio "${room.currentAnnouncement}" era falso. ${announcer.name} perdeu.`;

  const loser = isAnnouncementTruth(room.currentAnnouncement, dice1, dice2)
    ? currentPlayer
    : announcer;

  const winner = loser.id === currentPlayer.id ? announcer : currentPlayer;
  const livesLost = room.currentAnnouncement === 'cricket' ? 2 : 1;

  loser.lives = Math.max(0, loser.lives - livesLost);
  loser.isActive = loser.lives > 0;

  room.currentAnnouncement = null;
  room.lastAnnouncingPlayerIndex = null;
  room.diceResult = null;
  room.gamePhase = 'rolling';
  room.round += 1;

  if (loser.lives <= 0) {
    room.winner = winner.name;
    room.gamePhase = 'ended';
  }

  broadcastRoom(room, {
    type: 'CHALLENGE_RESULT',
    winner: winner.name,
    loser: loser.name,
    livesLost,
    reason,
    roomState: serializeRoom(room),
  });

  if (room.gamePhase === 'ended') {
    broadcastRoom(room, {
      type: 'GAME_OVER',
      winner: winner.name,
      roomState: serializeRoom(room),
    });
    return;
  }

  room.currentPlayerIndex = room.players.findIndex((player) => player.id === winner.id);
  if (room.currentPlayerIndex < 0) room.currentPlayerIndex = 0;
  room.players.forEach((player, index) => {
    player.isCurrentPlayer = index === room.currentPlayerIndex;
  });
  broadcastRoom(room, {
    type: 'YOUR_TURN',
    roomState: serializeRoom(room),
  });
  sendTurn(room, room.players[room.currentPlayerIndex]);
}

function handleMessage(socket: WebSocket, raw: string): void {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw) as ClientMessage;
  } catch {
    sendToSocket(socket, {
      type: 'ERROR',
      message: 'Mensagem inválida. JSON esperado.',
    });
    return;
  }

  const message = parsed as ClientMessage;

  if (typeof message !== 'object' || message === null || !('type' in message)) {
    sendToSocket(socket, {
      type: 'ERROR',
      message: 'Formato de mensagem inválido.',
    });
    return;
  }

  const type = message.type;

  if (type === 'CREATE_ROOM') {
    let roomCode = getRandomCode();
    while (rooms.has(roomCode)) {
      roomCode = getRandomCode();
    }

    const playerId = randomUUID();
    const room: Room = {
      code: roomCode,
      players: [{ id: playerId, name: message.playerName, lives: 3, isActive: true, isCurrentPlayer: true }],
      currentPlayerIndex: 0,
      gamePhase: 'waiting',
      currentAnnouncement: null,
      lastAnnouncingPlayerIndex: null,
      diceResult: null,
      round: 1,
      winner: null,
      createdAt: new Date(),
      sockets: new Map([[playerId, socket]]),
    };

    rooms.set(roomCode, room);
    playerToRoom.set(playerId, roomCode);

    sendToSocket(socket, {
      type: 'ROOM_CREATED',
      roomCode,
      playerId,
      roomState: serializeRoom(room),
    });
    return;
  }

  if (type === 'JOIN_ROOM') {
    const room = getRoom(message.roomCode);
    if (!room) {
      sendToSocket(socket, { type: 'ERROR', message: `Sala ${message.roomCode} não encontrada.` });
      return;
    }

    const playerId = randomUUID();
    const player: Player = {
      id: playerId,
      name: message.playerName,
      lives: 3,
      isActive: true,
      isCurrentPlayer: false,
    };

    room.players.push(player);
    room.sockets.set(playerId, socket);
    playerToRoom.set(playerId, room.code);

    sendToSocket(socket, {
      type: 'ROOM_JOINED',
      playerId,
      roomState: serializeRoom(room),
    });

    broadcastRoom(room, {
      type: 'ROOM_UPDATED',
      roomState: serializeRoom(room),
    });
    return;
  }

  if (type === 'START_GAME') {
    const room = getRoom(message.roomCode);
    if (!room) {
      sendToSocket(socket, { type: 'ERROR', message: 'Sala inexistente.' });
      return;
    }

    if (room.players.length < 2) {
      sendToSocket(socket, { type: 'ERROR', message: 'São necessários pelo menos 2 jogadores.' });
      return;
    }

    room.gamePhase = 'rolling';
    room.currentPlayerIndex = 0;
    room.players.forEach((player) => { player.isCurrentPlayer = player.id === room.players[room.currentPlayerIndex].id; });

    broadcastRoom(room, {
      type: 'GAME_STARTED',
      roomState: serializeRoom(room),
    });

    const currentPlayer = room.players[room.currentPlayerIndex];
    if (currentPlayer) {
      const currentSocket = room.sockets.get(currentPlayer.id);
      if (currentSocket) {
        sendToSocket(currentSocket, {
          type: 'YOUR_TURN',
          roomState: serializeRoom(room, true),
        });
      }
    }
    return;
  }

  if (type === 'ROLL_DICE') {
    const room = getRoom(message.roomCode);
    if (!room) {
      sendToSocket(socket, { type: 'ERROR', message: 'Sala inexistente.' });
      return;
    }

    const currentPlayer = room.players[room.currentPlayerIndex];
    if (!currentPlayer) {
      sendToSocket(socket, { type: 'ERROR', message: 'Não há jogador atual.' });
      return;
    }

    if (room.gamePhase !== 'rolling' || socket !== room.sockets.get(currentPlayer.id)) {
      sendToSocket(socket, { type: 'ERROR', message: 'Só o jogador atual pode rolar agora.' });
      return;
    }

    rollForCurrentPlayer(room);
    return;
  }

  if (type === 'ANNOUNCE') {
    const room = getRoom(message.roomCode);
    if (!room) {
      sendToSocket(socket, { type: 'ERROR', message: 'Sala inexistente.' });
      return;
    }

    if (room.gamePhase !== 'announcing') {
      sendToSocket(socket, { type: 'ERROR', message: 'Agora não é hora de anunciar.' });
      return;
    }

    const currentPlayer = room.players[room.currentPlayerIndex];
    if (!currentPlayer || socket !== room.sockets.get(currentPlayer.id)) {
      sendToSocket(socket, { type: 'ERROR', message: 'Só o jogador atual pode anunciar.' });
      return;
    }

    if (!isValidAnnouncement(message.announcement, room.currentAnnouncement)) {
      sendToSocket(socket, { type: 'ERROR', message: 'O anúncio deve ser válido e maior ou igual ao anúncio anterior.' });
      return;
    }

    room.currentAnnouncement = message.announcement;
    room.lastAnnouncingPlayerIndex = room.currentPlayerIndex;
    room.gamePhase = 'challenging';

    broadcastRoom(room, {
      type: 'ANNOUNCEMENT',
      playerName: room.players[room.currentPlayerIndex]?.name ?? 'Jogador',
      announcement: message.announcement,
      roomState: serializeRoom(room),
    });

    const nextPlayerIndex = getNextActivePlayerIndex(room, room.currentPlayerIndex);
    room.currentPlayerIndex = nextPlayerIndex;
    room.players.forEach((player, index) => {
      player.isCurrentPlayer = index === nextPlayerIndex;
    });

    const nextSocket = room.sockets.get(room.players[nextPlayerIndex].id);
    if (nextSocket) {
      sendToSocket(nextSocket, {
        type: 'YOUR_TURN',
        roomState: serializeRoom(room),
      });
    }
    return;
  }

  if (type === 'CHALLENGE') {
    const room = getRoom(message.roomCode);
    if (!room) {
      sendToSocket(socket, { type: 'ERROR', message: 'Sala inexistente.' });
      return;
    }

    const currentPlayer = room.players[room.currentPlayerIndex];
    if (!currentPlayer) {
      sendToSocket(socket, { type: 'ERROR', message: 'Jogador atual inválido.' });
      return;
    }

    if (socket !== room.sockets.get(currentPlayer.id)) {
      sendToSocket(socket, { type: 'ERROR', message: 'Só o jogador atual pode desafiar.' });
      return;
    }

    if (room.gamePhase !== 'challenging') {
      sendToSocket(socket, { type: 'ERROR', message: 'Agora não é hora de desafiar ou comprar.' });
      return;
    }

    if (message.challengeType === 'BUY') {
      room.gamePhase = 'rolling';
      rollForCurrentPlayer(room);
      return;
    }

    handleChallenge(room, currentPlayer);
    return;
  }

  if (type === 'LEAVE_ROOM') {
    const room = getRoom(message.roomCode);
    if (!room) {
      sendToSocket(socket, { type: 'ERROR', message: 'Sala inexistente.' });
      return;
    }

    const player = room.players.find((entry) => room.sockets.get(entry.id) === socket);
    if (!player) {
      sendToSocket(socket, { type: 'ERROR', message: 'Jogador não encontrado na sala.' });
      return;
    }

    room.players = room.players.filter((entry) => entry.id !== player.id);
    room.sockets.delete(player.id);
    playerToRoom.delete(player.id);

    if (room.players.length === 0) {
      rooms.delete(room.code);
      return;
    }

    if (room.currentPlayerIndex >= room.players.length) {
      room.currentPlayerIndex = 0;
    }

    broadcastRoom(room, {
      type: 'PLAYER_LEFT',
      playerName: player.name,
      roomState: serializeRoom(room),
    });
    return;
  }

  sendToSocket(socket, {
    type: 'ERROR',
    message: `Tipo de mensagem não suportado: ${String(type)}`,
  });
}

server.on('connection', (socket) => {
  socket.on('message', (raw) => {
    handleMessage(socket, raw.toString());
  });

  socket.on('close', () => {
    for (const [playerId, roomCode] of playerToRoom.entries()) {
      const room = rooms.get(roomCode);
      if (!room) continue;

      const targetSocket = room.sockets.get(playerId);
      if (targetSocket === socket) {
        room.players = room.players.filter((player) => player.id !== playerId);
        room.sockets.delete(playerId);
        playerToRoom.delete(playerId);

        if (room.players.length > 0) {
          if (room.currentPlayerIndex >= room.players.length) {
            room.currentPlayerIndex = 0;
          }
          broadcastRoom(room, {
            type: 'ROOM_UPDATED',
            roomState: serializeRoom(room),
          });
        } else {
          rooms.delete(roomCode);
        }
        break;
      }
    }
  });
});

console.log(`Cricket Server rodando em ws://localhost:${port}`);
