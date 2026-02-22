import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { calculateShot } from './physics';
import {
    joinRoom, handleShot, removePlayer, getRoom, deleteRoom,
    tickTimer, findActiveGame,
    submitScore, getLeaderboard, getGeneralStats
} from './gameState';
import { findOrCreateUser, generateUserId, isSoloGameOver, isValidUserId } from './utils';

const app = express();
const httpServer = createServer(app);

// Supported origins for CORS
const allowedOrigins = [
  'http://localhost:5173',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/stats', async (req, res) => {
    try {
        const stats = await getGeneralStats();
        res.status(200).json(stats);
    } catch (err) {
        console.error('Failed to get general stats:', err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      // or if the origin is in our allowed list
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST"],
    credentials: true
  }
});

const PORT = process.env.PORT || 3000;

// socket.id → userId mapping
const socketUserMap: Record<string, string> = {};

// Track solo timer intervals per room
const soloTimers: Record<string, NodeJS.Timeout> = {};

// Cleanup timers for solo rooms (delayed deletion after disconnect)
const cleanupTimers: Record<string, NodeJS.Timeout> = {};

const SOLO_RECONNECT_WINDOW = 60_000; // 60s to reconnect

// Helper: start a solo timer for a room
const startSoloTimer = (roomId: string) => {
    if (soloTimers[roomId]) return; // Already running

    soloTimers[roomId] = setInterval(async () => {
        const updatedRoom = tickTimer(roomId);
        if (!updatedRoom) {
            clearInterval(soloTimers[roomId]);
            delete soloTimers[roomId];
            return;
        }
        io.to(roomId).emit('timerUpdate', {
            timeRemaining: updatedRoom.timeRemaining
        });
        if (isSoloGameOver(updatedRoom)) {
            clearInterval(soloTimers[roomId]);
            delete soloTimers[roomId];
            updatedRoom.currentTurn = '';
            // Auto-submit score to leaderboard
            const player = updatedRoom.players[0];
            if (player && player.score > 0) {
                await submitScore(player.userId, player.score);
                const lb = await getLeaderboard();
                io.emit('leaderboardUpdate', lb);
            }
            io.to(roomId).emit('gameState', updatedRoom);
        }
    }, 1000);
};

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // ── Registration ──
  socket.on('register', async (data: { userId?: string }, callback) => {
      let userId: string;

      if (data?.userId && isValidUserId(data.userId)) {
          userId = data.userId;
          console.log('User re-registered:', userId, '← socket:', socket.id);
      } else {
          userId = generateUserId();
          console.log('New user registered:', userId, '← socket:', socket.id);
      }

      // Persist user in DB
      const user = await findOrCreateUser(userId);

      socketUserMap[socket.id] = userId;

      if (typeof callback === 'function') {
          callback({ userId, name: user.name });
      } else {
          socket.emit('registered', { userId, name: user.name });
      }
  });

  // ── Join Game ──
  socket.on('joinGame', (mode: 'solo' | 'multiplayer') => {
      const userId = socketUserMap[socket.id];
      if (!userId) {
          socket.emit('error', 'Not registered');
          return;
      }

      if (mode === 'solo') {
          const activeGame = findActiveGame(userId);
          const roomId = `solo_${userId}`;

          // Cancel any pending cleanup timer
          if (cleanupTimers[roomId]) {
              clearTimeout(cleanupTimers[roomId]);
              delete cleanupTimers[roomId];
              console.log('Cancelled cleanup for room:', roomId);
          }

          if (activeGame) {
              // Rejoin existing game
              const room = joinRoom(roomId, socket.id, userId, mode);
              if (room) {
                  socket.join(roomId);
                  socket.emit('gameState', room);
                  console.log('Player rejoined active game:', roomId);
                  startSoloTimer(roomId);
                  return;
              }
          }

          // No active game — clean up any old finished room
          if (getRoom(roomId)) {
              clearInterval(soloTimers[roomId]);
              delete soloTimers[roomId];
              deleteRoom(roomId);
          }

          const room = joinRoom(roomId, socket.id, userId, mode);
          if (room) {
              socket.join(roomId);
              socket.emit('gameState', room);
              startSoloTimer(roomId);
          } else {
              socket.emit('error', 'Could not create game');
          }
          return;
      }

      // Multiplayer
      const roomId = 'default-arena';
      const room = joinRoom(roomId, socket.id, userId, mode);
      if (room) {
          socket.join(roomId);
          socket.emit('gameState', room);
          socket.to(roomId).emit('gameState', room);
      } else {
          socket.emit('error', 'Room full or invalid mode');
      }
  });

  // ── Shoot ──
  socket.on('shoot', (data: { aimPosition: { x: number, y: number } }) => {
    const userId = socketUserMap[socket.id];
    if (!userId) return;

    let roomId = Array.from(socket.rooms).find(r => r !== socket.id);
    if (!roomId) return;

    const room = getRoom(roomId);
    if (!room) return;

    if (room.mode === 'solo') {
        if (isSoloGameOver(room)) return;
    } else {
        if (room.currentTurn !== userId) {
            console.log('Not your turn:', userId);
            return;
        }
    }

    const result = calculateShot(data.aimPosition, room.wind);
    const updatedRoom = handleShot(roomId, userId, result.score);

    io.to(roomId).emit('shotResult', {
        player: userId,
        path: result.path,
        score: result.score
    });

    io.to(roomId).emit('gameState', updatedRoom);
  });

  // ── Leaderboard ──
  socket.on('submitScore', async (data: { score: number }) => {
      const userId = socketUserMap[socket.id];
      if (!userId) return;

      await submitScore(userId, data.score);
      const lb = await getLeaderboard();
      io.emit('leaderboardUpdate', lb);
  });

  socket.on('getLeaderboard', async () => {
      const lb = await getLeaderboard();
      socket.emit('leaderboardUpdate', lb);
  });

  // ── Disconnect ──
  socket.on('disconnect', () => {
    const userId = socketUserMap[socket.id];
    console.log('Socket disconnected:', socket.id, '(userId:', userId, ')');

    if (userId) {
        const soloRoomId = `solo_${userId}`;
        const soloRoom = getRoom(soloRoomId);

        if (soloRoom && !isSoloGameOver(soloRoom)) {
            console.log('Solo game still active, keeping room for reconnect:', soloRoomId);
            cleanupTimers[soloRoomId] = setTimeout(() => {
                console.log('Reconnect window expired, cleaning up:', soloRoomId);
                if (soloTimers[soloRoomId]) {
                    clearInterval(soloTimers[soloRoomId]);
                    delete soloTimers[soloRoomId];
                }
                deleteRoom(soloRoomId);
                delete cleanupTimers[soloRoomId];
            }, SOLO_RECONNECT_WINDOW);
        } else {
            if (soloTimers[soloRoomId]) {
                clearInterval(soloTimers[soloRoomId]);
                delete soloTimers[soloRoomId];
            }
            if (soloRoom) {
                deleteRoom(soloRoomId);
            }
        }

        delete socketUserMap[socket.id];
    }

    removePlayer(socket.id);
  });
});

// ── Start server with DB ──
const start = async () => {
    httpServer.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
};

start().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
