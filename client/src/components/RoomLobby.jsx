import { useState } from 'react';

export default function RoomLobby({ onJoin }) {
  const [roomId, setRoomId] = useState('');
  const [playerName, setPlayerName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (roomId.trim() && playerName.trim()) {
      onJoin(roomId.trim(), playerName.trim());
    }
  };

  return (
    <div className="lobby-wrapper">
      <div className="lobby-card">
        <h1>Snake & Ladder</h1>
        <p>Join a room to play with friends!</p>
        
        <form onSubmit={handleSubmit} className="lobby-form">
          <div className="input-group">
            <label htmlFor="playerName">Your Name</label>
            <input 
              id="playerName"
              type="text" 
              placeholder="e.g. Alice" 
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              required
              maxLength={15}
            />
          </div>
          
          <div className="input-group">
            <label htmlFor="roomId">Room Code</label>
            <input 
              id="roomId"
              type="text" 
              placeholder="e.g. room123" 
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              required
              maxLength={15}
            />
          </div>
          
          <button type="submit" className="btn-primary">Join Game</button>
        </form>
      </div>
    </div>
  );
}
