import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import RoomLobby from './components/RoomLobby';
import Board from './components/Board';
import Dice from './components/Dice';
import './index.css';

// Connect to the backend server unconditionally
// Connect to backend (automatically use the current hostname so other devices on network can connect)
const SOCKET_URL = import.meta.env.VITE_SERVER_URL || `http://${window.location.hostname}:3001`;
const socket = io(SOCKET_URL);

function App() {
  const [inRoom, setInRoom] = useState(false);
  const [gameState, setGameState] = useState(null);
  const [currentRoll, setCurrentRoll] = useState(1);
  const [isRolling, setIsRolling] = useState(false);
  const [lastPositions, setLastPositions] = useState({});
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  // Function to synthesize "Faaah" sound (Snake)
  const playSnakeSound = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = 'sawtooth';
      // High pitch sliding down to low pitch over 1 second ("Faaah")
      osc.frequency.setValueAtTime(800, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 1);
      
      gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 1);
    } catch(e) {}
  };

  // Function to synthesize "Ghop Ghop" sound (Ladder)
  const playLadderSound = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      
      const playGhop = (startTime) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        
        // Quick low pitch blip ("Ghop")
        osc.frequency.setValueAtTime(150, startTime);
        osc.frequency.exponentialRampToValueAtTime(80, startTime + 0.1);
        
        gain.gain.setValueAtTime(0.6, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.1);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.1);
      };
      
      // Play two ghops
      playGhop(audioCtx.currentTime);
      playGhop(audioCtx.currentTime + 0.2); // 200ms later
      
    } catch(e) {}
  };

  useEffect(() => {
    // Listen for game updates
    socket.on('update-game', (state) => {
      // Check for position changes to trigger sounds
      if (state.status === 'playing' || state.status === 'finished') {
        Object.values(state.players).forEach(player => {
          setLastPositions(prev => {
            const oldPos = prev[player.id];
            const newPos = player.position;
            
            if (oldPos && newPos !== oldPos) {
              const diff = newPos - oldPos;
              if (diff > 6) {
                playLadderSound(); // Up a ladder!
              } else if (diff < 0) {
                playSnakeSound(); // Down a snake!
              }
            }
            return { ...prev, [player.id]: newPos };
          });
        });
      }
      
      setGameState(state);
    });

    // Listen for dice roll animations
    socket.on('dice-rolled', ({ roll }) => {
      setIsRolling(true);
      setCurrentRoll(roll);
      
      // Stop the rolling animation after the server delay (1s) finishes
      setTimeout(() => {
        setIsRolling(false);
      }, 1000);
    });

    socket.on('receive-chat', (msg) => {
      setChatMessages(prev => [...prev, msg]);
    });

    return () => {
      socket.off('update-game');
      socket.off('dice-rolled');
      socket.off('receive-chat');
    };
  }, []);

  const handleJoinRoom = (roomId, playerName) => {
    socket.emit('join-room', roomId, playerName);
    setInRoom(true);
  };

  const handleRollDice = () => {
    if (!gameState) return;
    const roomId = Object.keys(gameState.players).length > 0 ? getRoomIdFromSocket() : null; // We need room id, wait, server only needs roomId to know, we have to store roomId
  };

  // Wait, the client needs the roomId to emit roll-dice, let's keep track of it
  const [currentRoomId, setCurrentRoomId] = useState('');

  const handleJoinRoomUpdated = (roomId, playerName) => {
    setCurrentRoomId(roomId);
    socket.emit('join-room', roomId, playerName);
    setInRoom(true);
  };

  const handleRollDiceUpdated = () => {
    socket.emit('roll-dice', currentRoomId);
  };

  const handleStartGame = () => {
    socket.emit('start-game', currentRoomId);
  }

  // If not in a room, show Lobby
  if (!inRoom) {
    return <RoomLobby onJoin={handleJoinRoomUpdated} />;
  }

  // Loading state while waiting for initial server sync
  if (!gameState) {
    return <div className="glass" style={{padding: '40px'}}>Connecting to game...</div>;
  }

  // Helper bindings
  const playersInRoom = Object.values(gameState.players);
  const isMyTurn = gameState.status === 'playing' && gameState.playerOrder[gameState.turnIndex] === socket.id;
  
  // Find the winning player if the game is over
  const winnerPlayer = gameState.status === 'finished' 
    ? Object.values(gameState.players).find(p => p.position >= 100) 
    : null;

  const getStatusMessage = () => {
    if (gameState.status === 'waiting') {
      return 'Waiting for players...';
    } else if (gameState.status === 'playing') {
      return 'Game In Progress';
    } else if (gameState.status === 'finished') {
      return 'Game Over!';
    }
    return '';
  };

  const handleExitGame = () => {
    if (confirm("Are you sure you want to leave the game?")) {
      socket.emit('leave-room');
      setGameState(null);
      setCurrentRoomId('');
      setChatMessages([]);
    }
  };

  const handleSendChat = (e) => {
    e.preventDefault();
    if (chatInput.trim() && currentRoomId) {
      socket.emit('send-chat', currentRoomId, gameState.players[socket.id]?.name || 'Player', chatInput.trim());
      setChatInput('');
    }
  };

  return (
    <div className="game-container">
      
      {/* Left Sidebar: Status, Players, Dice */}
      <div className="sidebar panel glass">
        <div>
          <h2>Room: {currentRoomId}</h2>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <p className="status-text" style={{ color: gameState.status === 'playing' ? '#10b981' : '#f59e0b' }}>{getStatusMessage()}</p>
            <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.9rem', backgroundColor: '#ef4444', border: 'none' }} onClick={handleExitGame}>Exit</button>
          </div>

          {gameState.status === 'waiting' && playersInRoom.length >= 2 && (
             <button className="btn-primary" onClick={handleStartGame}>Start Game Now</button>
          )}

          <div className="player-list">
            <h3>Players ({playersInRoom.length})</h3>
            {playersInRoom.map(p => {
              const isActiveTurn = gameState.status === 'playing' && gameState.playerOrder[gameState.turnIndex] === p.id;
              return (
                <div key={p.id} className={`player-item ${isActiveTurn ? 'active-turn' : ''}`}>
                  <div className="player-token-indicator" style={{ backgroundColor: p.color }}></div>
                  <div className="player-info">
                    <span>{p.name} {p.id === socket.id ? '(You)' : ''}</span>
                    <span style={{ color: 'var(--text-muted)' }}>Pos: {p.position}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="ticks"></div>

        {gameState.status === 'playing' && (
          <Dice 
            roll={currentRoll} 
            onRoll={handleRollDiceUpdated} 
            isMyTurn={isMyTurn} 
            isRolling={isRolling} 
          />
        )}
      </div>

      {/* Main Board */}
      <Board players={gameState.players} />

      {/* Right Sidebar: Chat */}
      <div className="sidebar panel glass chat-panel">
        <h3 style={{ margin: '0 0 10px 0' }}>Live Chat 💬</h3>
        <div className="chat-messages">
          {chatMessages.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>No messages yet. Greet everyone! 👋</span>}
          {chatMessages.map((msg, i) => (
            <div key={i} className={`chat-message ${msg.playerName === (gameState.players[socket.id]?.name || 'Player') ? 'my-message' : ''}`}>
              <strong>{msg.playerName}: </strong>
              <span>{msg.message}</span>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        <form className="chat-form" onSubmit={handleSendChat}>
          <input 
            type="text" 
            value={chatInput} 
            onChange={(e) => setChatInput(e.target.value)} 
            placeholder="Type a message..." 
            className="input-field chat-input"
            maxLength={100}
          />
          <button type="submit" className="btn-primary" style={{ padding: '8px 12px', fontSize: '1rem' }}>Send</button>
        </form>
      </div>

      {/* Winner Overlay */}
      {winnerPlayer && (
        <div className="winner-overlay">
          <div className="winner-card glass">
            <h2>🏆 Winner! 🏆</h2>
            <div className="winner-badge" style={{ margin: '20px 0', fontSize: '5rem', animation: 'bounce 2s infinite' }}>
              🏅
            </div>
            <p style={{ fontSize: '1.2rem' }}><strong>{winnerPlayer.name}</strong> has reached the end!</p>
            <div style={{ marginTop: '20px' }}>
              <button className="btn-primary" onClick={() => socket.emit('join-room', currentRoomId, gameState.players[socket.id].name)}>Play Again</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
