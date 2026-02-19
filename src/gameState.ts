export interface Player {
  id: string;
  name?: string; // Optional name for leaderboard
  score: number;
}

export interface Room {
  id: string;
  mode: 'solo' | 'multiplayer';
  players: Player[];
  currentTurn: string; // socketId of current player
  round: number;
  maxRounds: number;
  wind: { x: number; y: number };
}

export interface LeaderboardEntry {
  name: string;
  score: number;
  date: number;
}

const rooms: Record<string, Room> = {};
let leaderboard: LeaderboardEntry[] = [];

// Seed leaderboard with some dummy data if empty
if (leaderboard.length === 0) {
    leaderboard = [
        { name: 'Robin Hood', score: 500, date: Date.now() },
        { name: 'Legolas', score: 450, date: Date.now() },
        { name: 'Katniss', score: 400, date: Date.now() },
        { name: 'Hawkeye', score: 350, date: Date.now() },
        { name: 'Cupid', score: 100, date: Date.now() }
    ];
}

export const createRoom = (roomId: string, mode: 'solo' | 'multiplayer' = 'multiplayer'): Room => {
  rooms[roomId] = {
    id: roomId,
    mode,
    players: [],
    currentTurn: '',
    round: 1,
    maxRounds: 5,
    wind: { x: (Math.random() - 0.5) * 5, y: (Math.random() - 0.5) * 2 }
  };
  return rooms[roomId];
};

export const getRoom = (roomId: string): Room | undefined => rooms[roomId];

export const joinRoom = (roomId: string, playerId: string, mode: 'solo' | 'multiplayer' = 'multiplayer'): Room | undefined => {
  let room = rooms[roomId];
  if (!room) {
      room = createRoom(roomId, mode);
  } else if (room.mode !== mode) {
      // Cannot join room with different mode
      return undefined;
  }
  
  if (room.players.find(p => p.id === playerId)) return room; // Already joined
  
  // Checking capacity
  const maxPlayers = mode === 'solo' ? 1 : 2;
  if (room.players.length >= maxPlayers) return undefined; // Full

  room.players.push({ id: playerId, score: 0 });
  
  // Start game Logic
  if (mode === 'solo') {
      // Solo starts immediately
      room.currentTurn = playerId;
  } else {
      // Multiplayer starts when 2 players
      if (room.players.length === 1) {
          room.currentTurn = playerId; // First player starts
      }
  }
  
  return room;
};

export const removePlayer = (playerId: string) => {
    for (const roomId in rooms) {
        const room = rooms[roomId];
        const idx = room.players.findIndex(p => p.id === playerId);
        if (idx !== -1) {
            room.players.splice(idx, 1);
            if (room.players.length === 0) {
                delete rooms[roomId];
                return undefined;
            }
            // Logic for multiplayer opponent disconnect
            if (room.mode === 'multiplayer') {
                             // If the disconnected player held the turn, pass it to the remaining player
                if (room.currentTurn === playerId && room.players.length > 0) {
                    room.currentTurn = room.players[0].id;
                }
                // Reset scores and round for a fresh game with the next opponent
                room.round = 1;
                room.players.forEach(p => p.score = 0);
                room.wind = { x: (Math.random() - 0.5) * 5, y: (Math.random() - 0.5) * 2 };
            }
            return room;
        }
    }
    return undefined;
};

export const handleShot = (roomId: string, playerId: string, score: number): Room | undefined => {
    const room = rooms[roomId];
    if (!room) return undefined;
    if (room.currentTurn !== playerId) return undefined; // Not your turn
    
    // Update score
    const player = room.players.find(p => p.id === playerId);
    if (player) {
        player.score += score;
    }
    
    // Determine next state
    if (room.mode === 'solo') {
        // Solo: Turn stays with player, round increments
        room.round++;
        if (room.round > room.maxRounds) {
            room.currentTurn = ''; // Game Over
        } else {
            room.wind = { x: (Math.random() - 0.5) * 5, y: (Math.random() - 0.5) * 2 };
        }
    } else {
        // Multiplayer: Switch turn
        const currentIdx = room.players.findIndex(p => p.id === playerId);
        const nextIdx = (currentIdx + 1) % room.players.length;
        room.currentTurn = room.players[nextIdx].id;
        
        // Round increments when turn cycles back to start
        if (nextIdx === 0) {
            room.round++;
            if (room.round > room.maxRounds) {
                room.currentTurn = ''; // Game Over
            } else {
                room.wind = { x: (Math.random() - 0.5) * 5, y: (Math.random() - 0.5) * 2 };
            }
        }
    }
    
    return room;
};

// Leaderboard Access
export const getLeaderboard = () => leaderboard;

export const submitScore = (name: string, score: number) => {
    leaderboard.push({ name, score, date: Date.now() });
    leaderboard.sort((a, b) => b.score - a.score);
    if (leaderboard.length > 10) leaderboard.length = 10;
    return leaderboard;
};
