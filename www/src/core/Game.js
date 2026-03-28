/**
 * Game.js - Core game engine for Vinter-OL Spill
 * Main entry point loaded from index.html as type="module".
 * Manages the game loop, state machine, canvas, scenes, and module registry.
 */

// ---------------------------------------------------------------------------
// Game states
// ---------------------------------------------------------------------------
export const GameState = Object.freeze({
  LOADING: 'LOADING',
  MENU:    'MENU',
  READY:   'READY',
  INRUN:   'INRUN',
  TAKEOFF: 'TAKEOFF',
  FLIGHT:  'FLIGHT',
  LANDING: 'LANDING',
  SCORE:   'SCORE',
  RESULTS: 'RESULTS',
});

// ---------------------------------------------------------------------------
// Game class
// ---------------------------------------------------------------------------
export class Game {
  constructor() {
    // Canvas
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');

    // Timing – fixed timestep (variable render)
    this.targetFPS = 60;
    this.fixedDt = 1 / this.targetFPS;           // seconds
    this.maxFrameTime = 0.25;                     // clamp to avoid spiral of death
    this.accumulator = 0;
    this.lastTimestamp = 0;
    this.running = false;
    this._rafId = null;

    // State machine
    this._state = GameState.LOADING;
    this._stateChangeCallbacks = [];

    // Scene management
    this.currentScene = null;

    // Module registry
    this._modules = {};

    // Config (loaded async)
    this.config = null;

    // Set up canvas sizing immediately
    this._setupCanvas();
    this._onResize = this._setupCanvas.bind(this);
    window.addEventListener('resize', this._onResize);
  }

  // -----------------------------------------------------------------------
  // Canvas
  // -----------------------------------------------------------------------
  _setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Expose logical size for scenes / renderers
    this.width = width;
    this.height = height;
    this.dpr = dpr;
  }

  // -----------------------------------------------------------------------
  // State machine
  // -----------------------------------------------------------------------
  setState(newState) {
    if (!Object.values(GameState).includes(newState)) {
      console.warn(`[Game] Unknown state: ${newState}`);
      return;
    }
    const prev = this._state;
    if (prev === newState) return;

    this._state = newState;

    // Notify scene
    if (this.currentScene && typeof this.currentScene.onStateChange === 'function') {
      this.currentScene.onStateChange(newState, prev);
    }

    // Notify external listeners
    for (const cb of this._stateChangeCallbacks) {
      try { cb(newState, prev); } catch (e) { console.error(e); }
    }
  }

  getState() {
    return this._state;
  }

  onStateChange(callback) {
    if (typeof callback === 'function') {
      this._stateChangeCallbacks.push(callback);
    }
    // Return unsubscribe function
    return () => {
      const idx = this._stateChangeCallbacks.indexOf(callback);
      if (idx !== -1) this._stateChangeCallbacks.splice(idx, 1);
    };
  }

  // -----------------------------------------------------------------------
  // Scene management
  // -----------------------------------------------------------------------
  setScene(scene) {
    // Tear down previous scene
    if (this.currentScene && typeof this.currentScene.destroy === 'function') {
      this.currentScene.destroy();
    }

    this.currentScene = scene;

    // Initialise new scene with a reference back to the engine
    if (scene && typeof scene.init === 'function') {
      scene.init(this);
    }
  }

  // -----------------------------------------------------------------------
  // Module registry
  // -----------------------------------------------------------------------
  registerModule(name, moduleInstance) {
    this._modules[name] = moduleInstance;
  }

  getModule(name) {
    return this._modules[name] || null;
  }

  // -----------------------------------------------------------------------
  // Initialisation & module loading
  // -----------------------------------------------------------------------
  async _loadConfig() {
    try {
      const resp = await fetch('src/data/config.json');
      this.config = await resp.json();
      if (this.config.game && this.config.game.targetFPS) {
        this.targetFPS = this.config.game.targetFPS;
        this.fixedDt = 1 / this.targetFPS;
      }
    } catch (e) {
      console.warn('[Game] Could not load config.json, using defaults.', e);
      this.config = {};
    }
  }

  async _loadModules() {
    // Dynamic imports so missing files don't crash the engine during
    // early development – each module is optional.
    try {
      const { default: InputManager } = await import('./InputManager.js');
      const input = new InputManager(this);
      this.registerModule('input', input);
    } catch (e) {
      console.warn('[Game] InputManager not available yet.', e.message);
    }

    try {
      const { default: AudioManager } = await import('./AudioManager.js');
      const audio = new AudioManager(this);
      this.registerModule('audio', audio);
    } catch (e) {
      console.warn('[Game] AudioManager not available yet.', e.message);
    }

    try {
      const { default: Renderer } = await import('./Renderer.js');
      const renderer = new Renderer(this);
      this.registerModule('renderer', renderer);
    } catch (e) {
      console.warn('[Game] Renderer module not available yet.', e.message);
    }
  }

  async _loadDefaultScene() {
    try {
      const { default: SkihoppGame } = await import('../events/skihopp/SkihoppGame.js');
      const scene = new SkihoppGame();
      this.setScene(scene);
    } catch (e) {
      console.warn('[Game] Default scene (SkihoppGame) not available yet.', e.message);
    }
  }

  // -----------------------------------------------------------------------
  // Game loop
  // -----------------------------------------------------------------------
  start() {
    if (this.running) return;
    this.running = true;

    this._init().then(() => {
      this.lastTimestamp = performance.now();
      this._rafId = requestAnimationFrame(this._loop.bind(this));
    });
  }

  async _init() {
    // Show loading state
    this._renderLoading();

    await this._loadConfig();
    await this._loadModules();
    await this._loadDefaultScene();

    // Transition to MENU once everything is ready
    this.setState(GameState.MENU);
  }

  stop() {
    this.running = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  _loop(timestamp) {
    if (!this.running) return;

    // Delta in seconds, clamped to avoid huge jumps (e.g. after tab switch)
    let frameTime = (timestamp - this.lastTimestamp) / 1000;
    if (frameTime > this.maxFrameTime) frameTime = this.maxFrameTime;
    this.lastTimestamp = timestamp;

    // Fixed-timestep update
    this.accumulator += frameTime;
    while (this.accumulator >= this.fixedDt) {
      this.update(this.fixedDt);
      this.accumulator -= this.fixedDt;
    }

    // Render once per frame
    this.render();

    this._rafId = requestAnimationFrame(this._loop.bind(this));
  }

  // -----------------------------------------------------------------------
  // Update & render
  // -----------------------------------------------------------------------
  update(dt) {
    // Update registered modules that expose an update method
    for (const mod of Object.values(this._modules)) {
      if (typeof mod.update === 'function') {
        mod.update(dt);
      }
    }

    // Delegate to current scene
    if (this.currentScene && typeof this.currentScene.update === 'function') {
      this.currentScene.update(dt);
    }
  }

  render() {
    const { ctx, width, height } = this;

    // Clear
    ctx.clearRect(0, 0, width, height);

    if (this._state === GameState.LOADING) {
      this._renderLoading();
      return;
    }

    // Delegate to current scene
    if (this.currentScene && typeof this.currentScene.render === 'function') {
      this.currentScene.render(ctx, width, height);
    }
  }

  _renderLoading() {
    const { ctx, width, height } = this;
    ctx.clearRect(0, 0, width, height);

    // Dark background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    // Loading text
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Laster…', width / 2, height / 2);
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------
  destroy() {
    this.stop();
    window.removeEventListener('resize', this._onResize);

    if (this.currentScene && typeof this.currentScene.destroy === 'function') {
      this.currentScene.destroy();
    }

    for (const mod of Object.values(this._modules)) {
      if (typeof mod.destroy === 'function') {
        mod.destroy();
      }
    }

    this._modules = {};
    this._stateChangeCallbacks = [];
  }
}

// ---------------------------------------------------------------------------
// Auto-start
// ---------------------------------------------------------------------------
const game = new Game();
game.start();

export default game;
