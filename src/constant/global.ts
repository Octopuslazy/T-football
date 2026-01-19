export const GAME_CONFIG = {
  MAX_BALLS: 5,
  GOAL_RESPAWN_DELAY: 2000, // 3 seconds in milliseconds
  // New Level (level-2) specific settings
  MAX_BALLS_2: 5,
  GOAL_RESPAWN_DELAY_2: 800, // 0.8 seconds for level-2

};

// Base design resolution (we target portrait layout)
// Restore the original base design resolution used by the game art/layout
export const BASE_WIDTH = 1080; // target mobile portrait width
export const BASE_HEIGHT = 2400; // target mobile portrait height

// Preferred orientation
export const PREFERRED_ORIENTATION: 'portrait' | 'landscape' = 'portrait';
