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
  // Timed solo fields
  timeLimit: number;      // total seconds (0 = untimed / multiplayer)
  timeRemaining: number;  // seconds left
  startedAt: number;      // Date.now() when game started
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

const SOLO_TIME_LIMIT = 60; // seconds

export const createRoom = (roomId: string, mode: 'solo' | 'multiplayer' = 'multiplayer'): Room => {
  rooms[roomId] = {
    id: roomId,
    mode,
    players: [],
    currentTurn: '',
    round: mode === 'solo' ? 0 : 1,
    maxRounds: mode === 'solo' ? 999 : 5,
    wind: { x: (Math.random() - 0.5) * 5, y: (Math.random() - 0.5) * 2 },
    timeLimit: mode === 'solo' ? SOLO_TIME_LIMIT : 0,
    timeRemaining: mode === 'solo' ? SOLO_TIME_LIMIT : 0,
    startedAt: 0,
  };
  return rooms[roomId];
};

export const getRoom = (roomId: string): Room | undefined => rooms[roomId];

export const joinRoom = (roomId: string, playerId: string, mode: 'solo' | 'multiplayer' = 'multiplayer'): Room | undefined => {
  let room = rooms[roomId];
  if (!room) {
      room = createRoom(roomId, mode);
  } else if (room.mode !== mode) {
      return undefined;
  }
  
  if (room.players.find(p => p.id === playerId)) return room; // Already joined
  
  const maxPlayers = mode === 'solo' ? 1 : 2;
  if (room.players.length >= maxPlayers) return undefined; // Full

  room.players.push({ id: playerId, score: 0 });
  
  if (mode === 'solo') {
      room.currentTurn = playerId;
      room.startedAt = Date.now();
      room.round = 1; // First shot incoming
  } else {
      if (room.players.length === 1) {
          room.currentTurn = playerId;
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
            if (room.mode === 'multiplayer') {
                if (room.currentTurn === playerId && room.players.length > 0) {
                    room.currentTurn = room.players[0].id;
                }
                room.round = 1;
                room.players.forEach(p => p.score = 0);
                room.wind = { x: (Math.random() - 0.5) * 5, y: (Math.random() - 0.5) * 2 };
            }
            return room;
        }
    }
    return undefined;
};

export const isSoloGameOver = (room: Room): boolean => {
    if (room.mode !== 'solo') return false;
    return room.timeRemaining <= 0;
};

export const handleShot = (roomId: string, playerId: string, score: number): Room | undefined => {
    const room = rooms[roomId];
    if (!room) return undefined;
    
    // For solo, just check player is in the room and time hasn't expired
    if (room.mode === 'solo') {
        if (isSoloGameOver(room)) return room; // Game over, ignore shot
        
        const player = room.players.find(p => p.id === playerId);
        if (player) {
            player.score += score;
        }
        room.round++; // Track shot count
        // New wind for each shot
        room.wind = { x: (Math.random() - 0.5) * 5, y: (Math.random() - 0.5) * 2 };
        return room;
    }
    
    // Multiplayer: existing turn-based logic
    if (room.currentTurn !== playerId) return undefined;
    
    const player = room.players.find(p => p.id === playerId);
    if (player) {
        player.score += score;
    }
    
    const currentIdx = room.players.findIndex(p => p.id === playerId);
    const nextIdx = (currentIdx + 1) % room.players.length;
    room.currentTurn = room.players[nextIdx].id;
    
    if (nextIdx === 0) {
        room.round++;
        if (room.round > room.maxRounds) {
            room.currentTurn = ''; // Game Over
        } else {
            room.wind = { x: (Math.random() - 0.5) * 5, y: (Math.random() - 0.5) * 2 };
        }
    }
    
    return room;
};

// Timer tick — called every second for solo rooms
export const tickTimer = (roomId: string): Room | undefined => {
    const room = rooms[roomId];
    if (!room || room.mode !== 'solo') return undefined;
    
    const elapsed = (Date.now() - room.startedAt) / 1000;
    room.timeRemaining = Math.max(0, room.timeLimit - elapsed);
    
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
