import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import RoomLobby from './components/RoomLobby';
import Board from './components/Board';
import './index.css';

const SOCKET_URL = import.meta.env.VITE_SERVER_URL || `http://${window.location.hostname}:3001`;
const socket = io(SOCKET_URL);

// Deterministic color per username
const NAME_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#a855f7'];
function nameColor(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return NAME_COLORS[Math.abs(hash) % NAME_COLORS.length];
}

const EMOJIS = ['🔥','😂','👍','💀','🏠','👑','⚡','🎯'];

// ── Dice component (inline, uses new CSS classes) ─────────────────────────────
function Dice({ roll, onRoll, isMyTurn, isRolling }) {
  const playSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.15);
    } catch(e) {}
  };

  const handleClick = () => {
    if (isMyTurn && !isRolling) { playSound(); onRoll(); }
  };

  const diceClass = isRolling ? 'dice rolling' : `dice face-${roll || 1}`;

  return (
    <div className="dice-container">
      <div
        className={`${diceClass} ${isMyTurn && !isRolling ? 'clickable' : 'not-clickable'}`}
        onClick={handleClick}
        title={isMyTurn ? 'Click to roll!' : 'Waiting for your turn'}
      >
        <div className="dot dot-1" />
        {(roll > 1 || isRolling) && <div className="dot dot-2" />}
        {(roll > 2 || isRolling) && <div className="dot dot-3" />}
        {(roll > 3 || isRolling) && <div className="dot dot-4" />}
        {(roll > 4 || isRolling) && <div className="dot dot-5" />}
        {(roll === 6 || isRolling) && <div className="dot dot-6" />}
      </div>
    </div>
  );
}

function App() {
  const [inRoom, setInRoom] = useState(false);
  const [gameState, setGameState] = useState(null);
  const [currentRoomId, setCurrentRoomId] = useState('');
  const [currentRoll, setCurrentRoll] = useState(1);
  const [isRolling, setIsRolling] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);

  // Turn timer
  const [turnExpiresAt, setTurnExpiresAt] = useState(null);
  const [timeLeft, setTimeLeft] = useState(30);

  // Skip toast
  const [skipToast, setSkipToast] = useState(null);

  // Stats: { socketId: { rolls, snakes, ladders } }
  const [stats, setStats] = useState({});

  // Emoji reactions overlay
  const [reactions, setReactions] = useState([]);

  const messagesEndRef = useRef(null);
  const chatMessagesRef = useRef(null);

  // ── Chat scroll ────────────────────────────────────────────────────────────
  const scrollToBottom = () => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };
  useEffect(() => { scrollToBottom(); }, [chatMessages]);

  const handleChatScroll = (e) => {
    const el = e.currentTarget;
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  };

  // ── Turn countdown ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!turnExpiresAt) return;
    const tick = () => setTimeLeft(Math.max(0, Math.round((turnExpiresAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [turnExpiresAt]);

  // ── Sounds ─────────────────────────────────────────────────────────────────
  const playSound = (src, maxMs) => {
    try {
      const a = new Audio(src);
      a.play();
      if (maxMs) setTimeout(() => { a.pause(); a.currentTime = 0; }, maxMs);
    } catch(e) {}
  };
  const playSnakeSound  = () => playSound('/fahhh_KcgAXfs.mp3');
  const playLadderSound = () => playSound('/gopgopgop.mp3', 2000);
  const playTurnSound   = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(880, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
      g.gain.setValueAtTime(0.3, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.3);
    } catch(e) {}
  };

  // ── Socket listeners ───────────────────────────────────────────────────────
  useEffect(() => {
    socket.on('update-game', (state) => {
      if (state.status === 'playing' || state.status === 'finished') {
        setStats(prev => {
          const next = { ...prev };
          Object.values(state.players).forEach(player => {
            const old = prev[player.id];
            if (!old) { next[player.id] = { rolls: 0, snakes: 0, ladders: 0, _lastPos: player.position }; return; }
            const diff = player.position - (old._lastPos ?? 1);
            if (diff > 6)  next[player.id] = { ...old, ladders: old.ladders + 1, _lastPos: player.position };
            else if (diff < 0) next[player.id] = { ...old, snakes: old.snakes + 1, _lastPos: player.position };
            else next[player.id] = { ...old, _lastPos: player.position };
          });
          return next;
        });
      }
      setGameState(state);
    });

    socket.on('dice-rolled', ({ playerId, roll }) => {
      setStats(prev => {
        const s = prev[playerId] || { rolls: 0, snakes: 0, ladders: 0 };
        return { ...prev, [playerId]: { ...s, rolls: s.rolls + 1 } };
      });
      setIsRolling(true);
      setCurrentRoll(roll);
      setTimeout(() => setIsRolling(false), 1000);
    });

    socket.on('receive-chat', (msg) => setChatMessages(prev => [...prev, msg]));

    socket.on('turn-start', ({ expiresAt, currentPlayerId }) => {
      setTurnExpiresAt(expiresAt);
      if (currentPlayerId === socket.id) playTurnSound();
    });

    socket.on('turn-skipped', ({ skippedId }) => {
      setSkipToast(skippedId);
      setTimeout(() => setSkipToast(null), 3500);
    });

    // Sound on position change
    socket.on('update-game', (state) => {
      if (state.status === 'playing') {
        Object.values(state.players).forEach(p => {
          setStats(prev => {
            const old = prev[p.id];
            if (!old) return prev;
            const diff = p.position - (old._lastPos ?? p.position);
            if (diff > 6) playLadderSound();
            else if (diff < 0) playSnakeSound();
            return prev;
          });
        });
      }
    });

    return () => {
      socket.off('update-game');
      socket.off('dice-rolled');
      socket.off('receive-chat');
      socket.off('turn-start');
      socket.off('turn-skipped');
    };
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleJoinRoom = (roomId, playerName) => {
    setCurrentRoomId(roomId);
    socket.emit('join-room', roomId, playerName);
    setInRoom(true);
  };

  const handleRollDice = () => socket.emit('roll-dice', currentRoomId);
  const handleStartGame = () => socket.emit('start-game', currentRoomId);

  const handleExitGame = () => {
    if (confirm('Are you sure you want to leave the game?')) {
      socket.emit('leave-room');
      setGameState(null);
      setCurrentRoomId('');
      setChatMessages([]);
      setStats({});
      setTurnExpiresAt(null);
      setInRoom(false);
    }
  };

  const handleSendChat = (e) => {
    e.preventDefault();
    if (chatInput.trim() && currentRoomId) {
      socket.emit('send-chat', currentRoomId, gameState?.players[socket.id]?.name || 'Player', chatInput.trim());
      setChatInput('');
    }
  };

  const sendReaction = (emoji) => {
    const id = Date.now() + Math.random();
    const x = 30 + Math.random() * 40;
    const y = 30 + Math.random() * 40;
    setReactions(prev => [...prev, { emoji, x, y, id }]);
    setTimeout(() => setReactions(prev => prev.filter(r => r.id !== id)), 2000);
    socket.emit('send-chat', currentRoomId, gameState?.players[socket.id]?.name || 'Player', emoji);
  };

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (!inRoom) return <RoomLobby onJoin={handleJoinRoom} />;
  if (!gameState) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 40 }}>🎲</div>
      <div style={{ color: '#94a3b8', fontWeight: 600 }}>Connecting to game…</div>
    </div>
  );

  const playersInRoom = Object.values(gameState.players);
  const currentTurnId = gameState.status === 'playing' ? gameState.playerOrder[gameState.turnIndex] : null;
  const isMyTurn = currentTurnId === socket.id;
  const winnerPlayer = gameState.status === 'finished'
    ? Object.values(gameState.players).find(p => p.position >= 100)
    : null;

  const statusText = {
    waiting:  'Waiting for players…',
    playing:  'Game in progress',
    finished: 'Game over!'
  }[gameState.status] ?? '';

  const statusClass = {
    waiting:  'waiting',
    playing:  '',
    finished: 'finished'
  }[gameState.status] ?? '';

  return (
    <div className="app-shell">

      {/* ─── TOP BAR ──────────────────────────────────────────────────────── */}
      <header className="top-bar">
        <div className="top-bar-left">
          <span className="top-bar-room">Room: {currentRoomId}</span>
          <span className={`top-bar-status ${statusClass}`}>{statusText}</span>
        </div>
        <div className="top-bar-right">
          {gameState.status === 'waiting' && playersInRoom.length >= 2 && (
            <button className="start-btn" onClick={handleStartGame}>▶ Start Game</button>
          )}
          <button className="exit-btn" onClick={handleExitGame}>Exit</button>
        </div>
      </header>

      {/* ─── MAIN CONTENT ─────────────────────────────────────────────────── */}
      <main className="main-content">

        {/* ── LEFT PANEL ──────────────────────────────────────────────────── */}
        <aside className="left-panel">

          {/* Players Section */}
          <div className="left-section">
            <div className="players-title">Players ({playersInRoom.length})</div>
            {playersInRoom.map(p => {
              const isActive = p.id === currentTurnId && gameState.status === 'playing';
              const isMe = p.id === socket.id;
              const pStats = stats[p.id] || { rolls: 0, snakes: 0, ladders: 0 };
              const timerClass = timeLeft <= 9 ? 'urgent' : '';

              return (
                <div key={p.id} className={`player-card ${isActive ? 'active' : ''}`}>
                  <div className="player-card-top">
                    <div className="player-avatar" style={{ backgroundColor: p.color }}>
                      {p.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="player-card-meta">
                      <div className="player-name-row">
                        <span className="player-name">{p.name}</span>
                        {isMe && <span className="badge badge-you">You</span>}
                        {isActive && !isMe && <span className="badge badge-turn">Their turn</span>}
                        {isActive && isMe  && <span className="badge badge-myturn">Your turn</span>}
                      </div>
                    </div>
                    {isActive && gameState.status === 'playing' && (
                      <span className={`player-timer-badge ${timerClass}`}>{timeLeft}s</span>
                    )}
                  </div>
                  <div className="stats-row">
                    <span className="stat-item"><span className="stat-dot pos" />{p.position}</span>
                    <span className="stat-item"><span className="stat-dot snakes" />{pStats.snakes}</span>
                    <span className="stat-item"><span className="stat-dot ladders" />{pStats.ladders}</span>
                    <span className="stat-item"><span className="stat-dot rolls" />{pStats.rolls}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Dice Section */}
          {gameState.status === 'playing' && (
            <div className="dice-section">
              <Dice
                roll={currentRoll}
                onRoll={handleRollDice}
                isMyTurn={isMyTurn}
                isRolling={isRolling}
              />
              <span className={`dice-label ${isMyTurn ? 'my-turn' : ''}`}>
                {isRolling ? '🎲 Rolling…' : isMyTurn ? '🟢 Your turn! Click the dice' : '⏳ Waiting…'}
              </span>
            </div>
          )}

          {/* Emoji Section */}
          {gameState.status === 'playing' && (
            <div className="emoji-section">
              {EMOJIS.map(e => (
                <button key={e} className="emoji-btn" onClick={() => sendReaction(e)}>{e}</button>
              ))}
            </div>
          )}

        </aside>

        {/* ── BOARD SECTION ───────────────────────────────────────────────── */}
        <section className="board-section">
          <Board players={gameState.players} />

          {/* Floating emoji reactions */}
          {reactions.map(r => (
            <div key={r.id} className="floating-reaction" style={{ left: `${r.x}%`, top: `${r.y}%` }}>
              {r.emoji}
            </div>
          ))}
        </section>

      </main>

      {/* ─── CHAT SECTION ─────────────────────────────────────────────────── */}
      <section className="chat-section">
        <div className="chat-header">
          <span className="chat-live-dot" />
          <span className="chat-title">Live Chat</span>
        </div>

        <div className="chat-messages" onScroll={handleChatScroll} ref={chatMessagesRef}>
          {chatMessages.length === 0 && (
            <span className="chat-empty">No messages yet. Say hi! 👋</span>
          )}
          {chatMessages.map((msg, i) => {
            // Detect system messages (no playerName or playerName starts with special emoji)
            const isSystem = !msg.playerName || msg.playerName === '__system__';
            const color = nameColor(msg.playerName || '');
            const time = msg.timestamp
              ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '';

            if (isSystem) {
              return (
                <div key={i} className="chat-system-msg">{msg.message}</div>
              );
            }

            return (
              <div key={i} className="chat-msg">
                <div className="chat-avatar" style={{ backgroundColor: color }}>
                  {(msg.playerName || '?').slice(0, 2).toUpperCase()}
                </div>
                <div className="chat-msg-body">
                  <div className="chat-msg-meta">
                    <span className="chat-msg-name" style={{ color }}>{msg.playerName}</span>
                    <span className="chat-msg-time">{time}</span>
                  </div>
                  <p className="chat-msg-text">{msg.message}</p>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {!autoScroll && (
          <button className="chat-scroll-btn" onClick={() => { setAutoScroll(true); scrollToBottom(); }}>
            ↓ New messages
          </button>
        )}

        <form className="chat-form" onSubmit={handleSendChat}>
          <input
            type="text"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            placeholder="Send a message…"
            className="chat-input"
            maxLength={200}
            autoComplete="off"
          />
          <button type="submit" className="chat-send-btn">Send</button>
        </form>
      </section>

      {/* ─── SKIP TOAST ───────────────────────────────────────────────────── */}
      {skipToast && (
        <div className="skip-toast">
          ⏰ {gameState.players[skipToast]?.name || 'A player'} ran out of time! Turn skipped.
        </div>
      )}

      {/* ─── WINNER OVERLAY ───────────────────────────────────────────────── */}
      {winnerPlayer && (
        <div className="winner-overlay">
          <div className="winner-card">
            <div className="confetti">🎉🎊🏆🎊🎉</div>
            <h2>🏆 Winner! 🏆</h2>
            <div style={{ fontSize: '4rem', animation: 'bounce 0.6s ease infinite alternate' }}>🏅</div>
            <p style={{ fontSize: '1.2rem', marginTop: 8 }}><strong>{winnerPlayer.name}</strong> reached square 100!</p>
            <div className="winner-stats">
              {(() => { const s = stats[winnerPlayer.id] || {}; return (
                <><span>🎲 {s.rolls || 0} rolls</span><span>🐍 {s.snakes || 0} snakes</span><span>🪜 {s.ladders || 0} ladders</span></>
              ); })()}
            </div>
            <button className="btn-primary" onClick={() => socket.emit('join-room', currentRoomId, gameState.players[socket.id]?.name)}>
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
