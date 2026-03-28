/**
 * SkihoppControls.js - Ski jump specific input controls
 *
 * Maps general input events (tap, swipe, hold, tilt) to phase-specific
 * game actions across the ski jumping state machine:
 *   MENU → READY → INRUN → TAKEOFF → FLIGHT → LANDING → SCORE → RESULTS
 */

import { GameState } from '../../core/Game.js';
import { clamp } from '../../core/Physics.js';

// ---------------------------------------------------------------------------
// Jumper state factory
// ---------------------------------------------------------------------------

/**
 * Creates a fresh jumperState object. Exported so other modules (physics,
 * renderer) can reference the same structure.
 * @returns {JumperState}
 */
export function createJumperState() {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    speed: 0,
    bodyAngle: 35,       // degrees, current
    targetAngle: 35,     // degrees, player-requested
    distance: 0,         // meters from takeoff
    takeoffQuality: 0,   // 0-1, set during TAKEOFF
    landingDistance: 0,   // meters, recorded at landing
    landingQuality: 0,   // style bonus/penalty
    inrunTaps: 0,        // total taps during INRUN
    phase: 'MENU',       // mirrors GameState for convenience
  };
}

// ---------------------------------------------------------------------------
// Timing / tuning constants
// ---------------------------------------------------------------------------

const TAKEOFF_PERFECT_MS  = 100;
const TAKEOFF_GOOD_MS     = 250;
const TAKEOFF_POOR_MS     = 500;

const LANDING_WINDOW_MS   = 300;

const BODY_ANGLE_MIN      = 10;   // degrees
const BODY_ANGLE_MAX      = 55;   // degrees
const BODY_ANGLE_OPTIMAL  = 35;   // degrees

const ANGLE_CHANGE_RATE   = 40;   // degrees per second (via swipe / tilt)
const SWIPE_ANGLE_STEP    = 5;    // degrees per discrete swipe event

const TAP_BOOST_DEFAULT   = 0.8;  // m/s speed added per inrun tap
const RHYTHM_BONUS        = 0.3;  // extra boost for consistent rhythm

const TELEMARK_PERFECT_BONUS = 3.0;
const TELEMARK_GOOD_BONUS    = 1.5;
const NO_TELEMARK_PENALTY    = -2.0;

// ---------------------------------------------------------------------------
// SkihoppControls
// ---------------------------------------------------------------------------

export default class SkihoppControls {
  constructor(game) {
    this.game = game;

    /** @type {import('../../core/InputManager.js').default | null} */
    this._input = null;

    /** @type {ReturnType<createJumperState> | null} */
    this._jumperState = null;

    // Unsubscribe handles
    this._unsubs = [];

    // Internal timing
    this._takeoffWindowStart = 0;   // timestamp when TAKEOFF phase began
    this._takeoffTapped = false;
    this._landingWindowStart = 0;   // timestamp when LANDING phase began
    this._landingTapped = false;

    // Inrun rhythm tracking
    this._lastTapTime = 0;          // timestamp of previous inrun tap
    this._lastTapInterval = 0;      // ms between the two most recent taps

    // Config-driven values (overridden in init if config is available)
    this._tapBoost = TAP_BOOST_DEFAULT;
    this._angleChangeRate = ANGLE_CHANGE_RATE;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Initialise controls for a jump. Called by the scene (SkihoppGame) when
   * it sets up a new jump attempt.
   * @param {import('../../core/Game.js').Game} game
   * @param {ReturnType<createJumperState>} jumperState
   */
  init(game, jumperState) {
    this.game = game;
    this._jumperState = jumperState;

    // Grab the InputManager module
    this._input = game.getModule('input');
    if (!this._input) {
      console.warn('[SkihoppControls] InputManager not registered.');
      return;
    }

    // Read config overrides if available
    const cfg = game.config && game.config.skihopp;
    if (cfg) {
      this._tapBoost = cfg.inrun?.tapBoost ?? TAP_BOOST_DEFAULT;
      this._angleChangeRate = cfg.flight?.angleChangeRate ?? ANGLE_CHANGE_RATE;
    }

    // Register input listeners
    this._unsubs.push(this._input.onTap(this._onTap.bind(this)));
    this._unsubs.push(this._input.onSwipe(this._onSwipe.bind(this)));

    // Listen for state transitions to set up phase-specific timing
    this._unsubs.push(
      game.onStateChange(this._onStateChange.bind(this))
    );
  }

  // -----------------------------------------------------------------------
  // State change handler
  // -----------------------------------------------------------------------

  _onStateChange(newState, _prevState) {
    if (this._jumperState) {
      this._jumperState.phase = newState;
    }

    if (newState === GameState.TAKEOFF) {
      this._takeoffWindowStart = performance.now();
      this._takeoffTapped = false;
    }

    if (newState === GameState.LANDING) {
      this._landingWindowStart = performance.now();
      this._landingTapped = false;
    }
  }

  // -----------------------------------------------------------------------
  // Tap handler (dispatches to current phase)
  // -----------------------------------------------------------------------

  _onTap(_x, _y) {
    const state = this.game.getState();

    switch (state) {
      case GameState.MENU:
        this._handleMenuTap();
        break;

      case GameState.READY:
        this._handleReadyTap();
        break;

      case GameState.INRUN:
        this._handleInrunTap();
        break;

      case GameState.TAKEOFF:
        this._handleTakeoffTap();
        break;

      case GameState.FLIGHT:
        // Taps are ignored during flight (swipe / tilt controls angle)
        break;

      case GameState.LANDING:
        this._handleLandingTap();
        break;

      case GameState.SCORE:
        this._handleScoreTap();
        break;

      default:
        break;
    }
  }

  // -----------------------------------------------------------------------
  // Swipe handler
  // -----------------------------------------------------------------------

  _onSwipe(direction, _distance) {
    const state = this.game.getState();
    if (state !== GameState.FLIGHT) return;

    if (!this._jumperState) return;

    // Discrete angle adjustment on swipe
    if (direction === 'up') {
      this._jumperState.targetAngle = clamp(
        this._jumperState.targetAngle - SWIPE_ANGLE_STEP,
        BODY_ANGLE_MIN,
        BODY_ANGLE_MAX
      );
    } else if (direction === 'down') {
      this._jumperState.targetAngle = clamp(
        this._jumperState.targetAngle + SWIPE_ANGLE_STEP,
        BODY_ANGLE_MIN,
        BODY_ANGLE_MAX
      );
    }
  }

  // -----------------------------------------------------------------------
  // Phase-specific tap handlers
  // -----------------------------------------------------------------------

  _handleMenuTap() {
    this.game.setState(GameState.READY);
  }

  _handleReadyTap() {
    this.game.setState(GameState.INRUN);
  }

  _handleInrunTap() {
    const js = this._jumperState;
    if (!js) return;

    const now = performance.now();
    js.inrunTaps++;

    // Rhythm bonus: if the interval between this tap and the previous one
    // is close to the interval between the two taps before that, add extra.
    let boost = this._tapBoost;

    if (this._lastTapTime > 0) {
      const interval = now - this._lastTapTime;

      if (this._lastTapInterval > 0) {
        const diff = Math.abs(interval - this._lastTapInterval);
        // Consistent rhythm if intervals differ by less than 80ms
        if (diff < 80) {
          boost += RHYTHM_BONUS;
        }
      }

      this._lastTapInterval = interval;
    }

    this._lastTapTime = now;
    js.speed += boost;

    // Haptic feedback
    this._vibrate(10);
  }

  _handleTakeoffTap() {
    if (this._takeoffTapped) return; // only first tap counts
    this._takeoffTapped = true;

    const js = this._jumperState;
    if (!js) return;

    const elapsed = performance.now() - this._takeoffWindowStart;

    // Calculate takeoff quality based on timing
    if (elapsed <= TAKEOFF_PERFECT_MS) {
      js.takeoffQuality = 1.0;
    } else if (elapsed <= TAKEOFF_GOOD_MS) {
      js.takeoffQuality = 0.6;
    } else if (elapsed <= TAKEOFF_POOR_MS) {
      js.takeoffQuality = 0.2;
    } else {
      js.takeoffQuality = 0.0;
    }

    // Haptic feedback
    this._vibrate(30);

    // Transition to flight
    this.game.setState(GameState.FLIGHT);
  }

  _handleLandingTap() {
    if (this._landingTapped) return; // only first tap counts
    this._landingTapped = true;

    const js = this._jumperState;
    if (!js) return;

    const elapsed = performance.now() - this._landingWindowStart;

    // Telemark landing quality
    if (elapsed <= LANDING_WINDOW_MS * 0.4) {
      // Perfect telemark – tapped quickly after landing contact
      js.landingQuality = TELEMARK_PERFECT_BONUS;
    } else if (elapsed <= LANDING_WINDOW_MS) {
      // Good telemark
      js.landingQuality = TELEMARK_GOOD_BONUS;
    } else {
      // Too late for telemark
      js.landingQuality = NO_TELEMARK_PENALTY;
    }

    // Haptic pattern for landing
    this._vibrate([50, 30, 50]);
  }

  _handleScoreTap() {
    this.game.setState(GameState.RESULTS);
  }

  // -----------------------------------------------------------------------
  // Update (called every tick)
  // -----------------------------------------------------------------------

  /**
   * @param {number} dt - delta time in seconds
   */
  update(dt) {
    const state = this.game.getState();
    const js = this._jumperState;
    if (!js) return;

    // -- TAKEOFF: if the player never tapped, quality is 0 --
    if (state === GameState.TAKEOFF && !this._takeoffTapped) {
      const elapsed = performance.now() - this._takeoffWindowStart;
      if (elapsed > TAKEOFF_POOR_MS) {
        // Auto-miss: transition to flight with quality 0
        js.takeoffQuality = 0.0;
        this._takeoffTapped = true;
        this.game.setState(GameState.FLIGHT);
      }
    }

    // -- FLIGHT: smoothly interpolate body angle toward target --
    if (state === GameState.FLIGHT) {
      this._updateFlightAngle(dt);
    }

    // -- LANDING: if no tap within the window, apply penalty --
    if (state === GameState.LANDING && !this._landingTapped) {
      const elapsed = performance.now() - this._landingWindowStart;
      if (elapsed > LANDING_WINDOW_MS) {
        js.landingQuality = NO_TELEMARK_PENALTY;
        this._landingTapped = true;

        // Proceed to score after a brief moment (let animation play).
        // The scene typically handles this transition, but we set quality.
      }
    }
  }

  /**
   * Smoothly move bodyAngle toward targetAngle, optionally using device
   * tilt if available.
   * @param {number} dt - delta time in seconds
   */
  _updateFlightAngle(dt) {
    const js = this._jumperState;
    if (!js) return;

    // If device tilt is available, map beta to target angle
    if (this._input) {
      const tilt = this._input.getTilt();
      if (tilt) {
        // beta ~0 when flat, positive when tilted forward.
        // Map beta range [−20, +40] to [BODY_ANGLE_MIN, BODY_ANGLE_MAX].
        const mapped = BODY_ANGLE_MIN +
          ((tilt.beta + 20) / 60) * (BODY_ANGLE_MAX - BODY_ANGLE_MIN);
        js.targetAngle = clamp(mapped, BODY_ANGLE_MIN, BODY_ANGLE_MAX);
      }
    }

    // Smooth interpolation
    const diff = js.targetAngle - js.bodyAngle;
    const maxChange = this._angleChangeRate * dt;

    if (Math.abs(diff) <= maxChange) {
      js.bodyAngle = js.targetAngle;
    } else {
      js.bodyAngle += Math.sign(diff) * maxChange;
    }

    js.bodyAngle = clamp(js.bodyAngle, BODY_ANGLE_MIN, BODY_ANGLE_MAX);
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Trigger haptic feedback if available.
   * @param {number | number[]} pattern - vibration duration or pattern
   */
  _vibrate(pattern) {
    if (navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  destroy() {
    for (const unsub of this._unsubs) {
      unsub();
    }
    this._unsubs = [];
    this._jumperState = null;
    this._input = null;
    this._lastTapTime = 0;
    this._lastTapInterval = 0;
  }
}
