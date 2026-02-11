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

  // Auto join a default room for now
  const roomId = 'default-arena';
  const room = joinRoom(roomId, socket.id);
  socket.join(roomId);
  io.to(roomId).emit('gameState', room);

  socket.on('shoot', (data: { aimPosition: { x: number, y: number } }) => {
    // Validate turn
    const room = getRoom(roomId);
    if (!room || room.currentTurn !== socket.id) {
        console.log('Not your turn:', socket.id);
        return;
    };
    
    console.log('Shot received:', data.aimPosition);
    
    // Calculate physics
    const result = calculateShot(data.aimPosition);
    
    // Update State
    const updatedRoom = handleShot(roomId, socket.id, result.score);
    
    // Broadcast result + New State
    io.to(roomId).emit('shotResult', {
        player: socket.id,
        path: result.path,
        score: result.score
    });
    
    // Delay state update slightly so visualization can start? 
    // Or send immediately and frontend handles it.
    io.to(roomId).emit('gameState', updatedRoom);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    removePlayer(socket.id);
    // Broadcast update?
    const room = getRoom(roomId);
    if (room) io.to(roomId).emit('gameState', room);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
