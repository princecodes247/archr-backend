import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { calculateShot } from './physics';
import { joinRoom, handleShot, removePlayer, getRoom } from './gameState';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

const PORT = 3000;

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Handle joining a game (Solo or Multiplayer)
  socket.on('joinGame', (mode: 'solo' | 'multiplayer') => {
      // For solo, create a unique room per player
      // For multiplayer, try to find an open room or create one
      // Simplified: Solo = socket.id, Multi = 'default-arena' (for now)
      const roomId = mode === 'solo' ? `solo_${socket.id}` : 'default-arena';
      const room = joinRoom(roomId, socket.id, mode);
      
      if (room) {
          socket.join(roomId);
          socket.emit('gameState', room); // Send to just this user initially
          // If multiplayer, broadcast to others in room
          if (mode === 'multiplayer') {
              socket.to(roomId).emit('gameState', room);
          }
      } else {
          socket.emit('error', 'Room full or invalid mode');
      }
  });

  socket.on('shoot', (data: { aimPosition: { x: number, y: number } }) => {
    // Determine room I am in
    // This is a simplification; ideally store roomId on socket or look it up
    let roomId = Array.from(socket.rooms).find(r => r !== socket.id);
    if (!roomId) return;

    // Validate turn
    const room = getRoom(roomId);
    if (!room || room.currentTurn !== socket.id) {
        console.log('Not your turn:', socket.id);
        return;
    };
    
    // Calculate physics
    const result = calculateShot(data.aimPosition, room.wind);
    
    // Update State
    const updatedRoom = handleShot(roomId, socket.id, result.score);
    
    // Broadcast result + New State
    io.to(roomId).emit('shotResult', {
        player: socket.id,
        path: result.path,
        score: result.score
    });
    
    io.to(roomId).emit('gameState', updatedRoom);
  });

  // Leaderboard
  socket.on('submitScore', (data: { name: string, score: number }) => {
      const { submitScore, getLeaderboard } = require('./gameState'); // Dynamic import to avoid cycle? Or just import top-level
      submitScore(data.name, data.score);
      io.emit('leaderboardUpdate', getLeaderboard());
  });

  socket.on('getLeaderboard', () => {
      const { getLeaderboard } = require('./gameState');
      socket.emit('leaderboardUpdate', getLeaderboard());
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    removePlayer(socket.id);
    // Determine roomId? Harder now. 
    // Ideally removePlayer returns the affected room
    // broadcast to that room
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
