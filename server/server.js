const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { handleJoinRoom, handleRollDice, handleDisconnect, handleStartGame } = require('./handlers/game');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "*", // Allow production URL, or fall back to open CORS for local testing
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true
  }
});

io.on('connection', (socket) => {
  console.log('A player connected:', socket.id);

  socket.on('join-room', (roomId, playerName) => {
    handleJoinRoom(io, socket, roomId, playerName);
  });

  socket.on('start-game', (roomId) => {
    handleStartGame(io, socket, roomId);
  });

  socket.on('roll-dice', (roomId) => {
    handleRollDice(io, socket, roomId);
  });

  socket.on('send-chat', (roomId, playerName, message) => {
    io.to(roomId).emit('receive-chat', { playerName, message, timestamp: new Date().toISOString() });
  });

  socket.on('leave-room', () => {
    handleDisconnect(io, socket);
  });

  socket.on('disconnect', () => {
    handleDisconnect(io, socket);
    console.log('Player disconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});