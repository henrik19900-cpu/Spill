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
// SkihoppRenderer
// ---------------------------------------------------------------------------

export default class SkihoppRenderer {
    constructor() {
        this.game = null;
        this.hill = null;
        this.renderer = null;

        // Pre-generated visual data
        this._stars = [];
        this._mountains = [[], [], []]; // 3 parallax layers
        this._spectators = [];
        this._snowParticles = [];

        this._initialized = false;
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
        for (let i = 0; i < 35; i++) {
            this._stars.push({
                x: rng(),
                y: rng() * 0.55,          // keep in upper portion
                r: 0.5 + rng() * 1.5,     // radius in px
                a: 0.4 + rng() * 0.6,     // alpha
            });
        }
    }

    _generateMountains() {
        const rng = seededRandom(1337);
        const layerConfigs = [
            { baseY: 0.40, variance: 0.12, color: '#0d1530', peaks: 12 },
            { baseY: 0.48, variance: 0.10, color: '#162040', peaks: 14 },
            { baseY: 0.55, variance: 0.08, color: '#1d2d50', peaks: 16 },
        ];

        this._mountains = layerConfigs.map(cfg => {
            const pts = [];
            // Extend well beyond screen width for parallax scrolling
            const count = cfg.peaks;
            for (let i = 0; i <= count; i++) {
                const t = i / count;
                // Use a wide range so parallax never runs out of mountains
                pts.push({
                    x: -0.3 + t * 1.6,
                    y: cfg.baseY - rng() * cfg.variance,
                });
            }
            return { points: pts, color: cfg.color };
        });
    }

    _generateSpectators() {
        const rng = seededRandom(777);
        this._spectators = [];

        // Place spectators along the outrun / flat area
        const landingPts = this.hill.getLandingPoints();
        const last = landingPts[landingPts.length - 1];
        const flatStartX = last.x - 20;
        const flatY = last.y;

        const colors = [
            '#e63946', '#457b9d', '#2a9d8f', '#e9c46a',
            '#f4a261', '#264653', '#d62828', '#023e8a',
            '#ff006e', '#8338ec', '#ffbe0b', '#fb5607',
        ];

        for (let i = 0; i < 28; i++) {
            this._spectators.push({
                x: flatStartX + rng() * 25,
                y: flatY - 0.3 - rng() * 1.8,
                color: colors[Math.floor(rng() * colors.length)],
                h: 0.8 + rng() * 1.0,
            });
        }
    }

    _generateSnowParticles() {
        const rng = seededRandom(999);
        this._snowParticles = [];
        for (let i = 0; i < 50; i++) {
            this._snowParticles.push({
                x: rng(),
                y: rng(),
                r: 1 + rng() * 2,
                speedX: (rng() - 0.5) * 0.15,
                speedY: 0.05 + rng() * 0.1,
                alpha: 0.2 + rng() * 0.5,
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

        // --- Camera management ---
        this._updateCamera(jumperState, gameState, 1 / 60);

        // --- Draw layers back-to-front ---
        this._drawSky(ctx, width, height);
        this._drawMountains(ctx, width, height);
        this._drawSnowGround(ctx, width, height);
        this._drawHillSurface(ctx, width, height);
        this._drawSpectators(ctx);
        this._drawJumper(ctx, jumperState);
        this._drawSnowParticles(ctx, width, height);
    }

    // ------------------------------------------------------------------
    // Camera
    // ------------------------------------------------------------------

    _updateCamera(jumperState, gameState, dt) {
        const r = this.renderer;
        if (!r) return;
        let targetZoom, targetX, targetY;

        switch (gameState) {
            case GameState.MENU:
            case GameState.READY: {
                // Wide shot: centre on middle of hill
                const profile = this.hill.getProfile();
                const mid = profile[Math.floor(profile.length * 0.4)];
                targetX = mid.x;
                targetY = mid.y;
                targetZoom = 0.8;
                break;
            }
            case GameState.INRUN:
                targetX = jumperState.x;
                targetY = jumperState.y;
                targetZoom = 3;
                break;
            case GameState.FLIGHT:
                targetX = jumperState.x;
                targetY = jumperState.y;
                targetZoom = 1.5;
                break;
            case GameState.LANDING:
                targetX = jumperState.x;
                targetY = jumperState.y;
                targetZoom = 2;
                break;
            default:
                targetX = jumperState.x;
                targetY = jumperState.y;
                targetZoom = 1.5;
        }

        r.smoothFollow(targetX, targetY, dt, 4);
        r.smoothZoom(targetZoom, dt, 3);
    }

    // ------------------------------------------------------------------
    // 1. Sky
    // ------------------------------------------------------------------

    _drawSky(ctx, w, h) {
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#0a0a2e');
        grad.addColorStop(0.65, '#1a3a6e');
        grad.addColorStop(1, '#243b6e');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        // Stars
        for (const s of this._stars) {
            ctx.beginPath();
            ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,255,${s.a})`;
            ctx.fill();
        }
    }

    // ------------------------------------------------------------------
    // 2. Mountains
    // ------------------------------------------------------------------

    _drawMountains(ctx, w, h) {
        const parallaxFactors = [0.1, 0.2, 0.3];
        const cameraX = this.renderer.cameraX;

        for (let layer = 0; layer < 3; layer++) {
            const { points, color } = this._mountains[layer];
            const offsetX = -cameraX * parallaxFactors[layer] * 0.01;

            ctx.beginPath();
            const firstPt = points[0];
            ctx.moveTo((firstPt.x + offsetX) * w, firstPt.y * h);

            for (let i = 1; i < points.length; i++) {
                const pt = points[i];
                ctx.lineTo((pt.x + offsetX) * w, pt.y * h);
            }

            // Close along the bottom
            ctx.lineTo((points[points.length - 1].x + offsetX) * w, h);
            ctx.lineTo((points[0].x + offsetX) * w, h);
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();
        }
    }

    // ------------------------------------------------------------------
    // 3. Snow ground (fill below hill surface)
    // ------------------------------------------------------------------

    _drawSnowGround(ctx, w, h) {
        const profile = this.hill.getProfile();
        const r = this.renderer;

        ctx.beginPath();
        let first = true;
        for (const pt of profile) {
            const sp = r.worldToScreen(pt.x, pt.y);
            if (first) { ctx.moveTo(sp.x, sp.y); first = false; }
            else ctx.lineTo(sp.x, sp.y);
        }

        // Close the polygon along the bottom and back
        const lastScreen = r.worldToScreen(profile[profile.length - 1].x, profile[profile.length - 1].y);
        const firstScreen = r.worldToScreen(profile[0].x, profile[0].y);
        ctx.lineTo(lastScreen.x, h + 50);
        ctx.lineTo(firstScreen.x, h + 50);
        ctx.closePath();

        ctx.fillStyle = '#e8f0ff';
        ctx.fill();
    }

    // ------------------------------------------------------------------
    // 4. Hill surface with markings
    // ------------------------------------------------------------------

    _drawHillSurface(ctx, w, h) {
        const r = this.renderer;
        const profile = this.hill.getProfile();

        // --- Snow surface fill (slightly brighter than ground) ---
        ctx.beginPath();
        let first = true;
        for (const pt of profile) {
            const sp = r.worldToScreen(pt.x, pt.y);
            if (first) { ctx.moveTo(sp.x, sp.y); first = false; }
            else ctx.lineTo(sp.x, sp.y);
        }

        // Close polygon with a thin strip below the surface (a few pixels)
        const thickness = 4 * r.ppm; // surface layer thickness in pixels
        const lastPt = profile[profile.length - 1];
        const firstPt = profile[0];
        const lastS = r.worldToScreen(lastPt.x, lastPt.y);
        const firstS = r.worldToScreen(firstPt.x, firstPt.y);
        ctx.lineTo(lastS.x, lastS.y + thickness);
        ctx.lineTo(firstS.x, firstS.y + thickness);
        ctx.closePath();

        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // Shadow strip just below surface edge
        ctx.beginPath();
        first = true;
        for (const pt of profile) {
            const sp = r.worldToScreen(pt.x, pt.y + 0.3);
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

        // --- Surface outline ---
        ctx.beginPath();
        first = true;
        for (const pt of profile) {
            const sp = r.worldToScreen(pt.x, pt.y);
            if (first) { ctx.moveTo(sp.x, sp.y); first = false; }
            else ctx.lineTo(sp.x, sp.y);
        }
        ctx.strokeStyle = '#667788';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // --- Distance markers on landing slope (every 10m) ---
        this._drawDistanceMarkers(ctx);

        // --- K-point and HS-point lines ---
        this._drawPointMarker(ctx, this.hill.getKPointPosition(), '#ff2222', 'K');
        this._drawPointMarker(ctx, this.hill.getHSPointPosition(), '#2255ff', 'HS');

        // --- Judges tower ---
        this._drawJudgesTower(ctx);
    }

    _drawDistanceMarkers(ctx) {
        const r = this.renderer;
        const landingPts = this.hill.getLandingPoints();

        // Mark every 10m of horizontal distance
        for (let dist = 10; dist <= 200; dist += 10) {
            // Find the surface point closest to this distance
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

            // Short perpendicular green line
            ctx.beginPath();
            ctx.moveTo(sp.x - 2, sp.y - 4);
            ctx.lineTo(sp.x + 2, sp.y + 4);
            ctx.strokeStyle = '#44aa44';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
    }

    _drawPointMarker(ctx, pos, color, label) {
        const r = this.renderer;
        if (!pos) return;

        const sp = r.worldToScreen(pos.x, pos.y);

        // Perpendicular line across the slope
        const lineLen = 8;
        ctx.beginPath();
        ctx.moveTo(sp.x - lineLen * 0.4, sp.y - lineLen);
        ctx.lineTo(sp.x + lineLen * 0.4, sp.y + lineLen);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Label
        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.fillText(label, sp.x, sp.y - lineLen - 4);
    }

    _drawJudgesTower(ctx) {
        const r = this.renderer;

        // Position the tower near the K-point, offset to the side
        const kp = this.hill.getKPointPosition();
        if (!kp) return;

        const towerX = kp.x + 5;
        const towerY = kp.y - 8; // above the slope

        const base = r.worldToScreen(towerX, kp.y);
        const top = r.worldToScreen(towerX, towerY);

        const towerWidth = 10;
        const floorHeight = (base.y - top.y) / 5;

        // Tower body
        ctx.fillStyle = '#334455';
        ctx.fillRect(top.x - towerWidth / 2, top.y, towerWidth, base.y - top.y);

        // Window floors
        const floorColors = ['#445566', '#556677', '#4a5a6a', '#556677', '#445566'];
        for (let i = 0; i < 5; i++) {
            ctx.fillStyle = floorColors[i];
            ctx.fillRect(
                top.x - towerWidth / 2 + 1,
                top.y + i * floorHeight + 1,
                towerWidth - 2,
                floorHeight - 2
            );
            // Small yellow window
            ctx.fillStyle = '#ffdd66';
            ctx.fillRect(
                top.x - 2,
                top.y + i * floorHeight + floorHeight * 0.25,
                4,
                floorHeight * 0.4
            );
        }

        // Roof
        ctx.fillStyle = '#223344';
        ctx.fillRect(top.x - towerWidth / 2 - 2, top.y - 3, towerWidth + 4, 4);
    }

    // ------------------------------------------------------------------
    // 5. Ski jumper
    // ------------------------------------------------------------------

    _drawJumper(ctx, js) {
        if (!js) return;

        const r = this.renderer;
        const sp = r.worldToScreen(js.x, js.y);
        const ppm = r.ppm; // pixels per meter at current zoom

        ctx.save();
        ctx.translate(sp.x, sp.y);

        const scale = ppm; // 1 meter = this many pixels
        const phase = js.phase;
        const bodyAngle = (js.bodyAngle || 0) * Math.PI / 180;

        if (phase === GameState.INRUN || phase === 'INRUN') {
            this._drawJumperInrun(ctx, scale, bodyAngle);
        } else if (phase === GameState.FLIGHT || phase === 'FLIGHT') {
            this._drawJumperFlight(ctx, scale, bodyAngle);
        } else if (phase === GameState.LANDING || phase === 'LANDING') {
            this._drawJumperLanding(ctx, scale, bodyAngle);
        } else {
            // Default: standing pose
            this._drawJumperInrun(ctx, scale, 0);
        }

        ctx.restore();
    }

    /** Crouched inrun pose: low body, skis flat. */
    _drawJumperInrun(ctx, s, angle) {
        ctx.rotate(angle);

        // Skis (flat under the jumper)
        ctx.fillStyle = '#444444';
        ctx.fillRect(-1.2 * s, -0.05 * s, 2.4 * s, 0.08 * s);

        // Legs (crouched)
        ctx.fillStyle = '#2244aa';
        ctx.fillRect(-0.15 * s, -0.5 * s, 0.3 * s, 0.5 * s);

        // Torso (leaning forward, crouched)
        ctx.save();
        ctx.translate(0, -0.5 * s);
        ctx.rotate(-0.6); // lean forward
        ctx.fillStyle = '#2244aa';
        ctx.fillRect(-0.15 * s, -0.6 * s, 0.3 * s, 0.6 * s);

        // Head
        ctx.fillStyle = '#cc2222'; // helmet
        ctx.beginPath();
        ctx.arc(0, -0.7 * s, 0.15 * s, 0, Math.PI * 2);
        ctx.fill();
        // Face
        ctx.fillStyle = '#ffccaa';
        ctx.beginPath();
        ctx.arc(0.05 * s, -0.65 * s, 0.07 * s, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    /** V-style flight: skis angled, body leaning forward. */
    _drawJumperFlight(ctx, s, angle) {
        ctx.rotate(angle);

        // Body leaning forward
        ctx.save();

        // Torso
        ctx.fillStyle = '#2244aa';
        ctx.fillRect(-0.12 * s, -0.15 * s, 0.24 * s, 0.9 * s);

        // Legs trailing behind (downward in rotated frame)
        ctx.fillStyle = '#2244aa';
        ctx.fillRect(-0.10 * s, 0.75 * s, 0.20 * s, 0.6 * s);

        // Head (at the front/top)
        ctx.fillStyle = '#cc2222';
        ctx.beginPath();
        ctx.arc(0, -0.25 * s, 0.15 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffccaa';
        ctx.beginPath();
        ctx.arc(0.06 * s, -0.20 * s, 0.07 * s, 0, Math.PI * 2);
        ctx.fill();

        // V-style skis
        ctx.strokeStyle = '#444444';
        ctx.lineWidth = Math.max(2, 0.06 * s);
        ctx.lineCap = 'round';

        // Left ski (angled out-left)
        ctx.beginPath();
        ctx.moveTo(-0.1 * s, 1.3 * s);
        ctx.lineTo(-0.6 * s, 1.3 * s + 1.2 * s);
        ctx.stroke();

        // Right ski (angled out-right)
        ctx.beginPath();
        ctx.moveTo(0.1 * s, 1.3 * s);
        ctx.lineTo(0.6 * s, 1.3 * s + 1.2 * s);
        ctx.stroke();

        // Arms stretched along body
        ctx.strokeStyle = '#2244aa';
        ctx.lineWidth = Math.max(1.5, 0.05 * s);
        ctx.beginPath();
        ctx.moveTo(-0.12 * s, 0.2 * s);
        ctx.lineTo(-0.25 * s, 0.8 * s);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0.12 * s, 0.2 * s);
        ctx.lineTo(0.25 * s, 0.8 * s);
        ctx.stroke();

        ctx.restore();
    }

    /** Telemark landing: one foot forward, one back, arms out. */
    _drawJumperLanding(ctx, s, angle) {
        ctx.rotate(angle);

        // Front ski (forward)
        ctx.fillStyle = '#444444';
        ctx.fillRect(-1.0 * s, -0.05 * s, 2.0 * s, 0.07 * s);

        // Back ski (behind, slightly offset)
        ctx.fillRect(-0.5 * s, 0.3 * s, 2.0 * s, 0.07 * s);

        // Front leg
        ctx.fillStyle = '#2244aa';
        ctx.save();
        ctx.translate(0.3 * s, 0);
        ctx.rotate(-0.15);
        ctx.fillRect(-0.08 * s, -0.7 * s, 0.16 * s, 0.7 * s);
        ctx.restore();

        // Back leg
        ctx.fillStyle = '#2244aa';
        ctx.save();
        ctx.translate(-0.2 * s, 0.3 * s);
        ctx.rotate(0.15);
        ctx.fillRect(-0.08 * s, -0.7 * s, 0.16 * s, 0.7 * s);
        ctx.restore();

        // Torso (upright)
        ctx.fillStyle = '#2244aa';
        ctx.fillRect(-0.12 * s, -1.3 * s, 0.24 * s, 0.7 * s);

        // Arms outstretched
        ctx.strokeStyle = '#2244aa';
        ctx.lineWidth = Math.max(2, 0.06 * s);
        ctx.lineCap = 'round';
        // Left arm
        ctx.beginPath();
        ctx.moveTo(-0.12 * s, -1.0 * s);
        ctx.lineTo(-0.7 * s, -0.8 * s);
        ctx.stroke();
        // Right arm
        ctx.beginPath();
        ctx.moveTo(0.12 * s, -1.0 * s);
        ctx.lineTo(0.7 * s, -0.8 * s);
        ctx.stroke();

        // Head
        ctx.fillStyle = '#cc2222';
        ctx.beginPath();
        ctx.arc(0, -1.45 * s, 0.15 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffccaa';
        ctx.beginPath();
        ctx.arc(0.06 * s, -1.40 * s, 0.07 * s, 0, Math.PI * 2);
        ctx.fill();
    }

    // ------------------------------------------------------------------
    // 6. Spectators
    // ------------------------------------------------------------------

    _drawSpectators(ctx) {
        const r = this.renderer;

        for (const spec of this._spectators) {
            const sp = r.worldToScreen(spec.x, spec.y);

            // Body (small rectangle)
            ctx.fillStyle = spec.color;
            const h = spec.h * r.ppm;
            const w = h * 0.4;
            ctx.fillRect(sp.x - w / 2, sp.y - h, w, h);

            // Head (small circle)
            ctx.fillStyle = '#ffccaa';
            ctx.beginPath();
            ctx.arc(sp.x, sp.y - h - w * 0.4, w * 0.4, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ------------------------------------------------------------------
    // 7. Snow particles
    // ------------------------------------------------------------------

    _drawSnowParticles(ctx, w, h) {
        const now = Date.now() * 0.001;

        for (const p of this._snowParticles) {
            // Animate position (wrapping)
            const px = ((p.x + p.speedX * now) % 1 + 1) % 1;
            const py = ((p.y + p.speedY * now) % 1 + 1) % 1;

            ctx.beginPath();
            ctx.arc(px * w, py * h, p.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,255,${p.alpha})`;
            ctx.fill();
        }
    }
}
