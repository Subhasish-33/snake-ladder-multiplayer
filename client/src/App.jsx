import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import RoomLobby from './components/RoomLobby';
import Board from './components/Board';
import Dice from './components/Dice';
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

// ── Circular countdown timer component ──────────────────────────────────────
function CircularTimer({ timeLeft, total = 30, isMe }) {
  const r = 16, circ = 2 * Math.PI * r;
  const pct = Math.max(0, timeLeft / total);
  const danger = timeLeft <= 10;
  const color = danger ? '#ef4444' : isMe ? '#22c55e' : '#94a3b8';
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" style={{ flexShrink: 0 }}>
      <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3"/>
      <circle
        cx="20" cy="20" r={r} fill="none"
        stroke={color} strokeWidth="3"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - pct)}
        strokeLinecap="round"
        transform="rotate(-90 20 20)"
        style={{ transition: 'stroke-dashoffset 0.25s linear, stroke 0.3s' }}
      />
      <text x="20" y="24" textAnchor="middle" fill={color}
        fontSize={timeLeft >= 10 ? "10" : "11"} fontWeight="700" fontFamily="Inter, sans-serif">
        {timeLeft}
      </text>
    </svg>
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

  // Emoji reactions
  const EMOJIS = ['🔥','😂','😱','👏','💀','🐍','🪜','🎲'];
  const [reactions, setReactions] = useState([]); // [{emoji, x, y, id}]

  const messagesEndRef = useRef(null);

  // ── Chat scroll ──────────────────────────────────────────────────────────
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

  // ── Turn countdown ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!turnExpiresAt) return;
    const tick = () => setTimeLeft(Math.max(0, Math.round((turnExpiresAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [turnExpiresAt]);

  // ── Sounds ───────────────────────────────────────────────────────────────
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

  // ── Socket listeners ─────────────────────────────────────────────────────
  useEffect(() => {
    socket.on('update-game', (state) => {
      if (state.status === 'playing' || state.status === 'finished') {
        setStats(prev => {
          const next = { ...prev };
          Object.values(state.players).forEach(player => {
            const old = prev[player.id];
            if (!old) { next[player.id] = { rolls: 0, snakes: 0, ladders: 0 }; return; }
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
      // Track rolls per player in stats
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

    // Listen for position changes to play sounds
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

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleJoinRoomUpdated = (roomId, playerName) => {
    setCurrentRoomId(roomId);
    socket.emit('join-room', roomId, playerName);
    setInRoom(true);
  };

  const handleRollDiceUpdated = () => socket.emit('roll-dice', currentRoomId);
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
    // Random position around the board center
    const x = 40 + Math.random() * 20;
    const y = 40 + Math.random() * 20;
    setReactions(prev => [...prev, { emoji, x, y, id }]);
    setTimeout(() => setReactions(prev => prev.filter(r => r.id !== id)), 2000);
    // Also send to chat
    socket.emit('send-chat', currentRoomId, gameState?.players[socket.id]?.name || 'Player', emoji);
  };

  // ── Guards ───────────────────────────────────────────────────────────────
  if (!inRoom) return <RoomLobby onJoin={handleJoinRoomUpdated} />;
  if (!gameState) return <div className="glass" style={{padding:'40px',textAlign:'center'}}>Connecting... 🎲</div>;

  const playersInRoom = Object.values(gameState.players);
  const currentTurnId = gameState.status === 'playing' ? gameState.playerOrder[gameState.turnIndex] : null;
  const isMyTurn = currentTurnId === socket.id;
  const winnerPlayer = gameState.status === 'finished'
    ? Object.values(gameState.players).find(p => p.position >= 100)
    : null;

  const statusLabel = {
    waiting: 'Waiting for players…',
    playing: 'Game In Progress',
    finished: 'Game Over!'
  }[gameState.status] ?? '';

  return (
    <div className="game-container">

      {/* ─── LEFT SIDEBAR ─────────────────────────────────────────────── */}
      <div className="sidebar panel glass">

        {/* Room header */}
        <div className="room-header">
          <div>
            <h2 style={{ margin: 0 }}>Room: {currentRoomId}</h2>
            <p className="status-text" style={{
              margin: '4px 0 0',
              color: gameState.status === 'playing' ? '#10b981' : '#f59e0b',
              fontSize: '0.85rem', fontWeight: 600
            }}>{statusLabel}</p>
          </div>
          <button className="exit-btn" onClick={handleExitGame}>Exit</button>
        </div>

        {/* Start game button */}
        {gameState.status === 'waiting' && playersInRoom.length >= 2 && (
          <button className="btn-primary" style={{ marginBottom: '12px' }} onClick={handleStartGame}>
            ▶ Start Game Now
          </button>
        )}

        {/* YOUR TURN banner */}
        {isMyTurn && gameState.status === 'playing' && (
          <div className="your-turn-banner">
            🎲 YOUR TURN!
          </div>
        )}

        {/* Player List */}
        <div className="player-list">
          <h3 style={{ marginTop: 0 }}>Players ({playersInRoom.length})</h3>
          {playersInRoom.map(p => {
            const isActive = p.id === currentTurnId && gameState.status === 'playing';
            const isMe = p.id === socket.id;
            const pStats = stats[p.id] || { rolls: 0, snakes: 0, ladders: 0 };
            return (
              <div key={p.id} className={`player-item ${isActive ? 'active-turn' : ''}`}
                style={ isActive ? { borderColor: p.color, boxShadow: `0 0 12px ${p.color}55` } : {}}>
                <div className="player-token-indicator" style={{ backgroundColor: p.color }} />
                <div className="player-info">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600 }}>{p.name} {isMe ? '(You)' : ''}</span>
                    {isActive && !isMe && <span className="turn-badge">THEIR TURN</span>}
                    {isActive && isMe  && <span className="turn-badge my-turn-badge">YOUR TURN</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 10, fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    <span>📍 {p.position}</span>
                    <span>🎲 {pStats.rolls}</span>
                    <span>🐍 {pStats.snakes}</span>
                    <span>🪜 {pStats.ladders}</span>
                  </div>
                </div>
                {/* Circular timer — only shown next to the active player */}
                {isActive && gameState.status === 'playing' && (
                  <CircularTimer timeLeft={timeLeft} total={30} isMe={isMe} />
                )}
              </div>
            );
          })}
        </div>

        {/* Dice — only when playing */}
        {gameState.status === 'playing' && (
          <Dice
            roll={currentRoll}
            onRoll={handleRollDiceUpdated}
            isMyTurn={isMyTurn}
            isRolling={isRolling}
          />
        )}

        {/* Emoji reactions bar */}
        {gameState.status === 'playing' && (
          <div className="emoji-bar">
            {EMOJIS.map(e => (
              <button key={e} className="emoji-btn" onClick={() => sendReaction(e)}>{e}</button>
            ))}
          </div>
        )}

        {/* Live Chat */}
        <div className="chat-panel">
          <div className="chat-header">
            <span className="chat-title">🗨️ Live Chat</span>
            <span className="chat-live-badge">● LIVE</span>
          </div>
          <div className="chat-messages" onScroll={handleChatScroll} ref={messagesEndRef}>
            {chatMessages.length === 0 && (
              <span className="chat-empty">No messages yet. Greet everyone! 👋</span>
            )}
            {chatMessages.map((msg, i) => {
              const isMe = msg.playerName === (gameState.players[socket.id]?.name || 'Player');
              const color = nameColor(msg.playerName);
              const time = msg.timestamp
                ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '';
              return (
                <div key={i} className={`twitch-msg ${isMe ? 'twitch-msg--me' : ''}`}>
                  <div className="twitch-avatar" style={{ background: color }}>
                    {msg.playerName.slice(0, 2).toUpperCase()}
                  </div>
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
            <button className="chat-scroll-btn" onClick={() => { setAutoScroll(true); scrollToBottom(); }}>
              ↓ New messages
            </button>
          )}
          <form className="chat-form" onSubmit={handleSendChat}>
            <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
              placeholder="Send a message…" className="chat-input" maxLength={100} autoComplete="off" />
            <button type="submit" className="chat-send-btn">Send</button>
          </form>
        </div>
      </div>

      {/* ─── MAIN BOARD ───────────────────────────────────────────────── */}
      <div style={{ position: 'relative', flex: 2 }}>
        <Board players={gameState.players} />

        {/* Floating emoji reactions over board */}
        {reactions.map(r => (
          <div key={r.id} className="floating-reaction"
            style={{ left: `${r.x}%`, top: `${r.y}%` }}>
            {r.emoji}
          </div>
        ))}
      </div>

      {/* ─── SKIP TOAST ───────────────────────────────────────────────── */}
      {skipToast && (
        <div className="skip-toast">
          ⏰ {gameState.players[skipToast]?.name || 'A player'} ran out of time! Turn skipped.
        </div>
      )}

      {/* ─── WINNER OVERLAY ───────────────────────────────────────────── */}
      {winnerPlayer && (
        <div className="winner-overlay">
          <div className="winner-card glass">
            <div className="confetti">🎉🎊🏆🎊🎉</div>
            <h2>🏆 Winner! 🏆</h2>
            <div style={{ fontSize: '5rem', animation: 'bounce 0.6s ease infinite alternate' }}>🏅</div>
            <p style={{ fontSize: '1.3rem' }}><strong>{winnerPlayer.name}</strong> reached square 100!</p>
            <div className="winner-stats">
              {(() => { const s = stats[winnerPlayer.id] || {}; return (
                <><span>🎲 {s.rolls || 0} rolls</span><span>🐍 {s.snakes || 0} snakes</span><span>🪜 {s.ladders || 0} ladders</span></>
              ); })()}
            </div>
            <button className="btn-primary" style={{ marginTop: 20 }}
              onClick={() => socket.emit('join-room', currentRoomId, gameState.players[socket.id]?.name)}>
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
