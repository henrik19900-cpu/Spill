/**
 * HUD.js - In-game heads-up display for Vinter-OL Skihopp
 *
 * Renders speed gauge, distance, wind indicator, phase text, timing bar,
 * angle indicator, and tap prompts. All Canvas 2D, mobile portrait (~390x844).
 */

export default class HUD {
    constructor() {
        this._time = 0;
    }

    // -------------------------------------------------------------------
    // Main render
    // -------------------------------------------------------------------

    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} width
     * @param {number} height
     * @param {object} hudData
     *   { speed, distance, bodyAngle, windSpeed, windDirection,
     *     phase, takeoffQuality, takeoffTiming (0-1, current bar pos) }
     */
    render(ctx, width, height, hudData = {}) {
        this._time += 0.016;

        const d = {
            speed: 0,
            distance: 0,
            bodyAngle: 0,
            windSpeed: 0,
            windDirection: 0,
            phase: 'INRUN',
            takeoffQuality: null,
            takeoffTiming: null,
            ...hudData,
        };

        this._renderPhaseIndicator(ctx, width, height, d);
        this._renderDistance(ctx, width, height, d);
        this._renderSpeedGauge(ctx, width, height, d);
        this._renderWindIndicator(ctx, width, height, d);

        if (d.phase === 'TAKEOFF' && d.takeoffTiming !== null) {
            this._renderTakeoffBar(ctx, width, height, d);
        }

        if (d.phase === 'FLIGHT') {
            this._renderAngleIndicator(ctx, width, height, d);
        }

        if (d.phase === 'READY' || d.phase === 'TAKEOFF' || d.phase === 'LANDING') {
            this._renderTapPrompt(ctx, width, height, d);
        }
    }

    // -------------------------------------------------------------------
    // Phase indicator (top-left)
    // -------------------------------------------------------------------

    _renderPhaseIndicator(ctx, width, height, d) {
        const phaseNames = {
            READY: 'Klar',
            INRUN: 'Tilløp',
            TAKEOFF: 'Sats',
            FLIGHT: 'Svev',
            LANDING: 'Landing',
            SCORE: 'Poeng',
        };

        const label = phaseNames[d.phase] || d.phase;
        const x = 16;
        const y = 50;

        // Background pill
        ctx.save();
        const pillW = 100;
        const pillH = 28;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        this._roundRect(ctx, x, y - pillH / 2, pillW, pillH, 14);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x + pillW / 2, y);
        ctx.restore();
    }

    // -------------------------------------------------------------------
    // Distance (top-center) - shown during/after flight
    // -------------------------------------------------------------------

    _renderDistance(ctx, width, height, d) {
        if (d.phase !== 'FLIGHT' && d.phase !== 'LANDING' && d.phase !== 'SCORE') return;

        const x = width / 2;
        const y = 50;

        // Background
        ctx.save();
        const bgW = 160;
        const bgH = 44;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        this._roundRect(ctx, x - bgW / 2, y - bgH / 2, bgW, bgH, 10);
        ctx.fill();

        // Distance number
        ctx.shadowColor = 'rgba(100,200,255,0.5)';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${d.distance.toFixed(1)} m`, x, y);
        ctx.restore();
    }

    // -------------------------------------------------------------------
    // Speed gauge (bottom-left) - circular
    // -------------------------------------------------------------------

    _renderSpeedGauge(ctx, width, height, d) {
        const cx = 56;
        const cy = height - 80;
        const r = 40;

        ctx.save();

        // Background circle
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath();
        ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
        ctx.fill();

        // Gauge arc (270 degrees, starting from bottom-left)
        const startAngle = Math.PI * 0.75;
        const endAngle = Math.PI * 2.25;
        const maxSpeed = 100;
        const speedFrac = Math.min(d.speed / maxSpeed, 1);
        const currentAngle = startAngle + speedFrac * (endAngle - startAngle);

        // Track
        ctx.beginPath();
        ctx.arc(cx, cy, r - 4, startAngle, endAngle);
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Filled arc
        if (speedFrac > 0) {
            const arcGrad = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
            arcGrad.addColorStop(0, '#00d4ff');
            arcGrad.addColorStop(1, '#ff4444');
            ctx.beginPath();
            ctx.arc(cx, cy, r - 4, startAngle, currentAngle);
            ctx.strokeStyle = arcGrad;
            ctx.lineWidth = 5;
            ctx.lineCap = 'round';
            ctx.stroke();
        }

        // Speed text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(Math.round(d.speed), cx, cy - 4);

        // Unit label
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '10px sans-serif';
        ctx.fillText('km/h', cx, cy + 12);

        ctx.restore();
    }

    // -------------------------------------------------------------------
    // Wind indicator (top-right)
    // -------------------------------------------------------------------

    _renderWindIndicator(ctx, width, height, d) {
        const x = width - 70;
        const y = 50;

        ctx.save();

        // Background
        const bgW = 120;
        const bgH = 44;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        this._roundRect(ctx, x - bgW / 2, y - bgH / 2, bgW, bgH, 10);
        ctx.fill();

        // Wind arrow
        const arrowX = x - 30;
        const arrowY = y;
        const dir = (d.windDirection || 0) * (Math.PI / 180); // degrees to rad

        ctx.save();
        ctx.translate(arrowX, arrowY);
        ctx.rotate(dir);

        ctx.strokeStyle = '#88ccff';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.lineTo(10, 0);
        ctx.moveTo(5, -5);
        ctx.lineTo(10, 0);
        ctx.lineTo(5, 5);
        ctx.stroke();

        ctx.restore();

        // Wind speed text
        ctx.fillStyle = '#ffffff';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${d.windSpeed.toFixed(1)}`, x + 10, y - 6);

        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = '10px sans-serif';
        ctx.fillText('m/s', x + 10, y + 9);

        ctx.restore();
    }

    // -------------------------------------------------------------------
    // Takeoff timing bar (center, during TAKEOFF)
    // -------------------------------------------------------------------

    _renderTakeoffBar(ctx, width, height, d) {
        const barW = Math.min(width * 0.6, 240);
        const barH = 16;
        const x = (width - barW) / 2;
        const y = height * 0.35;

        ctx.save();

        // Background bar
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        this._roundRect(ctx, x, y, barW, barH, barH / 2);
        ctx.fill();

        // Sweet spot zone (green band in center)
        const sweetStart = 0.4;
        const sweetEnd = 0.6;
        ctx.fillStyle = 'rgba(0,200,100,0.4)';
        this._roundRect(ctx, x + barW * sweetStart, y, barW * (sweetEnd - sweetStart), barH, 4);
        ctx.fill();

        // Perfect zone
        ctx.fillStyle = 'rgba(0,255,120,0.6)';
        const perfStart = 0.47;
        const perfEnd = 0.53;
        this._roundRect(ctx, x + barW * perfStart, y, barW * (perfEnd - perfStart), barH, 2);
        ctx.fill();

        // Moving indicator
        const timing = Math.max(0, Math.min(1, d.takeoffTiming));
        const indicatorX = x + barW * timing;
        const indicatorR = barH / 2 + 4;

        ctx.beginPath();
        ctx.arc(indicatorX, y + barH / 2, indicatorR, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(255,255,255,0.7)';
        ctx.shadowBlur = 8;
        ctx.fill();

        // Label
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('SATS!', width / 2, y - 8);

        ctx.restore();
    }

    // -------------------------------------------------------------------
    // Angle indicator (during FLIGHT)
    // -------------------------------------------------------------------

    _renderAngleIndicator(ctx, width, height, d) {
        const cx = width - 56;
        const cy = height - 80;
        const r = 36;

        ctx.save();

        // Background
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath();
        ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
        ctx.fill();

        // Arc track (-30 to +30 degrees mapped to visual arc)
        const minAngle = -30;
        const maxAngle = 30;
        const arcStart = -Math.PI * 0.75;
        const arcEnd = -Math.PI * 0.25;

        ctx.beginPath();
        ctx.arc(cx, cy, r - 4, arcStart, arcEnd);
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Optimal zone
        const optStart = arcStart + (arcEnd - arcStart) * 0.35;
        const optEnd = arcStart + (arcEnd - arcStart) * 0.55;
        ctx.beginPath();
        ctx.arc(cx, cy, r - 4, optStart, optEnd);
        ctx.strokeStyle = 'rgba(0,200,100,0.6)';
        ctx.lineWidth = 4;
        ctx.stroke();

        // Current angle needle
        const angleFrac = Math.max(0, Math.min(1, (d.bodyAngle - minAngle) / (maxAngle - minAngle)));
        const needleAngle = arcStart + angleFrac * (arcEnd - arcStart);
        const nx = cx + Math.cos(needleAngle) * (r - 8);
        const ny = cy + Math.sin(needleAngle) * (r - 8);

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(nx, ny);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Dot at tip
        ctx.beginPath();
        ctx.arc(nx, ny, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // Angle text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${d.bodyAngle.toFixed(0)}°`, cx, cy + 8);

        ctx.restore();
    }

    // -------------------------------------------------------------------
    // Tap prompt (pulsing)
    // -------------------------------------------------------------------

    _renderTapPrompt(ctx, width, height, d) {
        const pulse = 0.6 + Math.sin(this._time * 6) * 0.4;

        ctx.save();
        ctx.globalAlpha = pulse;

        const x = width / 2;
        const y = height * 0.55;

        // Background pill
        const pillW = 120;
        const pillH = 50;
        ctx.fillStyle = 'rgba(255,80,80,0.35)';
        ctx.shadowColor = 'rgba(255,100,100,0.6)';
        ctx.shadowBlur = 16;
        this._roundRect(ctx, x - pillW / 2, y - pillH / 2, pillW, pillH, pillH / 2);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('TAP!', x, y);

        ctx.restore();
    }

    // -------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------

    _roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }
}
