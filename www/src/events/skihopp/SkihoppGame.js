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
import HillSelectScreen from '../../ui/HillSelectScreen.js';
import StatsScreen from '../../ui/StatsScreen.js';
import SettingsScreen from '../../ui/SettingsScreen.js';
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
        this._perfectFlashTimer = 0;
        this._showPerfektText = false;

        // Progression results from last jump
        this._newUnlocks = [];
        this._newAchievements = [];

        // Achievement / record notification queue & popup state
        this._achievementQueue = [];
        this._currentPopup = null; // { text, subtext, type, timer, duration }

        // Optional UI screens for sub-menus
        this.hillSelectScreen = null;
        this.statsScreen = null;
        this.settingsScreen = null;

        // --- PREMIUM: Screen shake system ---
        this._shakes = [];

        // --- PREMIUM: Slowmo visual state ---
        this._slowmoActive = false;
        this._slowmoTextAlpha = 0;

        // --- PREMIUM: Combo / streak system ---
        this._comboCount = 0;
        this._comboTextTimer = 0;
        this._comboTextValue = 0;  // the streak number to display

        // --- PREMIUM: Post-jump stats overlay ---
        this._postJumpStats = null;       // { maxHeight, topSpeed, flightTime }
        this._postJumpStatsTimer = 0;
        this._postJumpStatsDuration = 3.5; // seconds to show before RESULTS
        this._trackMaxHeight = 0;
        this._trackTopSpeed = 0;
        this._trackFlightStartTime = 0;
        this._trackFlightEndTime = 0;
        this._personalBests = { maxHeight: 0, topSpeed: 0, flightTime: 0 };

        // --- PREMIUM: Woosh transition (RESULTS -> READY) ---
        this._wooshProgress = 0;  // 0 = not active, 0..1 = animating
        this._wooshActive = false;

        // --- Transition effects tracker ---
        // Each key holds { active, timer, duration } plus effect-specific fields
        this._transitionEffects = {
            menuToReadyZoom: { active: false, timer: 0, duration: 0.5 },
            takeoffFlash: { active: false, timer: 0, duration: 0.1, alpha: 0 },
            takeoffQualityText: { active: false, timer: 0, duration: 0.8, text: '', color: '#ffffff', scale: 0 },
            landingImpactFlash: { active: false, timer: 0, duration: 0.15, alpha: 0 },
            scoreToResultsCrossfade: { active: false, timer: 0, duration: 0.4, alpha: 0 },
        };
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
        try {
            this.hill = new Hill(hillConfig);
        } catch (e) {
            console.error('[SkihoppGame] Hill creation failed:', e);
            this.hill = null;
        }

        // ----------------------------------------------------------
        // 3. Create Jumper
        // ----------------------------------------------------------
        try {
            this.jumper = new Jumper();
        } catch (e) {
            console.error('[SkihoppGame] Jumper creation failed:', e);
            this.jumper = null;
        }

        // ----------------------------------------------------------
        // 4. Create Physics
        // ----------------------------------------------------------
        try {
            if (this.hill && this.jumper) {
                this.physics = new SkihoppPhysics(game, this.hill, this.jumper.getState());
            } else {
                console.warn('[SkihoppGame] Skipping physics – hill or jumper not available.');
            }
        } catch (e) {
            console.error('[SkihoppGame] Physics creation failed:', e);
            this.physics = null;
        }

        // ----------------------------------------------------------
        // 5. Create Renderer
        // ----------------------------------------------------------
        try {
            this.skihoppRenderer = new SkihoppRenderer();
            this.skihoppRenderer.init(game, this.hill, this._renderer);
        } catch (e) {
            console.error('[SkihoppGame] SkihoppRenderer creation failed:', e);
            this.skihoppRenderer = null;
        }

        // ----------------------------------------------------------
        // 6. Create Controls
        // ----------------------------------------------------------
        try {
            this.controls = new SkihoppControls(game);
            if (this.jumper) {
                this.controls.init(game, this.jumper.getState());
            }
        } catch (e) {
            console.error('[SkihoppGame] Controls creation failed:', e);
            this.controls = null;
        }

        // ----------------------------------------------------------
        // 7. Create Wind
        // ----------------------------------------------------------
        try {
            this.wind = new Wind();
        } catch (e) {
            console.error('[SkihoppGame] Wind creation failed:', e);
            this.wind = null;
        }

        // ----------------------------------------------------------
        // 8. Create Scoring System
        // ----------------------------------------------------------
        try {
            this.scoringSystem = new ScoringSystem(hillConfig);
        } catch (e) {
            console.error('[SkihoppGame] ScoringSystem creation failed:', e);
            this.scoringSystem = null;
        }

        // ----------------------------------------------------------
        // 9. Create UI components (each independent – one failure
        //    should not prevent the others from working)
        // ----------------------------------------------------------
        try { this.menuScreen = new MenuScreen(); }
        catch (e) { console.warn('[SkihoppGame] MenuScreen failed:', e.message); }
        try { this.hud = new HUD(); }
        catch (e) { console.warn('[SkihoppGame] HUD failed:', e.message); }
        try { this.judgeDisplay = new JudgeDisplay(); }
        catch (e) { console.warn('[SkihoppGame] JudgeDisplay failed:', e.message); }
        try { this.scoreboard = new Scoreboard(); }
        catch (e) { console.warn('[SkihoppGame] Scoreboard failed:', e.message); }
        try { this.tutorialScreen = new TutorialScreen(); }
        catch (e) { console.warn('[SkihoppGame] TutorialScreen failed:', e.message); }

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
            const { default: ProgressionManager } = await import('../../data/ProgressionManager.js');
            this.progression = new ProgressionManager();
        } catch (e) {
            console.warn('[SkihoppGame] ProgressionManager not available.', e.message);
            this.progression = null;
        }

        // ----------------------------------------------------------
        // 12. Create sub-menu screens (hills, stats, settings)
        // ----------------------------------------------------------
        this.hillSelectScreen = new HillSelectScreen(this.progression);
        this.statsScreen = new StatsScreen();
        this.settingsScreen = new SettingsScreen({
            volume: (this._audio && typeof this._audio.getVolume === 'function')
                ? Math.round(this._audio.getVolume() * 100)
                : 70,
            haptic: game.config && game.config.haptic != null ? game.config.haptic : true,
            difficulty: (game.config && game.config.difficulty) || 'normal',
            controlType: (game.config && game.config.controlType) || 'swipe',
        });

        // ----------------------------------------------------------
        // 13. Initial state is set by Game._init() after scene loads
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
        if (!this.game) return;
        const state = this.game.getState();

        // Slowmotion support via game feedback
        const fb = this.game.feedback;
        const isSlowmo = fb && fb.slowMotion && performance.now() < fb.slowMotion.until;
        if (isSlowmo) {
            dt *= fb.slowMotion.factor;
        }
        this._slowmoActive = !!isSlowmo;
        if (isSlowmo) {
            this._slowmoTextAlpha = Math.min(1, (this._slowmoTextAlpha || 0) + dt * 8);
        } else {
            this._slowmoTextAlpha = Math.max(0, (this._slowmoTextAlpha || 0) - dt * 4);
        }

        // Update screen shakes
        this._updateShakes(dt);

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
            this._perfectFlashTimer += dt;
            this._perfectFlashAlpha = Math.max(0, this._perfectFlashAlpha - dt * 2);
            if (this._perfectFlashTimer >= 0.5) {
                this._showPerfektText = false;
            }
        }

        // Edge-approaching warning during late INRUN
        if (state === GameState.INRUN && this.jumper && this.hill) {
            try {
                const js = this.jumper.getState();
                const tableDistance = js.distance !== undefined ? js.distance : 0;
                const inrunLen = this.hill.inrunLength || 98;
                if (tableDistance <= inrunLen * 0.15 && tableDistance > 0) {
                    if (!this._edgeWarningActive) {
                        this._edgeWarningActive = true;
                        this._edgeWarningTime = 0;
                        this._safeAudioCall('playRisingTone');
                    }
                    this._edgeWarningTime += dt;
                }
            } catch (e) {
                console.error('[SkihoppGame] Edge warning error:', e);
            }
        }

        // SCORE -> RESULTS fade transition
        if (this._scoreToResultsFade > 0 && state === GameState.RESULTS) {
            this._scoreToResultsFade = Math.max(0, this._scoreToResultsFade - dt * 2);
        }

        // Wind updates continuously (even on menu for ambient feel)
        if (this.wind) {
            this.wind.update(dt);
        }

        // Feed wind speed into jumper state so physics can use it
        if (!this.jumper) return;
        const jumperState = this.jumper.getState();
        if (this.wind) {
            jumperState.wind = this.wind.isHeadwind()
                ? -this.wind.getSpeed()
                : this.wind.getSpeed();
        }

        // Tutorial during READY state
        if (state === GameState.READY && this._showTutorial && this.tutorialScreen) {
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
            this._countdownScaleAnim = Math.min(1, this._countdownScaleAnim + dt * 3.0);

            if (this._countdownTimer >= COUNTDOWN_DURATION) {
                this.game.setState(GameState.INRUN);
            }
        }

        // Controls and physics only run during active gameplay
        if (state === GameState.INRUN || state === GameState.TAKEOFF ||
            state === GameState.FLIGHT || state === GameState.LANDING) {

            if (this.controls) {
                try {
                    this.controls.update(dt);
                } catch (e) {
                    console.error('[SkihoppGame] controls.update() error:', e);
                }
            }
            if (this.physics) {
                try {
                    this.physics.update(dt);
                } catch (e) {
                    console.error('[SkihoppGame] physics.update() error:', e);
                }
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

        // Combo text timer decay
        if (this._comboTextTimer > 0) {
            this._comboTextTimer -= dt;
        }

        // Post-jump stats overlay timer (shown during SCORE, after judge animation)
        if (state === GameState.SCORE && this._postJumpStats) {
            const judgeAnimDone = this._scoreAnimationTime >= SCORE_ANIMATION_DURATION;
            if (judgeAnimDone) {
                this._postJumpStatsTimer += dt;
                if (this._postJumpStatsTimer >= this._postJumpStatsDuration) {
                    this._postJumpStats = null;
                    this._postJumpStatsTimer = 0;
                    this.game.setState(GameState.RESULTS);
                }
            }
        }

        // Track max height and top speed during active phases
        if (state === GameState.INRUN || state === GameState.TAKEOFF) {
            const spd = this.jumper.getState().speed || 0;
            if (spd > this._trackTopSpeed) this._trackTopSpeed = spd;
        }
        if (state === GameState.FLIGHT) {
            const hag = this.jumper.getState().heightAboveGround || 0;
            if (hag > this._trackMaxHeight) this._trackMaxHeight = hag;
        }

        // Woosh transition animation
        if (this._wooshActive) {
            this._wooshProgress += dt * 2.5;
            if (this._wooshProgress >= 1) {
                this._wooshActive = false;
                this._wooshProgress = 0;
            }
        }

        // --- Transition effects update ---
        const fx = this._transitionEffects;

        // 1. MENU->READY zoom-in (0.5s)
        if (fx.menuToReadyZoom.active) {
            fx.menuToReadyZoom.timer += dt;
            if (fx.menuToReadyZoom.timer >= fx.menuToReadyZoom.duration) {
                fx.menuToReadyZoom.active = false;
            }
        }

        // 3. INRUN->TAKEOFF white HUD flash (0.1s)
        if (fx.takeoffFlash.active) {
            fx.takeoffFlash.timer += dt;
            fx.takeoffFlash.alpha = Math.max(0, 1.0 - fx.takeoffFlash.timer / fx.takeoffFlash.duration);
            if (fx.takeoffFlash.timer >= fx.takeoffFlash.duration) {
                fx.takeoffFlash.active = false;
                fx.takeoffFlash.alpha = 0;
            }
        }

        // 4. TAKEOFF quality text (0.8s scale-in)
        if (fx.takeoffQualityText.active) {
            fx.takeoffQualityText.timer += dt;
            const qt = fx.takeoffQualityText.timer / fx.takeoffQualityText.duration;
            // easeOutBack for scale: overshoot then settle
            if (qt < 0.4) {
                const t2 = qt / 0.4;
                const c1 = 1.70158;
                const c3 = c1 + 1;
                fx.takeoffQualityText.scale = 1 + c3 * Math.pow(t2 - 1, 3) + c1 * Math.pow(t2 - 1, 2);
            } else {
                fx.takeoffQualityText.scale = 1.0;
            }
            if (fx.takeoffQualityText.timer >= fx.takeoffQualityText.duration) {
                fx.takeoffQualityText.active = false;
            }
        }

        // 5. FLIGHT->LANDING impact flash (0.15s)
        if (fx.landingImpactFlash.active) {
            fx.landingImpactFlash.timer += dt;
            fx.landingImpactFlash.alpha = Math.max(0, 1.0 - fx.landingImpactFlash.timer / fx.landingImpactFlash.duration);
            if (fx.landingImpactFlash.timer >= fx.landingImpactFlash.duration) {
                fx.landingImpactFlash.active = false;
                fx.landingImpactFlash.alpha = 0;
            }
        }

        // 6. SCORE->RESULTS crossfade (0.4s)
        if (fx.scoreToResultsCrossfade.active) {
            fx.scoreToResultsCrossfade.timer += dt;
            // alpha goes 0->1 (fade out old) then stays at 1 (new fully visible)
            fx.scoreToResultsCrossfade.alpha = Math.min(1, fx.scoreToResultsCrossfade.timer / fx.scoreToResultsCrossfade.duration);
            if (fx.scoreToResultsCrossfade.timer >= fx.scoreToResultsCrossfade.duration) {
                fx.scoreToResultsCrossfade.active = false;
            }
        }

        // Popup queue processing (achievements & records)
        if (this._currentPopup) {
            this._currentPopup.timer += dt;
            if (this._currentPopup.timer >= this._currentPopup.duration) {
                this._currentPopup = null;
            }
        } else if (this._achievementQueue.length > 0) {
            this._currentPopup = this._achievementQueue.shift();
            this._currentPopup.timer = 0;
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
        if (!this.game) return;
        const state = this.game.getState();
        if (!this.jumper) return;
        const jumperState = this.jumper.getState();

        // --- PREMIUM: Screen shake offset ---
        const shake = this._getShakeOffset();
        const hasShake = shake.x !== 0 || shake.y !== 0;
        if (hasShake) {
            ctx.save();
            ctx.translate(shake.x, shake.y);
        }

        // --- PREMIUM: Slowmo desaturation filter ---
        if (this._slowmoActive) {
            try { ctx.filter = 'saturate(0.7)'; } catch (_e) { /* filter unsupported */ }
        }

        switch (state) {
            case GameState.MENU:
                if (this._menuSubScreen === 'hills') {
                    if (this.hillSelectScreen) {
                        if (this.progression && typeof this.progression.getRecords === 'function') {
                            this.hillSelectScreen.setRecords(this.progression.getRecords());
                        }
                        this.hillSelectScreen.render(ctx, width, height);
                    }
                } else if (this._menuSubScreen === 'stats') {
                    if (this.statsScreen) {
                        const statsData = this.progression && typeof this.progression.getStats === 'function'
                            ? this.progression.getStats()
                            : {};
                        this.statsScreen.render(ctx, width, height, statsData);
                    }
                } else if (this._menuSubScreen === 'settings') {
                    if (this.settingsScreen) {
                        this.settingsScreen.render(ctx, width, height);
                    }
                } else {
                    const menuData = {
                        bestDistance: this._bestDistance,
                        record: this.progression ? this.progression.getRecord(this._currentHillKey) : null,
                        level: this.progression ? this.progression.getLevel() : 1,
                        xp: this.progression ? this.progression.getXP() : 0,
                        xpForNextLevel: this.progression ? this.progression.getXPForNextLevel() : 100,
                        currentHill: this._currentHillKey,
                        hillName: this.hill ? this.hill.name : null,
                        achievements: this.progression ? this.progression.getAchievements() : [],
                    };
                    if (this.menuScreen) {
                        this.menuScreen.render(ctx, width, height, menuData);
                    }
                }
                break;

            case GameState.READY: {
                // MENU->READY zoom-in effect (0.5s)
                const zoomFx = this._transitionEffects.menuToReadyZoom;
                const hasZoom = zoomFx.active;
                if (hasZoom) {
                    const zt = Math.min(1, zoomFx.timer / zoomFx.duration);
                    // Smooth ease-out: zoom from 1.15 -> 1.0
                    const zoomScale = 1.15 - 0.15 * (1 - Math.pow(1 - zt, 3));
                    ctx.save();
                    ctx.translate(width / 2, height / 2);
                    ctx.scale(zoomScale, zoomScale);
                    ctx.translate(-width / 2, -height / 2);
                }
                // Render the 3D scene behind with camera pan progress
                if (this.skihoppRenderer) {
                    this.skihoppRenderer.render(ctx, width, height, jumperState, state, {
                        speed: this._getWindSpeed(),
                        direction: this._getWindDirection(),
                        cameraPan: this._cameraPanActive ? this._cameraPanProgress : 1,
                        cameraResetPan: this._resetCameraPanActive ? this._resetCameraPanProgress : 1,
                    });
                }

                // Show tutorial overlay if active
                if (this._showTutorial && this.tutorialScreen) {
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

                    // Scale: easeOutBack bounce 0 -> ~1.3 -> 1.0
                    const t = this._countdownScaleAnim;
                    // easeOutBack curve: overshoots to ~1.3 then settles to 1.0
                    const c1 = 1.70158;
                    const c3 = c1 + 1;
                    const scale = t < 0.01 ? 0 : (1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2));
                    // Fade: fully visible for first 60%, then fade out
                    const fadeAlpha = t < 0.6 ? 1.0 : Math.max(0, 1.0 - (t - 0.6) / 0.4);

                    ctx.save();
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                    ctx.fillRect(0, 0, width, height);

                    // HOP! screen flash (white)
                    if (this._hopFlashAlpha > 0) {
                        ctx.fillStyle = `rgba(255, 255, 255, ${this._hopFlashAlpha})`;
                        ctx.fillRect(0, 0, width, height);
                    }

                    ctx.translate(width / 2, height / 2);
                    ctx.scale(scale, scale);
                    ctx.globalAlpha = fadeAlpha;

                    if (isHop) {
                        ctx.fillStyle = '#44ff88';
                        ctx.font = 'bold 80px sans-serif';
                    } else {
                        ctx.fillStyle = '#ffffff';
                        ctx.font = 'bold 72px sans-serif';
                    }
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.shadowColor = isHop ? 'rgba(0, 100, 50, 0.8)' : 'rgba(0, 0, 0, 0.6)';
                    ctx.shadowBlur = isHop ? 16 : 8;
                    ctx.fillText(countdownText, 0, 0);
                    ctx.restore();
                }
                if (hasZoom) {
                    ctx.restore();
                }
                break;
            }

            case GameState.INRUN:
            case GameState.TAKEOFF:
            case GameState.FLIGHT:
            case GameState.LANDING: {
                // Render the 3D scene
                if (this.skihoppRenderer) {
                    this.skihoppRenderer.render(ctx, width, height, jumperState, state, {
                        speed: this._getWindSpeed(),
                        direction: this._getWindDirection(),
                    });
                }

                // Edge-approaching warning overlay (pulsing border glow)
                if (this._edgeWarningActive && state === GameState.INRUN) {
                    const pulse = 0.3 + 0.3 * Math.sin(this._edgeWarningTime * 12);
                    ctx.save();
                    ctx.strokeStyle = `rgba(255, 200, 50, ${pulse})`;
                    ctx.lineWidth = 6;
                    ctx.strokeRect(3, 3, width - 6, height - 6);
                    ctx.restore();
                }

                // Perfect takeoff gold flash and "PERFEKT!" text
                if (this._perfectFlashAlpha > 0) {
                    ctx.save();
                    ctx.fillStyle = `rgba(255, 215, 0, ${this._perfectFlashAlpha * 0.5})`;
                    ctx.fillRect(0, 0, width, height);
                    if (this._showPerfektText) {
                        const pt = this._perfectFlashTime;
                        const perfScale = 1.0 + 0.3 * Math.min(1, pt * 4);
                        const perfAlpha = pt < 0.3 ? 1.0 : Math.max(0, 1.0 - (pt - 0.3) / 0.2);
                        ctx.globalAlpha = perfAlpha;
                        ctx.translate(width / 2, height * 0.3);
                        ctx.scale(perfScale, perfScale);
                        ctx.fillStyle = '#FFD700';
                        ctx.font = 'bold 64px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.shadowColor = 'rgba(180, 130, 0, 0.9)';
                        ctx.shadowBlur = 20;
                        ctx.fillText('PERFEKT!', 0, 0);
                    }
                    ctx.restore();
                }

                // INRUN->TAKEOFF white HUD flash (0.1s)
                if (this._transitionEffects.takeoffFlash.active) {
                    ctx.save();
                    ctx.globalAlpha = this._transitionEffects.takeoffFlash.alpha * 0.7;
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, width, height);
                    ctx.restore();
                }

                // Takeoff quality text ("PERFEKT!" / "BRA!" / "OK") centered with scale-in
                if (this._transitionEffects.takeoffQualityText.active) {
                    const qfx = this._transitionEffects.takeoffQualityText;
                    const qAlpha = qfx.timer < 0.5 ? 1.0 : Math.max(0, 1.0 - (qfx.timer - 0.5) / 0.3);
                    ctx.save();
                    ctx.globalAlpha = qAlpha;
                    ctx.translate(width / 2, height * 0.35);
                    ctx.scale(qfx.scale, qfx.scale);
                    ctx.fillStyle = qfx.color;
                    ctx.font = 'bold 60px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
                    ctx.shadowBlur = 16;
                    ctx.fillText(qfx.text, 0, 0);
                    ctx.restore();
                }

                // FLIGHT->LANDING impact flash
                if (this._transitionEffects.landingImpactFlash.active) {
                    ctx.save();
                    ctx.globalAlpha = this._transitionEffects.landingImpactFlash.alpha * 0.6;
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, width, height);
                    ctx.restore();
                }

                // Overlay the HUD
                // During flight/landing, show surface distance from takeoff
                // During inrun, distance is remaining-to-table (not useful for display)
                let displayDistance = 0;
                if (state === GameState.FLIGHT || state === GameState.TAKEOFF) {
                    displayDistance = (this.hill && this.hill.getSurfaceDistanceAtX)
                        ? this.hill.getSurfaceDistanceAtX(Math.max(0, jumperState.x))
                        : jumperState.x;
                } else if (state === GameState.LANDING) {
                    displayDistance = jumperState.landingDistance;
                }
                if (this.hud) {
                this.hud.render(ctx, width, height, {
                    speed: jumperState.speed,
                    distance: displayDistance,
                    bodyAngle: jumperState.bodyAngle,
                    windSpeed: this._getWindSpeed(),
                    windDirection: this._getWindDirection(),
                    phase: state,
                    takeoffQuality: jumperState.takeoffQuality,
                    landingQuality: jumperState.landingQuality,
                    kPoint: (this.hill && this.hill.kPoint) || 0,
                    feedback: this.game.feedback || {},
                    heightAboveGround: jumperState.heightAboveGround || 0,
                    isTucked: jumperState.isTucked || false,
                    edgeWarning: this._edgeWarningActive && state === GameState.INRUN,
                    edgeWarningPulse: this._edgeWarningActive ? Math.sin(this._edgeWarningTime * 12) : 0,
                });
                }

                // Landing: show distance text during the 1.5s hold period
                if (state === GameState.LANDING && jumperState.landingDistance > 0) {
                    const holdAlpha = Math.min(1, this._landingTimer * 2);
                    ctx.save();
                    ctx.globalAlpha = holdAlpha;
                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 56px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
                    ctx.shadowBlur = 10;
                    ctx.fillText(
                        `${jumperState.landingDistance.toFixed(1)} m`,
                        width / 2, height * 0.35
                    );
                    ctx.restore();
                }
                break;
            }

            case GameState.SCORE:
                // Frozen scene behind the score overlay
                if (this.skihoppRenderer) {
                    this.skihoppRenderer.render(ctx, width, height, jumperState, state, {
                        speed: this._getWindSpeed(),
                        direction: this._getWindDirection(),
                    });
                }

                // JudgeDisplay._renderBackground provides its own dim overlay,
                // so no additional dimming is needed here.

                // Judge display with animation
                if (this._scoreResult && this.judgeDisplay) {
                    const progress = Math.min(1, this._scoreAnimationTime / SCORE_ANIMATION_DURATION);
                    this.judgeDisplay.render(ctx, width, height, {
                        judges: this._scoreResult.judges,
                        distancePoints: this._scoreResult.distancePoints,
                        stylePoints: this._scoreResult.stylePoints,
                        windComp: this._scoreResult.windCompensation,
                        totalPoints: this._scoreResult.totalPoints,
                        distance: this._scoreResult.distance,
                        kPoint: (this.hill && this.hill.kPoint) || 120,
                        hillName: (this.hill && this.hill.name) || 'Storbakke',
                        rating: this._scoreResult.rating,
                        ratingTier: this._scoreResult.ratingTier,
                        bestDistance: this._bestDistance,
                        animationProgress: progress,
                    });
                }
                break;

            case GameState.RESULTS: {
                if (!this.scoreboard) break;

                // SCORE -> RESULTS smooth crossfade (0.4s)
                // During crossfade, render the score screen at fading-out opacity behind
                const cfx = this._transitionEffects.scoreToResultsCrossfade;
                if (cfx.active && this._scoreResult && this.judgeDisplay) {
                    const fadeOutAlpha = 1.0 - cfx.alpha;
                    ctx.save();
                    ctx.globalAlpha = fadeOutAlpha;
                    // Draw the frozen score scene behind
                    if (this.skihoppRenderer) {
                        this.skihoppRenderer.render(ctx, width, height, jumperState, state, {
                            speed: this._getWindSpeed(),
                            direction: this._getWindDirection(),
                        });
                    }
                    this.judgeDisplay.render(ctx, width, height, {
                        judges: this._scoreResult.judges,
                        distancePoints: this._scoreResult.distancePoints,
                        stylePoints: this._scoreResult.stylePoints,
                        windComp: this._scoreResult.windCompensation,
                        totalPoints: this._scoreResult.totalPoints,
                        distance: this._scoreResult.distance,
                        kPoint: (this.hill && this.hill.kPoint) || 120,
                        hillName: (this.hill && this.hill.name) || 'Storbakke',
                        rating: this._scoreResult.rating,
                        ratingTier: this._scoreResult.ratingTier,
                        bestDistance: this._bestDistance,
                        animationProgress: 1,
                    });
                    ctx.restore();
                }

                // Draw the results scoreboard (fades in during crossfade)
                const resultsAlpha = cfx.active ? cfx.alpha : 1.0;
                ctx.save();
                ctx.globalAlpha = resultsAlpha;
                // Find the index of the latest jump (tagged with _latest)
                const latestIdx = this._jumpResults.findIndex(j => j._latest);
                this.scoreboard.render(ctx, width, height, {
                    jumps: this._jumpResults,
                    currentJumper: latestIdx >= 0 ? latestIdx : this._jumpResults.length - 1,
                });
                ctx.restore();

                // Legacy SCORE -> RESULTS black fade overlay (kept for backward compat)
                if (this._scoreToResultsFade > 0 && !cfx.active) {
                    ctx.save();
                    ctx.globalAlpha = this._scoreToResultsFade;
                    ctx.fillStyle = '#000000';
                    ctx.fillRect(0, 0, width, height);
                    ctx.restore();
                }
            }
                break;

            default:
                break;
        }

        // --- PREMIUM: Reset slowmo filter ---
        if (this._slowmoActive) {
            try { ctx.filter = 'none'; } catch (_e) { /* unsupported */ }
        }

        // --- PREMIUM: Close screen shake translation ---
        if (hasShake) {
            ctx.restore();
        }

        // --- PREMIUM: Slow-mo indicator text ---
        if (this._slowmoTextAlpha > 0) {
            ctx.save();
            ctx.globalAlpha = this._slowmoTextAlpha * 0.8;
            ctx.fillStyle = '#88ccff';
            ctx.font = 'bold 18px sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'top';
            ctx.shadowColor = 'rgba(50, 120, 200, 0.7)';
            ctx.shadowBlur = 8;
            ctx.fillText('SLOW-MO', width - 20, 20);
            ctx.restore();
        }

        // --- PREMIUM: Combo streak text ---
        this._renderComboText(ctx, width, height);

        // --- PREMIUM: Post-jump stats overlay ---
        if (state === GameState.SCORE && this._postJumpStats) {
            this._renderPostJumpStats(ctx, width, height);
        }

        // --- PREMIUM: Woosh transition ---
        this._renderWooshTransition(ctx, width, height);

        // Fade transition overlay
        if (this._fadeAlpha > 0) {
            ctx.save();
            ctx.globalAlpha = this._fadeAlpha;
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
        }

        // Transition effects overlay (drawn on top of everything)
        this._renderTransitionEffects(ctx, width, height);

        // Achievement and record popups (drawn on top of everything)
        this._renderPopup(ctx, width, height);
    }

    // ------------------------------------------------------------------
    // State change handler (called by Game state machine)
    // ------------------------------------------------------------------

    /**
     * @param {string} newState - new GameState value
     * @param {string} prevState - previous GameState value
     */
    onStateChange(newState, prevState) {
        if (!this.jumper) return;
        const jumperState = this.jumper.getState();

        switch (newState) {
            case GameState.READY: {
                // Button click feedback when user initiates a jump
                if (prevState === GameState.MENU || prevState === GameState.RESULTS) {
                    this._safeAudioCall('playButtonClick');
                }

                // Quick restart: minimal fade for replays, full fade from menu
                const isRestart = prevState === GameState.RESULTS || prevState === GameState.SCORE;
                this._fadeAlpha = isRestart ? 0.4 : 1;

                // Fast reset of all game systems
                this.jumper.reset(this.hill);
                if (this.physics) this.physics.reset();
                this._resetFlightTracking();
                this._countdownTimer = 0;
                this._landingTimer = 0;
                this._scoreResult = null;
                this._scoreAnimationTime = 0;
                this._landingHoldTime = 0;
                this._landingDistanceShown = false;
                this._scoreToResultsFade = 0;
                this._edgeWarningActive = false;
                this._edgeWarningTime = 0;

                // --- PREMIUM: Reset per-jump tracking ---
                this._trackMaxHeight = 0;
                this._trackTopSpeed = 0;
                this._trackFlightStartTime = 0;
                this._trackFlightEndTime = 0;
                this._shakes = [];
                this._postJumpStats = null;
                this._postJumpStatsTimer = 0;

                // --- PREMIUM: Woosh transition on restart ---
                if (prevState === GameState.RESULTS || prevState === GameState.SCORE) {
                    this._wooshActive = true;
                    this._wooshProgress = 0;
                }

                // Show tutorial only before the very first jump
                if (!this._tutorialShown && this.tutorialScreen) {
                    this._showTutorial = true;
                    this.tutorialScreen.reset();
                }
                // Never re-show tutorial on restart

                // Smooth camera pan: full pan from overview on menu, quick reset on restart
                if (isRestart) {
                    this._resetCameraPanActive = true;
                    this._resetCameraPanProgress = 0.4; // start partway for speed
                } else {
                    // MENU -> READY: smooth camera pan from overview to inrun top
                    this._cameraPanActive = true;
                    this._cameraPanProgress = 0;
                    // MENU -> READY: zoom-in animation (0.5s)
                    this._transitionEffects.menuToReadyZoom.active = true;
                    this._transitionEffects.menuToReadyZoom.timer = 0;
                }






                // Stop wind sound from previous run
                this._safeAudioCall('stopWind');
                // Stop menu music when leaving menu
                this._safeAudioCall('stopMenuMusic');
                break;
            }

            case GameState.INRUN:
                // Start replay recording
                if (this.replay && typeof this.replay.startRecording === 'function') {
                    this.replay.startRecording();
                }

                // Brief fade from countdown to inrun (not full black — countdown already faded)
                this._fadeAlpha = Math.min(this._fadeAlpha, 0.3);

                // Run has started - play ambient sounds
                if (this.wind) {
                    this._safeAudioCall('playWind', this.wind.getSpeed() / 4);
                }
                break;

            case GameState.TAKEOFF:
                // Clear edge warning state
                this._edgeWarningActive = false;
                this._edgeWarningTime = 0;
                // Swoosh sound at the table edge
                this._safeAudioCall('playSwoosh');
                // --- PREMIUM: Screen shake on takeoff ---
                this._addShake(3, 0.2);
                // INRUN->TAKEOFF: brief white HUD flash (0.1s warning)
                this._transitionEffects.takeoffFlash.active = true;
                this._transitionEffects.takeoffFlash.timer = 0;
                this._transitionEffects.takeoffFlash.alpha = 1.0;
                break;

            case GameState.FLIGHT: {
                // Takeoff quality text with tiered feedback
                const toq = jumperState.takeoffQuality || 0;
                if (toq > 0.9) {
                    // Perfect takeoff flash (quality > 0.9)
                    this._perfectFlashAlpha = 1.0;
                    this._perfectFlashTime = 0;
                    this._perfectFlashTimer = 0;
                    this._showPerfektText = true;
                    this._safeAudioCall('playPerfectTakeoff');
                    // --- PREMIUM: Perfect timing shake ---
                    this._addShake(2, 0.15);
                    // Quality text: "PERFEKT!" in gold
                    this._transitionEffects.takeoffQualityText.active = true;
                    this._transitionEffects.takeoffQualityText.timer = 0;
                    this._transitionEffects.takeoffQualityText.scale = 0;
                    this._transitionEffects.takeoffQualityText.text = 'PERFEKT!';
                    this._transitionEffects.takeoffQualityText.color = '#FFD700';
                } else if (toq > 0.6) {
                    // Good takeoff: "BRA!" in green
                    this._transitionEffects.takeoffQualityText.active = true;
                    this._transitionEffects.takeoffQualityText.timer = 0;
                    this._transitionEffects.takeoffQualityText.scale = 0;
                    this._transitionEffects.takeoffQualityText.text = 'BRA!';
                    this._transitionEffects.takeoffQualityText.color = '#44ff88';
                } else {
                    // Acceptable takeoff: "OK" in white
                    this._transitionEffects.takeoffQualityText.active = true;
                    this._transitionEffects.takeoffQualityText.timer = 0;
                    this._transitionEffects.takeoffQualityText.scale = 0;
                    this._transitionEffects.takeoffQualityText.text = 'OK';
                    this._transitionEffects.takeoffQualityText.color = '#ffffff';
                }
                // --- PREMIUM: Record flight start time ---
                this._trackFlightStartTime = performance.now();
                break;
            }

            case GameState.LANDING:
                // Stop replay recording
                if (this.replay && typeof this.replay.stopRecording === 'function') {
                    this.replay.stopRecording();
                }

                // FLIGHT->LANDING: brief white screen flash on impact
                this._transitionEffects.landingImpactFlash.active = true;
                this._transitionEffects.landingImpactFlash.timer = 0;
                this._transitionEffects.landingImpactFlash.alpha = 1.0;

                // Finalise flight stability on jumper state
                jumperState.flightStability = this._calculateFinalStability();

                // --- PREMIUM: Record flight end time ---
                this._trackFlightEndTime = performance.now();

                // Track best distance and mark new records
                {
                    const prevBestForRecord = this._bestDistance;
                    if (jumperState.landingDistance > this._bestDistance) {
                        this._bestDistance = jumperState.landingDistance;
                    }
                    // Flag for renderer particle celebration (first jump cannot be a "record")
                    jumperState.isNewRecord = prevBestForRecord > 0 && jumperState.landingDistance > prevBestForRecord;
                }

                // --- PREMIUM: Screen shake on landing ---
                {
                    const landQ = jumperState.landingQuality || 0;
                    if (landQ > 0.7) {
                        this._addShake(4, 0.3);   // good landing
                    } else {
                        this._addShake(8, 0.5);   // hard landing
                    }
                }

                // --- PREMIUM: Combo / streak system ---
                {
                    const kPt = (this.hill && this.hill.kPoint) || 120;
                    if (jumperState.landingDistance >= kPt) {
                        this._comboCount++;
                        if (this._comboCount >= 2) {
                            this._comboTextValue = this._comboCount;
                            this._comboTextTimer = 2.0;
                        }
                    } else {
                        this._comboCount = 0;
                    }
                }

                // Stop slide (safety), play landing thud + crowd eruption
                this._safeAudioCall('stopInrunSlide');
                this._safeAudioCall('playLanding', jumperState.landingQuality);
                // Crowd eruption: louder for longer jumps
                {
                    const landDist = jumperState.landingDistance || 0;
                    const kPt = (this.hill && this.hill.kPoint) || 120;
                    const cheerIntensity = Math.min(1.0, 0.3 + 0.7 * (landDist / kPt));
                    this._safeAudioCall('playCrowdCheer', cheerIntensity);
                }
                break;

            case GameState.SCORE:
                // Stop wind sound when leaving active phases
                this._safeAudioCall('stopWind');

                // Calculate score
                this._scoreResult = this.scoringSystem ? this.scoringSystem.calculateScore({
                    distance: jumperState.landingDistance,
                    takeoffQuality: jumperState.takeoffQuality,
                    flightStability: jumperState.flightStability,
                    landingQuality: jumperState.landingQuality,
                    windSpeed: this._getWindSpeed(),
                    windDirection: this._getWindDirection(),
                    gate: this.hill ? this.hill.defaultGate : 20,
                }) : null;

                this._scoreAnimationTime = 0;

                // --- PREMIUM: Build post-jump stats ---
                {
                    const flightMs = this._trackFlightEndTime - this._trackFlightStartTime;
                    const flightTime = Math.max(0, flightMs / 1000);
                    const stats = {
                        maxHeight: this._trackMaxHeight,
                        topSpeed: this._trackTopSpeed,
                        flightTime: flightTime,
                    };
                    this._postJumpStats = stats;
                    this._postJumpStatsTimer = 0;
                    // Update personal bests
                    if (stats.maxHeight > this._personalBests.maxHeight) this._personalBests.maxHeight = stats.maxHeight;
                    if (stats.topSpeed > this._personalBests.topSpeed) this._personalBests.topSpeed = stats.topSpeed;
                    if (stats.flightTime > this._personalBests.flightTime) this._personalBests.flightTime = stats.flightTime;
                }

                // Progression tracking
                if (this.progression && this._scoreResult) {
                    this.progression.addJump(
                        this._currentHillKey,
                        jumperState.landingDistance,
                        this._scoreResult.totalPoints,
                        jumperState.landingQuality
                    );
                    // --- PREMIUM: Combo XP bonus ---
                    let xpMultiplier = 1.0;
                    if (this._comboCount >= 3) {
                        xpMultiplier = 1.0 + (this._comboCount - 1) * 0.1;
                    }
                    this.progression.addXP(this._scoreResult.totalPoints * 0.5 * xpMultiplier);
                    // Store combo in progression if supported
                    if (this._comboCount >= 2 && typeof this.progression.setStreak === 'function') {
                        this.progression.setStreak(this._comboCount);
                    }
                    const newUnlocks = this.progression.checkUnlocks();
                    const newAchievements = this.progression.checkAchievements({
                        distance: jumperState.landingDistance,
                        points: this._scoreResult.totalPoints,
                        hillKey: this._currentHillKey,
                        landingQuality: jumperState.landingQuality,
                        takeoffQuality: jumperState.takeoffQuality,
                        styleScore: this._scoreResult.stylePoints,
                        windSpeed: this._scoreResult.windSpeed,
                    });
                    this._newUnlocks = newUnlocks;
                    this._newAchievements = newAchievements;

                    // Queue new achievements for popup notifications
                    if (this._newAchievements && this._newAchievements.length > 0) {
                        for (const a of this._newAchievements) {
                            const emoji = a.icon || a.emoji || '\u2B50';
                            const label = a.name || a.title || 'Prestasjon';
                            this._showPopup(
                                `${emoji} ${label}`,
                                a.description || '',
                                'achievement',
                                2.5
                            );
                        }
                        // Play achievement chime for new unlocks
                        this._safeAudioCall('playAchievement');
                    }
                }

                // Check for new distance record and trigger record popup
                {
                    const prevBest = this._bestDistance;
                    // _bestDistance was already updated in LANDING, so check if
                    // the current landing distance matches the new best
                    if (jumperState.landingDistance >= prevBest && jumperState.landingDistance > 0) {
                        this._showPopup(
                            'NY REKORD!',
                            `${jumperState.landingDistance.toFixed(1)} m`,
                            'record',
                            3.0
                        );
                        // Play new record arpeggio
                        this._safeAudioCall('playNewRecord');
                    }
                }

                // Audio effects for score reveal
                this._safeAudioCall('playJudgeReveal');
                this._safeAudioCall('playCrowdCheer',
                    (this._scoreResult && this._scoreResult.totalPoints > 120) ? 1.0 : 0.5
                );
                // Smooth fade transition from SCORE -> RESULTS
                this._scoreToResultsFade = 1.0;

                break;

            case GameState.RESULTS:
                // Button click feedback when advancing to results
                this._safeAudioCall('playButtonClick');

                // SCORE->RESULTS: smooth crossfade (0.4s)
                this._transitionEffects.scoreToResultsCrossfade.active = true;
                this._transitionEffects.scoreToResultsCrossfade.timer = 0;
                this._transitionEffects.scoreToResultsCrossfade.alpha = 0;

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

                // Reset scoreboard scroll so buttons are visible immediately
                if (this.scoreboard) {
                    this.scoreboard.scrollOffset = 0;
                    this.scoreboard._scrollVelocity = 0;
                }

                // Fanfare for good scores
                if (this._scoreResult && this._scoreResult.totalPoints > 130) {
                    this._safeAudioCall('playFanfare');
                }
                break;

            case GameState.MENU:
                // Button click feedback when returning to menu
                if (prevState === GameState.RESULTS || prevState === GameState.SCORE) {
                    this._safeAudioCall('playButtonClick');
                }

                // Full reset when returning to menu
                this.jumper.reset(this.hill);
                if (this.physics) this.physics.reset();
                this._resetFlightTracking();
                this._countdownTimer = 0;
                this._landingTimer = 0;
                this._scoreResult = null;
                this._scoreAnimationTime = 0;

                // Reset sub-screen navigation to main menu
                this._menuSubScreen = null;

                // Stop all looping audio
                this._safeAudioCall('stopWind');
                this._safeAudioCall('stopInrunSlide');
                this._safeAudioCall('stopCrowdAmbience');

                // Start menu music
                this._safeAudioCall('playMenuMusic');
                break;

            default:
                break;
        }
    }

    // ------------------------------------------------------------------
    // Popup notification system (achievements & records)
    // ------------------------------------------------------------------

    /**
     * Queue a popup notification. If one is already showing, it waits in
     * the queue and appears after the current popup finishes.
     * @param {string} text    - main line (e.g. emoji + achievement name)
     * @param {string} subtext - secondary line (description or distance)
     * @param {'achievement'|'record'} type
     * @param {number} duration - total display time in seconds
     */
    _showPopup(text, subtext, type, duration) {
        const popup = { text, subtext, type, timer: 0, duration };
        if (this._currentPopup) {
            this._achievementQueue.push(popup);
        } else {
            this._currentPopup = popup;
        }
    }

    /**
     * Render all active transition effects on top of the scene.
     * Called at the end of render() so effects overlay everything.
     */
    _renderTransitionEffects(ctx, width, height) {
        const fx = this._transitionEffects;

        // The individual effects (takeoffFlash, qualityText, landingImpactFlash)
        // are rendered inline within their respective state blocks for proper
        // layering with the HUD. This method handles any global overlay effects
        // that should appear on top of absolutely everything.

        // No additional global overlays needed currently — each effect is
        // rendered in context. This method serves as an extension point for
        // future global transition effects.
    }

    /**
     * Render the current popup notification at the top of the screen.
     * Slides down from above over 0.3 s, holds, then slides back up
     * over the last 0.3 s. Semi-transparent so gameplay remains visible.
     */
    _renderPopup(ctx, width, height) {
        const p = this._currentPopup;
        if (!p) return;

        const slideIn = 0.3;
        const slideOut = 0.3;
        const t = p.timer;
        const d = p.duration;
        const isRecord = p.type === 'record';

        // Panel dimensions
        const panelW = isRecord ? Math.min(420, width * 0.65) : Math.min(340, width * 0.55);
        const panelH = isRecord ? 72 : 54;
        const panelX = (width - panelW) / 2;
        const restY = 20; // resting position (fully visible)
        const hideY = -panelH - 10; // offscreen above

        // Compute current Y via slide-in / hold / slide-out
        let panelY;
        if (t < slideIn) {
            // Slide in
            const frac = t / slideIn;
            panelY = hideY + (restY - hideY) * frac;
        } else if (t > d - slideOut) {
            // Slide out
            const frac = (t - (d - slideOut)) / slideOut;
            panelY = restY + (hideY - restY) * frac;
        } else {
            panelY = restY;
        }

        ctx.save();

        if (isRecord) {
            // --- Record popup: gold background ---
            ctx.globalAlpha = 0.92;
            // Gold fill
            ctx.fillStyle = '#FFD700';
            ctx.strokeStyle = '#B8860B';
            ctx.lineWidth = 3;
            const r = 12;
            ctx.beginPath();
            ctx.moveTo(panelX + r, panelY);
            ctx.lineTo(panelX + panelW - r, panelY);
            ctx.quadraticCurveTo(panelX + panelW, panelY, panelX + panelW, panelY + r);
            ctx.lineTo(panelX + panelW, panelY + panelH - r);
            ctx.quadraticCurveTo(panelX + panelW, panelY + panelH, panelX + panelW - r, panelY + panelH);
            ctx.lineTo(panelX + r, panelY + panelH);
            ctx.quadraticCurveTo(panelX, panelY + panelH, panelX, panelY + panelH - r);
            ctx.lineTo(panelX, panelY + r);
            ctx.quadraticCurveTo(panelX, panelY, panelX + r, panelY);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Main text
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#4a2800';
            ctx.font = 'bold 26px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(255,255,255,0.5)';
            ctx.shadowBlur = 4;
            ctx.fillText(p.text, width / 2, panelY + panelH * 0.36);
            // Subtext (distance)
            ctx.font = 'bold 20px sans-serif';
            ctx.fillStyle = '#6b3a00';
            ctx.shadowBlur = 0;
            ctx.fillText(p.subtext, width / 2, panelY + panelH * 0.7);
        } else {
            // --- Achievement popup: dark panel with gold border ---
            ctx.globalAlpha = 0.88;
            ctx.fillStyle = 'rgba(30, 30, 40, 0.92)';
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 2;
            const r = 10;
            ctx.beginPath();
            ctx.moveTo(panelX + r, panelY);
            ctx.lineTo(panelX + panelW - r, panelY);
            ctx.quadraticCurveTo(panelX + panelW, panelY, panelX + panelW, panelY + r);
            ctx.lineTo(panelX + panelW, panelY + panelH - r);
            ctx.quadraticCurveTo(panelX + panelW, panelY + panelH, panelX + panelW - r, panelY + panelH);
            ctx.lineTo(panelX + r, panelY + panelH);
            ctx.quadraticCurveTo(panelX, panelY + panelH, panelX, panelY + panelH - r);
            ctx.lineTo(panelX, panelY + r);
            ctx.quadraticCurveTo(panelX, panelY, panelX + r, panelY);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Main text (emoji + name)
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 18px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0,0,0,0.6)';
            ctx.shadowBlur = 4;
            ctx.fillText(p.text, width / 2, panelY + (p.subtext ? panelH * 0.36 : panelH * 0.5));
            // Subtext (description)
            if (p.subtext) {
                ctx.font = '14px sans-serif';
                ctx.fillStyle = '#cccccc';
                ctx.shadowBlur = 0;
                ctx.fillText(p.subtext, width / 2, panelY + panelH * 0.7);
            }
        }

        ctx.restore();
    }

    // ------------------------------------------------------------------
    // Screen shake system
    // ------------------------------------------------------------------

    _addShake(intensity, duration) {
        this._shakes.push({ intensity, duration, elapsed: 0 });
    }

    _updateShakes(dt) {
        for (let i = this._shakes.length - 1; i >= 0; i--) {
            this._shakes[i].elapsed += dt;
            if (this._shakes[i].elapsed >= this._shakes[i].duration) {
                this._shakes.splice(i, 1);
            }
        }
    }

    _getShakeOffset() {
        let sx = 0, sy = 0;
        for (const s of this._shakes) {
            const remaining = 1 - s.elapsed / s.duration;
            const mag = s.intensity * remaining;
            sx += (Math.random() * 2 - 1) * mag;
            sy += (Math.random() * 2 - 1) * mag;
        }
        return { x: sx, y: sy };
    }

    // ------------------------------------------------------------------
    // Post-jump stats overlay
    // ------------------------------------------------------------------

    _renderPostJumpStats(ctx, width, height) {
        const stats = this._postJumpStats;
        if (!stats) return;

        const t = this._postJumpStatsTimer;
        const d = this._postJumpStatsDuration;
        let alpha;
        if (t < 0.4) alpha = t / 0.4;
        else if (t > d - 0.4) alpha = Math.max(0, (d - t) / 0.4);
        else alpha = 1;

        ctx.save();
        ctx.globalAlpha = alpha;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, width, height);

        const panelW = Math.min(400, width * 0.8);
        const panelH = 260;
        const px = (width - panelW) / 2;
        const py = (height - panelH) / 2;

        ctx.fillStyle = 'rgba(20, 25, 40, 0.95)';
        ctx.strokeStyle = '#4488ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(px, py, panelW, panelH, 12);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#4488ff';
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('HOPPSTATISTIKK', width / 2, py + 30);

        const rows = [
            { label: 'Maks h\u00f8yde', value: `${stats.maxHeight.toFixed(1)} m`, best: this._personalBests.maxHeight, key: 'maxHeight' },
            { label: 'Toppfart', value: `${stats.topSpeed.toFixed(1)} km/t`, best: this._personalBests.topSpeed, key: 'topSpeed' },
            { label: 'Flygetid', value: `${stats.flightTime.toFixed(2)} s`, best: this._personalBests.flightTime, key: 'flightTime' },
        ];

        const startY = py + 70;
        const rowH = 52;
        for (let i = 0; i < rows.length; i++) {
            const ry = startY + i * rowH;
            const r = rows[i];
            const isNewBest = r.key === 'maxHeight' ? stats.maxHeight > r.best
                : r.key === 'topSpeed' ? stats.topSpeed > r.best
                : stats.flightTime > r.best;

            ctx.fillStyle = '#aabbcc';
            ctx.font = '16px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(r.label, px + 24, ry);

            ctx.fillStyle = isNewBest ? '#FFD700' : '#ffffff';
            ctx.font = 'bold 22px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(r.value, px + panelW - 24, ry);

            const bestVal = r.key === 'flightTime' ? r.best.toFixed(2) + ' s'
                : r.key === 'topSpeed' ? r.best.toFixed(1) + ' km/t'
                : r.best.toFixed(1) + ' m';
            ctx.fillStyle = isNewBest ? '#FFD700' : '#667788';
            ctx.font = '13px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(isNewBest ? 'NY PERS!' : `Pers: ${bestVal}`, px + panelW - 24, ry + 20);
        }

        ctx.restore();
    }

    // ------------------------------------------------------------------
    // Combo / streak rendering
    // ------------------------------------------------------------------

    _renderComboText(ctx, width, height) {
        if (this._comboTextTimer <= 0 || this._comboTextValue < 2) return;

        const t = this._comboTextTimer;
        const alpha = t < 0.5 ? t / 0.5 : (t > 1.5 ? Math.max(0, (2 - t) / 0.5) : 1);
        const scale = 1 + 0.2 * Math.sin(t * 6);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(width / 2, height * 0.22);
        ctx.scale(scale, scale);

        ctx.fillStyle = '#ff8844';
        ctx.font = 'bold 36px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(255, 100, 0, 0.6)';
        ctx.shadowBlur = 12;

        let text = `Streak x${this._comboTextValue}!`;
        if (this._comboTextValue >= 3) {
            text += ` +${(this._comboTextValue - 1) * 10}% XP`;
        }
        ctx.fillText(text, 0, 0);
        ctx.restore();
    }

    // ------------------------------------------------------------------
    // Woosh transition rendering
    // ------------------------------------------------------------------

    _renderWooshTransition(ctx, width, height) {
        if (!this._wooshActive) return;
        const p = this._wooshProgress;

        ctx.save();
        const bandWidth = width * 0.35;
        const leadEdge = p * (width + bandWidth * 2) - bandWidth;

        ctx.fillStyle = '#0a0e1a';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.max(0, leadEdge - bandWidth), 0);
        ctx.lineTo(Math.max(0, leadEdge - bandWidth - 40), height);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.fill();

        if (leadEdge > 0 && leadEdge - bandWidth < width) {
            const grad = ctx.createLinearGradient(
                leadEdge - bandWidth, 0, leadEdge, 0
            );
            grad.addColorStop(0, 'rgba(10, 14, 26, 0)');
            grad.addColorStop(0.3, 'rgba(40, 80, 160, 0.4)');
            grad.addColorStop(0.5, 'rgba(80, 140, 255, 0.6)');
            grad.addColorStop(0.7, 'rgba(40, 80, 160, 0.4)');
            grad.addColorStop(1, 'rgba(10, 14, 26, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(leadEdge - bandWidth, 0, bandWidth, height);
        }

        ctx.restore();
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
        if (!this._audio || !this.jumper || !this.hill) return;

        const jumperState = this.jumper.getState();
        const kPoint = this.hill.kPoint || 120;

        // --- INRUN: continuous slide sound scaling with speed, light wind ---
        if (state === GameState.INRUN) {
            const speedNorm = Math.min(1, (jumperState.speed || 0) / 90);
            this._safeAudioCall('playInrunSlide', speedNorm);
            this._safeAudioCall('playWind', speedNorm * 0.3);
        }

        // --- TAKEOFF: swoosh already triggered in onStateChange;
        //     brief dramatic pause -- kill slide + reduce wind to near-silence ---
        if (state === GameState.TAKEOFF) {
            this._safeAudioCall('stopInrunSlide');
            this._safeAudioCall('playWind', 0.05);
        }

        // --- FLIGHT: wind + crowd ambience building with distance ---
        if (state === GameState.FLIGHT) {
            const flightDistance = Math.max(0, jumperState.x);
            const distRatio = flightDistance / kPoint;
            // Wind intensity ramps up with flight speed
            const windIntensity = Math.min(1.0, (jumperState.speed || 0) / 100);
            this._safeAudioCall('playWind', windIntensity);
            // Crowd ambience builds from quiet murmur to roar as distance grows
            const crowdIntensity = Math.min(1.0, 0.1 + 0.9 * distRatio);
            this._safeAudioCall('playCrowdAmbience', crowdIntensity);
        }

        // --- LANDING: wind fades, crowd erupts proportional to distance ---
        if (state === GameState.LANDING) {
            // Fade wind down over the landing-to-score delay
            const landingFade = Math.max(0, 1.0 - this._landingTimer / LANDING_TO_SCORE_DELAY);
            this._safeAudioCall('playWind', landingFade * 0.3);
            // Crowd eruption: louder for longer jumps
            const landingDist = jumperState.landingDistance || 0;
            const crowdIntensity = Math.min(1.0, 0.3 + 0.7 * (landingDist / kPoint));
            this._safeAudioCall('playCrowdAmbience', crowdIntensity);
        }

        // --- SCORE: timed judge reveal dings matching animation progress ---
        if (state === GameState.SCORE && this._scoreResult) {
            const judgeCount = this._scoreResult.judges ? this._scoreResult.judges.length : 5;
            const progress = Math.min(1, this._scoreAnimationTime / SCORE_ANIMATION_DURATION);
            // Each judge ding fires once as progress crosses its threshold
            for (let i = 0; i < judgeCount; i++) {
                const threshold = (i + 1) / (judgeCount + 1);
                const prevProgress = Math.min(1, Math.max(0, this._scoreAnimationTime - (1 / 60)) / SCORE_ANIMATION_DURATION);
                if (prevProgress < threshold && progress >= threshold) {
                    this._safeAudioCall('playJudgeReveal');
                }
            }
        }

        // --- MENU: stop all ambient sounds ---
        if (state === GameState.MENU) {
            this._safeAudioCall('stopWind');
            this._safeAudioCall('stopInrunSlide');
            this._safeAudioCall('stopCrowdAmbience');
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

    /** Safe wind speed accessor — returns 0 if wind is unavailable. */
    _getWindSpeed() {
        return this.wind ? this.wind.getSpeed() : 0;
    }

    /** Safe wind direction accessor — returns 0 if wind is unavailable. */
    _getWindDirection() {
        return this.wind ? this.wind.getDirection() : 0;
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
        if (this.jumper) {
            this.physics = new SkihoppPhysics(this.game, this.hill, this.jumper.getState());
        }
        this.scoringSystem = new ScoringSystem(hillConfig);
        if (this.skihoppRenderer && typeof this.skihoppRenderer.setHill === 'function') {
            this.skihoppRenderer.setHill(this.hill);
        }

        // Reset jumper on new hill
        if (this.jumper) this.jumper.reset(this.hill);
        if (this.physics) this.physics.reset();
    }

    // ------------------------------------------------------------------
    // Cleanup
    // ------------------------------------------------------------------

    destroy() {
        if (this.controls) {
            this.controls.destroy();
        }

        // Stop all looping audio before nulling references
        this._safeAudioCall('stopWind');
        this._safeAudioCall('stopInrunSlide');
        this._safeAudioCall('stopCrowdAmbience');
        this._safeAudioCall('stopMenuMusic');

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
        this._achievementQueue = [];
        this._currentPopup = null;
        this.hillSelectScreen = null;
        this.statsScreen = null;
        this.settingsScreen = null;

        // PREMIUM cleanup
        this._shakes = [];
        this._comboCount = 0;
        this._comboTextTimer = 0;
        this._postJumpStats = null;
        this._wooshActive = false;
        this._wooshProgress = 0;
        this._personalBests = { maxHeight: 0, topSpeed: 0, flightTime: 0 };

        // Transition effects cleanup
        this._transitionEffects = {
            menuToReadyZoom: { active: false, timer: 0, duration: 0.5 },
            takeoffFlash: { active: false, timer: 0, duration: 0.1, alpha: 0 },
            takeoffQualityText: { active: false, timer: 0, duration: 0.8, text: '', color: '#ffffff', scale: 0 },
            landingImpactFlash: { active: false, timer: 0, duration: 0.15, alpha: 0 },
            scoreToResultsCrossfade: { active: false, timer: 0, duration: 0.4, alpha: 0 },
        };
    }
}
