/**
 * SkihoppRenderer.js - Ski jumping scene renderer
 *
 * Renders the complete ski jumping scene on a Canvas 2D context.
 * Designed for mobile portrait layout (~390x844).
 *
 * Drawing order (back to front):
 *   1. Sky gradient + stars
 *   2. Parallax mountain layers
 *   3. Snow ground fill
 *   4. Hill surface with markings
 *   5. Ski jumper
 *   6. Spectators
 *   7. Snow particles
 */

import { GameState } from '../../core/Game.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seeded pseudo-random for deterministic star/mountain positions. */
function seededRandom(seed) {
    let s = seed;
    return () => {
        s = (s * 16807 + 0) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

/** Linear interpolation. */
function lerp(a, b, t) {
    return a + (b - a) * t;
}

// ---------------------------------------------------------------------------
// ParticlePool - lightweight particle system for visual effects
// ---------------------------------------------------------------------------

class ParticlePool {
    constructor(maxSize = 500) {
        this.particles = [];
        this.maxSize = maxSize;
    }

    /**
     * Spawn a single particle.
     * @param {Object} config  {x, y, vx, vy, life, maxLife, size, color, gravity, drag, type}
     *   type: 'circle' | 'star' | 'snowflake' | 'spark' | 'trail'
     */
    spawn(config) {
        if (this.particles.length >= this.maxSize) return;
        this.particles.push({
            x: 0, y: 0,
            vx: 0, vy: 0,
            life: 1, maxLife: 1,
            size: 2,
            color: '#ffffff',
            gravity: 4,
            drag: 1,
            type: 'circle',
            age: 0,
            prevX: config.x ?? 0,
            prevY: config.y ?? 0,
            sparklePhase: Math.random() * Math.PI * 2,
            ...config,
        });
    }

    /**
     * Spawn `count` particles in a random burst around a centre point.
     * @param {number} count
     * @param {Object} config  - same as spawn(), plus optional spread, speedMin, speedMax
     */
    spawnBurst(count, config) {
        const spread = config.spread ?? Math.PI * 1.2;
        const baseAngle = config.baseAngle ?? -Math.PI / 2;
        const speedMin = config.speedMin ?? 1.0;
        const speedMax = config.speedMax ?? 3.5;
        const sizeMin = config.sizeMin ?? 1;
        const sizeMax = config.sizeMax ?? 4;
        const lifeMin = config.lifeMin ?? 0.6;
        const lifeMax = config.lifeMax ?? 1.4;
        const posSpread = config.posSpread ?? 2;

        for (let i = 0; i < count; i++) {
            if (this.particles.length >= this.maxSize) return;
            const angle = baseAngle + (Math.random() - 0.5) * spread;
            const speed = speedMin + Math.random() * (speedMax - speedMin);
            const sz = sizeMin + Math.random() * (sizeMax - sizeMin);
            const ml = lifeMin + Math.random() * (lifeMax - lifeMin);
            this.spawn({
                x: (config.x || 0) + (Math.random() - 0.5) * posSpread,
                y: (config.y || 0) + (Math.random() - 0.5) * posSpread * 0.3,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                maxLife: ml,
                size: sz,
                color: config.color || '#ffffff',
                gravity: config.gravity ?? 4,
                drag: config.drag ?? 1,
                type: config.type || 'circle',
            });
        }
    }

    /**
     * Advance all particles by dt seconds. Dead particles are compacted out.
     */
    update(dt) {
        let writeIdx = 0;
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            p.life -= dt / p.maxLife;
            if (p.life <= 0) continue;

            p.age += dt;
            p.prevX = p.x;
            p.prevY = p.y;

            p.vy += p.gravity * dt;
            p.vx *= Math.pow(p.drag, dt);
            p.vy *= Math.pow(p.drag, dt);
            p.x += p.vx * dt;
            p.y += p.vy * dt;

            if (writeIdx !== i) this.particles[writeIdx] = p;
            writeIdx++;
        }
        this.particles.length = writeIdx;
    }

    /**
     * Batch-render all particles.
     * @param {CanvasRenderingContext2D} ctx
     * @param {Function} worldToScreen  (x, y) => {x, y}
     * @param {number} time             global clock for twinkle effects
     */
    render(ctx, worldToScreen, time) {
        if (this.particles.length === 0) return;

        ctx.save();

        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            const sp = worldToScreen(p.x, p.y);
            const alpha = Math.max(0, p.life);

            ctx.globalAlpha = alpha;

            switch (p.type) {
                case 'star':
                    this._renderStar(ctx, sp, p, alpha, time);
                    break;
                case 'spark':
                    this._renderSpark(ctx, sp, p, alpha, worldToScreen);
                    break;
                case 'snowflake':
                    this._renderSnowflake(ctx, sp, p, alpha, time);
                    break;
                case 'trail':
                    this._renderTrail(ctx, sp, p, alpha);
                    break;
                default:
                    ctx.fillStyle = p.color;
                    ctx.beginPath();
                    ctx.arc(sp.x, sp.y, p.size, 0, Math.PI * 2);
                    ctx.fill();
                    break;
            }
        }

        ctx.restore();
    }

    /** 4-point star shape */
    _renderStar(ctx, sp, p, alpha, time) {
        const twinkle = 0.5 + 0.5 * Math.sin(time * 12 + p.sparklePhase);
        ctx.globalAlpha = alpha * twinkle;
        ctx.fillStyle = p.color;
        const sz = p.size * (0.8 + twinkle * 0.4);

        ctx.beginPath();
        ctx.moveTo(sp.x, sp.y - sz * 1.5);
        ctx.lineTo(sp.x + sz * 0.4, sp.y - sz * 0.4);
        ctx.lineTo(sp.x + sz * 1.5, sp.y);
        ctx.lineTo(sp.x + sz * 0.4, sp.y + sz * 0.4);
        ctx.lineTo(sp.x, sp.y + sz * 1.5);
        ctx.lineTo(sp.x - sz * 0.4, sp.y + sz * 0.4);
        ctx.lineTo(sp.x - sz * 1.5, sp.y);
        ctx.lineTo(sp.x - sz * 0.4, sp.y - sz * 0.4);
        ctx.closePath();
        ctx.fill();

        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#fffde0';
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sz * 0.3, 0, Math.PI * 2);
        ctx.fill();
    }

    /** Bright dot with short trailing line */
    _renderSpark(ctx, sp, p, alpha, worldToScreen) {
        const prev = worldToScreen(p.prevX, p.prevY);

        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, p.size * 0.5);
        ctx.globalAlpha = alpha * 0.5;
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(sp.x, sp.y);
        ctx.stroke();

        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = alpha * 0.6;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, p.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
    }

    /** 6-arm snowflake shape */
    _renderSnowflake(ctx, sp, p, alpha, time) {
        const rot = time * 0.5 + p.sparklePhase;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(0.5, p.size * 0.25);
        ctx.lineCap = 'round';

        const armLen = p.size * 1.2;
        ctx.beginPath();
        for (let a = 0; a < 6; a++) {
            const angle = rot + (a * Math.PI) / 3;
            const ax = sp.x + Math.cos(angle) * armLen;
            const ay = sp.y + Math.sin(angle) * armLen;
            ctx.moveTo(sp.x, sp.y);
            ctx.lineTo(ax, ay);

            const bx = sp.x + Math.cos(angle) * armLen * 0.6;
            const by = sp.y + Math.sin(angle) * armLen * 0.6;
            const branchLen = armLen * 0.35;
            ctx.moveTo(bx, by);
            ctx.lineTo(bx + Math.cos(angle + 0.5) * branchLen, by + Math.sin(angle + 0.5) * branchLen);
            ctx.moveTo(bx, by);
            ctx.lineTo(bx + Math.cos(angle - 0.5) * branchLen, by + Math.sin(angle - 0.5) * branchLen);
        }
        ctx.stroke();
    }

    /** Fading trail dot (used for jumper flight trail) */
    _renderTrail(ctx, sp, p, alpha) {
        ctx.globalAlpha = alpha * 0.4;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ---------------------------------------------------------------------------
// SkihoppRenderer
// ---------------------------------------------------------------------------

export default class SkihoppRenderer {
    constructor() {
        this.game = null;
        this.hill = null;
        this.renderer = null;

        // Pre-generated visual data
        this._stars = [];
        this._mountains = [[], [], [], []]; // 4 parallax layers
        this._spectators = [];
        this._snowParticles = [];

        // Unified particle system (replaces _takeoffParticles, _landingParticles, _celebrationParticles)
        this._particles = new ParticlePool(500);
        this._trailFrameCounter = 0;
        this._windStreaks = [];
        this._prevGameState = null;

        // Game juice effect state
        this._takeoffFlash = null;          // { x, y, startTime }
        this._milestoneFlashes = [];        // { distance, startTime }
        this._passedMilestones = new Set(); // track which milestones already triggered

        // Premium visual effect state
        this._impactRipples = [];           // { x, y, startTime } expanding snow ripple rings

        this._initialized = false;
        this._time = 0;

        // Cinematic camera state
        this._cameraPhaseTime = 0;
        this._cameraPrevPhase = null;
        this._takeoffZoomPulse = 0;
        this._landingZoomHit = false;
        this._scoreStartX = 0;
        this._scoreStartY = 0;
        this._cameraRotation = 0;

        // --- Performance caches ---
        // Reusable point object to avoid per-frame allocations in worldToScreen
        this._tmpPt = { x: 0, y: 0 };
        // Cached hill profile screen coords
        this._cachedProfileScreen = [];
        this._cachedCameraX = NaN;
        this._cachedCameraY = NaN;
        this._cachedZoom = NaN;
        // Cached aurora color strings (avoid per-frame rgba string building)
        this._auroraColorCache = null;
        // Cached snow ground seeded-random results (avoid re-running seeded RNG every frame)
        this._snowGroundShadows = null;
        this._snowGroundSparkles = null;
        this._snowGroundRidges = null;
        // Cached mountain edge highlight color strings
        this._mountainEdgeColors = null;
    }

    // ------------------------------------------------------------------
    // Initialization
    // ------------------------------------------------------------------

    /**
     * @param {import('../../core/Game.js').Game} game
     * @param {import('./Hill.js').default} hill
     * @param {import('../../core/Renderer.js').default} renderer
     */
    init(game, hill, renderer) {
        this.game = game;
        this.hill = hill;
        this.renderer = renderer;

        this._generateStars();
        this._generateMountains();
        this._generateSpectators();
        this._generateSnowParticles();

        this._initialized = true;
    }

    // ------------------------------------------------------------------
    // Data generation (called once in init)
    // ------------------------------------------------------------------

    _generateStars() {
        const rng = seededRandom(42);
        this._stars = [];
        for (let i = 0; i < 90; i++) {
            this._stars.push({
                x: rng(),
                y: rng() * 0.50,
                r: 0.5 + rng() * 1.8,
                a: 0.3 + rng() * 0.7,
                twinkleSpeed: 0.5 + rng() * 2.0,
                twinkleOffset: rng() * Math.PI * 2,
                sparkle: rng() < 0.12, // ~12% of stars get a cross/sparkle shape
            });
        }
    }

    _generateMountains() {
        const rng = seededRandom(1337);
        const layerConfigs = [
            { baseY: 0.38, variance: 0.14, color: '#080e24', peaks: 22 },
            { baseY: 0.44, variance: 0.11, color: '#0f1a38', peaks: 24 },
            { baseY: 0.52, variance: 0.09, color: '#1a2848', peaks: 26 },
            { baseY: 0.58, variance: 0.07, color: '#2a3a5c', peaks: 28 },
        ];

        this._mountains = layerConfigs.map((cfg, layerIdx) => {
            const pts = [];
            // Extend well beyond screen width for parallax scrolling
            const count = cfg.peaks;
            for (let i = 0; i <= count; i++) {
                const t = i / count;
                // Use a wide range so parallax never runs out of mountains
                pts.push({
                    x: -0.4 + t * 1.8,
                    y: cfg.baseY - rng() * cfg.variance,
                });
            }

            // Generate pine tree positions for the nearest layer
            let pines = [];
            if (layerIdx === layerConfigs.length - 1) {
                for (let i = 0; i < 60; i++) {
                    pines.push({
                        t: rng(),            // 0-1 position along ridge
                        h: 6 + rng() * 10,   // tree height in px
                        w: 3 + rng() * 4,    // tree width in px
                    });
                }
            }

            return { points: pts, color: cfg.color, pines };
        });
    }

    _generateSpectators() {
        const rng = seededRandom(777);
        this._spectators = [];

        // Place spectators along the outrun / flat area (fence line)
        const landingPts = this.hill.getLandingPoints();
        const last = landingPts[landingPts.length - 1];
        const flatStartX = last.x - 20;
        const flatY = last.y;

        const bodyColors = [
            '#e63946', '#457b9d', '#2a9d8f', '#264653',
            '#d62828', '#023e8a', '#1d3557', '#6a0572',
        ];
        const hatColors = [
            '#ffbe0b', '#fb5607', '#ff006e', '#8338ec',
            '#e9c46a', '#f4a261', '#00b4d8', '#ef233c',
        ];
        const flagColors = ['#ef233c', '#0077b6', '#ffd60a', '#2d6a4f', '#ffffff'];

        for (let i = 0; i < 35; i++) {
            this._spectators.push({
                x: flatStartX + rng() * 28,
                y: flatY - 0.3 - rng() * 2.0,
                bodyColor: bodyColors[Math.floor(rng() * bodyColors.length)],
                hatColor: hatColors[Math.floor(rng() * hatColors.length)],
                h: 0.8 + rng() * 0.6,
                // Some spectators wave, some hold flags, some are still
                action: rng() < 0.25 ? 'wave' : (rng() < 0.4 ? 'flag' : 'still'),
                flagColor: flagColors[Math.floor(rng() * flagColors.length)],
                // Random phase offset for wave animation
                wavePhase: rng() * Math.PI * 2,
                waveSpeed: 2 + rng() * 3,
            });
        }
    }

    _generateSnowParticles() {
        const rng = seededRandom(999);
        this._snowParticles = [];
        for (let i = 0; i < 100; i++) {
            // Depth layer: 0 = far background, 1 = near foreground
            const depth = rng();
            // Size scales with depth: background 1-2px, foreground 2-4px
            const r = 1 + depth * 3;
            // Larger / closer particles fall faster
            const baseFallSpeed = 0.03 + depth * 0.1;
            // Larger particles are more opaque
            const alpha = 0.15 + depth * 0.6;
            // Whether this particle renders as a snowflake shape (only larger ones)
            const isFlake = r > 2.5 && rng() < 0.4;

            this._snowParticles.push({
                x: rng(),
                y: rng(),
                r,
                depth,
                baseDriftX: (rng() - 0.5) * 0.08,
                speedY: baseFallSpeed,
                alpha,
                isFlake,
                wobblePhase: rng() * Math.PI * 2,
                wobbleSpeed: 0.5 + rng() * 1.5,
            });
        }
    }

    // ------------------------------------------------------------------
    // Main render entry point
    // ------------------------------------------------------------------

    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} width   - canvas width (CSS px)
     * @param {number} height  - canvas height (CSS px)
     * @param {object} jumperState - from SkihoppPhysics
     * @param {string} gameState   - current GameState.*
     * @param {object} wind        - { speed, direction }
     */
    render(ctx, width, height, jumperState, gameState, wind) {
        if (!this._initialized || !this.renderer) return;

        this._wind = wind || { speed: 0, direction: 0 };
        this._time += 1 / 60;

        // --- Camera management ---
        this._updateCamera(jumperState, gameState, 1 / 60);

        // Camera shake from vibration/landing + cinematic rotation
        const vib = jumperState.vibration || 0;
        const hasRotation = Math.abs(this._cameraRotation || 0) > 0.0001;
        if (vib > 0.01 || hasRotation) {
            const shakeX = vib > 0.01 ? (Math.random() - 0.5) * vib * 4 : 0;
            const shakeY = vib > 0.01 ? (Math.random() - 0.5) * vib * 4 : 0;
            ctx.save();
            if (hasRotation) {
                ctx.translate(width / 2, height / 2);
                ctx.rotate(this._cameraRotation);
                ctx.translate(-width / 2, -height / 2);
            }
            if (vib > 0.01) {
                ctx.translate(shakeX, shakeY);
            }
        }

        // --- Detect state transitions for particle effects ---
        if (this._prevGameState !== gameState) {
            if (gameState === GameState.FLIGHT && this._prevGameState === GameState.TAKEOFF) {
                // Takeoff spark burst
                this._particles.spawnBurst(25, {
                    type: 'spark', color: '#ffffff',
                    x: jumperState.x, y: jumperState.y,
                    speedMin: 1.5, speedMax: 4.5, spread: Math.PI * 0.8,
                    sizeMin: 1, sizeMax: 3, lifeMin: 0.4, lifeMax: 0.8,
                    gravity: 3, drag: 0.95,
                });
                // Perfect takeoff: golden stars
                if ((jumperState.takeoffQuality || 0) > 0.85) {
                    this._particles.spawnBurst(20, {
                        type: 'star', color: '#ffd700',
                        x: jumperState.x, y: jumperState.y,
                        speedMin: 0.8, speedMax: 2.5, spread: Math.PI * 1.4,
                        sizeMin: 1.5, sizeMax: 3.5, lifeMin: 0.7, lifeMax: 1.2,
                        gravity: -0.5, drag: 0.97,
                    });
                }
                this._triggerTakeoffFlash(jumperState.x, jumperState.y);
                this._passedMilestones.clear();
                this._trailFrameCounter = 0;
            }
            if (gameState === GameState.LANDING && this._prevGameState === GameState.FLIGHT) {
                const impactForce = Math.abs(jumperState.vy || 0) * 2;
                const snowCount = Math.floor(15 + Math.min(30, impactForce * 3));
                // Landing snowflake burst
                this._particles.spawnBurst(snowCount, {
                    type: 'snowflake', color: '#e0f0ff',
                    x: jumperState.x, y: jumperState.y,
                    speedMin: 0.8, speedMax: 3.0, spread: Math.PI * 1.2,
                    sizeMin: 2, sizeMax: 5, lifeMin: 0.8, lifeMax: 1.6,
                    gravity: 2, drag: 0.92, posSpread: 3,
                });
                // Spawn impact ripples on landing
                this._impactRipples.push({ x: jumperState.x, y: jumperState.y, startTime: this._time });
                // Perfect telemark: green stars
                if ((jumperState.landingQuality || 0) > 0.8) {
                    this._particles.spawnBurst(15, {
                        type: 'star', color: '#44ff88',
                        x: jumperState.x, y: jumperState.y - 0.5,
                        speedMin: 0.5, speedMax: 2.0, spread: Math.PI * 1.4,
                        sizeMin: 1.5, sizeMax: 3.0, lifeMin: 0.8, lifeMax: 1.4,
                        gravity: -0.8, drag: 0.96,
                    });
                }
            }
            this._prevGameState = gameState;
        }

        // --- Continuous trail behind jumper during flight ---
        if (gameState === GameState.FLIGHT && jumperState) {
            this._trailFrameCounter++;
            if (this._trailFrameCounter % 3 === 0) {
                this._particles.spawn({
                    type: 'trail', color: '#c8deff',
                    x: jumperState.x, y: jumperState.y,
                    vx: (Math.random() - 0.5) * 0.2,
                    vy: (Math.random() - 0.5) * 0.1,
                    life: 1, maxLife: 0.5,
                    size: 1.5 + Math.random(),
                    gravity: 0.3, drag: 0.98,
                });
            }
        }

        // --- Update particle system ---
        this._particles.update(1 / 60);

        // --- Track distance milestones during flight ---
        if (gameState === GameState.FLIGHT) {
            this._checkDistanceMilestones(jumperState);
        }

        // --- Draw layers back-to-front ---
        // Each draw call is wrapped in try-catch so one failure doesn't
        // prevent the remaining layers from rendering.
        try { this._drawSky(ctx, width, height); } catch (e) { console.warn('[SkihoppRenderer] _drawSky error:', e); }
        try { this._drawMountains(ctx, width, height); } catch (e) { console.warn('[SkihoppRenderer] _drawMountains error:', e); }
        try { this._drawSnowGround(ctx, width, height); } catch (e) { console.warn('[SkihoppRenderer] _drawSnowGround error:', e); }
        try { this._drawHillSurface(ctx, width, height); } catch (e) { console.warn('[SkihoppRenderer] _drawHillSurface error:', e); }

        // Premium: dynamic lighting spotlight during flight
        try { this._drawDynamicLighting(ctx, width, height, jumperState); } catch (e) { console.warn('[SkihoppRenderer] _drawDynamicLighting error:', e); }

        try { this._drawSpectators(ctx); } catch (e) { console.warn('[SkihoppRenderer] _drawSpectators error:', e); }
        try { this._drawCrowdWaveEffect(ctx, jumperState, gameState); } catch (e) { console.warn('[SkihoppRenderer] _drawCrowdWaveEffect error:', e); }
        try { this._drawJumperShadow(ctx, jumperState); } catch (e) { console.warn('[SkihoppRenderer] _drawJumperShadow error:', e); }

        // Premium: heat distortion during fast inrun
        if (gameState === GameState.INRUN) {
            try { this._drawHeatDistortion(ctx, jumperState); } catch (e) { console.warn('[SkihoppRenderer] _drawHeatDistortion error:', e); }
        }

        // Speed lines behind jumper during inrun
        if (gameState === GameState.INRUN) {
            try { this._drawSpeedLines(ctx, jumperState); } catch (e) { console.warn('[SkihoppRenderer] _drawSpeedLines error:', e); }
        }

        try { this._drawJumper(ctx, jumperState); } catch (e) { console.warn('[SkihoppRenderer] _drawJumper error:', e); }

        // Premium: trajectory ghost line during flight
        if (gameState === GameState.FLIGHT) {
            try { this._drawTrajectoryGhost(ctx, jumperState); } catch (e) { console.warn('[SkihoppRenderer] _drawTrajectoryGhost error:', e); }
        }

        try { this._drawTakeoffFlash(ctx); } catch (e) { console.warn('[SkihoppRenderer] _drawTakeoffFlash error:', e); }

        // Premium: impact ripples on landing
        try { this._drawImpactRipple(ctx); } catch (e) { console.warn('[SkihoppRenderer] _drawImpactRipple error:', e); }

        // Celebration particles now handled by unified _particles system
        try { this._drawMilestoneFlashes(ctx, jumperState, gameState); } catch (e) { console.warn('[SkihoppRenderer] _drawMilestoneFlashes error:', e); }
        try { this._particles.render(ctx, (x, y) => this.renderer.worldToScreen(x, y), this._time); } catch (e) { console.warn('[SkihoppRenderer] _particles.render error:', e); }
        try { this._drawSnowParticles(ctx, width, height); } catch (e) { console.warn('[SkihoppRenderer] _drawSnowParticles error:', e); }

        // Wind streaks during flight
        if (gameState === GameState.FLIGHT) {
            try { this._drawWindStreaks(ctx, width, height, wind); } catch (e) { console.warn('[SkihoppRenderer] _drawWindStreaks error:', e); }
        }

        // Premium: lens flare from floodlights
        try { this._drawLensFlare(ctx, width, height); } catch (e) { console.warn('[SkihoppRenderer] _drawLensFlare error:', e); }

        // Restore camera shake/rotation transform
        if ((jumperState.vibration || 0) > 0.01 || Math.abs(this._cameraRotation || 0) > 0.0001) {
            ctx.restore();
        }

        // Premium: depth of field edge blur
        try { this._drawDepthOfField(ctx, width, height); } catch (e) { console.warn('[SkihoppRenderer] _drawDepthOfField error:', e); }

        // Vignette overlay (drawn last, outside camera shake)
        try { this._drawVignette(ctx, width, height); } catch (e) { console.warn('[SkihoppRenderer] _drawVignette error:', e); }
    }

    // ------------------------------------------------------------------
    // Camera
    // ------------------------------------------------------------------

    /**
     * Cubic ease-in-out for smooth camera transitions.
     * @param {number} t - value in [0, 1]
     * @returns {number} eased value in [0, 1]
     */
    _easeInOutCubic(t) {
        if (t < 0) return 0;
        if (t > 1) return 1;
        return t < 0.5
            ? 4 * t * t * t
            : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    _updateCamera(jumperState, gameState, dt) {
        const r = this.renderer;
        if (!r || !this.hill) return;
        let targetZoom, targetX, targetY;
        let followSpeed = 2;
        let zoomSpeed = 2;

        // Track phase transitions for cinematic timing
        if (this._cameraPrevPhase !== gameState) {
            this._cameraPhaseTime = 0;
            if (gameState === GameState.TAKEOFF) {
                this._takeoffZoomPulse = 0.2;
            }
            if (gameState === GameState.LANDING) {
                this._landingZoomHit = true;
            }
            if (gameState === GameState.SCORE) {
                this._scoreStartX = jumperState.x;
                this._scoreStartY = jumperState.y;
            }
            this._cameraPrevPhase = gameState;
        }
        this._cameraPhaseTime += dt;

        // Decay takeoff pulse timer
        if (this._takeoffZoomPulse > 0) {
            this._takeoffZoomPulse = Math.max(0, this._takeoffZoomPulse - dt);
        }

        switch (gameState) {
            case GameState.MENU:
            case GameState.READY: {
                // Wide overview shot: centre on middle of hill
                const profile = this.hill.getProfile();
                const mid = profile[Math.floor(profile.length * 0.4)];
                targetX = mid.x;
                targetY = mid.y;
                targetZoom = 0.7;
                followSpeed = 2;
                zoomSpeed = 2;
                this._cameraRotation = 0;
                break;
            }
            case GameState.INRUN: {
                // CINEMATIC INRUN: start wide, gradually zoom in as speed builds.
                // Subtle forward bias - camera slightly ahead of jumper.
                const speed = jumperState.speed || 0;
                const maxSpeed = 26; // matches SkihoppPhysics maxSpeed
                const speedRatio = Math.min(speed / maxSpeed, 1);
                const zoomEased = this._easeInOutCubic(speedRatio);

                // Zoom ramps from 1.5 (wide) to 3.0 (tight) with speed
                targetZoom = 1.5 + 1.5 * zoomEased;

                // Forward bias increases with speed (3m to 8m ahead)
                const leadDistance = 3 + 5 * zoomEased;
                targetX = jumperState.x + leadDistance;
                targetY = jumperState.y - 2;

                followSpeed = 5;
                zoomSpeed = 3;
                this._cameraRotation = 0;
                break;
            }
            case GameState.TAKEOFF: {
                // CINEMATIC TAKEOFF: 0.2s zoom-in pulse (zoom * 1.1) for impact
                targetX = jumperState.x + 3;
                targetY = jumperState.y - 2;

                const pulseT = this._takeoffZoomPulse / 0.2; // 1 at start, 0 at end
                const pulseEased = this._easeInOutCubic(pulseT);
                targetZoom = 3.0 * (1 + 0.1 * pulseEased);

                followSpeed = 6;
                zoomSpeed = 8;
                this._cameraRotation = 0;
                break;
            }
            case GameState.FLIGHT: {
                // CINEMATIC FLIGHT: dynamic zoom based on height, gentle rotation
                const height = Math.max(0, -(jumperState.y || 0));
                const heightFactor = Math.min(height / 20, 1);
                const heightEased = this._easeInOutCubic(heightFactor);

                // Zoom out more the higher the jumper goes (1.4 to 0.9)
                targetZoom = 1.4 - 0.5 * heightEased;

                // Keep camera ahead and above; more offset when higher
                targetX = jumperState.x + 12;
                targetY = jumperState.y - 6 - 4 * heightEased;

                followSpeed = 2.5;
                zoomSpeed = 2;

                // Gentle rotation following flight angle (max 2 degrees)
                const vx = jumperState.vx || 0;
                const vy = jumperState.vy || 0;
                if (Math.abs(vx) > 0.1 || Math.abs(vy) > 0.1) {
                    const flightAngle = Math.atan2(vy, vx);
                    const maxRot = 2 * Math.PI / 180;
                    const targetRot = Math.max(-maxRot, Math.min(maxRot, flightAngle * 0.3));
                    const rotFactor = 1 - Math.exp(-2 * dt);
                    this._cameraRotation += (targetRot - this._cameraRotation) * rotFactor;
                }
                break;
            }
            case GameState.LANDING: {
                // CINEMATIC LANDING: quick zoom in on impact, then bounce back
                const landT = this._cameraPhaseTime;
                const impactForce = jumperState.impactForce || Math.abs(jumperState.vy || 0) * 2;

                if (landT < 0.15) {
                    // Quick zoom IN to 2.5 on impact (first 150ms)
                    const hitEased = this._easeInOutCubic(landT / 0.15);
                    targetZoom = 2.0 + 0.5 * hitEased;
                    zoomSpeed = 12;
                } else if (landT < 0.5) {
                    // Bounce back slightly (150ms-500ms)
                    const bounceT = (landT - 0.15) / 0.35;
                    const bounceEased = this._easeInOutCubic(bounceT);
                    targetZoom = 2.5 - 0.3 * bounceEased;
                    zoomSpeed = 6;
                } else {
                    // Settle
                    targetZoom = 2.2;
                    zoomSpeed = 3;
                }

                targetX = jumperState.x + 2;
                targetY = jumperState.y - 1.5;
                followSpeed = 5;

                // Enhanced camera shake proportional to impact force
                if (this._landingZoomHit && landT < 0.3) {
                    const shakeMag = Math.min(impactForce * 0.5, 6);
                    const shakeDecay = 1 - this._easeInOutCubic(landT / 0.3);
                    r.cameraX += (Math.random() - 0.5) * shakeMag * shakeDecay * dt;
                    r.cameraY += (Math.random() - 0.5) * shakeMag * shakeDecay * dt;
                }
                if (landT > 0.3) this._landingZoomHit = false;

                // Ease rotation back to zero
                this._cameraRotation *= (1 - 5 * dt);
                break;
            }
            case GameState.SCORE: {
                // CINEMATIC SCORE: slow drift to side, gentle zoom out
                const scoreT = this._cameraPhaseTime;
                const driftEased = this._easeInOutCubic(Math.min(scoreT / 3, 1));

                targetX = this._scoreStartX + 8 * driftEased;
                targetY = this._scoreStartY - 3 * driftEased;
                targetZoom = 2.2 - 1.0 * driftEased;

                followSpeed = 1.5;
                zoomSpeed = 1.5;
                this._cameraRotation *= (1 - 3 * dt);
                break;
            }
            default:
                targetX = jumperState.x;
                targetY = jumperState.y;
                targetZoom = 1.5;
                followSpeed = 2;
                zoomSpeed = 2;
                this._cameraRotation = 0;
        }

        r.smoothFollow(targetX, targetY, dt, followSpeed);
        r.smoothZoom(targetZoom, dt, zoomSpeed);
    }

    // ------------------------------------------------------------------
    // 1. Sky
    // ------------------------------------------------------------------

    _drawSky(ctx, w, h) {
        // Richer sky gradient: very dark top, deep blue middle, slight teal near horizon
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#020210');
        grad.addColorStop(0.25, '#060828');
        grad.addColorStop(0.45, '#0a1240');
        grad.addColorStop(0.65, '#0e2a5e');
        grad.addColorStop(0.80, '#133a5c');
        grad.addColorStop(0.92, '#1a4a58');
        grad.addColorStop(1, '#1e5460');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        // Subtle warm amber/orange glow at horizon
        const hGlowGrad = ctx.createLinearGradient(0, h * 0.75, 0, h);
        hGlowGrad.addColorStop(0, 'rgba(255,180,80,0)');
        hGlowGrad.addColorStop(0.4, 'rgba(255,160,60,0.04)');
        hGlowGrad.addColorStop(0.7, 'rgba(255,140,40,0.06)');
        hGlowGrad.addColorStop(1, 'rgba(255,120,30,0.03)');
        ctx.fillStyle = hGlowGrad;
        ctx.fillRect(0, h * 0.75, w, h * 0.25);

        // Aurora borealis: 5 overlapping sine waves, vivid green/teal/purple
        const t = (this._time || 0);

        // Pre-cache aurora color strings once (avoid per-frame string concatenation)
        if (!this._auroraColorCache) {
            const auroraConfigs = [
                { baseY: 0.10, color: [64, 255, 128],  alpha: 0.10, freqs: [0.007, 0.013, 0.021], speeds: [0.35, 0.6, 0.25] },
                { baseY: 0.14, color: [64, 255, 221],  alpha: 0.09, freqs: [0.009, 0.017, 0.006], speeds: [0.45, 0.3, 0.55] },
                { baseY: 0.18, color: [128, 64, 255],  alpha: 0.08, freqs: [0.006, 0.014, 0.023], speeds: [0.5, 0.7, 0.35] },
                { baseY: 0.13, color: [64, 255, 180],  alpha: 0.11, freqs: [0.011, 0.019, 0.008], speeds: [0.3, 0.5, 0.65] },
                { baseY: 0.21, color: [100, 80, 255],  alpha: 0.08, freqs: [0.008, 0.016, 0.025], speeds: [0.55, 0.4, 0.3] },
            ];
            this._auroraColorCache = auroraConfigs.map(al => {
                const [r, g, b] = al.color;
                return {
                    baseY: al.baseY, freqs: al.freqs, speeds: al.speeds, alpha: al.alpha,
                    stops: [
                        `rgba(${r},${g},${b},${(al.alpha * 0.3).toFixed(3)})`,
                        `rgba(${r},${g},${b},${al.alpha.toFixed(3)})`,
                        `rgba(${r},${g},${b},${(al.alpha * 0.5).toFixed(3)})`,
                        `rgba(${r},${g},${b},0)`,
                    ],
                };
            });
        }

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const auroraLayers = this._auroraColorCache;
        const h038 = h * 0.38;
        for (let i = 0; i < auroraLayers.length; i++) {
            const al = auroraLayers[i];
            const baseY = h * al.baseY;
            ctx.beginPath();
            ctx.moveTo(0, baseY);
            // Step by 4px instead of 3px for ~25% fewer lineTo calls
            for (let x = 0; x <= w; x += 4) {
                const wave = Math.sin(x * al.freqs[0] + t * al.speeds[0] + i * 1.8) * 22
                           + Math.sin(x * al.freqs[1] + t * al.speeds[1] + i * 0.7) * 14
                           + Math.sin(x * al.freqs[2] + t * al.speeds[2] + i * 2.5) * 8;
                ctx.lineTo(x, baseY + wave);
            }
            ctx.lineTo(w, h038);
            ctx.lineTo(0, h038);
            ctx.closePath();

            // Vertical gradient fade for each aurora band (use cached color strings)
            const aGrad = ctx.createLinearGradient(0, baseY - 25, 0, h038);
            aGrad.addColorStop(0, al.stops[0]);
            aGrad.addColorStop(0.3, al.stops[1]);
            aGrad.addColorStop(0.7, al.stops[2]);
            aGrad.addColorStop(1, al.stops[3]);
            ctx.fillStyle = aGrad;
            ctx.fill();
        }
        ctx.restore();

        // Crescent moon in the upper-left portion of the sky
        const moonX = w * 0.18;
        const moonY = h * 0.10;
        const moonR = Math.min(w, h) * 0.030;
        // Soft glow around the moon
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const moonGlow = ctx.createRadialGradient(moonX, moonY, moonR * 0.5, moonX, moonY, moonR * 4);
        moonGlow.addColorStop(0, 'rgba(200,220,255,0.12)');
        moonGlow.addColorStop(0.5, 'rgba(180,200,240,0.04)');
        moonGlow.addColorStop(1, 'rgba(150,180,220,0)');
        ctx.fillStyle = moonGlow;
        ctx.fillRect(moonX - moonR * 5, moonY - moonR * 5, moonR * 10, moonR * 10);
        ctx.restore();
        // Crescent: draw bright disc with a clipped-out section for the crescent shape.
        // We avoid 'destination-out' on the main canvas because it would punch through
        // the sky gradient. Instead, draw the crescent as an arc path.
        ctx.save();
        // Create a clipping region: the full moon circle MINUS the shadow circle
        // Using even-odd fill rule to create the crescent shape
        ctx.beginPath();
        ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
        // Counter-arc for the shadow (drawn counter-clockwise for even-odd subtraction)
        ctx.arc(moonX + moonR * 0.5, moonY - moonR * 0.15, moonR * 0.85, 0, Math.PI * 2, true);
        ctx.fillStyle = 'rgba(230,235,255,0.9)';
        ctx.fill('evenodd');
        ctx.restore();

        // Twinkling stars with sparkle shapes on bright ones
        // Batch regular (non-sparkle) stars: group by similar alpha to reduce fillStyle changes
        ctx.save();
        // First pass: draw all sparkle stars
        ctx.lineWidth = 0.7;
        for (let si = 0; si < this._stars.length; si++) {
            const s = this._stars[si];
            if (!s.sparkle) continue;
            const twinkle = 0.5 + 0.5 * Math.sin(t * s.twinkleSpeed + s.twinkleOffset);
            const alpha = s.a * (0.2 + 0.8 * twinkle);
            const sx = (s.x * w) | 0;
            const sy = (s.y * h) | 0;

            // Cross/sparkle shape: 4 radiating lines from center
            const armLen = s.r * 2.5 + twinkle * 2.0;
            ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
            ctx.beginPath();
            ctx.moveTo(sx, sy - armLen);
            ctx.lineTo(sx, sy + armLen);
            ctx.moveTo(sx - armLen, sy);
            ctx.lineTo(sx + armLen, sy);
            const diagLen = armLen * 0.55;
            ctx.moveTo(sx - diagLen, sy - diagLen);
            ctx.lineTo(sx + diagLen, sy + diagLen);
            ctx.moveTo(sx + diagLen, sy - diagLen);
            ctx.lineTo(sx - diagLen, sy + diagLen);
            ctx.stroke();
            // Bright center dot
            ctx.beginPath();
            ctx.arc(sx, sy, s.r * 0.8, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,255,${Math.min(1, alpha * 1.3).toFixed(2)})`;
            ctx.fill();
        }

        // Second pass: draw all regular dot stars
        for (let si = 0; si < this._stars.length; si++) {
            const s = this._stars[si];
            if (s.sparkle) continue;
            const twinkle = 0.5 + 0.5 * Math.sin(t * s.twinkleSpeed + s.twinkleOffset);
            const alpha = s.a * (0.2 + 0.8 * twinkle);
            const sx = (s.x * w) | 0;
            const sy = (s.y * h) | 0;
            ctx.beginPath();
            ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
            ctx.fill();
        }
        ctx.restore();
    }

    // ------------------------------------------------------------------
    // 2. Mountains
    // ------------------------------------------------------------------

    _drawMountains(ctx, w, h) {
        const parallaxFactors = [0.08, 0.16, 0.28, 0.42];
        const cameraX = this.renderer.cameraX;
        const numLayers = this._mountains.length;

        for (let layer = 0; layer < numLayers; layer++) {
            const { points, color, pines } = this._mountains[layer];
            const offsetX = -cameraX * parallaxFactors[layer] * 0.01;

            // Draw the mountain silhouette using smooth quadratic curves
            ctx.beginPath();
            const firstPt = points[0];
            ctx.moveTo((firstPt.x + offsetX) * w, firstPt.y * h);

            for (let i = 1; i < points.length; i++) {
                const prev = points[i - 1];
                const curr = points[i];
                // Smooth curve through midpoints for a natural silhouette
                const cpx = ((prev.x + curr.x) / 2 + offsetX) * w;
                const cpy = ((prev.y + curr.y) / 2) * h;
                ctx.quadraticCurveTo(
                    (prev.x + offsetX) * w, prev.y * h,
                    cpx, cpy
                );
            }
            // Final segment to last point
            const lastPt = points[points.length - 1];
            ctx.lineTo((lastPt.x + offsetX) * w, lastPt.y * h);

            // Close along the bottom
            ctx.lineTo((lastPt.x + offsetX) * w, h);
            ctx.lineTo((firstPt.x + offsetX) * w, h);
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();

            // Subtle edge highlight on top of each layer (atmospheric haze effect)
            if (layer < numLayers - 1) {
                ctx.beginPath();
                ctx.moveTo((firstPt.x + offsetX) * w, firstPt.y * h);
                for (let i = 1; i < points.length; i++) {
                    const prev = points[i - 1];
                    const curr = points[i];
                    const cpx = ((prev.x + curr.x) / 2 + offsetX) * w;
                    const cpy = ((prev.y + curr.y) / 2) * h;
                    ctx.quadraticCurveTo(
                        (prev.x + offsetX) * w, prev.y * h,
                        cpx, cpy
                    );
                }
                ctx.lineTo((lastPt.x + offsetX) * w, lastPt.y * h);
                ctx.strokeStyle = this._mountainEdgeColors
                    ? this._mountainEdgeColors[layer]
                    : (this._mountainEdgeColors = [
                        'rgba(100,140,180,0.080)',
                        'rgba(100,140,180,0.065)',
                        'rgba(100,140,180,0.050)',
                        'rgba(100,140,180,0.035)',
                    ])[layer];
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }

            // --- White snow caps on peaks ---
            // Pre-compute cap dimensions and color for this layer (avoid per-peak work)
            const capH = 4 + layer * 2.5;
            const capW = capH * 1.6;
            const capHalfW = capW / 2;
            const capColor = `rgba(220,230,255,${(0.35 + layer * 0.12).toFixed(2)})`;
            ctx.fillStyle = capColor;
            for (let i = 1; i < points.length - 1; i++) {
                const prev = points[i - 1];
                const curr = points[i];
                const next = points[i + 1];

                // A peak is where the point is higher (smaller y) than both neighbours
                if (curr.y < prev.y && curr.y < next.y) {
                    const peakX = (curr.x + offsetX) * w;
                    const peakY = curr.y * h;

                    ctx.beginPath();
                    ctx.moveTo(peakX, peakY);
                    ctx.lineTo(peakX - capHalfW, peakY + capH);
                    ctx.lineTo(peakX + capHalfW, peakY + capH);
                    ctx.closePath();
                    ctx.fill();
                }
            }

            // --- Pine tree silhouettes on nearest layer ---
            if (pines && pines.length > 0) {
                ctx.fillStyle = '#1e2e48';
                // Batch all pine triangles into a single path for fewer draw calls
                ctx.beginPath();
                for (const pine of pines) {
                    const totalSpan = lastPt.x - firstPt.x;
                    const treeWorldX = firstPt.x + pine.t * totalSpan;
                    let ridgeY = lastPt.y;
                    for (let i = 1; i < points.length; i++) {
                        if (points[i].x >= treeWorldX) {
                            const p0 = points[i - 1];
                            const p1 = points[i];
                            const seg = (treeWorldX - p0.x) / (p1.x - p0.x || 1);
                            ridgeY = p0.y + (p1.y - p0.y) * seg;
                            break;
                        }
                    }

                    const tx = (treeWorldX + offsetX) * w;
                    const ty = ridgeY * h;
                    const th = pine.h;
                    const tw = pine.w;

                    // Lower wider triangle
                    ctx.moveTo(tx, ty - th * 0.3);
                    ctx.lineTo(tx - tw, ty);
                    ctx.lineTo(tx + tw, ty);
                    ctx.closePath();
                    // Upper narrower triangle
                    ctx.moveTo(tx, ty - th);
                    ctx.lineTo(tx - tw * 0.65, ty - th * 0.25);
                    ctx.lineTo(tx + tw * 0.65, ty - th * 0.25);
                    ctx.closePath();
                }
                ctx.fill();
                // Batch all trunks
                for (const pine of pines) {
                    const totalSpan = lastPt.x - firstPt.x;
                    const treeWorldX = firstPt.x + pine.t * totalSpan;
                    let ridgeY = lastPt.y;
                    for (let i = 1; i < points.length; i++) {
                        if (points[i].x >= treeWorldX) {
                            const p0 = points[i - 1];
                            const p1 = points[i];
                            const seg = (treeWorldX - p0.x) / (p1.x - p0.x || 1);
                            ridgeY = p0.y + (p1.y - p0.y) * seg;
                            break;
                        }
                    }
                    const tx = (treeWorldX + offsetX) * w;
                    const ty = ridgeY * h;
                    ctx.fillRect(tx - 0.8, ty, 1.6, 2);
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // 3. Snow ground (fill below hill surface)
    // ------------------------------------------------------------------

    /**
     * Get cached profile screen coordinates. Only recomputes when camera changes.
     */
    _getProfileScreen() {
        if (!this.hill) return this._cachedProfileScreen;
        const r = this.renderer;
        if (Math.abs(this._cachedCameraX - r.cameraX) < 0.1 &&
            Math.abs(this._cachedCameraY - r.cameraY) < 0.1 &&
            Math.abs(this._cachedZoom - r.zoom) < 0.1) {
            return this._cachedProfileScreen;
        }
        const profile = this.hill.getProfile();
        // Reuse existing array to avoid allocation
        if (this._cachedProfileScreen.length !== profile.length) {
            this._cachedProfileScreen = new Array(profile.length);
            for (let i = 0; i < profile.length; i++) {
                this._cachedProfileScreen[i] = { x: 0, y: 0 };
            }
        }
        for (let i = 0; i < profile.length; i++) {
            const sp = r.worldToScreen(profile[i].x, profile[i].y);
            this._cachedProfileScreen[i].x = sp.x;
            this._cachedProfileScreen[i].y = sp.y;
        }
        this._cachedCameraX = r.cameraX;
        this._cachedCameraY = r.cameraY;
        this._cachedZoom = r.zoom;
        return this._cachedProfileScreen;
    }

    _drawSnowGround(ctx, w, h) {
        if (!this.hill) return;
        const profile = this.hill.getProfile();
        const r = this.renderer;
        const profileScreen = this._getProfileScreen();

        // --- Main snow ground fill with gradient ---
        ctx.beginPath();
        ctx.moveTo(profileScreen[0].x, profileScreen[0].y);
        for (let i = 1; i < profileScreen.length; i++) {
            ctx.lineTo(profileScreen[i].x, profileScreen[i].y);
        }
        const lastScreen = profileScreen[profileScreen.length - 1];
        const firstScreen = profileScreen[0];
        ctx.lineTo(lastScreen.x, h + 50);
        ctx.lineTo(firstScreen.x, h + 50);
        ctx.closePath();

        // Gradient from bluish-white at surface to deeper blue below
        const surfaceY = Math.min(firstScreen.y, lastScreen.y);
        const groundGrad = ctx.createLinearGradient(0, surfaceY, 0, h + 50);
        groundGrad.addColorStop(0, '#e4eef8');
        groundGrad.addColorStop(0.05, '#dce8f5');
        groundGrad.addColorStop(0.15, '#d0e0f2');
        groundGrad.addColorStop(0.35, '#c0d4ea');
        groundGrad.addColorStop(0.6, '#a0b8d8');
        groundGrad.addColorStop(1, '#7090b8');
        ctx.fillStyle = groundGrad;
        ctx.fill();

        // --- Subtle blue shadow patches for depth ---
        // Cache the seeded random results so we don't re-run the RNG every frame
        const xRange = profile[profile.length - 1].x - profile[0].x;
        const xStart = profile[0].x;
        if (!this._snowGroundShadows) {
            const rng = seededRandom(2024);
            this._snowGroundShadows = [];
            for (let i = 0; i < 40; i++) {
                const wxNorm = rng();
                const wyOff = 1 + rng() * 10;
                this._snowGroundShadows.push({
                    wxNorm, wyOff,
                    radX: 8 + rng() * 30,
                    radY: 3 + rng() * 8,
                    blueTint: Math.floor(80 + rng() * 40),
                    alpha: 0.04 + rng() * 0.06,
                    rot: rng() * 0.4,
                    color: `rgb(70,${Math.floor(80 + rng() * 40)},170)`,
                });
            }
        }
        ctx.save();
        for (let i = 0; i < this._snowGroundShadows.length; i++) {
            const s = this._snowGroundShadows[i];
            const wx = xStart + s.wxNorm * xRange;
            const wy = this.hill.getHeightAtDistance(wx);
            const sp1 = r.worldToScreen(wx, wy + s.wyOff);
            if (sp1.x < -60 || sp1.x > w + 60 || sp1.y < -20 || sp1.y > h + 60) continue;
            ctx.globalAlpha = s.alpha;
            ctx.beginPath();
            ctx.ellipse(sp1.x, sp1.y, s.radX, s.radY, s.rot, 0, Math.PI * 2);
            ctx.fillStyle = s.color;
            ctx.fill();
        }
        ctx.restore();

        // --- Snow drift ridges (wavy highlight lines along the ground) ---
        // Cache ridge data to avoid re-running seeded RNG every frame
        if (!this._snowGroundRidges) {
            const rng3 = seededRandom(6060);
            this._snowGroundRidges = [];
            for (let ridge = 0; ridge < 14; ridge++) {
                const wxNorm = rng3();
                const wyOff = 2 + rng3() * 16;
                const ridgeLen = 6 + rng3() * 25;
                const bright = rng3() < 0.5;
                const lineWidth = 0.8 + rng3() * 0.8;
                const segPhases = [];
                for (let j = 0; j <= 12; j++) {
                    segPhases.push(rng3() * 6.28);
                }
                this._snowGroundRidges.push({
                    wxNorm, wyOff, ridgeLen, bright, lineWidth, segPhases,
                });
            }
        }
        ctx.save();
        ctx.lineCap = 'round';
        for (let ri = 0; ri < this._snowGroundRidges.length; ri++) {
            const rd = this._snowGroundRidges[ri];
            const baseWx = xStart + rd.wxNorm * xRange;
            const baseWy = this.hill.getHeightAtDistance(baseWx) + rd.wyOff;
            ctx.globalAlpha = rd.bright ? 0.1 : 0.06;
            ctx.strokeStyle = rd.bright ? '#f0f6ff' : '#d8e8f8';
            ctx.lineWidth = rd.lineWidth;
            ctx.beginPath();
            for (let j = 0; j <= 12; j++) {
                const rx = baseWx + (j / 12) * rd.ridgeLen;
                const ry = baseWy + Math.sin(j * 0.7 + rd.segPhases[j]) * 0.6;
                const sp = r.worldToScreen(rx, ry);
                if (j === 0) ctx.moveTo(sp.x, sp.y);
                else ctx.lineTo(sp.x, sp.y);
            }
            ctx.stroke();
        }
        ctx.restore();

        // --- Pine trees at varying distances along the ground ---
        this._drawSnowGroundTrees(ctx, w, h);

        // --- Sparkle dots that twinkle over time ---
        // Cache sparkle seeded random data
        if (!this._snowGroundSparkles) {
            const rng2 = seededRandom(4040);
            this._snowGroundSparkles = [];
            for (let i = 0; i < 70; i++) {
                const wxNorm = rng2();
                const wyOff = 1 + rng2() * 14;
                const freq = 1.2 + rng2() * 2.5;
                const phase = rng2() * 6.28;
                const dotR = 0.8 + rng2() * 1.0;
                this._snowGroundSparkles.push({ wxNorm, wyOff, freq, phase, dotR });
            }
        }
        const t = this._time || 0;
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.4;
        for (let i = 0; i < this._snowGroundSparkles.length; i++) {
            const sd = this._snowGroundSparkles[i];
            const raw = Math.sin(t * sd.freq + sd.phase);
            if (raw < 0.3) continue;
            const wx = xStart + sd.wxNorm * xRange;
            const wy = this.hill.getHeightAtDistance(wx) + sd.wyOff;
            const sp = r.worldToScreen(wx, wy);
            if (sp.x < -20 || sp.x > w + 20 || sp.y < -20 || sp.y > h + 20) continue;
            const intensity = (raw - 0.3) / 0.7;
            ctx.globalAlpha = 0.25 * intensity * intensity;
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, sd.dotR, 0, Math.PI * 2);
            ctx.fill();
            // Add a tiny cross-star on the brightest sparkles
            if (intensity > 0.7) {
                ctx.globalAlpha = 0.15 * intensity;
                const cr = sd.dotR * 2.5;
                ctx.beginPath();
                ctx.moveTo(sp.x - cr, sp.y);
                ctx.lineTo(sp.x + cr, sp.y);
                ctx.moveTo(sp.x, sp.y - cr);
                ctx.lineTo(sp.x, sp.y + cr);
                ctx.stroke();
            }
        }
        ctx.restore();

        // --- Original pine trees along the hill sides ---
        this._drawPineTrees(ctx, w, h);

        // --- Crowd areas near the outrun ---
        this._drawCrowdArea(ctx, w, h);
    }

    /** Draw 10-15 recognizable pine trees at varying distances along the snowy ground. */
    _drawSnowGroundTrees(ctx, w, h) {
        if (!this.hill) return;
        const r = this.renderer;
        const rng = seededRandom(8888);
        const profile = this.hill.getProfile();
        const xStart = profile[0].x;
        const xRange = profile[profile.length - 1].x - xStart;

        const trees = [];
        const treeCount = 12;
        for (let i = 0; i < treeCount; i++) {
            const wx = xStart + rng() * xRange;
            const wy = this.hill.getHeightAtDistance(wx);
            // Place trees behind the hill surface (larger offsetY = further behind)
            const distance = rng(); // 0 = far, 1 = near
            const offsetY = 6 + (1 - distance) * 20 + rng() * 5;
            const treeH = 2.5 + distance * 4 + rng() * 2; // far trees smaller
            trees.push({ wx, wy: wy + offsetY, h: treeH, distance, seed: rng() });
        }

        // Sort: far trees first (drawn behind near trees)
        trees.sort((a, b) => a.distance - b.distance);

        for (const tree of trees) {
            const base = r.worldToScreen(tree.wx, tree.wy);
            const top = r.worldToScreen(tree.wx, tree.wy - tree.h);
            const treeHPx = base.y - top.y;
            if (treeHPx < 3 || base.y < -50 || base.y > h + 100) continue;
            if (base.x < -100 || base.x > w + 100) continue;

            const treeW = treeHPx * 0.5;
            // Far trees are slightly lighter/more muted (atmospheric perspective)
            const dist = tree.distance;

            // --- Brown trunk ---
            const trunkW = treeW * 0.12;
            const trunkH = treeHPx * 0.18;
            ctx.fillStyle = dist < 0.3 ? '#4a3520' : '#3a2510';
            ctx.fillRect(base.x - trunkW, base.y - trunkH, trunkW * 2, trunkH);

            // --- Three triangular foliage layers (dark green body) ---
            const greenR = Math.floor(10 + (1 - dist) * 15);
            const greenG = Math.floor(50 + (1 - dist) * 30 + tree.seed * 15);
            const greenB = Math.floor(18 + (1 - dist) * 10);
            const layers = [
                { yOff: 0.0, wScale: 1.0, brighten: 0 },
                { yOff: 0.28, wScale: 0.75, brighten: 8 },
                { yOff: 0.52, wScale: 0.5, brighten: 16 },
            ];
            for (const layer of layers) {
                const ly = base.y - treeHPx * (0.18 + layer.yOff * 0.82);
                const lh = treeHPx * 0.42;
                const lw = treeW * layer.wScale;
                const gR = Math.min(255, greenR + layer.brighten);
                const gG = Math.min(255, greenG + layer.brighten);
                const gB = Math.min(255, greenB + layer.brighten);
                ctx.fillStyle = `rgb(${gR},${gG},${gB})`;
                ctx.beginPath();
                ctx.moveTo(base.x, ly - lh);
                ctx.lineTo(base.x - lw / 2, ly);
                ctx.lineTo(base.x + lw / 2, ly);
                ctx.closePath();
                ctx.fill();
            }

            // --- White snow on top of each foliage layer ---
            ctx.globalAlpha = 0.7;
            ctx.fillStyle = '#e1eeff';
            // Snow cap on the tip
            const capW = treeW * 0.22;
            const capY = base.y - treeHPx * 0.95;
            ctx.beginPath();
            ctx.moveTo(base.x, top.y - 1);
            ctx.lineTo(base.x - capW, capY + treeHPx * 0.08);
            ctx.lineTo(base.x + capW, capY + treeHPx * 0.08);
            ctx.closePath();
            ctx.fill();

            // Snow patches on lower layers (wider, subtle)
            for (const layer of [layers[0], layers[1]]) {
                const ly = base.y - treeHPx * (0.18 + layer.yOff * 0.82);
                const lw = treeW * layer.wScale;
                const snowW = lw * 0.45;
                ctx.globalAlpha = 0.4;
                ctx.beginPath();
                ctx.moveTo(base.x - snowW * 0.3, ly - treeHPx * 0.35);
                ctx.lineTo(base.x - snowW * 0.6, ly - treeHPx * 0.22);
                ctx.lineTo(base.x + snowW * 0.1, ly - treeHPx * 0.28);
                ctx.closePath();
                ctx.fill();
            }
            ctx.globalAlpha = 1.0;
        }
    }

    /** Draw simple pine trees (triangular) along the sides of the hill. */
    _drawPineTrees(ctx, w, h) {
        if (!this.hill) return;
        const r = this.renderer;
        const rng = seededRandom(3141);
        const profile = this.hill.getProfile();
        const startX = profile[0].x;
        const endX = profile[profile.length - 1].x;

        // Trees on both sides of the hill (offset laterally by drawing them
        // above the hill surface at different x positions)
        const treePositions = [];
        for (let i = 0; i < 40; i++) {
            const wx = startX + rng() * (endX - startX);
            const wy = this.hill.getHeightAtDistance(wx);
            // Offset trees below/behind the slope (positive y = further down)
            const offsetY = 4 + rng() * 18;
            const treeH = 3 + rng() * 5; // tree height in meters
            treePositions.push({ wx, wy: wy + offsetY, h: treeH, shade: rng() });
        }

        // Sort by y so farther trees draw first
        treePositions.sort((a, b) => a.wy - b.wy);

        for (const tree of treePositions) {
            const base = r.worldToScreen(tree.wx, tree.wy);
            const top = r.worldToScreen(tree.wx, tree.wy - tree.h);
            const treeHPx = base.y - top.y;
            if (treeHPx < 3 || base.y < -50 || base.y > h + 100) continue;
            if (base.x < -100 || base.x > w + 100) continue;

            const treeW = treeHPx * 0.55;

            // Trunk
            ctx.fillStyle = '#3a2510';
            ctx.fillRect(base.x - treeW * 0.08, base.y - treeHPx * 0.15, treeW * 0.16, treeHPx * 0.15);

            // Three triangle layers for foliage
            const darkGreen = tree.shade < 0.5 ? '#0a3a12' : '#0d4218';
            const midGreen = tree.shade < 0.5 ? '#0e4a1a' : '#125520';
            const lightGreen = tree.shade < 0.5 ? '#1a6030' : '#1e6e35';
            const layers = [
                { yOff: 0.0, wScale: 1.0, color: darkGreen },
                { yOff: 0.25, wScale: 0.78, color: midGreen },
                { yOff: 0.5, wScale: 0.55, color: lightGreen },
            ];
            for (const layer of layers) {
                const ly = base.y - treeHPx * (0.15 + layer.yOff * 0.85);
                const lh = treeHPx * 0.45;
                const lw = treeW * layer.wScale;
                ctx.fillStyle = layer.color;
                ctx.beginPath();
                ctx.moveTo(base.x, ly - lh);
                ctx.lineTo(base.x - lw / 2, ly);
                ctx.lineTo(base.x + lw / 2, ly);
                ctx.closePath();
                ctx.fill();
            }

            // Snow caps on tree tops
            ctx.fillStyle = 'rgba(220,235,255,0.6)';
            ctx.beginPath();
            const snowY = base.y - treeHPx * 0.92;
            ctx.moveTo(base.x, top.y - 1);
            ctx.lineTo(base.x - treeW * 0.18, snowY + treeHPx * 0.06);
            ctx.lineTo(base.x + treeW * 0.18, snowY + treeHPx * 0.06);
            ctx.closePath();
            ctx.fill();
        }
    }

    /** Draw crowd area with small colored dots near the outrun. */
    _drawCrowdArea(ctx, w, h) {
        if (!this.hill) return;
        const r = this.renderer;
        const rng = seededRandom(5555);
        const outrunEnd = this.hill.getOutrunEndPosition();
        const kp = this.hill.getKPointPosition();

        if (!outrunEnd || !kp) return;

        // Crowd fence line (barrier along the side of the outrun)
        const fenceStartX = kp.x + 15;
        const fenceEndX = outrunEnd.x - 5;
        const fenceY = this.hill.getHeightAtDistance(fenceEndX) || outrunEnd.y;

        // Draw a simple fence line
        ctx.strokeStyle = '#556677';
        ctx.lineWidth = 1;
        for (let fx = fenceStartX; fx < fenceEndX; fx += 3) {
            const fy = this.hill.getHeightAtDistance(fx);
            const sp = r.worldToScreen(fx, fy + 4);
            const spTop = r.worldToScreen(fx, fy + 2.5);
            ctx.beginPath();
            ctx.moveTo(sp.x, sp.y);
            ctx.lineTo(spTop.x, spTop.y);
            ctx.stroke();
        }
        // Horizontal fence rail
        ctx.beginPath();
        ctx.strokeStyle = '#667788';
        ctx.lineWidth = 1.5;
        let fFirst = true;
        for (let fx = fenceStartX; fx < fenceEndX; fx += 2) {
            const fy = this.hill.getHeightAtDistance(fx);
            const sp = r.worldToScreen(fx, fy + 2.8);
            if (fFirst) { ctx.moveTo(sp.x, sp.y); fFirst = false; }
            else ctx.lineTo(sp.x, sp.y);
        }
        ctx.stroke();
    }

    // ------------------------------------------------------------------
    // 4. Hill surface with markings
    // ------------------------------------------------------------------

    _drawHillSurface(ctx, w, h) {
        if (!this.hill) return;
        const r = this.renderer;
        const profile = this.hill.getProfile();
        const inrunPts = this.hill.getInrunPoints();
        const landingPts = this.hill.getLandingPoints();

        // --- Inrun: dark side walls flanking the ice track ---
        const wallThickness = 1.2;
        // Lower wall
        ctx.beginPath();
        let first = true;
        for (const pt of inrunPts) {
            const sp = r.worldToScreen(pt.x, pt.y + wallThickness);
            if (first) { ctx.moveTo(sp.x, sp.y); first = false; }
            else ctx.lineTo(sp.x, sp.y);
        }
        for (let i = inrunPts.length - 1; i >= 0; i--) {
            const sp = r.worldToScreen(inrunPts[i].x, inrunPts[i].y + wallThickness + 2.5);
            ctx.lineTo(sp.x, sp.y);
        }
        ctx.closePath();
        ctx.fillStyle = '#2a3040';
        ctx.fill();
        // Upper wall
        ctx.beginPath();
        first = true;
        for (const pt of inrunPts) {
            const sp = r.worldToScreen(pt.x, pt.y - wallThickness);
            if (first) { ctx.moveTo(sp.x, sp.y); first = false; }
            else ctx.lineTo(sp.x, sp.y);
        }
        for (let i = inrunPts.length - 1; i >= 0; i--) {
            const sp = r.worldToScreen(inrunPts[i].x, inrunPts[i].y - wallThickness - 2.5);
            ctx.lineTo(sp.x, sp.y);
        }
        ctx.closePath();
        ctx.fillStyle = '#2a3040';
        ctx.fill();

        // Orange barrier nets on top of walls
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ff6600';
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        first = true;
        for (let i = 0; i < inrunPts.length; i += 4) {
            const sp = r.worldToScreen(inrunPts[i].x, inrunPts[i].y + wallThickness + 0.3);
            if (first) { ctx.moveTo(sp.x, sp.y); first = false; }
            else ctx.lineTo(sp.x, sp.y);
        }
        ctx.stroke();
        ctx.beginPath();
        first = true;
        for (let i = 0; i < inrunPts.length; i += 4) {
            const sp = r.worldToScreen(inrunPts[i].x, inrunPts[i].y - wallThickness - 0.3);
            if (first) { ctx.moveTo(sp.x, sp.y); first = false; }
            else ctx.lineTo(sp.x, sp.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Net posts every ~8m along the inrun
        ctx.strokeStyle = '#cc5500';
        ctx.lineWidth = 1.5;
        const postStep = Math.max(1, Math.floor(inrunPts.length / 12));
        for (let i = 0; i < inrunPts.length; i += postStep) {
            const pt = inrunPts[i];
            let sp1 = r.worldToScreen(pt.x, pt.y + wallThickness + 0.3);
            let sp2 = r.worldToScreen(pt.x, pt.y + wallThickness - 0.8);
            ctx.beginPath(); ctx.moveTo(sp1.x, sp1.y); ctx.lineTo(sp2.x, sp2.y); ctx.stroke();
            sp1 = r.worldToScreen(pt.x, pt.y - wallThickness - 0.3);
            sp2 = r.worldToScreen(pt.x, pt.y - wallThickness + 0.8);
            ctx.beginPath(); ctx.moveTo(sp1.x, sp1.y); ctx.lineTo(sp2.x, sp2.y); ctx.stroke();
        }

        // Icy blue-white inrun track surface
        ctx.beginPath();
        first = true;
        for (const pt of inrunPts) {
            const sp = r.worldToScreen(pt.x, pt.y);
            if (first) { ctx.moveTo(sp.x, sp.y); first = false; }
            else ctx.lineTo(sp.x, sp.y);
        }
        const inrunLast = inrunPts[inrunPts.length - 1];
        const inrunFirst = inrunPts[0];
        const inrunLastS = r.worldToScreen(inrunLast.x, inrunLast.y);
        const inrunFirstS = r.worldToScreen(inrunFirst.x, inrunFirst.y);
        const iceThickness = 2 * r.ppm;
        ctx.lineTo(inrunLastS.x, inrunLastS.y + iceThickness);
        ctx.lineTo(inrunFirstS.x, inrunFirstS.y + iceThickness);
        ctx.closePath();
        const iceGrad = ctx.createLinearGradient(inrunFirstS.x, inrunFirstS.y, inrunLastS.x, inrunLastS.y);
        iceGrad.addColorStop(0, '#d8eeff');
        iceGrad.addColorStop(0.3, '#c0ddf8');
        iceGrad.addColorStop(0.6, '#b8d8f5');
        iceGrad.addColorStop(1, '#d0e8ff');
        ctx.fillStyle = iceGrad;
        ctx.fill();

        // --- Ice texture: subtle horizontal streaks of lighter blue ---
        ctx.save();
        if (!this._iceStreaks) {
            const iceRng = seededRandom(3030);
            this._iceStreaks = [];
            for (let i = 0; i < 18; i++) {
                this._iceStreaks.push({
                    tNorm: iceRng(),
                    offsetY: (iceRng() - 0.5) * 0.6,
                    alpha: 0.12 + iceRng() * 0.18,
                    width: 0.5 + iceRng() * 1.0,
                    color: iceRng() < 0.5 ? '#e8f4ff' : '#d0ecff',
                });
            }
        }
        for (const streak of this._iceStreaks) {
            const idx = Math.floor(streak.tNorm * (inrunPts.length - 10));
            if (idx < 0 || idx + 8 >= inrunPts.length) continue;
            ctx.globalAlpha = streak.alpha;
            ctx.strokeStyle = streak.color;
            ctx.lineWidth = streak.width;
            ctx.beginPath();
            for (let j = 0; j < 8; j++) {
                const pt = inrunPts[idx + j];
                const sp = r.worldToScreen(pt.x, pt.y + streak.offsetY);
                if (j === 0) ctx.moveTo(sp.x, sp.y);
                else ctx.lineTo(sp.x, sp.y);
            }
            ctx.stroke();
        }
        ctx.restore();

        // Icy glare streaks
        ctx.save();
        ctx.globalAlpha = 0.25;
        const glareStep = Math.max(1, Math.floor(inrunPts.length / 8));
        for (let i = 0; i < inrunPts.length - 10; i += glareStep) {
            const p1 = r.worldToScreen(inrunPts[i].x, inrunPts[i].y);
            const p2 = r.worldToScreen(inrunPts[i + 8].x, inrunPts[i + 8].y);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
        ctx.restore();

        // --- Track rails: two dark parallel lines with glossy shine ---
        const railOffset = 0.35;
        for (const side of [-1, 1]) {
            ctx.beginPath();
            first = true;
            for (let i = 0; i < inrunPts.length; i += 2) {
                const pt = inrunPts[i];
                const sp = r.worldToScreen(pt.x, pt.y + side * railOffset);
                if (first) { ctx.moveTo(sp.x, sp.y); first = false; }
                else ctx.lineTo(sp.x, sp.y);
            }
            ctx.strokeStyle = '#1a2233';
            ctx.lineWidth = 1.8;
            ctx.stroke();
            // Shine highlight on rail
            ctx.save();
            ctx.beginPath();
            first = true;
            for (let i = 0; i < inrunPts.length; i += 2) {
                const pt = inrunPts[i];
                const sp = r.worldToScreen(pt.x, pt.y + side * railOffset - 0.05);
                if (first) { ctx.moveTo(sp.x, sp.y); first = false; }
                else ctx.lineTo(sp.x, sp.y);
            }
            ctx.globalAlpha = 0.4;
            ctx.strokeStyle = '#aaccee';
            ctx.lineWidth = 0.6;
            ctx.stroke();
            ctx.restore();
        }

        // --- Table edge: warm amber glow ---
        ctx.save();
        ctx.shadowColor = '#ffaa33';
        ctx.shadowBlur = 12;
        ctx.strokeStyle = '#ffcc44';
        ctx.lineWidth = 3.5;
        const teUp = r.worldToScreen(0, -wallThickness - 0.5);
        const teDown = r.worldToScreen(0, wallThickness + 0.5);
        ctx.beginPath();
        ctx.moveTo(teUp.x, teUp.y);
        ctx.lineTo(teDown.x, teDown.y);
        ctx.stroke();
        ctx.shadowBlur = 20;
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(teUp.x, teUp.y);
        ctx.lineTo(teDown.x, teDown.y);
        ctx.stroke();
        ctx.restore();

        // --- Landing slope: white snow surface with noise texture ---
        ctx.beginPath();
        first = true;
        for (const pt of landingPts) {
            const sp = r.worldToScreen(pt.x, pt.y);
            if (first) { ctx.moveTo(sp.x, sp.y); first = false; }
            else ctx.lineTo(sp.x, sp.y);
        }
        const landLastS = r.worldToScreen(landingPts[landingPts.length - 1].x, landingPts[landingPts.length - 1].y);
        const landFirstS = r.worldToScreen(landingPts[0].x, landingPts[0].y);
        const thickness = 4 * r.ppm;
        ctx.lineTo(landLastS.x, landLastS.y + thickness);
        ctx.lineTo(landFirstS.x, landFirstS.y + thickness);
        ctx.closePath();
        const snowGrad = ctx.createLinearGradient(0, landFirstS.y, 0, landFirstS.y + thickness);
        snowGrad.addColorStop(0, '#fafeff');
        snowGrad.addColorStop(0.3, '#f0f6fc');
        snowGrad.addColorStop(1, '#dde8f2');
        ctx.fillStyle = snowGrad;
        ctx.fill();

        // Snow noise texture (subtle random dots on landing slope)
        ctx.save();
        if (!this._snowNoiseDots) {
            const noiseRng = seededRandom(7171);
            this._snowNoiseDots = [];
            for (let i = 0; i < 200; i++) {
                this._snowNoiseDots.push({
                    tNorm: noiseRng(),
                    offY: noiseRng() * 2.0,
                    dotR: 0.5 + noiseRng() * 1.2,
                    bright: noiseRng() < 0.5,
                });
            }
        }
        for (const dot of this._snowNoiseDots) {
            const idx = Math.floor(dot.tNorm * (landingPts.length - 1));
            if (idx < 0 || idx >= landingPts.length) continue;
            const pt = landingPts[idx];
            const sp = r.worldToScreen(pt.x, pt.y + dot.offY);
            if (sp.x < -10 || sp.x > w + 10 || sp.y < -10 || sp.y > h + 10) continue;
            ctx.globalAlpha = dot.bright ? 0.12 : 0.06;
            ctx.fillStyle = dot.bright ? '#ffffff' : '#c8d8e8';
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, dot.dotR, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // Shadow strip just below surface edge
        ctx.beginPath();
        first = true;
        for (let i = 0; i < profile.length; i++) {
            const sp = r.worldToScreen(profile[i].x, profile[i].y + 0.3);
            if (first) { ctx.moveTo(sp.x, sp.y); first = false; }
            else ctx.lineTo(sp.x, sp.y);
        }
        for (let i = profile.length - 1; i >= 0; i--) {
            const sp = r.worldToScreen(profile[i].x, profile[i].y + 1.2);
            ctx.lineTo(sp.x, sp.y);
        }
        ctx.closePath();
        ctx.fillStyle = '#d0e0f0';
        ctx.fill();

        // --- Surface outline (use cached profile screen coords) ---
        const profileScreen = this._getProfileScreen();
        ctx.beginPath();
        ctx.moveTo(profileScreen[0].x, profileScreen[0].y);
        for (let i = 1; i < profileScreen.length; i++) {
            ctx.lineTo(profileScreen[i].x, profileScreen[i].y);
        }
        ctx.strokeStyle = '#667788';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // --- Floodlight poles along the hill ---
        this._drawFloodlights(ctx, w, h);

        // --- Distance markers on landing slope (every 10m) ---
        this._drawDistanceMarkers(ctx);

        // --- K-point and HS-point lines ---
        this._drawPointMarker(ctx, this.hill.getKPointPosition(), '#ff2222', 'K');
        this._drawPointMarker(ctx, this.hill.getHSPointPosition(), '#2255ff', 'HS');

        // --- Judges tower ---
        this._drawJudgesTower(ctx);
    }

    _drawFloodlights(ctx, w, h) {
        if (!this.hill) return;
        const r = this.renderer;
        const kp = this.hill.getKPointPosition();
        const hs = this.hill.getHSPointPosition();
        if (!kp || !hs) return;

        const polePositions = [
            { x: kp.x * 0.3, side: 1 },
            { x: kp.x * 0.65, side: -1 },
            { x: kp.x * 1.0, side: 1 },
            { x: hs.x * 0.9, side: -1 },
        ];

        for (const pole of polePositions) {
            const surfaceY = this.hill.getHeightAtDistance(pole.x);
            const poleBaseY = surfaceY + pole.side * 6;
            const poleHeight = 18;
            const poleTopY = poleBaseY - poleHeight;

            const base = r.worldToScreen(pole.x, poleBaseY);
            const top = r.worldToScreen(pole.x, poleTopY);
            if (base.x < -100 || base.x > w + 100) continue;

            // Pole
            ctx.beginPath();
            ctx.moveTo(base.x, base.y);
            ctx.lineTo(top.x, top.y);
            ctx.strokeStyle = '#556677';
            ctx.lineWidth = 2.5;
            ctx.stroke();

            // Light fixture bracket
            ctx.fillStyle = '#778899';
            ctx.fillRect(top.x - 5, top.y - 2, 10, 4);

            // Light cone
            const coneTarget = r.worldToScreen(pole.x, surfaceY);
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const coneH = Math.abs(coneTarget.y - top.y);
            const coneGrad = ctx.createRadialGradient(top.x, top.y, 2, top.x, top.y, coneH * 0.9);
            coneGrad.addColorStop(0, 'rgba(255,255,240,0.35)');
            coneGrad.addColorStop(0.3, 'rgba(255,255,230,0.12)');
            coneGrad.addColorStop(0.7, 'rgba(255,255,220,0.04)');
            coneGrad.addColorStop(1, 'rgba(255,255,220,0)');
            const coneSpread = coneH * 0.4;
            ctx.beginPath();
            ctx.moveTo(top.x - 3, top.y);
            ctx.lineTo(top.x + 3, top.y);
            ctx.lineTo(coneTarget.x + coneSpread, coneTarget.y);
            ctx.lineTo(coneTarget.x - coneSpread, coneTarget.y);
            ctx.closePath();
            ctx.fillStyle = coneGrad;
            ctx.fill();
            ctx.restore();

            // Bright dot at fixture
            ctx.beginPath();
            ctx.arc(top.x, top.y, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffee';
            ctx.fill();
        }
    }

    _drawDistanceMarkers(ctx) {
        if (!this.hill) return;
        const r = this.renderer;
        const landingPts = this.hill.getLandingPoints();

        for (let dist = 50; dist <= 140; dist += 10) {
            let closest = null;
            let minDiff = Infinity;
            for (const pt of landingPts) {
                const diff = Math.abs(pt.x - dist);
                if (diff < minDiff) {
                    minDiff = diff;
                    closest = pt;
                }
            }
            if (!closest || minDiff > 2) continue;

            const sp = r.worldToScreen(closest.x, closest.y);
            const angle = this.hill.getAngleAtDistance(closest.x) * Math.PI / 180;
            const nx = -Math.sin(angle);
            const ny = Math.cos(angle);
            const markerLen = 6;

            // Green perpendicular line
            ctx.beginPath();
            ctx.moveTo(sp.x - nx * markerLen, sp.y + ny * markerLen);
            ctx.lineTo(sp.x + nx * markerLen, sp.y - ny * markerLen);
            ctx.strokeStyle = '#33bb33';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Distance number
            ctx.save();
            ctx.font = 'bold 10px sans-serif';
            ctx.fillStyle = '#33bb33';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(String(dist), sp.x + nx * (markerLen + 2), sp.y - ny * (markerLen + 2) - 2);
            ctx.restore();
        }
    }

    _drawPointMarker(ctx, pos, color, label) {
        if (!this.hill) return;
        const r = this.renderer;
        if (!pos) return;

        const sp = r.worldToScreen(pos.x, pos.y);
        const angle = this.hill.getAngleAtDistance(pos.x) * Math.PI / 180;
        const nx = -Math.sin(angle);
        const ny = Math.cos(angle);
        const lineLen = 14;

        // Thick perpendicular line
        ctx.beginPath();
        ctx.moveTo(sp.x - nx * lineLen, sp.y + ny * lineLen);
        ctx.lineTo(sp.x + nx * lineLen, sp.y - ny * lineLen);
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.stroke();

        // Glow effect
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(sp.x - nx * lineLen, sp.y + ny * lineLen);
        ctx.lineTo(sp.x + nx * lineLen, sp.y - ny * lineLen);
        ctx.strokeStyle = color;
        ctx.stroke();
        ctx.restore();

        // Label with background
        ctx.save();
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const labelX = sp.x + nx * (lineLen + 4);
        const labelY = sp.y - ny * (lineLen + 4) - 3;
        const metrics = ctx.measureText(label);
        const pad = 3;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(labelX - metrics.width / 2 - pad, labelY - 12 - pad, metrics.width + pad * 2, 14 + pad);
        ctx.fillStyle = color;
        ctx.fillText(label, labelX, labelY);
        ctx.restore();
    }

    _drawJudgesTower(ctx) {
        if (!this.hill) return;
        const r = this.renderer;
        const kp = this.hill.getKPointPosition();
        if (!kp) return;

        const towerX = kp.x + 5;
        const surfaceY = this.hill.getHeightAtDistance(towerX);
        const numFloors = 6;
        const floorH = 3;
        const towerTopY = surfaceY - numFloors * floorH;

        const base = r.worldToScreen(towerX, surfaceY + 3);
        const top = r.worldToScreen(towerX, towerTopY);

        const towerWidth = 14;
        const towerHeight = base.y - top.y;
        const floorHeightPx = towerHeight / numFloors;

        // Tower shadow
        ctx.save();
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.moveTo(base.x - towerWidth / 2, base.y);
        ctx.lineTo(base.x + towerWidth / 2, base.y);
        ctx.lineTo(base.x + towerWidth / 2 + 8, base.y + 4);
        ctx.lineTo(base.x - towerWidth / 2 + 8, base.y + 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Tower body (concrete gradient)
        const bodyGrad = ctx.createLinearGradient(top.x - towerWidth / 2, top.y, top.x + towerWidth / 2, top.y);
        bodyGrad.addColorStop(0, '#3a4a5a');
        bodyGrad.addColorStop(0.5, '#4a5a6a');
        bodyGrad.addColorStop(1, '#334455');
        ctx.fillStyle = bodyGrad;
        ctx.fillRect(top.x - towerWidth / 2, top.y, towerWidth, towerHeight);

        // Floors with lit windows
        const t = this._time || 0;
        for (let i = 0; i < numFloors; i++) {
            const floorY = top.y + i * floorHeightPx;

            // Floor divider
            ctx.fillStyle = '#2a3545';
            ctx.fillRect(top.x - towerWidth / 2, floorY, towerWidth, 1.5);

            // Two windows per floor
            const winW = towerWidth * 0.28;
            const winH = floorHeightPx * 0.5;
            const winY = floorY + floorHeightPx * 0.25;

            for (let wx = 0; wx < 2; wx++) {
                const winX = top.x - towerWidth / 2 + 2 + wx * (towerWidth * 0.45);

                // Window frame
                ctx.fillStyle = '#2a3040';
                ctx.fillRect(winX - 0.5, winY - 0.5, winW + 1, winH + 1);

                // Warm yellow lit window with flicker
                const flicker = 0.85 + 0.15 * Math.sin(t * 2.3 + i * 1.7 + wx * 3.1);
                const warmR = Math.floor(255 * flicker);
                const warmG = Math.floor(210 * flicker);
                const warmB = Math.floor(80 * flicker);
                ctx.fillStyle = `rgb(${warmR},${warmG},${warmB})`;
                ctx.fillRect(winX, winY, winW, winH);

                // Window glow
                ctx.save();
                ctx.globalAlpha = 0.15 * flicker;
                const glowRad = Math.max(winW, winH) * 1.5;
                const glowGrad = ctx.createRadialGradient(winX + winW / 2, winY + winH / 2, 1, winX + winW / 2, winY + winH / 2, glowRad);
                glowGrad.addColorStop(0, `rgb(${warmR},${warmG},${warmB})`);
                glowGrad.addColorStop(1, 'rgba(255,200,50,0)');
                ctx.fillStyle = glowGrad;
                ctx.fillRect(winX - glowRad, winY - glowRad, winW + glowRad * 2, winH + glowRad * 2);
                ctx.restore();
            }
        }

        // Roof / observation deck
        ctx.fillStyle = '#223344';
        ctx.fillRect(top.x - towerWidth / 2 - 3, top.y - 4, towerWidth + 6, 5);
        // Railing
        ctx.strokeStyle = '#556677';
        ctx.lineWidth = 1;
        ctx.strokeRect(top.x - towerWidth / 2 - 3, top.y - 7, towerWidth + 6, 3);
    }

    // ------------------------------------------------------------------
    // 5. Ski jumper
    // ------------------------------------------------------------------

    _drawJumper(ctx, js) {
        if (!js) return;

        const r = this.renderer;
        const sp = r.worldToScreen(js.x, js.y);
        const ppm = r.ppm;

        const scale = ppm;
        const phase = js.phase;
        const bodyAngle = (js.bodyAngle || 0) * Math.PI / 180;

        // --- Motion trail during FLIGHT (last 4 positions, fading afterimages) ---
        if (phase === GameState.FLIGHT || phase === 'FLIGHT') {
            if (!this._jumperTrail) this._jumperTrail = [];
            this._jumperTrail.push({ x: js.x, y: js.y, angle: bodyAngle });
            if (this._jumperTrail.length > 5) this._jumperTrail.shift();

            const trailAlphas = [0.05, 0.1, 0.15, 0.2];
            const trailCount = Math.min(4, this._jumperTrail.length - 1);
            for (let i = 0; i < trailCount; i++) {
                const t = this._jumperTrail[i];
                const tsp = r.worldToScreen(t.x, t.y);
                ctx.save();
                ctx.globalAlpha = trailAlphas[i] || 0.05;
                ctx.translate(tsp.x, tsp.y);
                this._drawJumperFlight(ctx, scale, t.angle);
                ctx.restore();
            }
        } else {
            this._jumperTrail = [];
        }

        // --- Draw the main jumper ---
        ctx.save();
        ctx.translate(sp.x, sp.y);

        if (phase === GameState.INRUN || phase === 'INRUN') {
            this._drawJumperInrun(ctx, scale, bodyAngle);
        } else if (phase === GameState.TAKEOFF || phase === 'TAKEOFF') {
            this._drawJumperInrun(ctx, scale, bodyAngle);
        } else if (phase === GameState.FLIGHT || phase === 'FLIGHT') {
            this._drawJumperFlight(ctx, scale, bodyAngle);
        } else if (phase === GameState.LANDING || phase === 'LANDING') {
            this._drawJumperLanding(ctx, scale, bodyAngle);
        } else {
            this._drawJumperInrun(ctx, scale, bodyAngle);
        }

        ctx.restore();
    }


    /**
     * Aerodynamic helmet with dark visor/goggles (side view).
     * Origin = centre of head, facing right.
     * Glossy dark red with highlight, oval shape wider at back.
     */
    _drawHelmet(ctx, s) {
        const hr = 0.15 * s;

        // Helmet shell -- aerodynamic oval, wider at back
        const grad = ctx.createRadialGradient(
            -hr * 0.15, -hr * 0.25, hr * 0.1,
            0, 0, hr * 1.3
        );
        grad.addColorStop(0, '#ff4444');
        grad.addColorStop(0.35, '#cc1111');
        grad.addColorStop(0.7, '#991111');
        grad.addColorStop(1, '#660a0a');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(-hr * 0.08, 0, hr * 1.15, hr * 1.0, 0, 0, Math.PI * 2);
        ctx.fill();

        // Glossy highlight arc on top (avoid save/restore, just set/reset globalAlpha)
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#ff8888';
        ctx.beginPath();
        ctx.ellipse(-hr * 0.25, -hr * 0.4, hr * 0.5, hr * 0.22, -0.3, 0, Math.PI * 2);
        ctx.fill();

        // Secondary highlight (small bright spot)
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#ffbbbb';
        ctx.beginPath();
        ctx.ellipse(-hr * 0.35, -hr * 0.3, hr * 0.18, hr * 0.12, -0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;

        // Visor/goggles strip -- dark band across front
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.ellipse(hr * 0.35, hr * 0.05, hr * 0.6, hr * 0.22, 0.05, 0, Math.PI * 2);
        ctx.fill();

        // Goggles frame edge
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = Math.max(0.5, 0.015 * s);
        ctx.beginPath();
        ctx.ellipse(hr * 0.35, hr * 0.05, hr * 0.6, hr * 0.22, 0.05, 0, Math.PI * 2);
        ctx.stroke();

        // Visor blue reflection -- curved highlight (avoid save/restore)
        ctx.globalAlpha = 0.5;
        const visorGrad = ctx.createLinearGradient(
            hr * 0.1, -hr * 0.1, hr * 0.7, hr * 0.15
        );
        visorGrad.addColorStop(0, 'rgba(80,160,255,0.0)');
        visorGrad.addColorStop(0.3, 'rgba(100,190,255,0.7)');
        visorGrad.addColorStop(0.6, 'rgba(140,210,255,0.5)');
        visorGrad.addColorStop(1, 'rgba(80,160,255,0.0)');
        ctx.fillStyle = visorGrad;
        ctx.beginPath();
        ctx.ellipse(hr * 0.4, -hr * 0.01, hr * 0.35, hr * 0.10, 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;

        // Chin guard (small dark area below visor)
        ctx.fillStyle = '#880808';
        ctx.beginPath();
        ctx.ellipse(hr * 0.3, hr * 0.35, hr * 0.25, hr * 0.12, 0.1, 0, Math.PI);
        ctx.fill();
    }

    /**
     * Detailed ski with curved-up tip, dark gray base, colored stripe, and binding.
     * 2.4m long, thin profile.
     * Drawn from startX along positive X for the given length.
     */
    _drawSki(ctx, s, startX, length) {
        const thickness = 0.05 * s;
        const tipLen = 0.25 * s;
        const tipCurve = 0.14 * s;

        // Main ski body -- dark gray
        ctx.fillStyle = '#333333';
        ctx.beginPath();
        ctx.moveTo(startX, thickness / 2);
        ctx.lineTo(startX + length - tipLen, thickness / 2);
        ctx.quadraticCurveTo(
            startX + length - tipLen * 0.3, thickness / 2,
            startX + length, -tipCurve
        );
        ctx.quadraticCurveTo(
            startX + length - tipLen * 0.5, -tipCurve * 0.2,
            startX + length - tipLen, -thickness / 2
        );
        ctx.lineTo(startX, -thickness / 2);
        ctx.closePath();
        ctx.fill();

        // Outline
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = Math.max(0.5, 0.015 * s);
        ctx.stroke();

        // Bright colored stripe down the center (yellow)
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = Math.max(1, 0.025 * s);
        ctx.beginPath();
        ctx.moveTo(startX + 0.02 * s, 0);
        ctx.lineTo(startX + length - tipLen * 1.1, 0);
        ctx.stroke();

        // Secondary thin red accent stripe
        ctx.strokeStyle = '#dd2200';
        ctx.lineWidth = Math.max(0.5, 0.012 * s);
        ctx.beginPath();
        ctx.moveTo(startX + 0.02 * s, thickness * 0.3);
        ctx.lineTo(startX + length - tipLen * 1.2, thickness * 0.3);
        ctx.stroke();

        // Binding -- small rectangle near the foot position
        const bindX = startX + length * 0.3;
        const bindW = 0.12 * s;
        const bindH = thickness * 1.8;
        ctx.fillStyle = '#555555';
        ctx.fillRect(bindX - bindW / 2, -bindH / 2, bindW, bindH);
        // Binding top clip
        ctx.fillStyle = '#777777';
        ctx.fillRect(bindX - bindW * 0.35, -bindH / 2 - thickness * 0.3, bindW * 0.7, thickness * 0.4);
        // Binding heel piece
        ctx.fillStyle = '#444444';
        ctx.fillRect(bindX + bindW * 0.3, -bindH * 0.35, bindW * 0.3, bindH * 0.7);
    }

    /** Draw a limb segment with rounded ends. */
    _drawLimb(ctx, x1, y1, x2, y2, width, color) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }

    /** Draw a detailed boot at position, rotated to leg angle. */
    _drawBoot(ctx, s, x, y, angle) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        const bw = 0.16 * s;
        const bh = 0.09 * s;
        // Boot body -- dark gray/black
        ctx.fillStyle = '#222222';
        ctx.beginPath();
        ctx.moveTo(-bw * 0.3, -bh / 2);
        ctx.lineTo(bw * 0.7, -bh / 2);
        ctx.lineTo(bw * 0.7, bh * 0.1);
        ctx.lineTo(bw * 0.5, bh / 2);
        ctx.lineTo(-bw * 0.3, bh / 2);
        ctx.closePath();
        ctx.fill();
        // Boot sole
        ctx.fillStyle = '#111111';
        ctx.fillRect(-bw * 0.3, bh * 0.25, bw, bh * 0.25);
        // Boot buckle detail
        ctx.fillStyle = '#555555';
        ctx.fillRect(bw * 0.1, -bh * 0.35, bw * 0.15, bh * 0.15);
        ctx.restore();
    }

    /** Draw a glove at position (darker blue). */
    _drawGlove(ctx, s, x, y) {
        ctx.fillStyle = '#0d2266';
        ctx.beginPath();
        ctx.ellipse(x, y, 0.05 * s, 0.035 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a3388';
        ctx.beginPath();
        ctx.ellipse(x, y, 0.035 * s, 0.04 * s, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    /** Draw torso with suit details: rich blue main, lighter side panel stripes, bib number. */
    _drawTorso(ctx, s, hipX, hipY, shoulderX, shoulderY) {
        const dx = shoulderX - hipX;
        const dy = shoulderY - hipY;
        const torsoAngle = Math.atan2(dy, dx);
        const torsoW = Math.max(3, 0.20 * s);

        // Main body suit -- rich blue
        ctx.strokeStyle = '#1a40aa';
        ctx.lineWidth = torsoW;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(hipX, hipY);
        ctx.lineTo(shoulderX, shoulderY);
        ctx.stroke();

        // Side panel stripes (lighter blue, offset to both sides)
        const nx = -Math.sin(torsoAngle);
        const ny = Math.cos(torsoAngle);
        const stripeOff = torsoW * 0.35;
        ctx.strokeStyle = '#3366cc';
        ctx.lineWidth = Math.max(1.5, 0.06 * s);
        ctx.beginPath();
        ctx.moveTo(hipX + nx * stripeOff, hipY + ny * stripeOff);
        ctx.lineTo(shoulderX + nx * stripeOff, shoulderY + ny * stripeOff);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(hipX - nx * stripeOff, hipY - ny * stripeOff);
        ctx.lineTo(shoulderX - nx * stripeOff, shoulderY - ny * stripeOff);
        ctx.stroke();

        // Subtle highlight line along center
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = Math.max(1, 0.03 * s);
        ctx.beginPath();
        ctx.moveTo(hipX + dx * 0.1, hipY + dy * 0.1);
        ctx.lineTo(hipX + dx * 0.9, hipY + dy * 0.9);
        ctx.stroke();

        // Bib / number on chest area
        const bibX = hipX + dx * 0.55;
        const bibY = hipY + dy * 0.55;
        ctx.save();
        ctx.translate(bibX, bibY);
        ctx.rotate(torsoAngle);
        const bibW = 0.14 * s;
        const bibH = 0.10 * s;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(-bibW / 2, -bibH / 2, bibW, bibH);
        ctx.fillStyle = '#111111';
        ctx.font = `bold ${Math.max(5, 0.07 * s)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('7', 0, 0);
        ctx.restore();
    }

    /** INRUN: DEEP crouch, knees bent, body folded forward, arms tucked behind lower back, chin tucked. */
    _drawJumperInrun(ctx, s, angle) {
        ctx.rotate(angle);

        // --- Skis (2.4m, flat under jumper) ---
        ctx.save();
        this._drawSki(ctx, s, -1.2 * s, 2.4 * s);
        ctx.restore();

        // Deep crouch articulation: feet at origin, very compact
        const footX = 0;
        const footY = 0;
        const kneeX = 0.10 * s;       // knee pushed forward (deep bend)
        const kneeY = -0.32 * s;
        const hipX = -0.05 * s;       // hip low and back
        const hipY = -0.38 * s;

        // Boot
        this._drawBoot(ctx, s, footX, footY - 0.02 * s, 0);

        // Lower leg (shin) -- deep angle
        this._drawLimb(ctx, footX, footY - 0.02 * s, kneeX, kneeY,
            Math.max(2.5, 0.13 * s), '#1a40aa');

        // Upper leg (thigh) -- folded tight
        this._drawLimb(ctx, kneeX, kneeY, hipX, hipY,
            Math.max(2.5, 0.14 * s), '#1a40aa');

        // Torso -- folded forward aggressively, nearly parallel to thighs
        const shoulderX = hipX + 0.52 * s;
        const shoulderY = hipY - 0.08 * s;
        this._drawTorso(ctx, s, hipX, hipY, shoulderX, shoulderY);

        // Arms tucked behind lower back (two segments per arm)
        const elbowX = shoulderX - 0.15 * s;
        const elbowY = shoulderY + 0.12 * s;
        const handX = hipX - 0.05 * s;
        const handY = hipY + 0.14 * s;
        this._drawLimb(ctx, shoulderX - 0.08 * s, shoulderY + 0.06 * s, elbowX, elbowY,
            Math.max(1.5, 0.08 * s), '#1a40aa');
        this._drawLimb(ctx, elbowX, elbowY, handX, handY,
            Math.max(1.5, 0.07 * s), '#1a40aa');
        this._drawGlove(ctx, s, handX, handY);

        // Second arm (slightly offset for depth)
        const elbow2X = elbowX + 0.02 * s;
        const elbow2Y = elbowY - 0.03 * s;
        const hand2X = handX + 0.03 * s;
        const hand2Y = handY - 0.02 * s;
        this._drawLimb(ctx, shoulderX - 0.06 * s, shoulderY + 0.04 * s, elbow2X, elbow2Y,
            Math.max(1.5, 0.07 * s), '#1a40aa');
        this._drawLimb(ctx, elbow2X, elbow2Y, hand2X, hand2Y,
            Math.max(1.5, 0.06 * s), '#1a40aa');
        this._drawGlove(ctx, s, hand2X, hand2Y);

        // Head (tilted down, chin tucked)
        ctx.save();
        ctx.translate(shoulderX + 0.16 * s, shoulderY + 0.02 * s);
        ctx.rotate(0.4);
        this._drawHelmet(ctx, s);
        ctx.restore();
    }

    /** FLIGHT: body nearly horizontal, stretched forward, slight back arch, arms at sides, V-style skis 25 deg. */
    _drawJumperFlight(ctx, s, angle) {
        ctx.rotate(angle);

        const hipX = 0;
        const hipY = 0;

        // Torso -- stretched forward with slight arch (quadratic curve)
        const torsoLen = 0.58 * s;
        const shoulderX = hipX - torsoLen;
        const shoulderY = hipY - 0.06 * s;
        const midTorsoX = hipX - torsoLen * 0.5;
        const midTorsoY = hipY - 0.10 * s;
        const torsoW = Math.max(3, 0.20 * s);

        // Main body suit with arch
        ctx.strokeStyle = '#1a40aa';
        ctx.lineWidth = torsoW;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(hipX, hipY);
        ctx.quadraticCurveTo(midTorsoX, midTorsoY, shoulderX, shoulderY);
        ctx.stroke();

        // Side panel stripes along the arch
        const stripeOff = torsoW * 0.35;
        ctx.strokeStyle = '#3366cc';
        ctx.lineWidth = Math.max(1.5, 0.06 * s);
        ctx.beginPath();
        ctx.moveTo(hipX, hipY + stripeOff);
        ctx.quadraticCurveTo(midTorsoX, midTorsoY + stripeOff, shoulderX, shoulderY + stripeOff);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(hipX, hipY - stripeOff);
        ctx.quadraticCurveTo(midTorsoX, midTorsoY - stripeOff, shoulderX, shoulderY - stripeOff);
        ctx.stroke();

        // Center highlight
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth = Math.max(1, 0.03 * s);
        ctx.beginPath();
        ctx.moveTo(hipX - 0.06 * s, hipY);
        ctx.quadraticCurveTo(midTorsoX, midTorsoY - 0.01 * s, shoulderX + 0.06 * s, shoulderY);
        ctx.stroke();

        // Bib on chest
        const bibAngle = Math.atan2(shoulderY - hipY, shoulderX - hipX);
        ctx.save();
        ctx.translate(midTorsoX, midTorsoY);
        ctx.rotate(bibAngle);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        const bibW = 0.12 * s;
        const bibH = 0.08 * s;
        ctx.fillRect(-bibW / 2, -bibH / 2, bibW, bibH);
        ctx.fillStyle = '#111';
        ctx.font = `bold ${Math.max(4, 0.06 * s)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('7', 0, 0);
        ctx.restore();

        // Legs (extending back from hip, nearly straight for flight)
        const kneeX = hipX + 0.40 * s;
        const kneeY = hipY + 0.04 * s;
        const footX = kneeX + 0.40 * s;
        const footY = kneeY + 0.02 * s;

        this._drawLimb(ctx, hipX, hipY, kneeX, kneeY,
            Math.max(2.5, 0.13 * s), '#1a40aa');
        this._drawLimb(ctx, kneeX, kneeY, footX, footY,
            Math.max(2, 0.11 * s), '#1a40aa');

        // Boots
        const legAngle = Math.atan2(footY - kneeY, footX - kneeX);
        this._drawBoot(ctx, s, footX, footY, legAngle);

        // V-style skis (25 deg spread each, tips slightly upward)
        const vAngle = 25 * Math.PI / 180;
        ctx.save();
        ctx.translate(footX, footY);
        ctx.save();
        ctx.rotate(-vAngle);
        this._drawSki(ctx, s, -0.1 * s, 2.4 * s);
        ctx.restore();
        ctx.save();
        ctx.rotate(vAngle);
        this._drawSki(ctx, s, -0.1 * s, 2.4 * s);
        ctx.restore();
        ctx.restore();

        // Arms pressed tight along the sides (two arms for depth)
        const armW = Math.max(1.5, 0.07 * s);
        this._drawLimb(ctx, shoulderX + 0.08 * s, shoulderY + 0.10 * s,
            hipX - 0.10 * s, hipY + 0.12 * s, armW, '#1a40aa');
        this._drawGlove(ctx, s, hipX - 0.10 * s, hipY + 0.12 * s);
        this._drawLimb(ctx, shoulderX + 0.10 * s, shoulderY + 0.08 * s,
            hipX - 0.06 * s, hipY + 0.10 * s, Math.max(1.5, 0.08 * s), '#152e80');
        this._drawGlove(ctx, s, hipX - 0.06 * s, hipY + 0.10 * s);

        // Head -- stretched forward, nose-down
        ctx.save();
        ctx.translate(shoulderX - 0.16 * s, shoulderY + 0.02 * s);
        ctx.rotate(0.15);
        this._drawHelmet(ctx, s);
        ctx.restore();
    }

    /** LANDING: telemark -- front foot forward, back foot behind, arms spread wide, body upright. */
    _drawJumperLanding(ctx, s, angle) {
        ctx.rotate(angle);

        const hipX = 0;
        const hipY = -0.85 * s;

        // --- Back leg (behind, deeper knee bend -- telemark) drawn first (behind) ---
        const backFootX = -0.38 * s;
        const backFootY = -0.12 * s;
        const backKneeX = -0.12 * s;
        const backKneeY = -0.52 * s;

        // Back ski
        ctx.save();
        ctx.translate(backFootX, backFootY);
        this._drawSki(ctx, s, -0.6 * s, 2.4 * s);
        ctx.restore();

        // Back thigh + shin
        this._drawLimb(ctx, hipX, hipY, backKneeX, backKneeY,
            Math.max(2.5, 0.12 * s), '#152e80');
        this._drawLimb(ctx, backKneeX, backKneeY, backFootX, backFootY,
            Math.max(2, 0.11 * s), '#152e80');
        const backLegAngle = Math.atan2(backFootY - backKneeY, backFootX - backKneeX);
        this._drawBoot(ctx, s, backFootX, backFootY, backLegAngle);

        // --- Front leg (forward, knee slightly bent) ---
        const frontFootX = 0.45 * s;
        const frontFootY = 0;
        const frontKneeX = 0.25 * s;
        const frontKneeY = -0.42 * s;

        // Front ski
        ctx.save();
        ctx.translate(frontFootX, frontFootY);
        this._drawSki(ctx, s, -0.6 * s, 2.4 * s);
        ctx.restore();

        // Front thigh + shin
        this._drawLimb(ctx, hipX, hipY, frontKneeX, frontKneeY,
            Math.max(2.5, 0.13 * s), '#1a40aa');
        this._drawLimb(ctx, frontKneeX, frontKneeY, frontFootX, frontFootY,
            Math.max(2, 0.12 * s), '#1a40aa');
        const frontLegAngle = Math.atan2(frontFootY - frontKneeY, frontFootX - frontKneeX);
        this._drawBoot(ctx, s, frontFootX, frontFootY, frontLegAngle);

        // Torso (mostly upright, slight forward lean)
        const shoulderX = hipX + 0.08 * s;
        const shoulderY = hipY - 0.52 * s;
        this._drawTorso(ctx, s, hipX, hipY, shoulderX, shoulderY);

        // --- Arms spread wide and slightly up for balance ---
        const armW = Math.max(2, 0.09 * s);
        // Forward-up arm (upper arm + forearm)
        const fElbowX = shoulderX + 0.25 * s;
        const fElbowY = shoulderY - 0.06 * s;
        const fHandX = shoulderX + 0.52 * s;
        const fHandY = shoulderY - 0.20 * s;
        this._drawLimb(ctx, shoulderX, shoulderY, fElbowX, fElbowY, armW, '#1a40aa');
        this._drawLimb(ctx, fElbowX, fElbowY, fHandX, fHandY, armW, '#1a40aa');
        this._drawGlove(ctx, s, fHandX, fHandY);

        // Backward-up arm (upper arm + forearm)
        const bElbowX = shoulderX - 0.25 * s;
        const bElbowY = shoulderY - 0.04 * s;
        const bHandX = shoulderX - 0.52 * s;
        const bHandY = shoulderY - 0.18 * s;
        this._drawLimb(ctx, shoulderX, shoulderY, bElbowX, bElbowY, armW, '#1a40aa');
        this._drawLimb(ctx, bElbowX, bElbowY, bHandX, bHandY, armW, '#1a40aa');
        this._drawGlove(ctx, s, bHandX, bHandY);

        // Head (upright, looking forward)
        ctx.save();
        ctx.translate(shoulderX + 0.03 * s, shoulderY - 0.18 * s);
        ctx.rotate(0.05);
        this._drawHelmet(ctx, s);
        ctx.restore();
    }


    // ------------------------------------------------------------------
    // 6. Spectators
    // ------------------------------------------------------------------

    _drawSpectators(ctx) {
        const r = this.renderer;
        const t = this._time || 0;
        const cw = r.width || 400;
        const ch = r.height || 900;

        for (const spec of this._spectators) {
            const sp = r.worldToScreen(spec.x, spec.y);
            // Skip off-screen spectators
            if (sp.x < -50 || sp.x > cw + 50 || sp.y < -80 || sp.y > ch + 20) continue;
            const ppm = r.ppm;
            const h = spec.h * ppm;      // total stick figure height in px
            const headR = h * 0.12;       // head radius
            const legLen = h * 0.35;      // leg length
            const bodyLen = h * 0.35;     // body (torso) line length
            const armLen = h * 0.25;      // arm length

            const lineW = Math.max(1, h * 0.06);
            ctx.lineCap = 'round';

            // Feet position = base (integer coords to avoid sub-pixel AA)
            const feetY = sp.y | 0;
            const spx = sp.x | 0;
            const hipY = (feetY - legLen) | 0;
            const shoulderY = (hipY - bodyLen) | 0;
            const headCenterY = (shoulderY - headR) | 0;

            // --- Leg lines (two lines from hip spreading down to feet) ---
            ctx.strokeStyle = spec.bodyColor;
            ctx.lineWidth = lineW;
            // Left leg
            ctx.beginPath();
            ctx.moveTo(spx, hipY);
            ctx.lineTo(spx - (h * 0.1) | 0, feetY);
            ctx.stroke();
            // Right leg
            ctx.beginPath();
            ctx.moveTo(spx, hipY);
            ctx.lineTo(spx + (h * 0.1) | 0, feetY);
            ctx.stroke();

            // --- Body line (vertical from hip to shoulder) ---
            ctx.strokeStyle = spec.bodyColor;
            ctx.lineWidth = lineW * 1.2;
            ctx.beginPath();
            ctx.moveTo(spx, hipY);
            ctx.lineTo(spx, shoulderY);
            ctx.stroke();

            // --- Arms (from shoulder) ---
            ctx.strokeStyle = spec.bodyColor;
            ctx.lineWidth = lineW;

            if (spec.action === 'wave') {
                // Left arm waves: angle varies with time
                const waveAngle = Math.sin(t * spec.waveSpeed + spec.wavePhase) * 0.7;
                const leftArmAngle = -1.2 + waveAngle; // swings around upper-left
                const lax = (spx + Math.cos(leftArmAngle) * armLen) | 0;
                const lay = (shoulderY + Math.sin(leftArmAngle) * armLen) | 0;
                ctx.beginPath();
                ctx.moveTo(spx, shoulderY);
                ctx.lineTo(lax, lay);
                ctx.stroke();
                // Right arm relaxed down
                ctx.beginPath();
                ctx.moveTo(spx, shoulderY);
                ctx.lineTo((spx + armLen * 0.7) | 0, (shoulderY + armLen * 0.6) | 0);
                ctx.stroke();
            } else if (spec.action === 'flag') {
                // Right arm up holding flag
                const flagArmEndX = (spx + armLen * 0.15) | 0;
                const flagArmEndY = (shoulderY - armLen * 0.9) | 0;
                ctx.beginPath();
                ctx.moveTo(spx, shoulderY);
                ctx.lineTo(flagArmEndX, flagArmEndY);
                ctx.stroke();
                // Flag pole
                ctx.strokeStyle = '#664422';
                ctx.lineWidth = Math.max(0.8, lineW * 0.6);
                const poleTopY = flagArmEndY - h * 0.2;
                ctx.beginPath();
                ctx.moveTo(flagArmEndX, flagArmEndY);
                ctx.lineTo(flagArmEndX, poleTopY);
                ctx.stroke();
                // Flag rectangle
                const flagW = h * 0.18;
                const flagH = h * 0.1;
                const wave = Math.sin(t * 3 + spec.wavePhase) * flagW * 0.08;
                ctx.fillStyle = spec.flagColor;
                ctx.beginPath();
                ctx.moveTo(flagArmEndX, poleTopY);
                ctx.lineTo(flagArmEndX + flagW + wave, poleTopY + flagH * 0.2);
                ctx.lineTo(flagArmEndX + flagW - wave, poleTopY + flagH);
                ctx.lineTo(flagArmEndX, poleTopY + flagH * 0.8);
                ctx.closePath();
                ctx.fill();
                // Left arm relaxed down
                ctx.strokeStyle = spec.bodyColor;
                ctx.lineWidth = lineW;
                ctx.beginPath();
                ctx.moveTo(spx, shoulderY);
                ctx.lineTo((spx - armLen * 0.7) | 0, (shoulderY + armLen * 0.6) | 0);
                ctx.stroke();
            } else {
                // Still: both arms relaxed at sides
                ctx.beginPath();
                ctx.moveTo(spx, shoulderY);
                ctx.lineTo((spx - armLen * 0.7) | 0, (shoulderY + armLen * 0.6) | 0);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(spx, shoulderY);
                ctx.lineTo((spx + armLen * 0.7) | 0, (shoulderY + armLen * 0.6) | 0);
                ctx.stroke();
            }

            // --- Head (circle) ---
            ctx.fillStyle = '#ffccaa';
            ctx.beginPath();
            ctx.arc(spx, headCenterY, headR, 0, Math.PI * 2);
            ctx.fill();

            // --- Colored hat (small circle sitting on top of head) ---
            ctx.fillStyle = spec.hatColor;
            ctx.beginPath();
            ctx.arc(spx, (headCenterY - headR * 0.9) | 0, headR * 0.55, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ------------------------------------------------------------------
    // 7. Snow particles
    // ------------------------------------------------------------------

    // ------------------------------------------------------------------
    // Visual polish effects
    // ------------------------------------------------------------------

    /**
     * Draw an ellipse shadow on the hill surface below the jumper.
     * Shadow shrinks with altitude above ground.
     */
    _drawJumperShadow(ctx, js) {
        if (!js || !this.hill) return;
        const r = this.renderer;
        const phase = js.phase;

        // Get the hill surface height at the jumper's x position
        const surfaceY = this.hill.getHeightAtDistance(js.x);
        const heightAboveGround = Math.max(0, surfaceY - js.y);

        // Shadow position on the hill surface
        const shadowX = js.x;
        const shadowY = surfaceY;

        const sp = r.worldToScreen(shadowX, shadowY);
        const ppm = r.ppm;

        // Scale shadow size inversely with height
        const scaleFactor = 1 / (1 + heightAboveGround * 0.3);

        // Base shadow size in world units, converted to screen
        let baseRadiusX = 1.2 * ppm * scaleFactor;
        let baseRadiusY = 0.3 * ppm * scaleFactor;

        // During INRUN: full size, directly under jumper
        if (phase === GameState.INRUN || phase === 'INRUN' ||
            phase === GameState.TAKEOFF || phase === 'TAKEOFF') {
            baseRadiusX = 1.2 * ppm;
            baseRadiusY = 0.3 * ppm;
        }

        // Don't draw if too small
        if (baseRadiusX < 0.5 || baseRadiusY < 0.1) return;

        // Alpha also fades with height
        const alpha = 0.15 * scaleFactor;
        if (alpha < 0.01) return;

        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.ellipse(sp.x | 0, sp.y | 0, baseRadiusX, baseRadiusY, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }



    /**
     * Update and draw takeoff and landing particle effects.
     */
    _drawEffectParticles(ctx, dt) {
        const r = this.renderer;
        const gravity = 4.0;

        // Helper to update and draw a particle array
        const processParticles = (particles, colorFn) => {
            // Compact dead particles using swap-and-pop (O(1) per removal)
            let writeIdx = 0;
            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                p.life -= dt / p.maxLife;
                if (p.life <= 0) continue;
                p.vy += gravity * dt;
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                if (writeIdx !== i) particles[writeIdx] = p;
                writeIdx++;

                const sp = r.worldToScreen(p.x, p.y);
                const alpha = Math.max(0, p.life);

                ctx.globalAlpha = alpha;
                ctx.fillStyle = colorFn(alpha);
                ctx.beginPath();
                ctx.arc(sp.x | 0, sp.y | 0, p.size, 0, Math.PI * 2);
                ctx.fill();
            }
            particles.length = writeIdx;
        };

        // Single save/restore for both particle systems
        ctx.save();
        // Takeoff particles: white
        processParticles(this._takeoffParticles, (a) =>
            `rgba(255,255,255,${a.toFixed(2)})`
        );

        // Landing particles: slight blue tint for snow
        processParticles(this._landingParticles, (a) =>
            `rgba(220,235,255,${a.toFixed(2)})`
        );
        ctx.restore();
    }

    /**
     * Draw semi-transparent wind streaks during flight.
     */
    _drawWindStreaks(ctx, w, h, wind) {
        if (!wind || wind.speed < 0.5) return;

        // Initialize wind streaks if needed
        if (this._windStreaks.length === 0) {
            const rng = seededRandom(12345);
            const count = 5 + Math.floor(rng() * 4); // 5-8 streaks
            for (let i = 0; i < count; i++) {
                this._windStreaks.push({
                    x: rng() * w,
                    y: rng() * h,
                    length: 30 + rng() * 60,
                    alpha: 0.05 + rng() * 0.05,
                    speed: 0.8 + rng() * 0.4,
                });
            }
        }

        const windDir = wind.direction || 0;
        const windSpd = wind.speed || 0;
        const dx = Math.cos(windDir);
        const dy = Math.sin(windDir);

        ctx.save();
        ctx.lineCap = 'round';
        for (const streak of this._windStreaks) {
            // Move streak position
            streak.x += dx * windSpd * streak.speed * 2;
            streak.y += dy * windSpd * streak.speed * 0.5;

            // Wrap around screen
            streak.x = ((streak.x % w) + w) % w;
            streak.y = ((streak.y % h) + h) % h;

            ctx.globalAlpha = streak.alpha;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(streak.x, streak.y);
            ctx.lineTo(streak.x + dx * streak.length, streak.y + dy * streak.length * 0.3);
            ctx.stroke();
        }
        ctx.restore();
    }

    /**
     * Draw a cinematic vignette: radial gradient from transparent center
     * to dark edges.
     */
    _drawVignette(ctx, w, h) {
        const cx = w / 2;
        const cy = h / 2;
        const radius = Math.sqrt(cx * cx + cy * cy);

        const grad = ctx.createRadialGradient(cx, cy, radius * 0.3, cx, cy, radius);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.5, 'rgba(0,0,0,0)');
        grad.addColorStop(0.8, 'rgba(0,0,0,0.12)');
        grad.addColorStop(1, 'rgba(0,0,0,0.3)');

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
    }

    // ------------------------------------------------------------------
    // Game Juice Effects
    // ------------------------------------------------------------------

    /**
     * 1. Speed lines during inrun: diagonal white streaks behind the jumper
     *    when speed > 70 km/h. More streaks = faster.
     */
    _drawSpeedLines(ctx, js) {
        if (!js) return;
        const speedKmh = (js.speed || 0) * 3.6;
        if (speedKmh <= 65) return; // ~18 m/s threshold

        const r = this.renderer;
        const sp = r.worldToScreen(js.x, js.y);
        const ppm = r.ppm;

        // 3 streaks at 65 km/h, up to 5 at 85+ km/h
        const numStreaks = Math.min(5, 3 + Math.floor((speedKmh - 65) / 10));
        const t = this._time;

        ctx.save();
        ctx.lineCap = 'round';

        for (let i = 0; i < numStreaks; i++) {
            // Stagger streaks vertically around the jumper
            const yOffset = (i - (numStreaks - 1) / 2) * 0.3 * ppm;
            // Animate streaks sliding backward using time + index offset
            const phase = ((t * 8 + i * 1.7) % 1);
            // Start behind the jumper, slide further back
            const startOffset = (0.5 + phase * 1.5) * ppm;
            const streakLen = (0.8 + (speedKmh - 65) / 80) * ppm;

            const sx = sp.x + startOffset;
            const sy = sp.y + yOffset - 0.3 * ppm;
            const ex = sx + streakLen;
            const ey = sy + streakLen * 0.15;

            // Fade based on phase (appear then disappear)
            const alpha = Math.sin(phase * Math.PI) * 0.4 * Math.min(1, (speedKmh - 65) / 20);

            ctx.globalAlpha = alpha;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(ex, ey);
            ctx.stroke();
        }

        ctx.restore();
    }

    /**
     * 2. Takeoff flash: trigger state.
     */
    _triggerTakeoffFlash(x, y) {
        this._takeoffFlash = {
            x,
            y,
            startTime: this._time,
        };
    }

    /**
     * 2. Takeoff flash: draw a brief white radial flash at the takeoff point
     *    that expands and fades over 0.3s.
     */
    _drawTakeoffFlash(ctx) {
        if (!this._takeoffFlash) return;

        const elapsed = this._time - this._takeoffFlash.startTime;
        const duration = 0.3;
        if (elapsed > duration) {
            this._takeoffFlash = null;
            return;
        }

        const r = this.renderer;
        const sp = r.worldToScreen(this._takeoffFlash.x, this._takeoffFlash.y);
        const progress = elapsed / duration;

        // Expand radius from small to large
        const maxRadius = 60;
        const radius = maxRadius * progress;

        // Bright start, quick fade
        const alpha = (1 - progress) * (1 - progress) * 0.7;

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const grad = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, radius);
        grad.addColorStop(0, `rgba(255,255,255,${alpha.toFixed(3)})`);
        grad.addColorStop(0.3, `rgba(255,250,230,${(alpha * 0.6).toFixed(3)})`);
        grad.addColorStop(0.7, `rgba(255,240,200,${(alpha * 0.2).toFixed(3)})`);
        grad.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    /**
     * 3. Perfect landing celebration: spawn golden sparkle particles.
     */
    _spawnCelebrationParticles(x, y) {
        const rng = seededRandom(Math.floor(this._time * 1000) + 42);
        const count = 15 + Math.floor(rng() * 6); // 15-20 particles
        for (let i = 0; i < count; i++) {
            const angle = -Math.PI / 2 + (rng() - 0.5) * Math.PI * 1.4;
            const speed = 1.0 + rng() * 2.5;
            this._celebrationParticles.push({
                x: x + (rng() - 0.5) * 2,
                y: y - rng() * 0.5,
                vx: Math.cos(angle) * speed * 0.5,
                vy: -0.5 - rng() * 2.0, // float upward
                life: 1.0,
                maxLife: 0.8 + rng() * 0.8,
                size: 1.5 + rng() * 2.5,
                sparklePhase: rng() * Math.PI * 2,
                hue: 40 + rng() * 20, // gold hue variation (40-60)
            });
        }
    }

    /**
     * 3. Perfect landing celebration: update and draw golden sparkle particles
     *    that float upward and fade.
     */
    _drawCelebrationParticles(ctx, dt) {
        const r = this.renderer;
        const t = this._time;

        for (let i = this._celebrationParticles.length - 1; i >= 0; i--) {
            const p = this._celebrationParticles[i];
            p.life -= dt / p.maxLife;
            if (p.life <= 0) {
                this._celebrationParticles.splice(i, 1);
                continue;
            }

            // Float upward, slight horizontal drift
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy -= 0.5 * dt; // gentle upward acceleration

            const sp = r.worldToScreen(p.x, p.y);
            const alpha = Math.max(0, p.life);
            const twinkle = 0.5 + 0.5 * Math.sin(t * 12 + p.sparklePhase);

            ctx.globalAlpha = alpha * twinkle;

            // Golden glow
            const gR = 255;
            const gG = (200 + p.hue * 0.5) | 0;
            const gB = (50 + (1 - alpha) * 80) | 0;
            ctx.fillStyle = `rgb(${gR},${gG},${gB})`;

            // Draw a 4-point star shape
            const sz = p.size * (0.8 + twinkle * 0.4);
            const spxi = sp.x | 0;
            const spyi = sp.y | 0;
            ctx.beginPath();
            ctx.moveTo(spxi, spyi - sz * 1.5);
            ctx.lineTo(spxi + sz * 0.4, spyi - sz * 0.4);
            ctx.lineTo(spxi + sz * 1.5, spyi);
            ctx.lineTo(spxi + sz * 0.4, spyi + sz * 0.4);
            ctx.lineTo(spxi, spyi + sz * 1.5);
            ctx.lineTo(spxi - sz * 0.4, spyi + sz * 0.4);
            ctx.lineTo(spxi - sz * 1.5, spyi);
            ctx.lineTo(spxi - sz * 0.4, spyi - sz * 0.4);
            ctx.closePath();
            ctx.fill();

            // Bright center dot
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#fffde0';
            ctx.beginPath();
            ctx.arc(spxi, spyi, sz * 0.3, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /**
     * 4. Distance milestones: check if jumper passed 100m, 120m (K-point), or 140m.
     */
    _checkDistanceMilestones(js) {
        if (!js) return;
        const milestones = [100, 120, 140];
        for (const m of milestones) {
            if (!this._passedMilestones.has(m) && js.x >= m) {
                this._passedMilestones.add(m);
                this._milestoneFlashes.push({
                    distance: m,
                    startTime: this._time,
                    worldX: js.x,
                    worldY: js.y,
                });
            }
        }
    }

    /**
     * 4. Distance milestone flashes: briefly flash the distance number
     *    larger and in gold when passing milestones during flight.
     */
    _drawMilestoneFlashes(ctx, js, gameState) {
        if (gameState !== GameState.FLIGHT) return;
        const r = this.renderer;
        const duration = 0.8;

        for (let i = this._milestoneFlashes.length - 1; i >= 0; i--) {
            const mf = this._milestoneFlashes[i];
            const elapsed = this._time - mf.startTime;
            if (elapsed > duration) {
                this._milestoneFlashes.splice(i, 1);
                continue;
            }

            const progress = elapsed / duration;

            // Scale: start at 1.5x, peak at 2.5x, then shrink back
            const scaleCurve = progress < 0.2
                ? 1.5 + (progress / 0.2) * 1.0
                : 2.5 - ((progress - 0.2) / 0.8) * 1.0;

            // Fade: full opacity for first 60%, then fade out
            const alpha = progress < 0.6 ? 1.0 : 1.0 - (progress - 0.6) / 0.4;

            // Position near the jumper, offset above
            const sp = r.worldToScreen(js.x, js.y);
            const textY = sp.y - 40 - progress * 20; // float upward

            ctx.save();
            ctx.globalAlpha = alpha;

            const fontSize = Math.round(16 * scaleCurve);
            ctx.font = `bold ${fontSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Gold glow
            ctx.shadowColor = '#ffcc00';
            ctx.shadowBlur = 12 * alpha;
            ctx.fillStyle = '#ffd700';
            const label = `${mf.distance}m` + (mf.distance === 120 ? ' K' : '');
            ctx.fillText(label, sp.x, textY);

            // Sharper inner text
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#fff8e0';
            ctx.fillText(label, sp.x, textY);

            ctx.restore();
        }
    }

    /**
     * 5. Crowd wave effect: during FLIGHT, animate spectators doing a wave
     *    that follows the jumper's x position.
     */
    _drawCrowdWaveEffect(ctx, js, gameState) {
        if (gameState !== GameState.FLIGHT || !js) return;

        const r = this.renderer;
        const t = this._time;
        const jumperX = js.x;
        const cw = r.width || 400;
        const ch = r.height || 900;

        for (const spec of this._spectators) {
            // Distance from jumper x to spectator
            const dx = spec.x - jumperX;

            // Wave propagates: spectators near jumperX raise arms,
            // with a wave-like delay based on distance
            const waveDelay = dx * 0.15;
            const wavePhase = Math.sin(t * 4 - waveDelay);

            // Only raise arms when wave passes (wavePhase > 0.3)
            if (wavePhase < 0.3) continue;

            const intensity = (wavePhase - 0.3) / 0.7; // 0-1

            const sp = r.worldToScreen(spec.x, spec.y);
            // Skip off-screen spectators
            if (sp.x < -50 || sp.x > cw + 50 || sp.y < -80 || sp.y > ch + 20) continue;
            const ppm = r.ppm;
            const h = spec.h * ppm;
            const legLen = h * 0.35;
            const bodyLen = h * 0.35;
            const armLen = h * 0.25;
            const lineW = Math.max(1, h * 0.06);

            const feetY = sp.y;
            const hipY = feetY - legLen;
            const shoulderY = hipY - bodyLen;

            // Both arms raise upward proportional to intensity
            const armAngle = -Math.PI / 2 - intensity * 0.5;

            ctx.strokeStyle = spec.bodyColor;
            ctx.lineWidth = lineW;
            ctx.lineCap = 'round';
            ctx.globalAlpha = 0.9;

            // Left arm raised
            const laX = (sp.x + Math.cos(armAngle - 0.3) * armLen) | 0;
            const laY = (shoulderY + Math.sin(armAngle - 0.3) * armLen) | 0;
            ctx.beginPath();
            ctx.moveTo(sp.x | 0, shoulderY | 0);
            ctx.lineTo(laX, laY);
            ctx.stroke();

            // Right arm raised
            const raX = (sp.x + Math.cos(armAngle + 0.3) * armLen) | 0;
            const raY = (shoulderY + Math.sin(armAngle + 0.3) * armLen) | 0;
            ctx.beginPath();
            ctx.moveTo(sp.x | 0, shoulderY | 0);
            ctx.lineTo(raX, raY);
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        }
    }

    // ------------------------------------------------------------------
    // 7. Snow particles
    // ------------------------------------------------------------------

    _drawSnowParticles(ctx, w, h) {
        const t = this._time || 0;
        const wind = this._wind || { speed: 0, direction: 0 };
        const windDriftX = Math.cos(wind.direction || 0) * (wind.speed || 0) * 0.012;
        const particles = this._snowParticles;

        ctx.save();

        // Pre-compute snowflake arm angles (avoid recomputing trig per flake)
        // angles: 0, PI/3, 2PI/3, PI, 4PI/3, 5PI/3
        const flakeCos = [1, 0.5, -0.5, -1, -0.5, 0.5];
        const flakeSin = [0, 0.866025, 0.866025, 0, -0.866025, -0.866025];

        // First pass: batch regular (non-flake) circles by quantized radius
        // Group into buckets by rounded radius to batch same-size particles
        ctx.fillStyle = '#ffffff';
        // Sort particles into alpha groups (quantize to 10 levels) to reduce state changes
        // Use a simpler approach: batch all same-alpha particles into one path
        const alphaBuckets = new Array(10);
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            if (p.isFlake) continue;
            const windFactor = 0.5 + p.depth * 0.5;
            const driftX = p.baseDriftX + windDriftX * windFactor;
            const wobble = Math.sin(t * p.wobbleSpeed + p.wobblePhase) * 0.02 * (1 - p.depth * 0.5);
            const px = ((p.x + (driftX + wobble) * t) % 1 + 1) % 1;
            const py = ((p.y + p.speedY * t) % 1 + 1) % 1;
            const sx = (px * w) | 0;
            const sy = (py * h) | 0;
            const bucket = (p.alpha * 10) | 0;
            if (!alphaBuckets[bucket]) alphaBuckets[bucket] = [];
            alphaBuckets[bucket].push(sx, sy, p.r);
        }
        for (let b = 0; b < 10; b++) {
            const arr = alphaBuckets[b];
            if (!arr || arr.length === 0) continue;
            ctx.globalAlpha = (b + 0.5) / 10;
            ctx.beginPath();
            for (let j = 0; j < arr.length; j += 3) {
                ctx.moveTo(arr[j] + arr[j + 2], arr[j + 1]);
                ctx.arc(arr[j], arr[j + 1], arr[j + 2], 0, Math.PI * 2);
            }
            ctx.fill();
        }

        // Second pass: snowflake shapes (fewer particles, set stroke style once)
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.6;
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            if (!p.isFlake) continue;
            const windFactor = 0.5 + p.depth * 0.5;
            const driftX = p.baseDriftX + windDriftX * windFactor;
            const wobble = Math.sin(t * p.wobbleSpeed + p.wobblePhase) * 0.02 * (1 - p.depth * 0.5);
            const px = ((p.x + (driftX + wobble) * t) % 1 + 1) % 1;
            const py = ((p.y + p.speedY * t) % 1 + 1) % 1;
            const sx = (px * w) | 0;
            const sy = (py * h) | 0;
            const armLen = p.r * 1.2;
            ctx.globalAlpha = p.alpha;
            ctx.beginPath();
            for (let a = 0; a < 6; a++) {
                ctx.moveTo(sx, sy);
                ctx.lineTo(sx + flakeCos[a] * armLen, sy + flakeSin[a] * armLen);
            }
            ctx.stroke();
        }
        ctx.restore();
    }
    // ------------------------------------------------------------------
    // Premium Visual Effects
    // ------------------------------------------------------------------

    /**
     * Lens flare effect from floodlight positions.
     * Draws hexagonal bokeh shapes and light streaks using screen composite.
     */
    _drawLensFlare(ctx, w, h) {
        if (!this.hill || !this.renderer) return;
        const r = this.renderer;
        const kp = this.hill.getKPointPosition();
        const hs = this.hill.getHSPointPosition();
        if (!kp || !hs) return;

        const t = this._time || 0;

        // Floodlight positions (same as _drawFloodlights)
        const polePositions = [
            { x: kp.x * 0.3, side: 1 },
            { x: kp.x * 0.65, side: -1 },
            { x: kp.x * 1.0, side: 1 },
            { x: hs.x * 0.9, side: -1 },
        ];

        ctx.save();
        ctx.globalCompositeOperation = 'screen';

        for (const pole of polePositions) {
            const surfaceY = this.hill.getHeightAtDistance(pole.x);
            const poleTopY = surfaceY + pole.side * 6 - 18;
            const top = r.worldToScreen(pole.x, poleTopY);

            // Skip if off-screen
            if (top.x < -50 || top.x > w + 50 || top.y < -50 || top.y > h + 50) continue;

            // Subtle pulsing flare intensity
            const pulse = 0.7 + 0.3 * Math.sin(t * 1.5 + pole.x * 0.1);

            // Central soft glow
            const glowR = 35 * pulse;
            const glowGrad = ctx.createRadialGradient(top.x, top.y, 0, top.x, top.y, glowR);
            glowGrad.addColorStop(0, `rgba(255,255,230,${(0.15 * pulse).toFixed(3)})`);
            glowGrad.addColorStop(0.5, `rgba(255,250,200,${(0.06 * pulse).toFixed(3)})`);
            glowGrad.addColorStop(1, 'rgba(255,250,200,0)');
            ctx.fillStyle = glowGrad;
            ctx.beginPath();
            ctx.arc(top.x, top.y, glowR, 0, Math.PI * 2);
            ctx.fill();

            // Light streak (horizontal anamorphic flare)
            const streakLen = 50 * pulse;
            const streakGrad = ctx.createLinearGradient(
                top.x - streakLen, top.y, top.x + streakLen, top.y
            );
            streakGrad.addColorStop(0, 'rgba(255,250,220,0)');
            streakGrad.addColorStop(0.3, `rgba(255,250,220,${(0.04 * pulse).toFixed(3)})`);
            streakGrad.addColorStop(0.5, `rgba(255,255,240,${(0.08 * pulse).toFixed(3)})`);
            streakGrad.addColorStop(0.7, `rgba(255,250,220,${(0.04 * pulse).toFixed(3)})`);
            streakGrad.addColorStop(1, 'rgba(255,250,220,0)');
            ctx.fillStyle = streakGrad;
            ctx.fillRect(top.x - streakLen, top.y - 1.5, streakLen * 2, 3);

            // 2-3 hexagonal bokeh ghosts along a line from flare to center
            const cx = w / 2;
            const cy = h / 2;
            const dx = cx - top.x;
            const dy = cy - top.y;
            const bokehPositions = [0.3, 0.55, 0.8];
            const bokehSizes = [8, 12, 6];
            const bokehAlphas = [0.03, 0.04, 0.025];

            for (let bi = 0; bi < bokehPositions.length; bi++) {
                const bx = top.x + dx * bokehPositions[bi];
                const by = top.y + dy * bokehPositions[bi];
                const bSize = bokehSizes[bi] * pulse;
                const bAlpha = bokehAlphas[bi] * pulse;

                // Draw hexagon
                ctx.globalAlpha = bAlpha;
                ctx.fillStyle = `rgba(200,220,255,1)`;
                ctx.beginPath();
                for (let hi = 0; hi < 6; hi++) {
                    const angle = (hi / 6) * Math.PI * 2 - Math.PI / 6;
                    const hx = bx + Math.cos(angle) * bSize;
                    const hy = by + Math.sin(angle) * bSize;
                    if (hi === 0) ctx.moveTo(hx, hy);
                    else ctx.lineTo(hx, hy);
                }
                ctx.closePath();
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }

        ctx.restore();
    }

    /**
     * Dynamic spotlight that follows the jumper during flight.
     * Lights up the snow surface below with a radial gradient.
     */
    _drawDynamicLighting(ctx, w, h, jumperState) {
        if (!jumperState || !this.renderer || !this.hill) return;
        const phase = jumperState.phase;
        if (phase !== GameState.FLIGHT && phase !== 'FLIGHT') return;

        const r = this.renderer;
        const surfaceY = this.hill.getHeightAtDistance(jumperState.x);
        const heightAbove = Math.max(0, surfaceY - jumperState.y);

        // Only show when jumper is airborne
        if (heightAbove < 0.5) return;

        // Spotlight on the snow surface below the jumper
        const groundSp = r.worldToScreen(jumperState.x, surfaceY);
        const jumperSp = r.worldToScreen(jumperState.x, jumperState.y);

        // Radius grows with height (wider spread from higher up)
        const spotRadius = Math.min(120, 30 + heightAbove * 8);
        const intensity = Math.min(0.12, 0.04 + heightAbove * 0.005);

        ctx.save();
        ctx.globalCompositeOperation = 'screen';

        // Main spotlight on ground
        const spotGrad = ctx.createRadialGradient(
            groundSp.x, groundSp.y, 0,
            groundSp.x, groundSp.y, spotRadius
        );
        spotGrad.addColorStop(0, `rgba(200,220,255,${intensity.toFixed(3)})`);
        spotGrad.addColorStop(0.4, `rgba(180,200,240,${(intensity * 0.5).toFixed(3)})`);
        spotGrad.addColorStop(0.7, `rgba(150,180,220,${(intensity * 0.2).toFixed(3)})`);
        spotGrad.addColorStop(1, 'rgba(150,180,220,0)');
        ctx.fillStyle = spotGrad;
        ctx.beginPath();
        ctx.arc(groundSp.x, groundSp.y, spotRadius, 0, Math.PI * 2);
        ctx.fill();

        // Subtle glow around jumper
        const jumperGlow = 20;
        const jGrad = ctx.createRadialGradient(
            jumperSp.x, jumperSp.y, 0,
            jumperSp.x, jumperSp.y, jumperGlow
        );
        jGrad.addColorStop(0, 'rgba(220,240,255,0.06)');
        jGrad.addColorStop(0.5, 'rgba(200,220,255,0.02)');
        jGrad.addColorStop(1, 'rgba(200,220,255,0)');
        ctx.fillStyle = jGrad;
        ctx.beginPath();
        ctx.arc(jumperSp.x, jumperSp.y, jumperGlow, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    /**
     * Predicted trajectory ghost line during flight.
     * Draws a faint dotted arc ahead of the jumper showing estimated landing.
     */
    _drawTrajectoryGhost(ctx, jumperState) {
        if (!jumperState || !this.renderer || !this.hill) return;
        const r = this.renderer;

        const vx = jumperState.vx || 0;
        const vy = jumperState.vy || 0;
        const gravity = 9.81;

        // Skip if barely moving
        if (Math.abs(vx) < 0.5) return;

        ctx.save();
        ctx.globalAlpha = 0.2;
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.setLineDash([4, 6]);
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';

        ctx.beginPath();
        let started = false;
        const dt = 0.08; // time step for prediction
        const steps = 30;  // predict ~2.4 seconds ahead

        for (let i = 1; i <= steps; i++) {
            const t = i * dt;
            // Simple projectile: x = x0 + vx*t, y = y0 + vy*t + 0.5*g*t^2
            const px = jumperState.x + vx * t;
            const py = jumperState.y + vy * t + 0.5 * gravity * t * t;

            // Check if we hit the hill surface
            const surfaceY = this.hill.getHeightAtDistance(px);
            if (py >= surfaceY) break;

            const sp = r.worldToScreen(px, py);
            if (!started) {
                ctx.moveTo(sp.x, sp.y);
                started = true;
            } else {
                ctx.lineTo(sp.x, sp.y);
            }
        }

        if (started) {
            ctx.stroke();
        }

        ctx.setLineDash([]);
        ctx.restore();
    }

    /**
     * Expanding concentric ripple rings on landing impact (like stone in water, but snow).
     * 3 rings, expanding and fading over 0.5s.
     */
    _drawImpactRipple(ctx) {
        if (this._impactRipples.length === 0) return;
        const r = this.renderer;
        const duration = 0.5;

        ctx.save();
        ctx.lineWidth = 1.5;

        // Clean up expired ripples while iterating
        let writeIdx = 0;
        for (let i = 0; i < this._impactRipples.length; i++) {
            const ripple = this._impactRipples[i];
            const elapsed = this._time - ripple.startTime;
            if (elapsed > duration) continue;

            // Keep this ripple
            if (writeIdx !== i) this._impactRipples[writeIdx] = ripple;
            writeIdx++;

            const progress = elapsed / duration;
            const sp = r.worldToScreen(ripple.x, ripple.y);
            const ppm = r.ppm;

            // 3 concentric rings with staggered expansion
            for (let ring = 0; ring < 3; ring++) {
                const ringDelay = ring * 0.08;
                const ringProgress = Math.max(0, (elapsed - ringDelay) / (duration - ringDelay));
                if (ringProgress <= 0 || ringProgress >= 1) continue;

                // Expand outward
                const maxRadius = (2.0 + ring * 1.5) * ppm;
                const radius = maxRadius * ringProgress;

                // Fade out as they expand -- fast ease-out
                const alpha = (1 - ringProgress) * (1 - ringProgress) * 0.5;

                // Elliptical (wider than tall) for perspective
                ctx.globalAlpha = alpha;
                ctx.strokeStyle = 'rgba(220,235,255,0.8)';
                ctx.beginPath();
                ctx.ellipse(sp.x, sp.y, radius, radius * 0.35, 0, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
        this._impactRipples.length = writeIdx;

        ctx.restore();
    }

    /**
     * Subtle depth-of-field effect: soft blur at screen edges.
     * Uses canvas filter blur on clipped border regions.
     */
    _drawDepthOfField(ctx, w, h) {
        // Check for filter support (not available in all contexts)
        if (typeof ctx.filter === 'undefined') return;

        const borderSize = Math.min(w, h) * 0.08; // ~8% of smallest dimension

        ctx.save();

        // Top edge
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, borderSize);
        ctx.clip();
        ctx.filter = 'blur(2px)';
        ctx.drawImage(ctx.canvas, 0, 0);
        ctx.filter = 'none';
        ctx.restore();

        // Bottom edge
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, h - borderSize, w, borderSize);
        ctx.clip();
        ctx.filter = 'blur(2px)';
        ctx.drawImage(ctx.canvas, 0, 0);
        ctx.filter = 'none';
        ctx.restore();

        // Left edge
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, borderSize, borderSize, h - borderSize * 2);
        ctx.clip();
        ctx.filter = 'blur(1.5px)';
        ctx.drawImage(ctx.canvas, 0, 0);
        ctx.filter = 'none';
        ctx.restore();

        // Right edge
        ctx.save();
        ctx.beginPath();
        ctx.rect(w - borderSize, borderSize, borderSize, h - borderSize * 2);
        ctx.clip();
        ctx.filter = 'blur(1.5px)';
        ctx.drawImage(ctx.canvas, 0, 0);
        ctx.filter = 'none';
        ctx.restore();

        ctx.restore();
    }

    /**
     * Heat distortion effect during high-speed inrun (>80 km/h).
     * Draws subtle wavy distortion lines rising from the track.
     */
    _drawHeatDistortion(ctx, jumperState) {
        if (!jumperState || !this.renderer || !this.hill) return;
        const speedKmh = (jumperState.speed || 0) * 3.6;
        if (speedKmh <= 80) return;

        const r = this.renderer;
        const t = this._time || 0;
        const intensity = Math.min(1, (speedKmh - 80) / 30); // 0-1 from 80-110 km/h

        ctx.save();
        ctx.globalAlpha = 0.06 * intensity;
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;

        // Draw 6-10 wavy rising lines near the jumper on the track
        const numLines = Math.floor(6 + intensity * 4);
        const jx = jumperState.x;

        for (let i = 0; i < numLines; i++) {
            // Spread lines along the track behind/around the jumper
            const offsetX = (i - numLines / 2) * 1.5;
            const baseX = jx + offsetX;
            const baseY = this.hill.getHeightAtDistance(baseX);

            ctx.beginPath();
            const segments = 8;
            for (let s = 0; s <= segments; s++) {
                const frac = s / segments;
                // Rise upward from the track surface
                const riseY = baseY - frac * 2.5;
                // Wavy horizontal wobble that increases with height
                const wobble = Math.sin(t * 6 + i * 2.3 + frac * 4) * 0.3 * frac * intensity;
                const wx = baseX + wobble;

                const sp = r.worldToScreen(wx, riseY);
                if (s === 0) ctx.moveTo(sp.x, sp.y);
                else ctx.lineTo(sp.x, sp.y);
            }
            ctx.stroke();
        }

        ctx.restore();
    }

}
