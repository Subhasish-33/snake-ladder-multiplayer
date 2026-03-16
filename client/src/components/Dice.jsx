export default function Dice({ roll, onRoll, isMyTurn, isRolling }) {
  // Simple CSS class based on the dice value to show dots
  const getDiceClass = () => {
    if (isRolling) return 'dice rolling';
    return `dice face-${roll || 1}`;
  };

  const playSound = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      
      // A fun little "roll" sound effect
      osc.frequency.setValueAtTime(600, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.15);
      
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch(e) {}
  };

  const handleRoll = () => {
    if (isMyTurn && !isRolling) {
      playSound();
      onRoll();
    }
  };

  return (
    <div className="dice-container">
      <div className={getDiceClass()}>
        {/* We use CSS grid to place the dots correctly based on the face-class */}
        <div className="dot dot-1"></div>
        {(roll > 1 || isRolling) && <div className="dot dot-2"></div>}
        {(roll > 2 || isRolling) && <div className="dot dot-3"></div>}
        {(roll > 3 || isRolling) && <div className="dot dot-4"></div>}
        {(roll > 4 || isRolling) && <div className="dot dot-5"></div>}
        {(roll === 6 || isRolling) && <div className="dot dot-6"></div>}
      </div>
      
      <button 
        className={`btn-roll ${isMyTurn && !isRolling ? 'active' : 'disabled'}`}
        onClick={handleRoll}
        disabled={!isMyTurn || isRolling}
      >
        {isRolling ? 'Rolling...' : isMyTurn ? 'Roll Dice' : 'Waiting...'}
      </button>
    </div>
  );
}
