/**
 * InputManager.js - General input handling for Vinter-OL Spill
 *
 * Touch-first for Android (Capacitor app) with keyboard fallback for
 * desktop testing. Handles tap, swipe, hold detection and optional
 * device orientation (tilt).
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TAP_MAX_DURATION = 300;   // ms – touch shorter than this counts as a tap
const SWIPE_MIN_DISTANCE = 30; // px – minimum movement to register as a swipe

// ---------------------------------------------------------------------------
// InputManager
// ---------------------------------------------------------------------------

export default class InputManager {
  constructor(game) {
    this.game = game;
    this.canvas = game.canvas;

    // Touch state
    this.isTouching = false;
    this.touchStartTime = 0;
    this.touchX = 0;
    this.touchY = 0;
    this._touchStartX = 0;
    this._touchStartY = 0;
    this.swipeDirection = null; // 'up' | 'down' | null

    // Keyboard state (mirrors touch for desktop testing)
    this._keysDown = new Set();

    // Tilt state
    this._tilt = null;          // { beta, gamma } or null
    this._tiltPermission = false;

    // Callback registries
    this._tapListeners = [];
    this._swipeListeners = [];
    this._holdListeners = [];

    // Bound handlers (stored so we can remove them in destroy)
    this._onTouchStart = this._handleTouchStart.bind(this);
    this._onTouchEnd = this._handleTouchEnd.bind(this);
    this._onTouchMove = this._handleTouchMove.bind(this);
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

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  // -----------------------------------------------------------------------
  // Touch handlers
  // -----------------------------------------------------------------------

  _handleTouchStart(e) {
    e.preventDefault();
    const touch = e.changedTouches[0];

    this.isTouching = true;
    this.touchStartTime = performance.now();
    this._touchStartX = touch.clientX;
    this._touchStartY = touch.clientY;
    this.touchX = touch.clientX;
    this.touchY = touch.clientY;
    this.swipeDirection = null;
  }

  _handleTouchEnd(e) {
    e.preventDefault();
    const touch = e.changedTouches[0];
    const duration = performance.now() - this.touchStartTime;

    const dx = touch.clientX - this._touchStartX;
    const dy = touch.clientY - this._touchStartY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > SWIPE_MIN_DISTANCE) {
      // Determine swipe direction (vertical axis)
      const direction = dy < 0 ? 'up' : 'down';
      this.swipeDirection = direction;
      this._fireSwipe(direction, dist);
    } else if (duration < TAP_MAX_DURATION) {
      this._fireTap(this.touchX, this.touchY);
    }

    this.isTouching = false;
  }

  _handleTouchMove(e) {
    e.preventDefault();
    const touch = e.changedTouches[0];
    this.touchX = touch.clientX;
    this.touchY = touch.clientY;

    // Detect ongoing swipe direction for continuous feedback
    const dy = this.touchY - this._touchStartY;
    const dist = Math.abs(dy);
    if (dist > SWIPE_MIN_DISTANCE) {
      this.swipeDirection = dy < 0 ? 'up' : 'down';
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
      this._fireSwipe('up', SWIPE_MIN_DISTANCE);
    } else if (e.code === 'ArrowDown') {
      this.swipeDirection = 'down';
      this._fireSwipe('down', SWIPE_MIN_DISTANCE);
    }
  }

  _handleKeyUp(e) {
    this._keysDown.delete(e.code);

    if (e.code === 'Space') {
      this.isTouching = false;
    }
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
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
   * Register a swipe listener. Called with (direction, distance).
   * direction is 'up' or 'down'.
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

  // -----------------------------------------------------------------------
  // Fire callbacks
  // -----------------------------------------------------------------------

  _fireTap(x, y) {
    for (const cb of this._tapListeners) {
      try { cb(x, y); } catch (e) { console.error('[InputManager] tap callback error', e); }
    }
  }

  _fireSwipe(direction, distance) {
    for (const cb of this._swipeListeners) {
      try { cb(direction, distance); } catch (e) { console.error('[InputManager] swipe callback error', e); }
    }
  }

  _fireHold(duration) {
    for (const cb of this._holdListeners) {
      try { cb(duration); } catch (e) { console.error('[InputManager] hold callback error', e); }
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

    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);

    if (this._tiltPermission) {
      window.removeEventListener('deviceorientation', this._onDeviceOrientation);
    }

    this._tapListeners = [];
    this._swipeListeners = [];
    this._holdListeners = [];
    this._keysDown.clear();
    this._tilt = null;
  }
}
