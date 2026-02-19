import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { calculateShot } from './physics';
import { joinRoom, handleShot, removePlayer, getRoom, tickTimer, isSoloGameOver, submitScore, getLeaderboard } from './gameState';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

const PORT = 3000;

// Track solo timer intervals per room
const soloTimers: Record<string, NodeJS.Timeout> = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Handle joining a game (Solo or Multiplayer)
  socket.on('joinGame', (mode: 'solo' | 'multiplayer') => {
      const roomId = mode === 'solo' ? `solo_${socket.id}` : 'default-arena';
      const room = joinRoom(roomId, socket.id, mode);
      
      console.log("joinGame", { mode, roomId, room });
      if (room) {
          socket.join(roomId);
          socket.emit('gameState', room);

          if (mode === 'multiplayer') {
              socket.to(roomId).emit('gameState', room);
          }

          // Start solo timer
          if (mode === 'solo') {
              // Clear any existing timer for this room
              if (soloTimers[roomId]) {
                  clearInterval(soloTimers[roomId]);
              }

              soloTimers[roomId] = setInterval(() => {
                  const updatedRoom = tickTimer(roomId);
                  if (!updatedRoom) {
                      clearInterval(soloTimers[roomId]);
                      delete soloTimers[roomId];
                      return;
                  }

                  // Send timer update
                  io.to(roomId).emit('timerUpdate', {
                      timeRemaining: updatedRoom.timeRemaining
                  });

                  // Game over when time runs out
                  if (isSoloGameOver(updatedRoom)) {
                      clearInterval(soloTimers[roomId]);
                      delete soloTimers[roomId];
                      updatedRoom.currentTurn = ''; // No more shots
                      io.to(roomId).emit('gameState', updatedRoom);
                  }
              }, 1000);
          }
      } else {
          socket.emit('error', 'Room full or invalid mode');
      }
  });

  socket.on('shoot', (data: { aimPosition: { x: number, y: number } }) => {
    let roomId = Array.from(socket.rooms).find(r => r !== socket.id);
    if (!roomId) return;

    const room = getRoom(roomId);
    if (!room) return;

    // Solo: just check game isn't over
    if (room.mode === 'solo') {
        if (isSoloGameOver(room)) return;
    } else {
        // Multiplayer: validate turn
        if (room.currentTurn !== socket.id) {
            console.log('Not your turn:', socket.id);
            return;
        }
    }
    
    const result = calculateShot(data.aimPosition, room.wind);
    const updatedRoom = handleShot(roomId, socket.id, result.score);
    
    io.to(roomId).emit('shotResult', {
        player: socket.id,
        path: result.path,
        score: result.score
    });
    
    io.to(roomId).emit('gameState', updatedRoom);
  });

  // Leaderboard
  socket.on('submitScore', (data: { name: string, score: number }) => {
      submitScore(data.name, data.score);
      io.emit('leaderboardUpdate', getLeaderboard());
  });

  socket.on('getLeaderboard', () => {
      socket.emit('leaderboardUpdate', getLeaderboard());
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Clean up solo timer
    const soloRoomId = `solo_${socket.id}`;
    if (soloTimers[soloRoomId]) {
        clearInterval(soloTimers[soloRoomId]);
        delete soloTimers[soloRoomId];
    }
    
    removePlayer(socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
