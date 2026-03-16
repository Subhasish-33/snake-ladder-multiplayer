// Define board constants
const BOARD_SIZE = 100;

// Mapping of starting square to ending square for snakes
const SNAKES = {
  16: 6,
  47: 26,
  49: 11,
  56: 53,
  62: 19,
  64: 60,
  87: 24,
  93: 73,
  95: 75,
  98: 78
};

// Mapping of starting square to ending square for ladders
const LADDERS = {
  1: 38,
  4: 14,
  9: 31,
  21: 42,
  28: 84,
  36: 44,
  51: 67,
  71: 91,
  80: 100
};

// Function to calculate final position after accounting for snakes and ladders
function calculateFinalPosition(position) {
  if (SNAKES[position]) {
    return SNAKES[position]; // Slide down
  }
  if (LADDERS[position]) {
    return LADDERS[position]; // Climb up
  }
  return position; // Stay
}

module.exports = {
  BOARD_SIZE,
  SNAKES,
  LADDERS,
  calculateFinalPosition
};
