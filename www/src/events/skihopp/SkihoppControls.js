/**
 * SkihoppControls.js - Ski jump specific input controls
 *
 * Maps general input events (tap, swipe, hold, drag, tilt) to phase-specific
 * game actions across the ski jumping state machine:
 *   MENU -> READY -> INRUN -> TAKEOFF -> FLIGHT -> LANDING -> SCORE -> RESULTS
 *
 * Control scheme (realistic):
 *   INRUN   : HOLD screen to maintain tuck position (better aerodynamics).
 *             Releasing = worse aero = slightly slower. No tapping.
 *   TAKEOFF : Tap within ~200ms window. Perfect = quality 1.0.
 *             Auto-launch if missed = quality 0.3.
 *   FLIGHT  : Slide finger up/down to control body angle (smooth with inertia).
 *             Optimal angle ~35 degrees.
 *   LANDING : Tap within 300ms window for telemark landing.
 *   SCORE   : 1.5s delay before tap to continue.
 *
 * Visual feedback system:
 *   Controls communicate feedback to the renderer via `game.feedback` - an
 *   object the renderer reads each frame. Fields:
 *     flash      : { color, alpha, duration, startTime } | null
 *     haptic     : { pattern } | null  (consumed after vibration)
 *     slowMotion : { factor, until } | null
 *     takeoffRing: { progress } | null  (0-1 ring animation)
 *     landingBar : { progress } | null  (0-1 timing bar)
 *     tuckGlow   : { alpha } | null     (0-1 tuck indicator intensity)
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
    isTucked: false,     // true while player holds screen during INRUN
    tuckDuration: 0,     // seconds spent in tuck position
    phase: 'MENU',       // mirrors GameState for convenience
  };
}

// ---------------------------------------------------------------------------
// Timing / tuning constants
// ---------------------------------------------------------------------------

const TAKEOFF_WINDOW_MS   = 200;   // total window for takeoff tap
const TAKEOFF_PERFECT_MS  = 80;    // tight perfect window within the 200ms
const TAKEOFF_AUTO_QUALITY = 0.3;  // quality if player misses the tap entirely

const LANDING_WINDOW_MS   = 300;   // telemark landing window

const BODY_ANGLE_MIN      = 10;   // degrees
const BODY_ANGLE_MAX      = 55;   // degrees
const BODY_ANGLE_OPTIMAL  = 35;   // degrees

const ANGLE_CHANGE_RATE   = 40;   // degrees per second (via swipe / tilt)
const SWIPE_ANGLE_STEP    = 5;    // degrees per discrete swipe event
const DRAG_SENSITIVITY    = 0.12; // degrees per pixel of vertical drag

const ANGLE_INERTIA       = 0.88; // smoothing factor for angle velocity (0-1)
const ANGLE_VELOCITY_DECAY = 0.92; // how fast inertia velocity decays each tick

// Inrun tuck parameters
const TUCK_AERO_BONUS     = 1.0;  // speed gain per second while tucked (m/s^2)
const RELEASE_AERO_PENALTY = 0.4; // speed loss per second when not tucked (m/s^2)

const TELEMARK_PERFECT_BONUS = 1.0;
const TELEMARK_GOOD_BONUS    = 0.7;
const NO_TELEMARK_PENALTY    = 0.1;

const SCORE_READ_DELAY_MS = 1500; // minimum time to display score before allowing skip

const SLOWMO_FACTOR       = 0.5;  // time scale during takeoff slow-motion
const SLOWMO_DURATION_MS  = 400;  // how long slow-motion lasts after takeoff tap

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

    // Inrun tuck tracking
    this._inrunStartTime = 0;       // timestamp when INRUN phase began

    // Flight angle inertia
    this._angleVelocity = 0;        // degrees/sec, applied via inertia

    // Score display timing
    this._scoreShownAt = 0;

    // Config-driven values (overridden in init if config is available)
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

    // Ensure the feedback channel exists on the game object
    if (!game.feedback) {
      game.feedback = {
        flash: null,
        haptic: null,
        slowMotion: null,
        takeoffRing: null,
        landingBar: null,
        tuckGlow: null,
      };
    }

    // Grab the InputManager module
    this._input = game.getModule('input');
    if (!this._input) {
      console.warn('[SkihoppControls] InputManager not registered.');
      return;
    }

    // Read config overrides if available
    const cfg = game.config && game.config.skihopp;
    if (cfg) {
      this._angleChangeRate = cfg.flight?.angleChangeRate ?? ANGLE_CHANGE_RATE;
    }

    // Register input listeners
    this._unsubs.push(this._input.onTap(this._onTap.bind(this)));
    this._unsubs.push(this._input.onSwipe(this._onSwipe.bind(this)));
    this._unsubs.push(this._input.onDrag(this._onDrag.bind(this)));

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

    if (newState === GameState.INRUN) {
      this._inrunStartTime = performance.now();
      if (this._jumperState) {
        this._jumperState.isTucked = false;
        this._jumperState.tuckDuration = 0;
      }
    }

    if (newState === GameState.TAKEOFF) {
      this._takeoffWindowStart = performance.now();
      this._takeoffTapped = false;
    }

    if (newState === GameState.LANDING) {
      this._landingWindowStart = performance.now();
      this._landingTapped = false;
    }

    if (newState === GameState.FLIGHT) {
      // Reset angle inertia on entering flight
      this._angleVelocity = 0;
    }

    if (newState === GameState.SCORE) {
      this._scoreShownAt = performance.now();
    }
  }

  // -----------------------------------------------------------------------
  // Tap handler (dispatches to current phase)
  // -----------------------------------------------------------------------

  _onTap(x, y) {
    const state = this.game.getState();

    switch (state) {
      case GameState.MENU:
        this._handleMenuTap(x, y);
        break;

      case GameState.READY:
        this._handleReadyTap();
        break;

      case GameState.INRUN:
        // Inrun is hold-based (tuck), taps are ignored
        break;

      case GameState.TAKEOFF:
        this._handleTakeoffTap();
        break;

      case GameState.FLIGHT:
        // Taps are ignored during flight (swipe / drag / tilt controls angle)
        break;

      case GameState.LANDING:
        this._handleLandingTap();
        break;

      case GameState.SCORE:
        this._handleScoreTap();
        break;

      case GameState.RESULTS:
        this._handleResultsTap(x, y);
        break;

      default:
        break;
    }
  }

  // -----------------------------------------------------------------------
  // Swipe handler
  // -----------------------------------------------------------------------

  _onSwipe(direction, _distance, velocity) {
    const state = this.game.getState();
    if (state !== GameState.FLIGHT) return;

    if (!this._jumperState) return;

    // Discrete angle adjustment on swipe, scaled by velocity
    const velScale = clamp(velocity / 1.0, 0.5, 2.0); // velocity in px/ms
    const step = SWIPE_ANGLE_STEP * velScale;

    if (direction === 'up') {
      this._jumperState.targetAngle = clamp(
        this._jumperState.targetAngle - step,
        BODY_ANGLE_MIN,
        BODY_ANGLE_MAX
      );
      this._angleVelocity = -step * 4; // add inertia
    } else if (direction === 'down') {
      this._jumperState.targetAngle = clamp(
        this._jumperState.targetAngle + step,
        BODY_ANGLE_MIN,
        BODY_ANGLE_MAX
      );
      this._angleVelocity = step * 4;  // add inertia
    }
  }

  // -----------------------------------------------------------------------
  // Drag handler (continuous touch-move during flight)
  // -----------------------------------------------------------------------

  _onDrag(_dx, dy, _vx, vy) {
    const state = this.game.getState();
    if (state !== GameState.FLIGHT) return;

    if (!this._jumperState) return;

    // Map vertical drag movement to angle change
    const angleDelta = dy * DRAG_SENSITIVITY;
    this._jumperState.targetAngle = clamp(
      this._jumperState.targetAngle + angleDelta * 0.3, // dampen for smooth feel
      BODY_ANGLE_MIN,
      BODY_ANGLE_MAX
    );

    // Feed velocity into inertia system
    this._angleVelocity = vy * DRAG_SENSITIVITY * 8;
  }

  // -----------------------------------------------------------------------
  // Phase-specific tap handlers
  // -----------------------------------------------------------------------

  _handleMenuTap(x, y) {
    const scene = this.game.currentScene;
    if (!scene) {
      this.game.setState(GameState.READY);
      return;
    }

    // If we're in a sub-screen, delegate tap to that sub-screen
    if (scene._menuSubScreen) {
      let result = null;

      if (scene._menuSubScreen === 'hills' && scene.hillSelectScreen) {
        result = scene.hillSelectScreen.handleTap(x, y);
        if (result === 'back') {
          scene._fadeAlpha = 0.6;
          scene._menuSubScreen = null;
          return;
        }
        // A hill key was returned (e.g. 'K90', 'K120', 'K185')
        if (result && result !== 'back') {
          scene.selectHill(result);
          scene._fadeAlpha = 0.6;
          scene._menuSubScreen = null;
          return;
        }
      } else if (scene._menuSubScreen === 'stats' && scene.statsScreen) {
        result = scene.statsScreen.handleTap(x, y);
        if (result === 'back') {
          scene._fadeAlpha = 0.6;
          scene._menuSubScreen = null;
          return;
        }
      } else if (scene._menuSubScreen === 'settings' && scene.settingsScreen) {
        result = scene.settingsScreen.handleTap(x, y);
        if (result === 'back') {
          scene._fadeAlpha = 0.6;
          scene._menuSubScreen = null;
          return;
        }
        if (result === 'save') {
          // Apply settings
          const settings = scene.settingsScreen.getSettings();
          if (scene._audio && typeof scene._audio.setVolume === 'function') {
            scene._audio.setVolume(settings.volume / 100);
          }
          // Store settings on game config for other systems to read
          if (scene.game && scene.game.config) {
            scene.game.config.haptic = settings.haptic;
            scene.game.config.difficulty = settings.difficulty;
            scene.game.config.controlType = settings.controlType;
          }
          scene._fadeAlpha = 0.6;
          scene._menuSubScreen = null;
          return;
        }
      }
      return;
    }

    // Main menu: delegate tap to MenuScreen
    if (scene.menuScreen) {
      const buttonId = scene.menuScreen.handleTap(x, y);
      switch (buttonId) {
        case 'jump':
          this.game.setState(GameState.READY);
          break;
        case 'hills':
          // Lazily create HillSelectScreen if needed
          if (!scene.hillSelectScreen) {
            try {
              const HillSelectScreen = (await import('../../ui/HillSelectScreen.js')).default;
              scene.hillSelectScreen = new HillSelectScreen(scene.progression);
            } catch (e) {
              // HillSelectScreen already imported at module level in some builds
            }
          }
          scene._fadeAlpha = 0.6;
          scene._menuSubScreen = 'hills';
          break;
        case 'stats':
          if (!scene.statsScreen) {
            try {
              const StatsScreen = (await import('../../ui/StatsScreen.js')).default;
              scene.statsScreen = new StatsScreen();
            } catch (e) {
              // StatsScreen already imported at module level in some builds
            }
          }
          scene._fadeAlpha = 0.6;
          scene._menuSubScreen = 'stats';
          break;
        case 'settings':
          if (!scene.settingsScreen) {
            try {
              const SettingsScreen = (await import('../../ui/SettingsScreen.js')).default;
              scene.settingsScreen = new SettingsScreen();
            } catch (e) {
              // SettingsScreen already imported at module level in some builds
            }
          }
          scene._fadeAlpha = 0.6;
          scene._menuSubScreen = 'settings';
          break;
        default:
          break;
      }
    } else {
      // Fallback: no menu screen, just start
      this.game.setState(GameState.READY);
    }
  }

  _handleReadyTap() {
    // If tutorial is showing, advance it
    const scene = this.game.currentScene;
    if (scene && scene._showTutorial && scene.tutorialScreen) {
      scene.tutorialScreen.handleTap();
      if (scene.tutorialScreen.isComplete()) {
        scene._showTutorial = false;
        scene._tutorialShown = true;
        scene._countdownTimer = 0; // Start countdown after tutorial
      }
      return;
    }
    // Otherwise do nothing — let the 3-2-1 countdown finish naturally.
  }

  /**
   * Update inrun tuck state based on whether the player is currently touching
   * the screen. Called every tick from update().
   * @param {number} dt - delta time in seconds
   */
  _updateInrunTuck(dt) {
    const js = this._jumperState;
    if (!js || !this._input) return;

    const wasTucked = js.isTucked;
    js.isTucked = this._input.isTouching;

    if (js.isTucked) {
      js.tuckDuration += dt;
      // Tuck state is read by SkihoppPhysics._updateInrun() to adjust drag.
      // Do NOT modify js.speed here — physics handles the speed calculation.
    }
    // Not tucked = worse aerodynamics — also handled by physics via isTucked flag.

    // Visual feedback: glow indicator for tuck state
    const fb = this.game.feedback;
    if (fb) {
      if (js.isTucked) {
        // Ramp up glow smoothly
        const currentAlpha = fb.tuckGlow ? fb.tuckGlow.alpha : 0;
        fb.tuckGlow = {
          alpha: clamp(currentAlpha + dt * 3.0, 0, 1.0),
        };
      } else {
        // Fade out glow
        const currentAlpha = fb.tuckGlow ? fb.tuckGlow.alpha : 0;
        fb.tuckGlow = {
          alpha: Math.max(0, currentAlpha - dt * 4.0),
        };
      }

      // Haptic pulse when entering tuck
      if (js.isTucked && !wasTucked) {
        this._vibrate(10);
      }
    }
  }

  _handleTakeoffTap() {
    if (this._takeoffTapped) return; // only first tap counts
    this._takeoffTapped = true;

    const js = this._jumperState;
    if (!js) return;

    const now = performance.now();
    const elapsed = now - this._takeoffWindowStart;
    const fb = this.game.feedback;

    // Calculate takeoff quality based on timing within the 200ms window
    if (elapsed <= TAKEOFF_PERFECT_MS) {
      js.takeoffQuality = 1.0;
      // Perfect: green flash + strong double-pulse haptic
      if (fb) {
        fb.flash = { color: '#00ff44', alpha: 0.35, duration: 300, startTime: now };
      }
      this._vibrate([0, 50, 30, 50]);
    } else if (elapsed <= TAKEOFF_WINDOW_MS) {
      // Good but not perfect: linear interpolation from 1.0 down to 0.5
      const t = (elapsed - TAKEOFF_PERFECT_MS) / (TAKEOFF_WINDOW_MS - TAKEOFF_PERFECT_MS);
      js.takeoffQuality = 1.0 - 0.5 * t;
      // Yellow flash + medium haptic
      if (fb) {
        fb.flash = { color: '#ffcc00', alpha: 0.3, duration: 250, startTime: now };
      }
      this._vibrate([0, 35]);
    } else {
      // Too late - tapped after the window closed (shouldn't normally happen
      // since auto-launch fires, but handle defensively)
      js.takeoffQuality = TAKEOFF_AUTO_QUALITY;
      if (fb) {
        fb.flash = { color: '#ff3333', alpha: 0.2, duration: 150, startTime: now };
      }
      this._vibrate(15);
    }

    // Trigger slow-motion feel for dramatic takeoff moment
    if (fb) {
      fb.slowMotion = {
        factor: SLOWMO_FACTOR,
        until: now + SLOWMO_DURATION_MS,
      };
    }

    // Do NOT transition to FLIGHT here - let SkihoppPhysics._updateTakeoff()
    // handle the transition after computing launch velocity.
  }

  _handleLandingTap() {
    if (this._landingTapped) return; // only first tap counts
    this._landingTapped = true;

    const js = this._jumperState;
    if (!js) return;

    const now = performance.now();
    const elapsed = now - this._landingWindowStart;
    const fb = this.game.feedback;

    // Telemark landing quality (300ms window)
    if (elapsed <= LANDING_WINDOW_MS * 0.4) {
      // Perfect telemark - tapped within first 120ms
      js.landingQuality = TELEMARK_PERFECT_BONUS;
      if (fb) {
        fb.flash = { color: '#00ff44', alpha: 0.3, duration: 250, startTime: now };
      }
      // Strong impactful haptic for perfect telemark
      this._vibrate([0, 60, 30, 60]);
    } else if (elapsed <= LANDING_WINDOW_MS) {
      // Good telemark - tapped within 120-300ms
      const t = (elapsed - LANDING_WINDOW_MS * 0.4) / (LANDING_WINDOW_MS * 0.6);
      js.landingQuality = TELEMARK_GOOD_BONUS + (TELEMARK_PERFECT_BONUS - TELEMARK_GOOD_BONUS) * (1 - t);
      if (fb) {
        fb.flash = { color: '#ffcc00', alpha: 0.25, duration: 200, startTime: now };
      }
      this._vibrate([50, 30, 50]);
    } else {
      // Too late for telemark
      js.landingQuality = NO_TELEMARK_PENALTY;
      if (fb) {
        fb.flash = { color: '#ff3333', alpha: 0.2, duration: 150, startTime: now };
      }
      this._vibrate(20);
    }
  }

  _handleScoreTap() {
    // Enforce minimum display time so the player can read the score
    const elapsed = performance.now() - this._scoreShownAt;
    if (elapsed < SCORE_READ_DELAY_MS) return;

    this.game.setState(GameState.RESULTS);
  }

  _handleResultsTap(x, y) {
    // Check scoreboard buttons first
    const scene = this.game.currentScene;
    if (scene && scene.scoreboard) {
      const action = scene.scoreboard.handleTap(x, y);
      if (action === 'again') {
        this.game.setState(GameState.READY);
        return;
      }
      if (action === 'menu') {
        this.game.setState(GameState.MENU);
        return;
      }
    }
    // Tap anywhere else = quick restart (one more try!)
    this.game.setState(GameState.READY);
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

    const now = performance.now();
    const fb = this.game.feedback;

    // -- Expire flash effects --
    if (fb && fb.flash) {
      const elapsed = now - fb.flash.startTime;
      if (elapsed >= fb.flash.duration) {
        fb.flash = null;
      }
    }

    // -- Expire slow-motion --
    if (fb && fb.slowMotion) {
      if (now >= fb.slowMotion.until) {
        fb.slowMotion = null;
      }
    }

    // -- INRUN: update tuck state based on touch --
    if (state === GameState.INRUN) {
      this._updateInrunTuck(dt);
    } else if (fb) {
      fb.tuckGlow = null;
    }

    // -- TAKEOFF: ring animation + auto-launch --
    if (state === GameState.TAKEOFF) {
      const elapsed = now - this._takeoffWindowStart;

      // Update ring progress for renderer (0 -> 1 over the timing window)
      if (fb) {
        fb.takeoffRing = {
          progress: clamp(elapsed / TAKEOFF_WINDOW_MS, 0, 1),
        };
      }

      if (!this._takeoffTapped && elapsed > TAKEOFF_WINDOW_MS) {
        // Auto-launch: player missed the tap, set reduced quality
        js.takeoffQuality = TAKEOFF_AUTO_QUALITY;
        this._takeoffTapped = true;
        if (fb) {
          fb.takeoffRing = null;
          fb.flash = { color: '#ff3333', alpha: 0.2, duration: 150, startTime: now };
        }
        // Weak haptic to indicate missed timing
        this._vibrate(20);
      }
    } else if (fb) {
      fb.takeoffRing = null;
    }

    // -- FLIGHT: smoothly interpolate body angle toward target with inertia --
    if (state === GameState.FLIGHT) {
      this._updateFlightAngle(dt);
    }

    // -- LANDING: timing bar + auto-penalty --
    if (state === GameState.LANDING) {
      const elapsed = now - this._landingWindowStart;

      // Update landing timing bar for renderer
      if (fb) {
        fb.landingBar = {
          progress: clamp(elapsed / LANDING_WINDOW_MS, 0, 1),
        };
      }

      if (!this._landingTapped && elapsed > LANDING_WINDOW_MS) {
        js.landingQuality = NO_TELEMARK_PENALTY;
        this._landingTapped = true;
        if (fb) {
          fb.landingBar = null;
          fb.flash = { color: '#ff3333', alpha: 0.15, duration: 150, startTime: now };
        }
      }
    } else if (fb) {
      fb.landingBar = null;
    }

    // (Inrun tuck glow is handled in _updateInrunTuck)
  }

  /**
   * Smoothly move bodyAngle toward targetAngle with inertia, optionally
   * using device tilt if available.
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
        // Map beta range [-20, +40] to [BODY_ANGLE_MIN, BODY_ANGLE_MAX].
        const mapped = BODY_ANGLE_MIN +
          ((tilt.beta + 20) / 60) * (BODY_ANGLE_MAX - BODY_ANGLE_MIN);
        js.targetAngle = clamp(mapped, BODY_ANGLE_MIN, BODY_ANGLE_MAX);
      }
    }

    // Apply inertia velocity
    if (Math.abs(this._angleVelocity) > 0.1) {
      js.targetAngle = clamp(
        js.targetAngle + this._angleVelocity * dt,
        BODY_ANGLE_MIN,
        BODY_ANGLE_MAX
      );
      this._angleVelocity *= ANGLE_VELOCITY_DECAY;
    } else {
      this._angleVelocity = 0;
    }

    // Smooth interpolation (eased, not linear)
    const diff = js.targetAngle - js.bodyAngle;
    const maxChange = this._angleChangeRate * dt;

    // Use an easing blend: mostly smooth interpolation, but cap at maxChange
    const eased = diff * (1 - Math.pow(ANGLE_INERTIA, dt * 60));
    const clamped = Math.abs(eased) > maxChange
      ? Math.sign(eased) * maxChange
      : eased;

    js.bodyAngle += clamped;
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
    this._inrunStartTime = 0;
    this._angleVelocity = 0;
    this._scoreShownAt = 0;

    // Clean up feedback channel
    if (this.game && this.game.feedback) {
      this.game.feedback.flash = null;
      this.game.feedback.slowMotion = null;
      this.game.feedback.takeoffRing = null;
      this.game.feedback.landingBar = null;
      this.game.feedback.tuckGlow = null;
    }
  }
}
