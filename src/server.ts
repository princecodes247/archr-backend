import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { calculateShot } from './physics';
import {
    generateUserId, isValidUserId,
    joinRoom, handleShot, removePlayer, getRoom, deleteRoom,
    tickTimer, isSoloGameOver, findActiveGame,
    submitScore, getLeaderboard
} from './gameState';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = 3000;

// socket.id → userId mapping
const socketUserMap: Record<string, string> = {};

// Track solo timer intervals per room
const soloTimers: Record<string, NodeJS.Timeout> = {};

// Cleanup timers for solo rooms (delayed deletion after disconnect)
const cleanupTimers: Record<string, NodeJS.Timeout> = {};

const SOLO_RECONNECT_WINDOW = 60_000; // 60s to reconnect

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // ── Registration ──
  // Client sends existing userId (from localStorage) or nothing
  socket.on('register', (data: { userId?: string }, callback) => {
      let userId: string;

      if (data?.userId && isValidUserId(data.userId)) {
          userId = data.userId;
          console.log('User re-registered:', userId, '← socket:', socket.id);
      } else {
          userId = generateUserId();
          console.log('New user registered:', userId, '← socket:', socket.id);
      }

      socketUserMap[socket.id] = userId;

      // Acknowledge with the confirmed userId
      if (typeof callback === 'function') {
          callback({ userId });
      } else {
          socket.emit('registered', { userId });
      }
  });

  // ── Join Game ──
  socket.on('joinGame', (mode: 'solo' | 'multiplayer') => {
      const userId = socketUserMap[socket.id];
      if (!userId) {
          socket.emit('error', 'Not registered');
          return;
      }

      // For solo: check if there's an active game to rejoin
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

                  // Restart timer if not running
                  if (!soloTimers[roomId]) {
                      soloTimers[roomId] = setInterval(() => {
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
                              io.to(roomId).emit('gameState', updatedRoom);
                          }
                      }, 1000);
                  }
                  return;
              }
          }

          // No active game — clean up any old finished room and create fresh
          if (getRoom(roomId)) {
              clearInterval(soloTimers[roomId]);
              delete soloTimers[roomId];
              deleteRoom(roomId);
          }

          const room = joinRoom(roomId, socket.id, userId, mode);
          if (room) {
              socket.join(roomId);
              socket.emit('gameState', room);

              soloTimers[roomId] = setInterval(() => {
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
                      io.to(roomId).emit('gameState', updatedRoom);
                  }
              }, 1000);
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
  socket.on('submitScore', (data: { name: string, score: number }) => {
      const userId = socketUserMap[socket.id];
      if (!userId) return;

      submitScore(userId, data.name, data.score);
      io.emit('leaderboardUpdate', getLeaderboard());
  });

  socket.on('getLeaderboard', () => {
      socket.emit('leaderboardUpdate', getLeaderboard());
  });

  // ── Disconnect ──
  socket.on('disconnect', () => {
    const userId = socketUserMap[socket.id];
    console.log('Socket disconnected:', socket.id, '(userId:', userId, ')');

    if (userId) {
        const soloRoomId = `solo_${userId}`;
        const soloRoom = getRoom(soloRoomId);

        if (soloRoom && !isSoloGameOver(soloRoom)) {
            // Game still active — keep room alive, set cleanup timer
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
            // Game over or no room — clean up immediately
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

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
