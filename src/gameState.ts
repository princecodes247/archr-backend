import { collections } from './db';
import { Room } from './types';
import { isSoloGameOver } from './utils';

// ── In-memory room storage (ephemeral) ──
const rooms: Record<string, Room> = {};
const SOLO_TIME_LIMIT = 60; // seconds

// ── Room management (in-memory) ──
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

export const deleteRoom = (roomId: string) => {
    delete rooms[roomId];
};

export const findActiveGame = (userId: string): Room | undefined => {
    const roomId = `solo_${userId}`;
    const room = rooms[roomId];
    if (!room || room.mode !== 'solo') return undefined;
    if (room.timeRemaining <= 0) return undefined;
    return room;
};

export const joinRoom = (roomId: string, socketId: string, userId: string, mode: 'solo' | 'multiplayer' = 'multiplayer'): Room | undefined => {
  let room = rooms[roomId];

  if (!room) {
      room = createRoom(roomId, mode);
  } else if (room.mode !== mode) {
      return undefined;
  }

  // Check if user is already in the room (reconnection)
  const existingPlayer = room.players.find(p => p.userId === userId);
  if (existingPlayer) {
      existingPlayer.id = socketId;
      if (mode === 'solo') {
          room.currentTurn = userId;
      }
      return room;
  }

  if (mode === 'solo') {
      if (room.players.length >= 1) return undefined;
  } else {
      if (room.players.length >= 2) return undefined;
  }

  room.players.push({ id: socketId, userId, score: 0 });

  if (mode === 'solo') {
      room.currentTurn = userId;
      room.startedAt = Date.now();
      room.round = 1;
  } else {
      if (room.players.length === 1) {
          room.currentTurn = userId;
      }
  }

  return room;
};

export const removePlayer = (socketId: string) => {
    for (const roomId in rooms) {
        const room = rooms[roomId];
        const idx = room.players.findIndex(p => p.id === socketId);
        if (idx !== -1) {
            if (room.mode === 'solo') {
                return room;
            }

            room.players.splice(idx, 1);
            if (room.players.length === 0) {
                delete rooms[roomId];
                return undefined;
            }
            if (room.currentTurn === socketId && room.players.length > 0) {
                room.currentTurn = room.players[0].userId;
            }
            room.round = 1;
            room.players.forEach(p => p.score = 0);
            room.wind = { x: (Math.random() - 0.5) * 5, y: (Math.random() - 0.5) * 2 };
            return room;
        }
    }
    return undefined;
};

export const handleShot = (roomId: string, userId: string, score: number): Room | undefined => {
    const room = rooms[roomId];
    if (!room) return undefined;

    if (room.mode === 'solo') {
        if (isSoloGameOver(room)) return room;
        const player = room.players.find(p => p.userId === userId);
        if (player) player.score += score;
        room.round++;
        room.wind = { x: (Math.random() - 0.5) * 5, y: (Math.random() - 0.5) * 2 };
        return room;
    }

    // Multiplayer
    if (room.currentTurn !== userId) return undefined;
    const player = room.players.find(p => p.userId === userId);
    if (player) player.score += score;

    const currentIdx = room.players.findIndex(p => p.userId === userId);
    const nextIdx = (currentIdx + 1) % room.players.length;
    room.currentTurn = room.players[nextIdx].userId;

    if (nextIdx === 0) {
        room.round++;
        if (room.round > room.maxRounds) {
            room.currentTurn = '';
        } else {
            room.wind = { x: (Math.random() - 0.5) * 5, y: (Math.random() - 0.5) * 2 };
        }
    }

    return room;
};

export const tickTimer = (roomId: string): Room | undefined => {
    const room = rooms[roomId];
    if (!room || room.mode !== 'solo') return undefined;

    const elapsed = (Date.now() - room.startedAt) / 1000;
    room.timeRemaining = Math.max(0, room.timeLimit - elapsed);

    return room;
};

// ── Leaderboard (persisted to MongoDB) ──

export const getLeaderboard = async () => {
    const entries = await collections.leaderboard.aggregate().addStage({
        $sort: { score: -1 },
    }).addStage({
        $group: {
            _id: "$userId",
            userId: { $first: "$userId" },
            score: { $first: "$score" },
            date: { $first: "$date" },
            playCount: { $sum: 1 }
        }
    }).addStage({
        $sort: { score: -1 },
    }).addStage({
        $limit: 10,
    }).addStage({
        $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "userId",
            as: "user"
        }
    }).addStage({
        $unwind: {
            path: "$user",
            preserveNullAndEmptyArrays: true
        }
    });

    // Join user names
    const results = entries.map((e: any) => {
      return {
        userId: e.userId,
        name: e.user?.name || e.userId.slice(0, 8),
        score: e.score,
        date: e.date,
        playCount: e.playCount,
      };
    });

    return results;
};

export const submitScore = async (userId: string, score: number) => {
    await collections.leaderboard.insertOne({
        userId,
        score,
        date: new Date(),
    });

    return getLeaderboard();
};

export const getGeneralStats = async () => {
    const stats: any = await collections.leaderboard.aggregate().addStage({
        $group: {
            _id: null,
            totalGames: { $sum: 1 },
            uniquePlayers: { $addToSet: "$userId" }
        }
    }).addStage({
        $project: {
            _id: 0,
            totalGames: 1,
            totalPlayers: { $size: "$uniquePlayers" }
        }
    });

    if (!stats || stats.length === 0) {
        return { totalGames: 0, totalPlayers: 0 };
    }

    return stats[0];
};
