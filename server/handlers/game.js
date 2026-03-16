const { BOARD_SIZE, calculateFinalPosition } = require('../data/board');

// Object to store the state of all active games
// Structure:
// rooms[roomId] = {
//   players: { socketId: { id: socketId, position: Number, name: String, color: String } },
//   playerOrder: [socketId1, socketId2, ...], // To keep track of turns
//   turnIndex: 0, // Whose turn it is currently (index of playerOrder)
//   status: 'waiting' | 'playing' | 'finished',
//   winner: null
// }
const rooms = {};

// Colors for the players to easily distinguish them
const COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

function getRoom(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      players: {},
      playerOrder: [],
      turnIndex: 0,
      status: 'waiting',
      winner: null
    };
  }
  return rooms[roomId];
}

function handleJoinRoom(io, socket, roomId, playerName = 'Player') {
  socket.join(roomId);
  const room = getRoom(roomId);
  
  // Assign a color based on order
  const colorIndex = room.playerOrder.length % COLORS.length;
  
  if (!room.players[socket.id]) {
    room.players[socket.id] = {
      id: socket.id,
      position: 1, // Start at square 1
      name: `${playerName} ${room.playerOrder.length + 1}`,
      color: COLORS[colorIndex]
    };
    room.playerOrder.push(socket.id);
  }

  // Auto-start if it's waiting and we have 2+ players (We can let them manually start, but for simplicity let's stick to waiting/playing)
  if (room.status === 'finished') {
    // Reset if joining a finished game
    room.status = 'waiting';
    room.winner = null;
    room.turnIndex = 0;
    Object.values(room.players).forEach(p => p.position = 1);
  }

  console.log(`User ${socket.id} joined room ${roomId}`);
  
  // Broadcast the updated state to everyone in the room
  io.to(roomId).emit('update-game', room);
}

function handleStartGame(io, socket, roomId) {
  const room = rooms[roomId];
  if (room && room.playerOrder.length >= 2) {
      room.status = 'playing';
      room.turnIndex = 0;
      io.to(roomId).emit('update-game', room);
  }
}

function handleRollDice(io, socket, roomId) {
  const room = rooms[roomId];
  if (!room || room.status !== 'playing') return;

  // Check if it's the player's turn
  const currentPlayerId = room.playerOrder[room.turnIndex];
  if (currentPlayerId !== socket.id) return; // Not their turn

  // Roll the dice!
  const roll = Math.floor(Math.random() * 6) + 1;
  const player = room.players[socket.id];
  
  // Broadcast dice animation instantly before calculated movement
  io.to(roomId).emit('dice-rolled', { playerId: socket.id, roll });

  // Wait a short moment for animation before actually moving
  setTimeout(() => {
    let newPosition = player.position + roll;
    
    // Bounds check
    if (newPosition > BOARD_SIZE) {
      // You must land exactly on the last square, or bounce back (classic rule: bounce back or don't move)
      // For simplicity, let's just make them not move if they overshoot.
      newPosition = player.position; 
    } else {
      // Check snakes and ladders
      newPosition = calculateFinalPosition(newPosition);
    }
    
    player.position = newPosition;

    // Check Win Condition
    if (player.position === BOARD_SIZE) {
      room.status = 'finished';
      room.winner = socket.id;
    } else {
      // If they roll a 6, they often get another turn. But let's skip that complexity for V1 and just advance turn.
      room.turnIndex = (room.turnIndex + 1) % room.playerOrder.length;
    }

    // Broadcast new state
    io.to(roomId).emit('update-game', room);
    
  }, 1000); // 1 second delay to watch the dice
}

function handleDisconnect(io, socket) {
  // Find which room the player was in and remove them
  for (const roomId in rooms) {
    const room = rooms[roomId];
    if (room.players[socket.id]) {
      delete room.players[socket.id];
      room.playerOrder = room.playerOrder.filter(id => id !== socket.id);
      
      if (room.playerOrder.length === 0) {
        // Delete room if empty
        delete rooms[roomId];
      } else {
        // Adjust turn index if necessary
        if (room.turnIndex >= room.playerOrder.length) {
          room.turnIndex = 0;
        }
        
        // If playing and < 2 players left, go back to waiting
        if (room.status === 'playing' && room.playerOrder.length < 2) {
          room.status = 'waiting';
        }
        
        io.to(roomId).emit('update-game', room);
      }
      break;
    }
  }
}

module.exports = {
  handleJoinRoom,
  handleStartGame,
  handleRollDice,
  handleDisconnect
};
