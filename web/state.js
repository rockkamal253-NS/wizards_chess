// Single centralized mutable state store (replaces top-level let declarations)
export const state = {
  // Authoritative game state
  game: new Chess(),
  humanColor: 'w',
  aiDepth: 2,
  promoPiece: 'q',

  // Interaction state
  selectedSq: null,
  validMoves: [],
  lastMove: null,
  hintMove: null,
  hoveredSq: null,
  gen: 0,
  aiPendingGen: -1,
  isAnimating: false,
  activeAnim: null,
  pointerState: null,
  resetArmedUntil: 0,

  // Camera / View state
  camYaw: 0,
  camPitch: 0.66,
  camDist: 15.6,
  targetYaw: 0,
  targetPitch: 0.66,
  targetDist: 15.6,
  isDraggingCam: false,
  shakeAmt: 0,
  shadowHigh: true,

  // Render & Engine Objects
  squareMeshes: {},
  pieceMeshes: {},
  shards: [],
  animatedMarkers: [],
  markerGroup: null,
  sunLight: null,
  brazierLights: [],
  flameCones: [],

  // Telemetry & Timing
  lastTime: performance.now(),
  frameCount: 0,
  fpsStart: performance.now(),
  gpuName: 'WebGL'
};
