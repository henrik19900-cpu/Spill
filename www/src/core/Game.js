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

    // Loading progress tracking
    this._loadProgress = 0;       // 0..1
    this._loadStepCount = 4;      // config, modules(3 sub), scene
    this._loadStepsComplete = 0;
    this._loadStartTime = performance.now();

    // Debug mode
    this.debug = false;
    this._fpsFrames = 0;
    this._fpsLastTime = 0;
    this._fpsDisplay = 0;

    // Error tracking – avoid spamming console with the same error
    this._lastLoopError = '';
    this._consecutiveLoopErrors = 0;
    this._errorScreenActive = false;

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
  async setScene(scene) {
    // Tear down previous scene
    if (this.currentScene && typeof this.currentScene.destroy === 'function') {
      this.currentScene.destroy();
    }

    this.currentScene = scene;

    // Initialise new scene with a reference back to the engine
    // (await in case init is async, e.g. fetches data)
    if (scene && typeof scene.init === 'function') {
      await scene.init(this);
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
      const resp = await fetch('./src/data/config.json');
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
      await this.setScene(scene);
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

    // Enable debug mode via URL param: ?debug=1
    this.debug = new URLSearchParams(window.location.search).has('debug');

    // Start the render loop immediately so the loading screen is visible
    // while async initialisation runs in the background.
    this.lastTimestamp = performance.now();
    this._fpsLastTime = this.lastTimestamp;
    this._rafId = requestAnimationFrame(this._loop.bind(this));

    this._init().catch((err) => {
      console.error('[Game] Fatal error during initialisation:', err);
    });
  }

  _advanceLoadProgress() {
    this._loadStepsComplete++;
    this._loadProgress = Math.min(this._loadStepsComplete / this._loadStepCount, 1);
  }

  async _init() {
    this._loadStartTime = performance.now();

    await this._loadConfig();
    this._advanceLoadProgress();           // 1/4

    await this._loadModules();
    this._advanceLoadProgress();           // 2/4  (counted as one group)

    await this._loadDefaultScene();
    this._advanceLoadProgress();           // 3/4

    // Small artificial delay so the user can see the bar reach ~100 %
    await new Promise((r) => setTimeout(r, 120));
    this._advanceLoadProgress();           // 4/4

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

    // If we hit too many consecutive errors, stop the loop and show error screen
    if (this._errorScreenActive) {
      this._renderErrorScreen();
      this._rafId = requestAnimationFrame(this._loop.bind(this));
      return;
    }

    try {
      // Delta in seconds, clamped to avoid huge jumps (e.g. after tab switch)
      let frameTime = (timestamp - this.lastTimestamp) / 1000;
      if (frameTime > this.maxFrameTime) frameTime = this.maxFrameTime;
      this.lastTimestamp = timestamp;

      // FPS counter (debug mode)
      if (this.debug) {
        this._fpsFrames++;
        if (timestamp - this._fpsLastTime >= 1000) {
          this._fpsDisplay = this._fpsFrames;
          this._fpsFrames = 0;
          this._fpsLastTime = timestamp;
        }
      }

      // Fixed-timestep update – skip updates while still loading
      if (this._state !== GameState.LOADING) {
        this.accumulator += frameTime;
        while (this.accumulator >= this.fixedDt) {
          this.update(this.fixedDt);
          this.accumulator -= this.fixedDt;
        }
      }

      // Render once per frame
      this.render();

      // Successful frame – reset consecutive error counter
      this._consecutiveLoopErrors = 0;

    } catch (err) {
      this._consecutiveLoopErrors++;

      // Log the error but deduplicate consecutive identical errors
      const msg = err && err.message ? err.message : String(err);
      if (msg !== this._lastLoopError) {
        console.error('[Game] Error in game loop:', err);
        this._lastLoopError = msg;
      }

      // If 5+ consecutive errors, stop trying and show error screen
      if (this._consecutiveLoopErrors >= 5) {
        console.error('[Game] 5 consecutive loop errors – showing error screen.');
        this._errorScreenActive = true;
      }
    }

    this._rafId = requestAnimationFrame(this._loop.bind(this));
  }

  // -----------------------------------------------------------------------
  // Update & render
  // -----------------------------------------------------------------------
  update(dt) {
    // Update registered modules that expose an update method
    for (const [name, mod] of Object.entries(this._modules)) {
      if (typeof mod.update === 'function') {
        try {
          mod.update(dt);
        } catch (err) {
          console.error(`[Game] Module "${name}" update error:`, err);
        }
      }
    }

    // Delegate to current scene
    if (this.currentScene && typeof this.currentScene.update === 'function') {
      try {
        this.currentScene.update(dt);
      } catch (err) {
        console.error('[Game] Scene update error:', err);
      }
    }
  }

  render() {
    const { ctx, width, height } = this;

    try {
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

      // Debug FPS overlay
      if (this.debug) {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(4, 4, 64, 22);
        ctx.fillStyle = '#0f0';
        ctx.font = '13px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`FPS: ${this._fpsDisplay}`, 10, 8);
        ctx.restore();
      }
    } catch (err) {
      console.error('[Game] render() error:', err);
      // Show a simple inline error screen so the canvas is never blank
      try {
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#ff4444';
        ctx.font = '18px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Noe gikk galt', width/2, height/2 - 20);
        ctx.fillStyle = '#ffffff';
        ctx.font = '14px sans-serif';
        ctx.fillText('Tap for å prøve igjen', width/2, height/2 + 20);
      } catch (_ignored) { /* nothing more we can do */ }

      // On next tap, attempt to restart by going back to the menu
      if (!this._renderErrorTapBound) {
        this._renderErrorTapBound = true;
        const handler = () => {
          this.canvas.removeEventListener('click', handler);
          this.canvas.removeEventListener('touchstart', handler);
          this._renderErrorTapBound = false;
          try { this.setState(GameState.MENU); } catch (_e) { /* ignore */ }
        };
        this.canvas.addEventListener('click', handler);
        this.canvas.addEventListener('touchstart', handler);
      }
    }
  }

  _renderLoading() {
    const { ctx, width, height } = this;
    const now = performance.now();
    const elapsed = (now - this._loadStartTime) / 1000;  // seconds
    const cx = width / 2;
    const cy = height / 2;

    ctx.save();
    ctx.clearRect(0, 0, width, height);

    // -- Winter sky gradient background --
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#0b1a3b');   // dark night sky
    grad.addColorStop(0.6, '#163d6e'); // deep blue
    grad.addColorStop(1, '#6baed6');   // lighter horizon
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // -- Falling snowflakes --
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    const flakeCount = 40;
    for (let i = 0; i < flakeCount; i++) {
      // Deterministic pseudo-random per flake, animated over time
      const seed = i * 137.5;
      const x = ((seed * 2.3) % width + Math.sin(elapsed * 0.4 + seed) * 30) % width;
      const y = ((seed * 1.7 + elapsed * (20 + (i % 5) * 12)) % (height + 20)) - 10;
      const r = 1.2 + (i % 3) * 0.8;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // -- Title --
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Vinter-OL Spill', cx, cy - 50);

    // -- Pulsing "Laster..." text with animated dots --
    const dotCount = Math.floor(elapsed * 2.5) % 4;  // 0..3
    const dots = '.'.repeat(dotCount);
    const pulse = 0.7 + 0.3 * Math.sin(elapsed * 3);
    ctx.globalAlpha = pulse;
    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#d0e8ff';
    ctx.fillText('Laster' + dots, cx, cy - 14);
    ctx.globalAlpha = 1;

    // -- Progress bar --
    const barW = Math.min(260, width * 0.5);
    const barH = 14;
    const barX = cx - barW / 2;
    const barY = cy + 14;
    const radius = barH / 2;
    const progress = this._loadProgress;

    // Bar track (dark, rounded)
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, radius);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();

    // Bar fill (icy gradient, rounded)
    if (progress > 0.01) {
      const fillW = Math.max(barH, barW * progress); // min width = pill shape
      const barGrad = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
      barGrad.addColorStop(0, '#74b9ff');
      barGrad.addColorStop(1, '#a0e7ff');
      ctx.beginPath();
      ctx.roundRect(barX, barY, fillW, barH, radius);
      ctx.fillStyle = barGrad;
      ctx.fill();

      // Shimmer highlight
      const shimmerX = barX + ((elapsed * 80) % fillW);
      const shimGrad = ctx.createRadialGradient(shimmerX, barY + barH / 2, 0, shimmerX, barY + barH / 2, 30);
      shimGrad.addColorStop(0, 'rgba(255,255,255,0.35)');
      shimGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = shimGrad;
      ctx.beginPath();
      ctx.roundRect(barX, barY, fillW, barH, radius);
      ctx.fill();
    }

    // Percentage text
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(Math.round(progress * 100) + ' %', cx, barY + barH + 18);

    ctx.restore();
  }

  // -----------------------------------------------------------------------
  // Error screen – shown when the game loop or render fails repeatedly
  // -----------------------------------------------------------------------
  _renderErrorScreen() {
    const { ctx, width, height } = this;
    const cx = width / 2;
    const cy = height / 2;

    ctx.save();
    ctx.clearRect(0, 0, width, height);

    // Dark background
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#0b1a3b');
    grad.addColorStop(1, '#1a1a2e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Error icon (warning triangle)
    ctx.font = '48px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffcc00';
    ctx.fillText('\u26A0', cx, cy - 60);

    // Error message
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('Noe gikk galt', cx, cy - 10);

    ctx.fillStyle = '#aabbcc';
    ctx.font = '15px sans-serif';
    ctx.fillText('En feil oppstod under kj\u00F8ring.', cx, cy + 20);

    // Retry button
    const btnW = 180;
    const btnH = 44;
    const btnX = cx - btnW / 2;
    const btnY = cy + 50;

    ctx.beginPath();
    ctx.roundRect(btnX, btnY, btnW, btnH, 8);
    ctx.fillStyle = '#3a7bd5';
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('Pr\u00F8v igjen', cx, btnY + btnH / 2);

    ctx.restore();

    // Attach click handler once for retry
    if (!this._errorRetryBound) {
      this._errorRetryBound = true;
      this._errorRetryHandler = (e) => {
        const rect = this.canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        if (clickX >= btnX && clickX <= btnX + btnW &&
            clickY >= btnY && clickY <= btnY + btnH) {
          this._errorScreenActive = false;
          this._consecutiveLoopErrors = 0;
          this._lastLoopError = '';
          this._errorRetryBound = false;
          this.canvas.removeEventListener('click', this._errorRetryHandler);
          // Attempt to re-init the game
          this._init().catch((err) => {
            console.error('[Game] Re-init failed:', err);
            this._errorScreenActive = true;
          });
        }
      };
      this.canvas.addEventListener('click', this._errorRetryHandler);
    }
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------
  destroy() {
    this.stop();
    window.removeEventListener('resize', this._onResize);

    // Clean up error retry handler if active
    if (this._errorRetryBound && this._errorRetryHandler) {
      this.canvas.removeEventListener('click', this._errorRetryHandler);
      this._errorRetryBound = false;
    }

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
