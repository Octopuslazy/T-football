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
export const BASE_WIDTH = 1080; // design logical width (portrait)
export const BASE_HEIGHT = 1920; // design logical height (portrait)
// Arcade / fake-physics tuning constants used for Penalty Shootout game feel.
// These are intentionally simple, deterministically driven values for tween-based
// ball flights and keeper hit detection.
export const COLLIDE_SCALE_THRESHOLD = 1.5; // sprite scale multiplier to enable keeper collision checks
export const HIT_RADIUS = 48; // pixels: distance from keeper head required to count as a save
export const OPP_DURATION_MIN = 450; // ms (fast shot)
export const OPP_DURATION_MAX = 1200; // ms (slow shot)
export const ARC_HEIGHT_BASE = 220; // base arc peak height (px)
export const ARC_HEIGHT_DELTA = 380; // additional arc height scaled by power
export const SIDE_MAG_BASE = 120; // base lateral control for bezier control point
export const SIDE_MAG_DELTA = 220; // extra lateral magnitude scaled by power
export const TWEEN_ARC_FACTOR_DEFAULT = 1.8; // default arcFactor used by _tweenTo
