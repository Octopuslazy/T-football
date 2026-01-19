export const GAME_CONFIG = {
  MAX_BALLS: 5,
  GOAL_RESPAWN_DELAY: 2000, // 3 seconds in milliseconds
  // New Level (level-2) specific settings
  MAX_BALLS_2: 5,
  GOAL_RESPAWN_DELAY_2: 800, // 0.8 seconds for level-2

};

// Base design resolution used across UI for layout/scaling
// Use a portrait-oriented design resolution so UI layout is consistent
// across mobile portrait devices. Other UI components use these values
// to position elements in a shared design coordinate space.
export const BASE_WIDTH = 720; // design logical width (portrait)
export const BASE_HEIGHT = 1280; // design logical height (portrait)
