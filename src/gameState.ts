import crypto from 'crypto';
import { collections } from './db';

// ── Types (still used in-memory for rooms) ──

export interface Player {
  id: string;        // socket.id (ephemeral)
  userId: string;    // persistent user ID
  name?: string;
  score: number;
}

export interface Room {
  id: string;
  mode: 'solo' | 'multiplayer';
  players: Player[];
  currentTurn: string; // userId of current player
  round: number;
  maxRounds: number;
  wind: { x: number; y: number };
  // Timed solo fields
  timeLimit: number;
  timeRemaining: number;
  startedAt: number;
}

// ── In-memory room storage (ephemeral) ──

const rooms: Record<string, Room> = {};

const SOLO_TIME_LIMIT = 60; // seconds

// ── User ID management (persisted to MongoDB) ──

export const generateUserId = (): string => crypto.randomUUID();

export const isValidUserId = (id: string): boolean =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

// Find or create user in DB
export const findOrCreateUser = async (userId: string): Promise<string> => {
    const existing = await collections.users.findOne({ userId });
    if (existing) return existing.userId;

    // Create new user
    await collections.users.insertOne({
        userId,
        createdAt: new Date(),
    });

    return userId;
};

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

export const isSoloGameOver = (room: Room): boolean => {
    if (room.mode !== 'solo') return false;
    return room.timeRemaining <= 0;
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
    const entries = await collections.leaderboard
        .find({})
        .sort({ score: -1 })
        .limit(10);

    return entries.map(e => ({
        userId: e.userId,
        score: e.score,
        date: e.date.getTime(),
    }));
};

export const submitScore = async (userId: string, score: number) => {
    await collections.leaderboard.insertOne({
        userId,
        score,
        date: new Date(),
    });

    return getLeaderboard();
};
