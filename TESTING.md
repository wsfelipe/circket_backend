/**
 * TESTE DO SERVIDOR CRICKET
 * 
 * Este arquivo documenta como testar o servidor e a comunicação WebSocket
 */

// ============================================================================
// 1. INICIAR O SERVIDOR
// ============================================================================
/*
cd backend
npm install
npm run dev

# Esperado:
# 🎲 Cricket Server rodando em ws://localhost:8080
*/

// ============================================================================
// 2. TESTAR COM CLIENTE WEBSOCKET (Node.js ou Browser)
// ============================================================================

// No browser, abrir DevTools e colar:

const ws = new WebSocket('ws://localhost:8080');

ws.onopen = () => {
  console.log('✅ Conectado ao servidor');
  
  // Criar uma sala
  ws.send(JSON.stringify({
    type: 'CREATE_ROOM',
    playerName: 'Jogador1'
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('📨 Mensagem recebida:', message);
};

// ============================================================================
// 3. FLUXO COMPLETO DE TESTE
// ============================================================================

/*
PASSO 1: Criar sala (Cliente 1)
---------------------------------
{
  "type": "CREATE_ROOM",
  "playerName": "Alice"
}

Resposta esperada:
{
  "type": "ROOM_CREATED",
  "roomCode": "ABC123",
  "playerId": "uuid-...",
  "roomState": { ... }
}

PASSO 2: Entrar na sala (Cliente 2)
------------------------------------
{
  "type": "JOIN_ROOM",
  "roomCode": "ABC123",
  "playerName": "Bob"
}

Resposta esperada:
{
  "type": "ROOM_JOINED",
  "playerId": "uuid-...",
  "roomState": { ... }
}

PASSO 3: Iniciar jogo (Qualquer cliente)
-----------------------------------------
{
  "type": "START_GAME",
  "roomCode": "ABC123"
}

Resposta: GAME_STARTED + YOUR_TURN

PASSO 4: Primeira rolagem (Alice - primeiro jogador)
-----------------------------------------------------
{
  "type": "ROLL_DICE",
  "roomCode": "ABC123"
}

PASSO 5: Alice anuncia algo (ex: "pair_3")
--------------------------------------------
{
  "type": "ANNOUNCE",
  "roomCode": "ABC123",
  "announcement": "pair_3"
}

PASSO 6: Bob pode DESMENTIR (CALL_BLUFF) ou COMPRAR (BUY)
----------------------------------------------------------
Desmentir:
{
  "type": "CHALLENGE",
  "roomCode": "ABC123",
  "challengeType": "CALL_BLUFF"
}

Comprar:
{
  "type": "CHALLENGE",
  "roomCode": "ABC123",
  "challengeType": "BUY"
}

PASSO 7: Bob anuncia algo maior que "pair_3"
----------------------------------------------
{
  "type": "ANNOUNCE",
  "roomCode": "ABC123",
  "announcement": "cricket"
}

PASSO 8: Alice desmente
------------------------
{
  "type": "CHALLENGE",
  "roomCode": "ABC123",
  "challengeType": "CALL_BLUFF"
}

Resposta: CHALLENGE_RESULT com winner, loser, livesLost

Continua até sobrar 1 jogador...
*/

// ============================================================================
// 4. HIERARQUIA DE JOGADAS (do MENOR para o MAIOR)
// ============================================================================

/*
NORMAL:
  "4", "5", "6", "7", "8", "9", "10", "11"

PARES (maiores que normais):
  "pair_1", "pair_2", "pair_3", "pair_4", "pair_5", "pair_6"

CRICKET (maior que tudo):
  "cricket" (1+2 ou 2+1)

Cricket é especial:
  - Só pode ser vencido por outro Cricket
  - Se desmentido, perde 2 vidas (não 1)
  - Se for mentira, quem mentiu perde 2 vidas
*/

// ============================================================================
// 5. ESTADOS DO JOGO
// ============================================================================

/*
gamePhase: 'waiting'     → Aguardando jogadores / aguardando START_GAME
gamePhase: 'rolling'     → Jogador atual pode fazer ROLL_DICE
gamePhase: 'announcing'  → Jogador atual pode fazer ANNOUNCE
gamePhase: 'challenging' → Próximo jogador pode fazer CHALLENGE (BUY ou CALL_BLUFF)
gamePhase: 'ended'       → Jogo terminou, winner está definido
*/

// ============================================================================
// 6. EXEMPLO: TESTE COM curl (para server-side)
// ============================================================================

/*
# Conectar com wscat (instalar: npm install -g wscat)
wscat -c ws://localhost:8080

# Depois digitar mensagens JSON:
{"type":"CREATE_ROOM","playerName":"Alice"}

# Copiar roomCode da resposta

{"type":"JOIN_ROOM","roomCode":"ABC123","playerName":"Bob"}

{"type":"START_GAME","roomCode":"ABC123"}

{"type":"ROLL_DICE","roomCode":"ABC123"}

{"type":"ANNOUNCE","roomCode":"ABC123","announcement":"pair_3"}

{"type":"CHALLENGE","roomCode":"ABC123","challengeType":"CALL_BLUFF"}
*/

// ============================================================================
// 7. TIPOS TYPESCRIPT PARA FRONTEND
// ============================================================================

// Importar do backend/src/types/index.ts:

type PlayType = 
  | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11'
  | 'pair_1' | 'pair_2' | 'pair_3' | 'pair_4' | 'pair_5' | 'pair_6'
  | 'cricket';

interface Player {
  id: string;
  name: string;
  lives: number;
  isActive: boolean;
  isCurrentPlayer: boolean;
}

interface RoomState {
  code: string;
  players: Player[];
  currentPlayerIndex: number;
  gamePhase: 'waiting' | 'rolling' | 'announcing' | 'challenging' | 'resolving' | 'ended';
  currentAnnouncement: string | null;
  lastAnnouncingPlayerIndex: number | null;
  diceResult: [number, number] | null; // Sempre null no cliente (servidor não envia)
  round: number;
  winner: string | null;
  createdAt: Date;
}

// ============================================================================
// 8. NOTAS IMPORTANTES
// ============================================================================

/*
✅ Server-Authoritative:
   - Servidor valida TODAS as jogadas
   - Servidor mantém verdadeiros os resultados dos dados
   - Cliente nunca sabe o resultado real dos dados até desafio

✅ Cricket (especial):
   - Parse: se dice1 + dice2 == (1,2 ou 2,1)
   - Rank: 14 (maior que todos)
   - Desafio: sempre perde 2 vidas
   - Não pode ser batido por nada exceto outro Cricket

✅ Fluxo de turno:
   - Jogador A rola → anuncia
   - Jogador B: BUY (compra, rola, anuncia maior) ou CALL_BLUFF (desmente A)
   - Se CALL_BLUFF: resultado, próxima rodada começar por quem anunciou
   - Se BUY: continua para Jogador C

✅ Eliminação:
   - Jogador fica com 0 ou menos vidas → isActive = false
   - Quando apenas 1 isActive = true → GAME_OVER
   - Winner é o último ativo

✅ Timeout:
   - Salas vazias são deletadas após 30 min
   - Desconexão remove jogador automaticamente
*/