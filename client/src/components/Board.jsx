import './Board.css';

// Fixed board size based on backend
const BOARD_SIZE = 100;
const ROWS = 10;
const COLS = 10;

// The same mappings from the backend for visual representation
const SNAKES = {
  32: 10,
  34: 6,
  48: 26,
  62: 18,
  88: 24,
  95: 56,
  97: 78
};

const LADDERS = {
  1: 38,
  4: 14,
  8: 30,
  21: 42,
  28: 76,
  50: 67,
  71: 92,
  80: 99
};

export default function Board({ players }) {
  // Generate the board grid based on standard Snake & Ladder layout
  const getSquares = () => {
    const squares = [];
    for (let i = 1; i <= 100; i++) {
        squares.push(i);
    }
    return squares;
  };

  const squares = getSquares();

  // Calculate relative top/left percentage for a square
  const getSquarePos = (num) => {
    const bottomRow = Math.floor((num - 1) / 10);
    const topRow = 9 - bottomRow;
    // Row 0 (1-10) goes left to right, Row 1 (11-20) goes right to left...
    const isMovingRight = bottomRow % 2 === 0;
    const colOffset = (num - 1) % 10;
    const col = isMovingRight ? colOffset : 9 - colOffset;
    
    return {
      x: col * 10 + 5, // 5% is the center
      y: topRow * 10 + 5
    };
  };

  const drawSnake = (start, end, index) => {
    const startPos = getSquarePos(start); // Head
    const endPos = getSquarePos(end); // Tail

    const dx = endPos.x - startPos.x;
    const dy = endPos.y - startPos.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    const normPerpX = -dy / length;
    const normPerpY = dx / length;
    
    // Add distinct curves to snakes based on index to differentiate them
    const wiggleDir = index % 2 === 0 ? 1 : -1;
    let wiggle = length * 0.25 * wiggleDir;
    
    if (Math.abs(wiggle) > 15) wiggle = 15 * wiggleDir;
    
    const cp1X = startPos.x + (dx * 0.33) + normPerpX * wiggle;
    const cp1Y = startPos.y + (dy * 0.33) + normPerpY * wiggle;
    
    const cp2X = startPos.x + (dx * 0.66) - normPerpX * wiggle;
    const cp2Y = startPos.y + (dy * 0.66) - normPerpY * wiggle;

    const colors = [
      { body: '#22c55e', spots: '#14532d' }, // Green
      { body: '#ef4444', spots: '#7f1d1d' }, // Red
      { body: '#a855f7', spots: '#581c87' }, // Purple
      { body: '#3b82f6', spots: '#1e3a8a' }, // Blue
      { body: '#f97316', spots: '#7c2d12' }  // Orange
    ];
    const color = colors[index % colors.length];

    const pathData = `M ${startPos.x} ${startPos.y} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endPos.x} ${endPos.y}`;

    // Angle of the head
    const headDx = cp1X - startPos.x;
    const headDy = cp1Y - startPos.y;
    const headAngle = Math.atan2(headDy, headDx) * (180 / Math.PI) + 90;

    return (
      <g key={`snake-${start}-${end}`} style={{ filter: 'drop-shadow(2px 4px 4px rgba(0,0,0,0.5))' }}>
        <path d={pathData} fill="none" stroke="#111827" strokeWidth="4.5" strokeLinecap="round" />
        <path d={pathData} fill="none" stroke={color.body} strokeWidth="3" strokeLinecap="round" />
        <path d={pathData} fill="none" stroke={color.spots} strokeWidth="3" strokeLinecap="round" strokeDasharray="1 3" />
        
        {/* Snake Head */}
        <g transform={`translate(${startPos.x}, ${startPos.y}) rotate(${headAngle})`}>
          <path d="M -2,0 C -3,-2 -1,-3 0,-3 C 1,-3 3,-2 2,0 C 2.5,2 -2.5,2 -2,0 Z" fill={color.body} stroke="#111827" strokeWidth="0.5" />
          <circle cx="-0.8" cy="-1.5" r="0.4" fill="white" />
          <circle cx="0.8" cy="-1.5" r="0.4" fill="white" />
          <circle cx="-0.8" cy="-1.5" r="0.2" fill="black" />
          <circle cx="0.8" cy="-1.5" r="0.2" fill="black" />
          <path d="M 0,-3 L 0,-4.5 M 0,-4 L -0.5,-4.5 M 0,-4 L 0.5,-4.5" fill="none" stroke="#ef4444" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        
        <circle cx={endPos.x} cy={endPos.y} r="0.8" fill={color.body} />
      </g>
    );
  };

  const drawLadder = (start, end, index) => {
    const startPos = getSquarePos(start);
    const endPos = getSquarePos(end);
    
    const dx = endPos.x - startPos.x;
    const dy = endPos.y - startPos.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    const normPerpX = -dy / length;
    const normPerpY = dx / length;
    
    const halfVWidth = 2; // 4% total visual width
    
    const l1StartX = startPos.x + normPerpX * halfVWidth;
    const l1StartY = startPos.y + normPerpY * halfVWidth;
    const l1EndX = endPos.x + normPerpX * halfVWidth;
    const l1EndY = endPos.y + normPerpY * halfVWidth;

    const l2StartX = startPos.x - normPerpX * halfVWidth;
    const l2StartY = startPos.y - normPerpY * halfVWidth;
    const l2EndX = endPos.x - normPerpX * halfVWidth;
    const l2EndY = endPos.y - normPerpY * halfVWidth;

    const numRungs = Math.max(3, Math.floor(length / 2.5));

    const rungs = [];
    for (let i = 0; i <= numRungs; i++) {
        const t = i / numRungs;
        const r1X = l1StartX + (l1EndX - l1StartX) * t;
        const r1Y = l1StartY + (l1EndY - l1StartY) * t;
        const r2X = l2StartX + (l2EndX - l2StartX) * t;
        const r2Y = l2StartY + (l2EndY - l2StartY) * t;
        
        rungs.push(<line key={`rung-${i}`} x1={r1X} y1={r1Y} x2={r2X} y2={r2Y} stroke="#b45309" strokeWidth="1" strokeLinecap="round" />);
    }

    return (
        <g key={`ladder-${start}-${end}`} style={{ filter: 'drop-shadow(2px 3px 3px rgba(0,0,0,0.4))' }}>
            <line x1={l1StartX} y1={l1StartY} x2={l1EndX} y2={l1EndY} stroke="#78350f" strokeWidth="2" strokeLinecap="round" />
            <line x1={l2StartX} y1={l2StartY} x2={l2EndX} y2={l2EndY} stroke="#78350f" strokeWidth="2" strokeLinecap="round" />
            
            <line x1={l1StartX} y1={l1StartY} x2={l1EndX} y2={l1EndY} stroke="#d97706" strokeWidth="1.2" strokeLinecap="round" />
            <line x1={l2StartX} y1={l2StartY} x2={l2EndX} y2={l2EndY} stroke="#d97706" strokeWidth="1.2" strokeLinecap="round" />
            {rungs}
        </g>
    );
  };

  // Render players absolutely positioned on the board so CSS transitions work!
  const renderAllPlayers = () => {
    // Group players by position to handle overlapping
    const playersByPos = {};
    Object.values(players).forEach(p => {
      if (!playersByPos[p.position]) playersByPos[p.position] = [];
      playersByPos[p.position].push(p);
    });

    const rendered = [];
    Object.keys(playersByPos).forEach(pos => {
      const pList = playersByPos[pos];
      const squareNum = parseInt(pos);
      const posObj = getSquarePos(squareNum); // returns {x:%, y:%} center
      
      pList.forEach((p, idx) => {
        rendered.push(
          <div 
            key={p.id} 
            className="player-token" 
            style={{ 
              backgroundColor: p.color,
              left: `${posObj.x}%`,
              top: `${posObj.y}%`,
              transform: `translate(-50%, -50%) ${pList.length > 1 ? `translate(${idx * 4 - (pList.length*2)}px, ${idx * 4 - (pList.length*2)}px)` : ''}`,
              zIndex: 30 + idx + squareNum
            }}
            title={p.name}
          >
            {p.name.substring(0, 2).toUpperCase()}
          </div>
        );
      });
    });
    
    return rendered;
  };

  return (
    <div className="board-wrapper">
      <div className="board">
        {/* Render Players absolutely for animation */}
        {renderAllPlayers()}

        <svg 
          style={{
            position: 'absolute',
            top: 0, left: 0,
            width: '100%', height: '100%',
            pointerEvents: 'none',
            zIndex: 20
          }}
          viewBox="0 0 100 100"
        >
          {Object.entries(LADDERS).map(([start, end], idx) => drawLadder(parseInt(start), parseInt(end), idx))}
          {Object.entries(SNAKES).map(([start, end], idx) => drawSnake(parseInt(start), parseInt(end), idx))}
        </svg>

        {squares.map(num => {
          // Use the EXACT SAME LOGIC as getSquarePos to assign grid area!
          const bottomRow = Math.floor((num - 1) / 10);
          const topRow = 9 - bottomRow;
          const isMovingRight = bottomRow % 2 === 0;
          const colOffset = (num - 1) % 10;
          const col = isMovingRight ? colOffset : 9 - colOffset;

          // Classic vibrant colors for the board
          const classicColors = ['#facc15', '#ef4444', '#3b82f6', '#22c55e', '#f97316'];
          // Use a pseudo-random looking pattern that is static by using math on the index
          const bgColor = classicColors[(num + Math.floor(num/10)*2) % classicColors.length];

          return (
            <div 
              key={num} 
              className="square"
              style={{ gridRow: topRow + 1, gridColumn: col + 1, backgroundColor: bgColor }}
            >
              <span className="square-num">{num === 1 ? '1 Start' : num}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
