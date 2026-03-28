/**
 * InputManager.js - General input handling for Vinter-OL Spill
 *
 * Touch-first for Android (Capacitor app) with keyboard fallback for
 * desktop testing. Handles tap, swipe, hold, double-tap, and drag
 * detection with multi-touch support, debouncing, velocity tracking,
 * and optional device orientation (tilt).
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TAP_MAX_DURATION = 300;       // ms - touch shorter than this counts as a tap
const SWIPE_MIN_DISTANCE = 30;     // px - minimum movement to register as a swipe
const DOUBLE_TAP_MAX_GAP = 300;    // ms - max interval between taps for double-tap
const TAP_DEBOUNCE_MS = 80;        // ms - ignore taps faster than this (anti-bounce)
const SWIPE_VELOCITY_MIN = 0.3;    // px/ms - minimum velocity for a swipe

// ---------------------------------------------------------------------------
// InputManager
// ---------------------------------------------------------------------------

export default class InputManager {
  constructor(game) {
    this.game = game;
    this.canvas = game.canvas;

    // --- Primary touch state ---
    this.isTouching = false;
    this.touchStartTime = 0;
    this.touchX = 0;
    this.touchY = 0;
    this._touchStartX = 0;
    this._touchStartY = 0;
    this.swipeDirection = null; // 'up' | 'down' | 'left' | 'right' | null

    // --- Swipe velocity tracking ---
    this._swipeVelocityX = 0;      // px/ms
    this._swipeVelocityY = 0;      // px/ms
    this._lastMoveTime = 0;
    this._lastMoveX = 0;
    this._lastMoveY = 0;

    // --- Drag state (continuous touch-move while held) ---
    this.isDragging = false;
    this.dragDeltaX = 0;           // px since touch start
    this.dragDeltaY = 0;           // px since touch start

    // --- Debounce & double-tap ---
    this._lastTapTime = 0;
    this._lastTapX = 0;
    this._lastTapY = 0;

    // --- Multi-touch ---
    this.activeTouches = new Map(); // id -> { startX, startY, startTime, x, y }

    // --- Keyboard state (mirrors touch for desktop testing) ---
    this._keysDown = new Set();

    // --- Tilt state ---
    this._tilt = null;              // { beta, gamma } or null
    this._tiltPermission = false;

    // --- Callback registries ---
    this._tapListeners = [];
    this._swipeListeners = [];
    this._holdListeners = [];
    this._doubleTapListeners = [];
    this._dragListeners = [];

    // --- Bound handlers (stored so we can remove them in destroy) ---
    this._onTouchStart = this._handleTouchStart.bind(this);
    this._onTouchEnd = this._handleTouchEnd.bind(this);
    this._onTouchMove = this._handleTouchMove.bind(this);
    this._onTouchCancel = this._handleTouchCancel.bind(this);
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp = this._handleKeyUp.bind(this);
    this._onDeviceOrientation = this._handleDeviceOrientation.bind(this);

    this._addListeners();
  }

  // -----------------------------------------------------------------------
  // Listener setup
  // -----------------------------------------------------------------------

  _addListeners() {
    const opts = { passive: false };

    this.canvas.addEventListener('touchstart', this._onTouchStart, opts);
    this.canvas.addEventListener('touchend', this._onTouchEnd, opts);
    this.canvas.addEventListener('touchmove', this._onTouchMove, opts);
    this.canvas.addEventListener('touchcancel', this._onTouchCancel, opts);

    // Prevent default gestures that interfere with gameplay
    document.addEventListener('gesturestart', this._preventDefault, opts);
    document.addEventListener('gesturechange', this._preventDefault, opts);
    document.addEventListener('gestureend', this._preventDefault, opts);

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  /** Utility to block browser default behavior */
  _preventDefault(e) { e.preventDefault(); }

  // -----------------------------------------------------------------------
  // Touch handlers
  // -----------------------------------------------------------------------

  _handleTouchStart(e) {
    e.preventDefault();
    e.stopPropagation();

    // Track all touches for multi-touch support
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      this.activeTouches.set(touch.identifier, {
        startX: touch.clientX,
        startY: touch.clientY,
        startTime: performance.now(),
        x: touch.clientX,
        y: touch.clientY,
      });
    }

    // Use the first changed touch as the primary touch
    const touch = e.changedTouches[0];
    const now = performance.now();

    this.isTouching = true;
    this.touchStartTime = now;
    this._touchStartX = touch.clientX;
    this._touchStartY = touch.clientY;
    this.touchX = touch.clientX;
    this.touchY = touch.clientY;
    this.swipeDirection = null;
    this.isDragging = false;
    this.dragDeltaX = 0;
    this.dragDeltaY = 0;

    // Reset velocity tracking
    this._swipeVelocityX = 0;
    this._swipeVelocityY = 0;
    this._lastMoveTime = now;
    this._lastMoveX = touch.clientX;
    this._lastMoveY = touch.clientY;
  }

  _handleTouchEnd(e) {
    e.preventDefault();
    e.stopPropagation();

    const touch = e.changedTouches[0];
    const now = performance.now();
    const duration = now - this.touchStartTime;

    const dx = touch.clientX - this._touchStartX;
    const dy = touch.clientY - this._touchStartY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Remove finished touches from tracking
    for (let i = 0; i < e.changedTouches.length; i++) {
      this.activeTouches.delete(e.changedTouches[i].identifier);
    }

    if (dist > SWIPE_MIN_DISTANCE) {
      // --- Swipe detection with velocity ---
      const timeDelta = now - this.touchStartTime;
      const velocityX = timeDelta > 0 ? dx / timeDelta : 0;
      const velocityY = timeDelta > 0 ? dy / timeDelta : 0;
      const speed = Math.sqrt(velocityX * velocityX + velocityY * velocityY);

      if (speed >= SWIPE_VELOCITY_MIN) {
        // Determine direction: use dominant axis
        let direction;
        if (Math.abs(dx) > Math.abs(dy)) {
          direction = dx < 0 ? 'left' : 'right';
        } else {
          direction = dy < 0 ? 'up' : 'down';
        }
        this.swipeDirection = direction;
        this._fireSwipe(direction, dist, speed);
      }
    } else if (duration < TAP_MAX_DURATION) {
      // --- Tap with debounce ---
      if (now - this._lastTapTime < TAP_DEBOUNCE_MS) {
        // Too fast after the previous tap, skip (anti-bounce)
      } else {
        // Check for double-tap
        const gap = now - this._lastTapTime;
        const tapDist = Math.sqrt(
          (this.touchX - this._lastTapX) ** 2 +
          (this.touchY - this._lastTapY) ** 2
        );

        if (gap < DOUBLE_TAP_MAX_GAP && gap >= TAP_DEBOUNCE_MS && tapDist < 60) {
          this._fireDoubleTap(this.touchX, this.touchY);
        } else {
          this._fireTap(this.touchX, this.touchY);
        }

        this._lastTapTime = now;
        this._lastTapX = this.touchX;
        this._lastTapY = this.touchY;
      }
    }

    // Clear primary touch state when all fingers are up
    if (this.activeTouches.size === 0) {
      this.isTouching = false;
      this.isDragging = false;
    }
  }

  _handleTouchMove(e) {
    e.preventDefault();
    e.stopPropagation();

    const now = performance.now();

    // Update all tracked touches
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const tracked = this.activeTouches.get(touch.identifier);
      if (tracked) {
        tracked.x = touch.clientX;
        tracked.y = touch.clientY;
      }
    }

    const touch = e.changedTouches[0];
    this.touchX = touch.clientX;
    this.touchY = touch.clientY;

    // Track instantaneous velocity (using recent movement window)
    const moveDt = now - this._lastMoveTime;
    if (moveDt > 0) {
      this._swipeVelocityX = (touch.clientX - this._lastMoveX) / moveDt;
      this._swipeVelocityY = (touch.clientY - this._lastMoveY) / moveDt;
    }
    this._lastMoveTime = now;
    this._lastMoveX = touch.clientX;
    this._lastMoveY = touch.clientY;

    // Compute drag delta from start
    this.dragDeltaX = this.touchX - this._touchStartX;
    this.dragDeltaY = this.touchY - this._touchStartY;

    const dist = Math.sqrt(this.dragDeltaX ** 2 + this.dragDeltaY ** 2);

    if (dist > SWIPE_MIN_DISTANCE) {
      this.isDragging = true;
      // Detect ongoing swipe direction for continuous feedback
      if (Math.abs(this.dragDeltaX) > Math.abs(this.dragDeltaY)) {
        this.swipeDirection = this.dragDeltaX < 0 ? 'left' : 'right';
      } else {
        this.swipeDirection = this.dragDeltaY < 0 ? 'up' : 'down';
      }

      this._fireDrag(this.dragDeltaX, this.dragDeltaY, this._swipeVelocityX, this._swipeVelocityY);
    }
  }

  _handleTouchCancel(e) {
    // Clean up cancelled touches
    for (let i = 0; i < e.changedTouches.length; i++) {
      this.activeTouches.delete(e.changedTouches[i].identifier);
    }
    if (this.activeTouches.size === 0) {
      this.isTouching = false;
      this.isDragging = false;
      this.swipeDirection = null;
    }
  }

  // -----------------------------------------------------------------------
  // Keyboard handlers (desktop fallback)
  // -----------------------------------------------------------------------

  _handleKeyDown(e) {
    if (this._keysDown.has(e.code)) return; // ignore key repeat
    this._keysDown.add(e.code);

    if (e.code === 'Space') {
      // Simulate tap
      this.isTouching = true;
      this.touchStartTime = performance.now();
      this._fireTap(0, 0);
    } else if (e.code === 'ArrowUp') {
      this.swipeDirection = 'up';
      this._fireSwipe('up', SWIPE_MIN_DISTANCE, 1.0);
    } else if (e.code === 'ArrowDown') {
      this.swipeDirection = 'down';
      this._fireSwipe('down', SWIPE_MIN_DISTANCE, 1.0);
    } else if (e.code === 'ArrowLeft') {
      this.swipeDirection = 'left';
      this._fireSwipe('left', SWIPE_MIN_DISTANCE, 1.0);
    } else if (e.code === 'ArrowRight') {
      this.swipeDirection = 'right';
      this._fireSwipe('right', SWIPE_MIN_DISTANCE, 1.0);
    } else if (e.code === 'KeyD') {
      // Simulate double-tap
      this._fireDoubleTap(0, 0);
    }
  }

  _handleKeyUp(e) {
    this._keysDown.delete(e.code);

    if (e.code === 'Space') {
      this.isTouching = false;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      this.swipeDirection = null;
    }
  }

  // -----------------------------------------------------------------------
  // Device orientation (tilt)
  // -----------------------------------------------------------------------

  /**
   * Request permission and start listening for device orientation.
   * On iOS 13+ this must be triggered by a user gesture.
   * @returns {Promise<boolean>} whether tilt is now available
   */
  async requestTilt() {
    // iOS 13+ requires explicit permission
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const result = await DeviceOrientationEvent.requestPermission();
        if (result !== 'granted') return false;
      } catch (_) {
        return false;
      }
    }

    window.addEventListener('deviceorientation', this._onDeviceOrientation);
    this._tiltPermission = true;
    return true;
  }

  _handleDeviceOrientation(e) {
    if (e.beta !== null && e.gamma !== null) {
      this._tilt = { beta: e.beta, gamma: e.gamma };
    }
  }

  /**
   * Returns the current device tilt, or null if unavailable.
   * beta: front-to-back tilt (-180 to 180, 0 = flat)
   * gamma: left-to-right tilt (-90 to 90)
   * @returns {{ beta: number, gamma: number } | null}
   */
  getTilt() {
    return this._tilt;
  }

  // -----------------------------------------------------------------------
  // Callback registration
  // -----------------------------------------------------------------------

  /**
   * Register a tap listener. Called with (x, y) in client coordinates.
   * @param {Function} callback
   * @returns {Function} unsubscribe function
   */
  onTap(callback) {
    this._tapListeners.push(callback);
    return () => {
      const idx = this._tapListeners.indexOf(callback);
      if (idx !== -1) this._tapListeners.splice(idx, 1);
    };
  }

  /**
   * Register a double-tap listener. Called with (x, y) in client coordinates.
   * @param {Function} callback
   * @returns {Function} unsubscribe function
   */
  onDoubleTap(callback) {
    this._doubleTapListeners.push(callback);
    return () => {
      const idx = this._doubleTapListeners.indexOf(callback);
      if (idx !== -1) this._doubleTapListeners.splice(idx, 1);
    };
  }

  /**
   * Register a swipe listener. Called with (direction, distance, velocity).
   * direction is 'up', 'down', 'left', or 'right'.
   * velocity is in px/ms.
   * @param {Function} callback
   * @returns {Function} unsubscribe function
   */
  onSwipe(callback) {
    this._swipeListeners.push(callback);
    return () => {
      const idx = this._swipeListeners.indexOf(callback);
      if (idx !== -1) this._swipeListeners.splice(idx, 1);
    };
  }

  /**
   * Register a hold listener. Fired every update tick while touch is held.
   * Called with (holdDuration) in seconds.
   * @param {Function} callback
   * @returns {Function} unsubscribe function
   */
  onHold(callback) {
    this._holdListeners.push(callback);
    return () => {
      const idx = this._holdListeners.indexOf(callback);
      if (idx !== -1) this._holdListeners.splice(idx, 1);
    };
  }

  /**
   * Register a drag listener. Fired during touchmove while dragging.
   * Called with (deltaX, deltaY, velocityX, velocityY).
   * @param {Function} callback
   * @returns {Function} unsubscribe function
   */
  onDrag(callback) {
    this._dragListeners.push(callback);
    return () => {
      const idx = this._dragListeners.indexOf(callback);
      if (idx !== -1) this._dragListeners.splice(idx, 1);
    };
  }

  // -----------------------------------------------------------------------
  // Getters for current velocity (useful for inertia calculations)
  // -----------------------------------------------------------------------

  /** @returns {{ x: number, y: number }} instantaneous swipe velocity in px/ms */
  getSwipeVelocity() {
    return { x: this._swipeVelocityX, y: this._swipeVelocityY };
  }

  /** @returns {number} number of active touch points */
  getTouchCount() {
    return this.activeTouches.size;
  }

  // -----------------------------------------------------------------------
  // Fire callbacks
  // -----------------------------------------------------------------------

  _fireTap(x, y) {
    for (const cb of this._tapListeners) {
      try { cb(x, y); } catch (e) { console.error('[InputManager] tap callback error', e); }
    }
  }

  _fireDoubleTap(x, y) {
    for (const cb of this._doubleTapListeners) {
      try { cb(x, y); } catch (e) { console.error('[InputManager] doubleTap callback error', e); }
    }
  }

  _fireSwipe(direction, distance, velocity) {
    for (const cb of this._swipeListeners) {
      try { cb(direction, distance, velocity); } catch (e) { console.error('[InputManager] swipe callback error', e); }
    }
  }

  _fireHold(duration) {
    for (const cb of this._holdListeners) {
      try { cb(duration); } catch (e) { console.error('[InputManager] hold callback error', e); }
    }
  }

  _fireDrag(dx, dy, vx, vy) {
    for (const cb of this._dragListeners) {
      try { cb(dx, dy, vx, vy); } catch (e) { console.error('[InputManager] drag callback error', e); }
    }
  }

  // -----------------------------------------------------------------------
  // Update (called each tick by the game loop)
  // -----------------------------------------------------------------------

  update(_dt) {
    // Fire hold callbacks while touching
    if (this.isTouching) {
      const holdDuration = (performance.now() - this.touchStartTime) / 1000;
      this._fireHold(holdDuration);
    }
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  destroy() {
    this.canvas.removeEventListener('touchstart', this._onTouchStart);
    this.canvas.removeEventListener('touchend', this._onTouchEnd);
    this.canvas.removeEventListener('touchmove', this._onTouchMove);
    this.canvas.removeEventListener('touchcancel', this._onTouchCancel);

    document.removeEventListener('gesturestart', this._preventDefault);
    document.removeEventListener('gesturechange', this._preventDefault);
    document.removeEventListener('gestureend', this._preventDefault);

    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);

    if (this._tiltPermission) {
      window.removeEventListener('deviceorientation', this._onDeviceOrientation);
    }

    this._tapListeners = [];
    this._swipeListeners = [];
    this._holdListeners = [];
    this._doubleTapListeners = [];
    this._dragListeners = [];
    this._keysDown.clear();
    this._tilt = null;
    this.activeTouches.clear();
  }
}
