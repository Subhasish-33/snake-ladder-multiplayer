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

// Deterministic color per username
const NAME_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#a855f7'];
function nameColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return NAME_COLORS[Math.abs(hash) % NAME_COLORS.length];
}

function App() {
  const [inRoom, setInRoom] = useState(false);
  const [gameState, setGameState] = useState(null);
  const [currentRoll, setCurrentRoll] = useState(1);
  const [isRolling, setIsRolling] = useState(false);
  const [lastPositions, setLastPositions] = useState({});
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [turnExpiresAt, setTurnExpiresAt] = useState(null);
  const [timeLeft, setTimeLeft] = useState(30);
  const [skipToast, setSkipToast] = useState(null);
  const messagesEndRef = useRef(null);
  const chatScrollRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const scrollToBottom = () => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleChatScroll = (e) => {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  // Live countdown ticker
  useEffect(() => {
    if (!turnExpiresAt) return;
    const tick = () => {
      const remaining = Math.max(0, Math.round((turnExpiresAt - Date.now()) / 1000));
      setTimeLeft(remaining);
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [turnExpiresAt]);

  // Function to play "Faaah" sound (Snake)
  const playSnakeSound = () => {
    try {
      const audio = new Audio('/fahhh_KcgAXfs.mp3');
      audio.play();
    } catch(e) {
      console.error("Audio play failed", e);
    }
  };

  // Function to play "Ghop Ghop" sound (Ladder)
  const playLadderSound = () => {
    try {
      const audio = new Audio('/gopgopgop.mp3');
      audio.play();
    } catch(e) {
      console.error("Audio play failed", e);
    }
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

    socket.on('turn-start', ({ expiresAt }) => {
      setTurnExpiresAt(expiresAt);
    });

    socket.on('turn-skipped', ({ skippedId }) => {
      // Show a brief toast notification
      setSkipToast(skippedId);
      setTimeout(() => setSkipToast(null), 3000);
    });

    return () => {
      socket.off('update-game');
      socket.off('dice-rolled');
      socket.off('receive-chat');
      socket.off('turn-start');
      socket.off('turn-skipped');
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
          
          {/* Live Chat Section — Twitch Style */}
          <div className="chat-panel">
            <div className="chat-header">
              <span className="chat-title">🗨️ Live Chat</span>
              <span className="chat-live-badge">● LIVE</span>
            </div>
            <div className="chat-messages" onScroll={handleChatScroll} ref={chatScrollRef}>
              {chatMessages.length === 0 && (
                <span className="chat-empty">No messages yet. Greet everyone! 👋</span>
              )}
              {chatMessages.map((msg, i) => {
                const isMe = msg.playerName === (gameState.players[socket.id]?.name || 'Player');
                const initials = msg.playerName.slice(0, 2).toUpperCase();
                const color = nameColor(msg.playerName);
                const time = msg.timestamp
                  ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : '';
                return (
                  <div key={i} className={`twitch-msg ${isMe ? 'twitch-msg--me' : ''}`}>
                    <div className="twitch-avatar" style={{ background: color }}>{initials}</div>
                    <div className="twitch-body">
                      <div className="twitch-meta">
                        <span className="twitch-name" style={{ color }}>{msg.playerName}</span>
                        {isMe && <span className="twitch-badge twitch-badge--you">YOU</span>}
                        <span className="twitch-time">{time}</span>
                      </div>
                      <p className="twitch-text">{msg.message}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
            {!autoScroll && (
              <button className="chat-scroll-btn" onClick={() => { setAutoScroll(true); scrollToBottom(); }}>↓ New messages</button>
            )}
            <form className="chat-form" onSubmit={handleSendChat}>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Send a message..."
                className="chat-input"
                maxLength={100}
                autoComplete="off"
              />
              <button type="submit" className="chat-send-btn">Send</button>
            </form>
          </div>
        </div>

        <div className="ticks"></div>

        {gameState.status === 'playing' && (
          <>
            {/* Countdown Timer Bar */}
            <div className="turn-timer">
              <div className="turn-timer-label">
                {isMyTurn
                  ? timeLeft <= 10
                    ? `⏰ Hurry! ${timeLeft}s`
                    : `⏳ Your turn — ${timeLeft}s`
                  : `⏳ ${timeLeft}s`}
              </div>
              <div className="turn-timer-bar">
                <div
                  className={`turn-timer-fill ${timeLeft <= 10 ? 'danger' : ''}`}
                  style={{ width: `${(timeLeft / 30) * 100}%` }}
                />
              </div>
            </div>
            <Dice
              roll={currentRoll}
              onRoll={handleRollDiceUpdated}
              isMyTurn={isMyTurn}
              isRolling={isRolling}
            />
          </>
        )}
      </div>

      {/* Main Board */}
      <Board players={gameState.players} />

      {/* Skip Toast */}
      {skipToast && (
        <div className="skip-toast">
          ⏰ {gameState.players[skipToast]?.name || 'A player'} timed out! Turn skipped.
        </div>
      )}

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
