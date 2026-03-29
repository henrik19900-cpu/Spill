/**
 * SkihoppGame.js - Main scene orchestrator for the ski jumping event
 *
 * Wires together all subsystems (physics, controls, rendering, scoring,
 * wind, UI) and drives the game state machine. Loaded by Game.js as
 * the default scene via setScene().
 *
 * Lifecycle:
 *   init(game) -> update(dt) / render(ctx,w,h) each frame -> destroy()
 *
 * State flow:
 *   MENU -> READY -> INRUN -> TAKEOFF -> FLIGHT -> LANDING -> SCORE -> RESULTS
 */

import { GameState } from '../../core/Game.js';
import Hill from './Hill.js';
import Jumper from './Jumper.js';
import SkihoppPhysics from './SkihoppPhysics.js';
import SkihoppRenderer from './SkihoppRenderer.js';
import SkihoppControls from './SkihoppControls.js';
import ScoringSystem from './ScoringSystem.js';
import Wind from './Wind.js';
import MenuScreen from '../../ui/MenuScreen.js';
import HUD from '../../ui/HUD.js';
import JudgeDisplay from '../../ui/JudgeDisplay.js';
import Scoreboard from '../../ui/Scoreboard.js';
import TutorialScreen from '../../ui/TutorialScreen.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OPTIMAL_FLIGHT_ANGLE = 35;           // degrees
const STABILITY_DEVIATION_TOLERANCE = 15;  // degrees from optimal before stability drops
const COUNTDOWN_DURATION = 3.0;            // seconds for "3... 2... 1... HOP!" countdown
const LANDING_TO_SCORE_DELAY = 1.5;        // seconds after landing before showing score
const SCORE_ANIMATION_DURATION = 3.0;      // seconds for judge reveal animation

// ---------------------------------------------------------------------------
// SkihoppGame
// ---------------------------------------------------------------------------

export default class SkihoppGame {
    constructor() {
        /** @type {import('../../core/Game.js').Game} */
        this.game = null;

        // Subsystems (created in init)
        this.hill = null;
        this.jumper = null;
        this.physics = null;
        this.skihoppRenderer = null;
        this.controls = null;
        this.scoringSystem = null;
        this.wind = null;

        // UI components
        this.menuScreen = null;
        this.hud = null;
        this.judgeDisplay = null;
        this.scoreboard = null;
        this.tutorialScreen = null;
        this._showTutorial = false;
        this._tutorialShown = false;

        // Module references
        this._audio = null;
        this._renderer = null;
        this._input = null;

        // Score state
        this._scoreResult = null;
        this._scoreAnimationTime = 0;

        // Countdown timer (READY -> INRUN)
        this._countdownTimer = 0;

        // Landing delay timer
        this._landingTimer = 0;

        // Best distance tracking
        this._bestDistance = 0;

        // Flight stability tracking
        this._flightSamples = 0;
        this._stabilityAccum = 0;

        // Jump results history (for scoreboard)
        this._jumpResults = [];

        // Input unsub handles
        this._unsubs = [];
    }

    // ------------------------------------------------------------------
    // Lifecycle
    // ------------------------------------------------------------------

    /**
     * Called by Game.setScene(). Sets up all subsystems.
     * @param {import('../../core/Game.js').Game} game
     */
    async init(game) {
        this.game = game;

        // Grab engine modules
        this._audio = game.getModule('audio');
        this._renderer = game.getModule('renderer');
        this._input = game.getModule('input');

        // ----------------------------------------------------------
        // 1. Load hill data
        // ----------------------------------------------------------
        let hillsData = null;

        if (game.config && game.config.hills) {
            hillsData = game.config.hills;
        } else {
            try {
                const resp = await fetch('./src/data/hills.json');
                hillsData = await resp.json();
            } catch (e) {
                console.warn('[SkihoppGame] Could not load hills.json, using inline fallback.', e.message);
                hillsData = null;
            }
        }

        // Default to K120 (large hill)
        const hillKey = (game.config && game.config.defaultHill) || 'K120';
        const hillConfig = hillsData ? (hillsData[hillKey] || Object.values(hillsData)[0]) : {
            name: 'Storbakke K120',
            kPoint: 120,
            hillSize: 140,
            inrunLength: 98,
            inrunAngle: 37,
            tableAngle: 11,
            tableLength: 7.2,
            landingAngle: 36,
            landingSteepness: 0.57,
            flatLength: 100,
            gateCount: 25,
            defaultGate: 20,
        };

        // ----------------------------------------------------------
        // 2. Create Hill
        // ----------------------------------------------------------
        this.hill = new Hill(hillConfig);

        // ----------------------------------------------------------
        // 3. Create Jumper
        // ----------------------------------------------------------
        this.jumper = new Jumper();

        // ----------------------------------------------------------
        // 4. Create Physics
        // ----------------------------------------------------------
        this.physics = new SkihoppPhysics(game, this.hill, this.jumper.getState());

        // ----------------------------------------------------------
        // 5. Create Renderer
        // ----------------------------------------------------------
        this.skihoppRenderer = new SkihoppRenderer();
        this.skihoppRenderer.init(game, this.hill, this._renderer);

        // ----------------------------------------------------------
        // 6. Create Controls
        // ----------------------------------------------------------
        this.controls = new SkihoppControls(game);
        this.controls.init(game, this.jumper.getState());

        // ----------------------------------------------------------
        // 7. Create Wind
        // ----------------------------------------------------------
        this.wind = new Wind();

        // ----------------------------------------------------------
        // 8. Create Scoring System
        // ----------------------------------------------------------
        this.scoringSystem = new ScoringSystem(hillConfig);

        // ----------------------------------------------------------
        // 9. Create UI components
        // ----------------------------------------------------------
        this.menuScreen = new MenuScreen();
        this.hud = new HUD();
        this.judgeDisplay = new JudgeDisplay();
        this.scoreboard = new Scoreboard();
        this.tutorialScreen = new TutorialScreen();

        // ----------------------------------------------------------
        // 10. Initial state is set by Game._init() after scene loads
        // ----------------------------------------------------------
        // (Game._init() calls setState(MENU) after _loadDefaultScene completes)
    }

    // ------------------------------------------------------------------
    // Update (called every fixed timestep)
    // ------------------------------------------------------------------

    /**
     * @param {number} dt - fixed timestep in seconds
     */
    update(dt) {
        const state = this.game.getState();

        // Wind updates continuously (even on menu for ambient feel)
        this.wind.update(dt);

        // Feed wind speed into jumper state so physics can use it
        const jumperState = this.jumper.getState();
        jumperState.wind = this.wind.isHeadwind()
            ? -this.wind.getSpeed()
            : this.wind.getSpeed();

        // Tutorial during READY state
        if (state === GameState.READY && this._showTutorial) {
            this.tutorialScreen.update(dt);
            return; // Don't run countdown while tutorial is showing
        }

        // Countdown timer during READY state
        if (state === GameState.READY) {
            this._countdownTimer += dt;
            if (this._countdownTimer >= COUNTDOWN_DURATION) {
                this.game.setState(GameState.INRUN);
            }
        }

        // Controls and physics only run during active gameplay
        if (state === GameState.INRUN || state === GameState.TAKEOFF ||
            state === GameState.FLIGHT || state === GameState.LANDING) {

            try {
                this.controls.update(dt);
            } catch (e) {
                console.error('[SkihoppGame] controls.update() error:', e);
            }
            try {
                this.physics.update(dt);
            } catch (e) {
                console.error('[SkihoppGame] physics.update() error:', e);
            }
        }

        // Track flight stability during FLIGHT phase
        if (state === GameState.FLIGHT) {
            this._trackFlightStability(dt);
        }

        // Landing delay: wait before transitioning to SCORE
        if (state === GameState.LANDING) {
            this._landingTimer += dt;
            if (this._landingTimer >= LANDING_TO_SCORE_DELAY) {
                this.game.setState(GameState.SCORE);
            }
        }

        // Score animation progress
        if (state === GameState.SCORE) {
            this._scoreAnimationTime += dt;
        }

        // Audio: wind sound proportional to speed
        this._updateAudio(state);
    }

    // ------------------------------------------------------------------
    // Render (called every frame)
    // ------------------------------------------------------------------

    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} width
     * @param {number} height
     */
    render(ctx, width, height) {
        const state = this.game.getState();
        const jumperState = this.jumper.getState();

        switch (state) {
            case GameState.MENU:
                this.menuScreen.render(ctx, width, height);
                break;

            case GameState.READY:
                // Render the 3D scene behind
                this.skihoppRenderer.render(ctx, width, height, jumperState, state, {
                    speed: this.wind.getSpeed(),
                    direction: this.wind.getDirection(),
                });

                // Show tutorial overlay if active
                if (this._showTutorial) {
                    this.tutorialScreen.render(ctx, width, height);
                    break;
                }

                // Draw countdown overlay
                {
                    const remaining = COUNTDOWN_DURATION - this._countdownTimer;
                    let countdownText;
                    if (remaining > 2) countdownText = '3...';
                    else if (remaining > 1) countdownText = '2...';
                    else if (remaining > 0) countdownText = '1...';
                    else countdownText = 'HOP!';

                    ctx.save();
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                    ctx.fillRect(0, 0, width, height);
                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 72px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
                    ctx.shadowBlur = 8;
                    ctx.fillText(countdownText, width / 2, height / 2);
                    ctx.restore();
                }
                break;

            case GameState.INRUN:
            case GameState.TAKEOFF:
            case GameState.FLIGHT:
            case GameState.LANDING: {
                // Render the 3D scene
                this.skihoppRenderer.render(ctx, width, height, jumperState, state, {
                    speed: this.wind.getSpeed(),
                    direction: this.wind.getDirection(),
                });

                // Overlay the HUD
                // During flight/landing, show surface distance from takeoff
                // During inrun, distance is remaining-to-table (not useful for display)
                let displayDistance = 0;
                if (state === GameState.FLIGHT || state === GameState.TAKEOFF) {
                    displayDistance = this.hill.getSurfaceDistanceAtX
                        ? this.hill.getSurfaceDistanceAtX(Math.max(0, jumperState.x))
                        : jumperState.x;
                } else if (state === GameState.LANDING) {
                    displayDistance = jumperState.landingDistance;
                }
                this.hud.render(ctx, width, height, {
                    speed: jumperState.speed,
                    distance: displayDistance,
                    bodyAngle: jumperState.bodyAngle,
                    windSpeed: this.wind.getSpeed(),
                    windDirection: this.wind.getDirection(),
                    phase: state,
                    takeoffQuality: jumperState.takeoffQuality,
                    landingQuality: jumperState.landingQuality,
                    kPoint: this.hill.kPoint,
                    feedback: this.game.feedback || {},
                });
                break;
            }

            case GameState.SCORE:
                // Frozen scene behind the score overlay
                this.skihoppRenderer.render(ctx, width, height, jumperState, state, {
                    speed: this.wind.getSpeed(),
                    direction: this.wind.getDirection(),
                });

                // JudgeDisplay._renderBackground provides its own dim overlay,
                // so no additional dimming is needed here.

                // Judge display with animation
                if (this._scoreResult) {
                    const progress = Math.min(1, this._scoreAnimationTime / SCORE_ANIMATION_DURATION);
                    this.judgeDisplay.render(ctx, width, height, {
                        judges: this._scoreResult.judges,
                        distancePoints: this._scoreResult.distancePoints,
                        stylePoints: this._scoreResult.stylePoints,
                        windComp: this._scoreResult.windCompensation,
                        totalPoints: this._scoreResult.totalPoints,
                        distance: this._scoreResult.distance,
                        kPoint: this.hill.kPoint || 120,
                        hillName: this.hill.name || 'Storbakke',
                        rating: this._scoreResult.rating,
                        ratingTier: this._scoreResult.ratingTier,
                        bestDistance: this._bestDistance,
                        animationProgress: progress,
                    });
                }
                break;

            case GameState.RESULTS: {
                // Find the index of the latest jump (tagged with _latest)
                const latestIdx = this._jumpResults.findIndex(j => j._latest);
                this.scoreboard.render(ctx, width, height, {
                    jumps: this._jumpResults,
                    currentJumper: latestIdx >= 0 ? latestIdx : this._jumpResults.length - 1,
                });
            }
                break;

            default:
                break;
        }
    }

    // ------------------------------------------------------------------
    // State change handler (called by Game state machine)
    // ------------------------------------------------------------------

    /**
     * @param {string} newState - new GameState value
     * @param {string} prevState - previous GameState value
     */
    onStateChange(newState, prevState) {
        const jumperState = this.jumper.getState();

        switch (newState) {
            case GameState.READY:
                // Reset jumper for a new attempt
                this.jumper.reset(this.hill);
                this.physics.reset();
                this._resetFlightTracking();
                this._countdownTimer = 0;
                this._landingTimer = 0;
                this._scoreResult = null;
                this._scoreAnimationTime = 0;

                // Show tutorial before first jump
                if (!this._tutorialShown) {
                    this._showTutorial = true;
                    this.tutorialScreen.reset();
                }

                // Stop wind sound from previous run
                this._safeAudioCall('stopWind');
                break;

            case GameState.INRUN:
                // Run has started - play ambient sounds
                this._safeAudioCall('playWind', this.wind.getSpeed() / 4);
                break;

            case GameState.TAKEOFF:
                // Swoosh sound at the table edge
                this._safeAudioCall('playSwoosh');
                break;

            case GameState.LANDING:
                // Finalise flight stability on jumper state
                jumperState.flightStability = this._calculateFinalStability();

                // Track best distance
                if (jumperState.landingDistance > this._bestDistance) {
                    this._bestDistance = jumperState.landingDistance;
                }

                // Stop crowd ambience from flight, play landing sound
                this._safeAudioCall('stopCrowdAmbience');
                this._safeAudioCall('playLanding', jumperState.landingQuality);
                break;

            case GameState.SCORE:
                // Stop wind sound when leaving active phases
                this._safeAudioCall('stopWind');

                // Calculate score
                this._scoreResult = this.scoringSystem.calculateScore({
                    distance: jumperState.landingDistance,
                    takeoffQuality: jumperState.takeoffQuality,
                    flightStability: jumperState.flightStability,
                    landingQuality: jumperState.landingQuality,
                    windSpeed: this.wind.getSpeed(),
                    windDirection: this.wind.getDirection(),
                    gate: this.hill.defaultGate,
                });

                this._scoreAnimationTime = 0;

                // Audio effects for score reveal
                this._safeAudioCall('playJudgeReveal');
                this._safeAudioCall('playCrowdCheer',
                    this._scoreResult.totalPoints > 120 ? 1.0 : 0.5
                );
                break;

            case GameState.RESULTS:
                // Stop wind sound on results screen
                this._safeAudioCall('stopWind');

                // Add this jump to the results list
                // Mark all previous jumps as not-latest
                for (const j of this._jumpResults) { j._latest = false; }

                this._jumpResults.push({
                    name: 'Spiller',
                    country: 'NOR',
                    distance: jumperState.landingDistance,
                    totalPoints: this._scoreResult ? this._scoreResult.totalPoints : 0,
                    rank: this._jumpResults.length + 1,
                    _latest: true,
                });

                // Re-sort by total points descending and update ranks
                this._jumpResults.sort((a, b) => b.totalPoints - a.totalPoints);
                this._jumpResults.forEach((r, i) => { r.rank = i + 1; });

                // Fanfare for good scores
                if (this._scoreResult && this._scoreResult.totalPoints > 130) {
                    this._safeAudioCall('playFanfare');
                }
                break;

            case GameState.MENU:
                // Full reset when returning to menu
                this.jumper.reset(this.hill);
                this.physics.reset();
                this._resetFlightTracking();
                this._countdownTimer = 0;
                this._landingTimer = 0;
                this._scoreResult = null;
                this._scoreAnimationTime = 0;

                // Stop all looping audio
                this._safeAudioCall('stopWind');
                this._safeAudioCall('stopCrowdAmbience');
                break;

            default:
                break;
        }
    }

    // ------------------------------------------------------------------
    // Flight stability tracking
    // ------------------------------------------------------------------

    /**
     * Track how steadily the jumper holds the optimal body angle during flight.
     * Samples each physics tick; large deviations reduce the accumulated score.
     */
    _trackFlightStability(dt) {
        const angle = this.jumper.getState().bodyAngle;
        const deviation = Math.abs(angle - OPTIMAL_FLIGHT_ANGLE);

        // Stability contribution for this tick: 1.0 when perfect, dropping
        // toward 0 as deviation increases beyond the tolerance threshold.
        const sample = Math.max(0, 1.0 - deviation / STABILITY_DEVIATION_TOLERANCE);

        this._stabilityAccum += sample;
        this._flightSamples++;
    }

    /**
     * Calculate the final flight stability score (0-1) as the average of
     * all sampled ticks during flight.
     * @returns {number}
     */
    _calculateFinalStability() {
        if (this._flightSamples === 0) return 1.0;
        return this._stabilityAccum / this._flightSamples;
    }

    _resetFlightTracking() {
        this._flightSamples = 0;
        this._stabilityAccum = 0;
    }

    // ------------------------------------------------------------------
    // Audio helpers
    // ------------------------------------------------------------------

    _updateAudio(state) {
        if (!this._audio) return;

        // Continuous wind sound during active phases
        // Wind speed is 0-4 m/s; normalise to 0-1 for AudioManager
        if (state === GameState.INRUN || state === GameState.FLIGHT ||
            state === GameState.TAKEOFF || state === GameState.LANDING) {
            this._safeAudioCall('playWind', this.wind.getSpeed() / 4);
        }

        // Crowd ambience during flight that builds with distance
        if (state === GameState.FLIGHT) {
            const jumperState = this.jumper.getState();
            const kPoint = this.hill.kPoint || 120;
            // Volume ramps from 0.2 to 1.0 as horizontal distance approaches (and exceeds) K-point
            // Use jumperState.x (horizontal position from takeoff) since .distance tracks inrun remaining
            const flightDistance = Math.max(0, jumperState.x);
            const intensity = Math.min(1.0, 0.2 + 0.8 * (flightDistance / kPoint));
            this._safeAudioCall('playCrowdAmbience', intensity);
        }
    }

    /**
     * Safely call an audio method with typeof guard and try-catch.
     * @param {string} method - method name on this._audio
     * @param {...*} args - arguments to pass
     */
    _safeAudioCall(method, ...args) {
        if (!this._audio || typeof this._audio[method] !== 'function') return;
        try {
            this._audio[method](...args);
        } catch (e) {
            console.warn(`[SkihoppGame] audio.${method}() error:`, e);
        }
    }

    // ------------------------------------------------------------------
    // Cleanup
    // ------------------------------------------------------------------

    destroy() {
        if (this.controls) {
            this.controls.destroy();
        }

        // Clear unsub handles
        for (const unsub of this._unsubs) {
            unsub();
        }
        this._unsubs = [];

        // Null out references
        this.game = null;
        this.hill = null;
        this.jumper = null;
        this.physics = null;
        this.skihoppRenderer = null;
        this.controls = null;
        this.scoringSystem = null;
        this.wind = null;
        this.menuScreen = null;
        this.hud = null;
        this.judgeDisplay = null;
        this.scoreboard = null;
        this._audio = null;
        this._renderer = null;
        this._input = null;
        this._scoreResult = null;
        this._jumpResults = [];
        this._bestDistance = 0;
        this._countdownTimer = 0;
    }
}
