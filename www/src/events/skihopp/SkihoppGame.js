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
import ReplaySystem from './ReplaySystem.js';

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

        // Replay system (optional, loaded dynamically)
        this.replay = null;

        // Progression system (optional, loaded dynamically)
        this.progression = null;

        // Current hill key for progression tracking
        this._currentHillKey = 'K90';

        // Hills data reference (stored after load for hill selection)
        this._hillsData = null;

        // Menu sub-screen navigation
        this._menuSubScreen = null;  // null | 'hills' | 'stats' | 'settings'

        // Fade transition overlay
        this._fadeAlpha = 0;

        // Camera pan transition (MENU -> READY)
        this._cameraPanProgress = 0;   // 0 = overview, 1 = inrun top
        this._cameraPanActive = false;

        // Countdown animation state
        this._lastCountdownNumber = null;
        this._countdownScaleAnim = 0;  // 0..1 progress of scale-up-then-fade

        // "HOP!" screen flash
        this._hopFlashAlpha = 0;

        // Edge-approaching warning (INRUN -> TAKEOFF)
        this._edgeWarningActive = false;
        this._edgeWarningTime = 0;

        // Landing hold: show distance before transitioning
        this._landingHoldTime = 0;
        this._landingDistanceShown = false;

        // SCORE -> RESULTS fade transition
        this._scoreToResultsFade = 0;

        // "Hopp igjen" camera smooth reset
        this._resetCameraPanProgress = 0;
        this._resetCameraPanActive = false;

        // Perfect takeoff flash
        this._perfectFlashAlpha = 0;
        this._perfectFlashTime = 0;
        this._showPerfektText = false;

        // Progression results from last jump
        this._newUnlocks = [];
        this._newAchievements = [];

        // Achievement notification queue & popup state
        this._achievementQueue = [];
        this._achievementPopup = {
            active: false,
            achievement: null,
            timer: 0,
            duration: 2.5,
            slideIn: 0.3,
            slideOut: 0.3,
        };

        // New record notification state
        this._newRecordPopup = {
            active: false,
            distance: 0,
            timer: 0,
            duration: 3.0,
            pulsePhase: 0,
        };

        // Optional UI screens for sub-menus
        this.hillSelectScreen = null;
        this.statsScreen = null;
        this.settingsScreen = null;
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
        // 10. Store hills data for hill selection
        // ----------------------------------------------------------
        this._hillsData = hillsData;
        this._currentHillKey = hillKey;

        // ----------------------------------------------------------
        // 11. Dynamic imports for optional systems (replay, progression)
        // ----------------------------------------------------------
        try {
            this.replay = new ReplaySystem();
        } catch (e) {
            console.warn('[SkihoppGame] ReplaySystem not available.', e.message);
            this.replay = null;
        }

        try {
            const { default: ProgressionManager } = await import('./ProgressionManager.js');
            this.progression = new ProgressionManager();
        } catch (e) {
            console.warn('[SkihoppGame] ProgressionManager not available.', e.message);
            this.progression = null;
        }

        // ----------------------------------------------------------
        // 12. Initial state is set by Game._init() after scene loads
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

        // Slowmotion support via game feedback
        const fb = this.game.feedback;
        if (fb && fb.slowMotion && performance.now() < fb.slowMotion.until) {
            dt *= fb.slowMotion.factor;
        }

        // Fade transition: decrease alpha each frame
        if (this._fadeAlpha > 0) {
            this._fadeAlpha = Math.max(0, this._fadeAlpha - dt * 3);
        }

        // Camera pan transition (MENU -> READY smooth pan)
        if (this._cameraPanActive) {
            this._cameraPanProgress = Math.min(1, this._cameraPanProgress + dt * 0.8);
            if (this._cameraPanProgress >= 1) {
                this._cameraPanActive = false;
            }
        }

        // "Hopp igjen" camera smooth reset
        if (this._resetCameraPanActive) {
            this._resetCameraPanProgress = Math.min(1, this._resetCameraPanProgress + dt * 1.2);
            if (this._resetCameraPanProgress >= 1) {
                this._resetCameraPanActive = false;
            }
        }

        // HOP! screen flash decay
        if (this._hopFlashAlpha > 0) {
            this._hopFlashAlpha = Math.max(0, this._hopFlashAlpha - dt * 4);
        }

        // Perfect takeoff flash decay
        if (this._perfectFlashAlpha > 0) {
            this._perfectFlashTime += dt;
            this._perfectFlashAlpha = Math.max(0, this._perfectFlashAlpha - dt * 2);
            if (this._perfectFlashTime >= 0.5) {
                this._showPerfektText = false;
            }
        }

        // Edge-approaching warning during late INRUN
        if (state === GameState.INRUN) {
            const jumperState = this.jumper.getState();
            const tableDistance = jumperState.distance !== undefined ? jumperState.distance : 0;
            // Activate warning when close to takeoff edge (last 15% of inrun)
            const inrunLen = this.hill.inrunLength || 98;
            if (tableDistance <= inrunLen * 0.15 && tableDistance > 0) {
                if (!this._edgeWarningActive) {
                    this._edgeWarningActive = true;
                    this._edgeWarningTime = 0;
                    this._safeAudioCall('playRisingTone');
                }
                this._edgeWarningTime += dt;
            }
        }

        // SCORE -> RESULTS fade transition
        if (this._scoreToResultsFade > 0 && state === GameState.RESULTS) {
            this._scoreToResultsFade = Math.max(0, this._scoreToResultsFade - dt * 2);
        }

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

            // Track which countdown number we're on for scale animation
            const remaining = COUNTDOWN_DURATION - this._countdownTimer;
            let currentNumber;
            if (remaining > 2) currentNumber = 3;
            else if (remaining > 1) currentNumber = 2;
            else if (remaining > 0) currentNumber = 1;
            else currentNumber = 0; // HOP!

            if (currentNumber !== this._lastCountdownNumber) {
                this._lastCountdownNumber = currentNumber;
                this._countdownScaleAnim = 0;
                // Trigger HOP! flash when countdown reaches 0
                if (currentNumber === 0) {
                    this._hopFlashAlpha = 0.6;
                }
            }
            this._countdownScaleAnim = Math.min(1, this._countdownScaleAnim + dt * 2.5);

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

        // Replay recording during active phases
        if (this.replay) {
            if (state === GameState.INRUN || state === GameState.TAKEOFF ||
                state === GameState.FLIGHT || state === GameState.LANDING) {
                this.replay.recordFrame(jumperState, dt);
            }
        }

        // Height above ground during flight
        if (state === GameState.FLIGHT) {
            if (this.hill && typeof this.hill.getHeightAtDistance === 'function') {
                const hillY = this.hill.getHeightAtDistance(jumperState.x);
                jumperState.heightAboveGround = hillY - jumperState.y;
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

        // Achievement popup processing
        if (this._achievementPopup.active) {
            this._achievementPopup.timer += dt;
            if (this._achievementPopup.timer >= this._achievementPopup.duration) {
                this._achievementPopup.active = false;
                this._achievementPopup.achievement = null;
                this._achievementPopup.timer = 0;
            }
        } else if (this._achievementQueue.length > 0) {
            // Pop next achievement from queue and start showing it
            const next = this._achievementQueue.shift();
            this._achievementPopup.active = true;
            this._achievementPopup.achievement = next;
            this._achievementPopup.timer = 0;
        }

        // New record popup processing
        if (this._newRecordPopup.active) {
            this._newRecordPopup.timer += dt;
            this._newRecordPopup.pulsePhase += dt;
            if (this._newRecordPopup.timer >= this._newRecordPopup.duration) {
                this._newRecordPopup.active = false;
            }
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
                if (this._menuSubScreen === 'hills') {
                    if (this.hillSelectScreen) {
                        this.hillSelectScreen.render(ctx, width, height);
                    }
                } else if (this._menuSubScreen === 'stats') {
                    if (this.statsScreen) {
                        this.statsScreen.render(ctx, width, height);
                    }
                } else if (this._menuSubScreen === 'settings') {
                    if (this.settingsScreen) {
                        this.settingsScreen.render(ctx, width, height);
                    }
                } else {
                    const menuData = {
                        bestDistance: this._bestDistance,
                        record: this.progression ? this.progression.getRecord() : null,
                        level: this.progression ? this.progression.getLevel() : 1,
                        xp: this.progression ? this.progression.getXP() : 0,
                        currentHill: this._currentHillKey,
                    };
                    this.menuScreen.render(ctx, width, height, menuData);
                }
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

                // Draw countdown overlay with scale-up-then-fade animation
                {
                    const remaining = COUNTDOWN_DURATION - this._countdownTimer;
                    let countdownText;
                    let isHop = false;
                    if (remaining > 2) countdownText = '3...';
                    else if (remaining > 1) countdownText = '2...';
                    else if (remaining > 0) countdownText = '1...';
                    else { countdownText = 'HOP!'; isHop = true; }

                    // Scale: 1.0 -> 1.5 over the animation, then fade out
                    const t = this._countdownScaleAnim;
                    const scale = 1.0 + 0.5 * t;
                    // Fade: fully visible for first 60%, then fade out
                    const fadeAlpha = t < 0.6 ? 1.0 : Math.max(0, 1.0 - (t - 0.6) / 0.4);

                    ctx.save();
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                    ctx.fillRect(0, 0, width, height);

                    // HOP! screen flash (green-white)
                    if (this._hopFlashAlpha > 0) {
                        ctx.fillStyle = `rgba(100, 255, 100, ${this._hopFlashAlpha})`;
                        ctx.fillRect(0, 0, width, height);
                    }

                    ctx.translate(width / 2, height / 2);
                    ctx.scale(scale, scale);
                    ctx.globalAlpha = fadeAlpha;

                    if (isHop) {
                        ctx.fillStyle = '#00ff44';
                        ctx.font = 'bold 84px sans-serif';
                    } else {
                        ctx.fillStyle = '#ffffff';
                        ctx.font = 'bold 72px sans-serif';
                    }
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.shadowColor = isHop ? 'rgba(0, 80, 0, 0.8)' : 'rgba(0, 0, 0, 0.6)';
                    ctx.shadowBlur = isHop ? 16 : 8;
                    ctx.fillText(countdownText, 0, 0);
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
                    heightAboveGround: jumperState.heightAboveGround || 0,
                    isTucked: jumperState.isTucked || false,
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

        // Fade transition overlay
        if (this._fadeAlpha > 0) {
            ctx.save();
            ctx.globalAlpha = this._fadeAlpha;
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
        }

        // Achievement and record popups (drawn on top of everything)
        this._renderAchievementPopup(ctx, width, height);
        this._renderNewRecordPopup(ctx, width, height);
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
                // Fade transition
                this._fadeAlpha = 1;

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
                // Start replay recording
                if (this.replay && typeof this.replay.startRecording === 'function') {
                    this.replay.startRecording();
                }

                // Fade in from state transition
                this._fadeAlpha = 1;

                // Run has started - play ambient sounds
                this._safeAudioCall('playWind', this.wind.getSpeed() / 4);
                break;

            case GameState.TAKEOFF:
                // Swoosh sound at the table edge
                this._safeAudioCall('playSwoosh');
                break;

            case GameState.LANDING:
                // Stop replay recording
                if (this.replay && typeof this.replay.stopRecording === 'function') {
                    this.replay.stopRecording();
                }

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

                // Progression tracking
                if (this.progression) {
                    this.progression.addJump(
                        this._currentHillKey,
                        jumperState.landingDistance,
                        this._scoreResult.totalPoints,
                        jumperState.landingQuality
                    );
                    this.progression.addXP(this._scoreResult.totalPoints * 0.5);
                    const newUnlocks = this.progression.checkUnlocks();
                    const newAchievements = this.progression.checkAchievements({
                        distance: jumperState.landingDistance,
                        totalPoints: this._scoreResult.totalPoints,
                        hillKey: this._currentHillKey,
                        landingQuality: jumperState.landingQuality,
                        flightStability: jumperState.flightStability,
                    });
                    this._newUnlocks = newUnlocks;
                    this._newAchievements = newAchievements;

                    // Queue new achievements for popup notifications
                    if (this._newAchievements && this._newAchievements.length > 0) {
                        for (const a of this._newAchievements) {
                            this._achievementQueue.push(a);
                        }
                    }
                }

                // Check for new distance record and trigger record popup
                {
                    const prevBest = this._bestDistance;
                    // _bestDistance was already updated in LANDING, so check if
                    // the current landing distance matches the new best
                    if (jumperState.landingDistance >= prevBest && jumperState.landingDistance > 0) {
                        this._newRecordPopup = {
                            active: true,
                            distance: jumperState.landingDistance,
                            timer: 0,
                            duration: 3.0,
                            pulsePhase: 0,
                        };
                    }
                }

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
    // Hill selection
    // ------------------------------------------------------------------

    /**
     * Switch to a different hill by key (e.g. 'K90', 'K120').
     * Rebuilds the Hill instance and resets physics/jumper accordingly.
     * @param {string} hillKey
     */
    selectHill(hillKey) {
        if (!this._hillsData || !this._hillsData[hillKey]) {
            console.warn(`[SkihoppGame] Unknown hill key: ${hillKey}`);
            return;
        }
        this._currentHillKey = hillKey;
        const hillConfig = this._hillsData[hillKey];

        // Rebuild hill and dependent systems
        this.hill = new Hill(hillConfig);
        this.physics = new SkihoppPhysics(this.game, this.hill, this.jumper.getState());
        this.scoringSystem = new ScoringSystem(hillConfig);
        if (this.skihoppRenderer && typeof this.skihoppRenderer.setHill === 'function') {
            this.skihoppRenderer.setHill(this.hill);
        }

        // Reset jumper on new hill
        this.jumper.reset(this.hill);
        this.physics.reset();
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
        this.replay = null;
        this.progression = null;
        this._hillsData = null;
        this._fadeAlpha = 0;
        this._newUnlocks = [];
        this._newAchievements = [];
        this.hillSelectScreen = null;
        this.statsScreen = null;
        this.settingsScreen = null;
    }
}
