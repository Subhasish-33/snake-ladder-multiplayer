const { BOARD_SIZE, calculateFinalPosition } = require('../data/board');

const rooms = {};
const timers = {}; // Separate map: roomId -> timeout handle (NEVER in room object!)
const COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
const TURN_SECONDS = 30;

// ── helpers ────────────────────────────────────────────────────────────────

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

function clearTurnTimer(roomId) {
  if (timers[roomId]) {
    clearTimeout(timers[roomId]);
    delete timers[roomId];
  }
}

function startTurnTimer(io, roomId) {
  const room = rooms[roomId];
  if (!room || room.status !== 'playing') return;

  clearTurnTimer(roomId);

  const expiresAt = Date.now() + TURN_SECONDS * 1000;
  io.to(roomId).emit('turn-start', {
    expiresAt,
    currentPlayerId: room.playerOrder[room.turnIndex]
  });

  timers[roomId] = setTimeout(() => {
    const r = rooms[roomId];
    if (!r || r.status !== 'playing') return;

    const skippedId = r.playerOrder[r.turnIndex];
    r.turnIndex = (r.turnIndex + 1) % r.playerOrder.length;
    io.to(roomId).emit('turn-skipped', { skippedId });
    io.to(roomId).emit('update-game', r);

    startTurnTimer(io, roomId);
  }, TURN_SECONDS * 1000);
}

// ── handlers ───────────────────────────────────────────────────────────────

function handleJoinRoom(io, socket, roomId, playerName = 'Player') {
  socket.join(roomId);
  const room = getRoom(roomId);
  const colorIndex = room.playerOrder.length % COLORS.length;

  if (!room.players[socket.id]) {
    room.players[socket.id] = {
      id: socket.id,
      position: 1,
      name: `${playerName} ${room.playerOrder.length + 1}`,
      color: COLORS[colorIndex]
    };
    room.playerOrder.push(socket.id);
  }

  if (room.status === 'finished') {
    clearTurnTimer(roomId);
    room.status = 'waiting';
    room.winner = null;
    room.turnIndex = 0;
    Object.values(room.players).forEach(p => p.position = 1);
  }

  console.log(`User ${socket.id} joined room ${roomId}`);
  io.to(roomId).emit('update-game', room);
}

function handleStartGame(io, socket, roomId) {
  const room = rooms[roomId];
  if (room && room.playerOrder.length >= 2) {
    room.status = 'playing';
    room.turnIndex = 0;
    io.to(roomId).emit('update-game', room);
    startTurnTimer(io, roomId);
  }
}

function handleRollDice(io, socket, roomId) {
  const room = rooms[roomId];
  if (!room || room.status !== 'playing') return;

  const currentPlayerId = room.playerOrder[room.turnIndex];
  if (currentPlayerId !== socket.id) return;

  // Cancel the auto-skip — player rolled in time
  clearTurnTimer(roomId);

  const roll = Math.floor(Math.random() * 6) + 1;
  const player = room.players[socket.id];

  io.to(roomId).emit('dice-rolled', { playerId: socket.id, roll });

  setTimeout(() => {
    let newPosition = player.position + roll;

    if (newPosition > BOARD_SIZE) {
      newPosition = player.position; // overshoot — stay
    } else {
      newPosition = calculateFinalPosition(newPosition);
    }

    player.position = newPosition;

    if (player.position === BOARD_SIZE) {
      room.status = 'finished';
      room.winner = socket.id;
    } else {
      room.turnIndex = (room.turnIndex + 1) % room.playerOrder.length;
      startTurnTimer(io, roomId); // start timer for next player
    }

    io.to(roomId).emit('update-game', room);
  }, 1000);
}

function handleDisconnect(io, socket) {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    if (room.players[socket.id]) {
      delete room.players[socket.id];
      room.playerOrder = room.playerOrder.filter(id => id !== socket.id);

      if (room.playerOrder.length === 0) {
        clearTurnTimer(roomId);
        delete rooms[roomId];
      } else {
        if (room.turnIndex >= room.playerOrder.length) room.turnIndex = 0;

        if (room.status === 'playing' && room.playerOrder.length < 2) {
          room.status = 'waiting';
          clearTurnTimer(roomId);
        } else if (room.status === 'playing') {
          startTurnTimer(io, roomId);
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


// ── helpers ────────────────────────────────────────────────────────────────

function getRoom(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      players: {},
      playerOrder: [],
      turnIndex: 0,
      status: 'waiting',
      winner: null,
      _timer: null          // server-side timeout handle
    };
  }
  return rooms[roomId];
}

/** Clears any running timer for this room */
function clearTurnTimer(room) {
  if (room._timer) {
    clearTimeout(room._timer);
    room._timer = null;
  }
}

/** Starts (or restarts) the 30-second auto-skip timer */
function startTurnTimer(io, roomId) {
  const room = rooms[roomId];
  if (!room || room.status !== 'playing') return;

  clearTurnTimer(room);

  // Tell every client when this turn expires so they can show a countdown
  const expiresAt = Date.now() + TURN_SECONDS * 1000;
  io.to(roomId).emit('turn-start', { expiresAt, currentPlayerId: room.playerOrder[room.turnIndex] });

  room._timer = setTimeout(() => {
    if (!rooms[roomId] || rooms[roomId].status !== 'playing') return;
    const r = rooms[roomId];

    // Skip this player's turn
    r.turnIndex = (r.turnIndex + 1) % r.playerOrder.length;
    io.to(roomId).emit('turn-skipped', { skippedId: r.playerOrder[(r.turnIndex - 1 + r.playerOrder.length) % r.playerOrder.length] });
    io.to(roomId).emit('update-game', r);

    // Restart the timer for the next player
    startTurnTimer(io, roomId);
  }, TURN_SECONDS * 1000);
}

// ── handlers ───────────────────────────────────────────────────────────────

function handleJoinRoom(io, socket, roomId, playerName = 'Player') {
  socket.join(roomId);
  const room = getRoom(roomId);
  const colorIndex = room.playerOrder.length % COLORS.length;

  if (!room.players[socket.id]) {
    room.players[socket.id] = {
      id: socket.id,
      position: 1,
      name: `${playerName} ${room.playerOrder.length + 1}`,
      color: COLORS[colorIndex]
    };
    room.playerOrder.push(socket.id);
  }

  if (room.status === 'finished') {
    clearTurnTimer(room);
    room.status = 'waiting';
    room.winner = null;
    room.turnIndex = 0;
    Object.values(room.players).forEach(p => p.position = 1);
  }

  console.log(`User ${socket.id} joined room ${roomId}`);
  io.to(roomId).emit('update-game', room);
}

function handleStartGame(io, socket, roomId) {
  const room = rooms[roomId];
  if (room && room.playerOrder.length >= 2) {
    room.status = 'playing';
    room.turnIndex = 0;
    io.to(roomId).emit('update-game', room);
    startTurnTimer(io, roomId);
  }
}

function handleRollDice(io, socket, roomId) {
  const room = rooms[roomId];
  if (!room || room.status !== 'playing') return;

  const currentPlayerId = room.playerOrder[room.turnIndex];
  if (currentPlayerId !== socket.id) return; // Not their turn

  // Player is rolling — cancel the auto-skip timer
  clearTurnTimer(room);

  const roll = Math.floor(Math.random() * 6) + 1;
  const player = room.players[socket.id];

  io.to(roomId).emit('dice-rolled', { playerId: socket.id, roll });

  setTimeout(() => {
    let newPosition = player.position + roll;

    if (newPosition > BOARD_SIZE) {
      newPosition = player.position;
    } else {
      newPosition = calculateFinalPosition(newPosition);
    }

    player.position = newPosition;

    if (player.position === BOARD_SIZE) {
      room.status = 'finished';
      room.winner = socket.id;
      clearTurnTimer(room);
    } else {
      room.turnIndex = (room.turnIndex + 1) % room.playerOrder.length;
      startTurnTimer(io, roomId); // Restart timer for next player
    }

    io.to(roomId).emit('update-game', room);
  }, 1000);
}

function handleDisconnect(io, socket) {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    if (room.players[socket.id]) {
      delete room.players[socket.id];
      room.playerOrder = room.playerOrder.filter(id => id !== socket.id);

      if (room.playerOrder.length === 0) {
        clearTurnTimer(room);
        delete rooms[roomId];
      } else {
        if (room.turnIndex >= room.playerOrder.length) room.turnIndex = 0;

        if (room.status === 'playing' && room.playerOrder.length < 2) {
          room.status = 'waiting';
          clearTurnTimer(room);
        } else if (room.status === 'playing') {
          // Restart timer for whoever's turn it is now
          startTurnTimer(io, roomId);
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
