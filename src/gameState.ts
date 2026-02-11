export interface Player {
  id: string;
  score: number;
}

export interface Room {
  id: string;
  players: Player[];
  currentTurn: string; // socketId of current player
  round: number;
  maxRounds: number;
  wind: { x: number; y: number };
}

const rooms: Record<string, Room> = {};

export const createRoom = (roomId: string): Room => {
  rooms[roomId] = {
    id: roomId,
    players: [],
    currentTurn: '',
    round: 1,
    maxRounds: 5,
    wind: { x: (Math.random() - 0.5) * 5, y: (Math.random() - 0.5) * 2 }
  };
  return rooms[roomId];
};

export const getRoom = (roomId: string): Room | undefined => rooms[roomId];

export const joinRoom = (roomId: string, playerId: string): Room | undefined => {
  let room = rooms[roomId];
  if (!room) {
      room = createRoom(roomId);
  }
  
  if (room.players.find(p => p.id === playerId)) return room; // Already joined
  if (room.players.length >= 2) return undefined; // Full

  room.players.push({ id: playerId, score: 0 });
  
  // Start game if 2 players
  if (room.players.length === 1) {
      room.currentTurn = playerId; // First player starts
  }
  
  return room;
};

export const removePlayer = (playerId: string) => {
    // Find room and remove player
    for (const roomId in rooms) {
        const room = rooms[roomId];
        const idx = room.players.findIndex(p => p.id === playerId);
        if (idx !== -1) {
            room.players.splice(idx, 1);
            if (room.players.length === 0) {
                delete rooms[roomId];
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
    
    // Switch turn
    const currentIdx = room.players.findIndex(p => p.id === playerId);
    const nextIdx = (currentIdx + 1) % room.players.length;
    room.currentTurn = room.players[nextIdx].id;
    
    // Increment round if back to first player? 
    // Or just count shots.
    // Let's say Round ends when both fired.
    if (nextIdx === 0) {
        room.round++;
    }
    
    // Randomize wind for next turn
    room.wind = { x: (Math.random() - 0.5) * 5, y: (Math.random() - 0.5) * 2 };
    
    return room;
};
