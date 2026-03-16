// Define board constants
const BOARD_SIZE = 100;

// Mapping of starting square to ending square for snakes
const SNAKES = {
  32: 10,
  34: 6,
  48: 26,
  62: 18,
  88: 24,
  95: 56,
  97: 78
};

// Mapping of starting square to ending square for ladders
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
