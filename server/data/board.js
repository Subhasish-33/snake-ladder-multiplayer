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
  11: 30, // Reference: Bottom left ladder
  15: 44, // Reference: Bottom right ladder
  26: 67, // Reference: Middle ladder
  34: 47, // Reference: Middle ladder
  52: 74, // Reference: Middle ladder
  58: 83, // Reference: Upper right ladder
  64: 84, // Reference: Upper middle ladder
  76: 95, // Reference: Top ladder
  80: 98  // Reference: Top ladder
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
