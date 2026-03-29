/**
 * HUD.js - TV broadcast-style overlay for Vinter-OL Skihopp
 *
 * Minimal, clean design inspired by real ski jumping broadcasts.
 * Phase-specific rendering: INRUN, TAKEOFF, FLIGHT, LANDING.
 */

export default class HUD {
    constructor() {
        this._time = 0;
        this._displayedDistance = 0;
        this._landingFlashTimer = 0;
        this._landingPhaseEntered = false;
    }

    // -------------------------------------------------------------------
    // Main render
    // -------------------------------------------------------------------

    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} width
     * @param {number} height
     * @param {object} hudData
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
            landingQuality: 0,
            ...hudData,
        };

        // Smoothly animate distance counter
        const distDelta = d.distance - this._displayedDistance;
        this._displayedDistance += distDelta * 0.15;
        if (Math.abs(distDelta) < 0.05) this._displayedDistance = d.distance;

        // Track landing phase entry for flash timer
        if (d.phase === 'LANDING' && !this._landingPhaseEntered) {
            this._landingPhaseEntered = true;
            this._landingFlashTimer = 0;
        }
        if (d.phase === 'LANDING') {
            this._landingFlashTimer += 0.016;
        }
        if (d.phase !== 'LANDING') {
            this._landingPhaseEntered = false;
        }

        // Phase-specific rendering
        switch (d.phase) {
            case 'INRUN':
                this._renderInrun(ctx, width, height, d);
                break;
            case 'TAKEOFF':
                this._renderTakeoff(ctx, width, height, d);
                break;
            case 'FLIGHT':
                this._renderFlight(ctx, width, height, d);
                break;
            case 'LANDING':
                this._renderLanding(ctx, width, height, d);
                break;
        }
    }

    // -------------------------------------------------------------------
    // INRUN: Speed display + speed bar
    // -------------------------------------------------------------------

    _renderInrun(ctx, width, height, d) {
        // Bottom-left: large speed number
        const speedKmh = Math.round(d.speed * 3.6);
        const x = 24;
        const y = height - 60;

        ctx.save();

        // Semi-transparent background panel
        const panelW = 110;
        const panelH = 64;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this._roundRect(ctx, x - 8, y - panelH + 10, panelW, panelH, 6);
        ctx.fill();

        // Large speed number
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 4;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 42px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(String(speedKmh), x, y);

        // "km/h" label
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = '14px sans-serif';
        const numWidth = ctx.measureText(String(speedKmh)).width;
        ctx.font = 'bold 42px sans-serif';
        const actualNumWidth = ctx.measureText(String(speedKmh)).width;
        ctx.font = '14px sans-serif';
        ctx.fillText('km/h', x + actualNumWidth + 6, y);

        ctx.restore();

        // Bottom: thin speed bar
        this._renderSpeedBar(ctx, width, height, d);
    }

    _renderSpeedBar(ctx, width, height, d) {
        const barY = height - 16;
        const barH = 4;
        const barMargin = 20;
        const barW = width - barMargin * 2;
        const maxSpeedKmh = 95; // ~26 m/s max inrun speed
        const speedKmh = d.speed * 3.6;
        const fill = Math.min(speedKmh / maxSpeedKmh, 1);

        ctx.save();

        // Track background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        this._roundRect(ctx, barMargin, barY, barW, barH, 2);
        ctx.fill();

        // Filled portion
        if (fill > 0.01) {
            const grad = ctx.createLinearGradient(barMargin, 0, barMargin + barW, 0);
            grad.addColorStop(0, 'rgba(100, 180, 255, 0.8)');
            grad.addColorStop(0.7, 'rgba(100, 220, 255, 0.9)');
            grad.addColorStop(1, 'rgba(255, 255, 255, 1.0)');
            ctx.fillStyle = grad;
            this._roundRect(ctx, barMargin, barY, barW * fill, barH, 2);
            ctx.fill();
        }

        ctx.restore();
    }

    // -------------------------------------------------------------------
    // TAKEOFF: Pulsing target circle + "SATS!" text
    // -------------------------------------------------------------------

    _renderTakeoff(ctx, width, height, d) {
        const cx = width / 2;
        const cy = height * 0.4;

        ctx.save();

        // Pulsing shrinking circle
        const pulse = 0.5 + Math.sin(this._time * 12) * 0.5; // fast pulse
        const baseR = 80;
        const minR = 20;
        // Circle shrinks over the takeoff phase (brief, so use time-based)
        const shrinkT = Math.min(this._time * 4 % 1, 1);
        const r = baseR - (baseR - minR) * pulse * 0.3;

        // Outer ring - white with glow
        ctx.shadowColor = 'rgba(255, 255, 255, 0.6)';
        ctx.shadowBlur = 20;
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.5 + pulse * 0.5})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();

        // Inner ring
        ctx.shadowBlur = 0;
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 + pulse * 0.3})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
        ctx.stroke();

        // Center dot
        ctx.fillStyle = `rgba(255, 255, 255, ${0.6 + pulse * 0.4})`;
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fill();

        // "SATS!" text - bold, pulsing
        const textScale = 1.0 + Math.sin(this._time * 10) * 0.08;
        ctx.save();
        ctx.translate(cx, cy + r + 40);
        ctx.scale(textScale, textScale);
        ctx.translate(-cx, -(cy + r + 40));

        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 6;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('SATS!', cx, cy + r + 40);
        ctx.restore();

        ctx.restore();
    }

    // -------------------------------------------------------------------
    // FLIGHT: Distance, wind, body angle gauge
    // -------------------------------------------------------------------

    _renderFlight(ctx, width, height, d) {
        // Top-left: live distance
        this._renderFlightDistance(ctx, width, height, d);
        // Top-right: wind indicator
        this._renderFlightWind(ctx, width, height, d);
        // Bottom-right: body angle gauge
        this._renderFlightAngleGauge(ctx, width, height, d);
    }

    _renderFlightDistance(ctx, width, height, d) {
        const x = 20;
        const y = 48;

        ctx.save();

        // Background panel
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        this._roundRect(ctx, x - 6, y - 28, 170, 44, 6);
        ctx.fill();

        // Distance number
        const dist = this._displayedDistance.toFixed(1);
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 4;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 32px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(dist, x, y);

        // "m" suffix
        ctx.shadowBlur = 0;
        ctx.font = 'bold 32px sans-serif';
        const numW = ctx.measureText(dist).width;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText(' m', x + numW, y + 2);

        ctx.restore();
    }

    _renderFlightWind(ctx, width, height, d) {
        const x = width - 20;
        const y = 48;

        ctx.save();

        // Background panel
        const panelW = 100;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        this._roundRect(ctx, x - panelW + 6, y - 28, panelW, 44, 6);
        ctx.fill();

        // Wind arrow
        const arrowX = x - panelW + 22;
        const arrowY = y;
        const windDir = (d.windDirection || 0) * (Math.PI / 180);
        const arrowLen = 12;

        ctx.save();
        ctx.translate(arrowX, arrowY);
        ctx.rotate(windDir);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-arrowLen, 0);
        ctx.lineTo(arrowLen, 0);
        ctx.stroke();

        // Arrowhead
        ctx.beginPath();
        ctx.moveTo(arrowLen, 0);
        ctx.lineTo(arrowLen - 5, -4);
        ctx.moveTo(arrowLen, 0);
        ctx.lineTo(arrowLen - 5, 4);
        ctx.stroke();

        ctx.restore();

        // Wind speed text
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 3;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(d.windSpeed.toFixed(1), x - 4, y - 6);

        // "m/s" label
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '12px sans-serif';
        ctx.fillText('m/s', x - 4, y + 10);

        ctx.restore();
    }

    _renderFlightAngleGauge(ctx, width, height, d) {
        const cx = width - 70;
        const cy = height - 80;
        const r = 48;

        // Angle range: 10 to 55 degrees
        const minDeg = 10;
        const maxDeg = 55;
        // Arc: upper semi-circle, left to right
        const arcStart = Math.PI;  // 180 deg (left)
        const arcEnd = 0;          // 0 deg (right)
        const arcSweep = Math.PI;  // 180 degrees of arc

        ctx.save();

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.beginPath();
        ctx.arc(cx, cy, r + 6, Math.PI, 0, false);
        ctx.lineTo(cx + r + 6, cy + 8);
        ctx.lineTo(cx - r - 6, cy + 8);
        ctx.closePath();
        ctx.fill();

        // Track arc (dim)
        ctx.beginPath();
        ctx.arc(cx, cy, r - 4, arcStart, arcEnd, false);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 8;
        ctx.lineCap = 'butt';
        ctx.stroke();

        // Green zone: 30-40 degrees
        const greenStartFrac = (30 - minDeg) / (maxDeg - minDeg);
        const greenEndFrac = (40 - minDeg) / (maxDeg - minDeg);
        const greenStart = arcStart + greenStartFrac * arcSweep;
        const greenEnd = arcStart + greenEndFrac * arcSweep;

        ctx.beginPath();
        ctx.arc(cx, cy, r - 4, greenStart, greenEnd, false);
        ctx.strokeStyle = 'rgba(0, 200, 100, 0.6)';
        ctx.lineWidth = 8;
        ctx.stroke();

        // Bright sweet spot: 33-37 degrees
        const sweetStartFrac = (33 - minDeg) / (maxDeg - minDeg);
        const sweetEndFrac = (37 - minDeg) / (maxDeg - minDeg);
        const sweetStart = arcStart + sweetStartFrac * arcSweep;
        const sweetEnd = arcStart + sweetEndFrac * arcSweep;

        ctx.beginPath();
        ctx.arc(cx, cy, r - 4, sweetStart, sweetEnd, false);
        ctx.strokeStyle = 'rgba(0, 255, 120, 0.9)';
        ctx.lineWidth = 8;
        ctx.stroke();

        // Tick marks at 10, 20, 30, 40, 50
        const ticks = [10, 20, 30, 40, 50];
        for (const tickVal of ticks) {
            const frac = (tickVal - minDeg) / (maxDeg - minDeg);
            const angle = arcStart + frac * arcSweep;
            const inner = r - 12;
            const outer = r - 6;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
            ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1.5;
            ctx.lineCap = 'round';
            ctx.stroke();
        }

        // Needle - current body angle
        const clampedAngle = Math.max(minDeg, Math.min(maxDeg, d.bodyAngle));
        const angleFrac = (clampedAngle - minDeg) / (maxDeg - minDeg);
        const needleAngle = arcStart + angleFrac * arcSweep;
        const needleLen = r - 14;
        const nx = cx + Math.cos(needleAngle) * needleLen;
        const ny = cy + Math.sin(needleAngle) * needleLen;

        // Color: green if in optimal zone, white otherwise
        const inGreen = d.bodyAngle >= 30 && d.bodyAngle <= 40;
        const needleColor = inGreen ? '#44ff88' : '#ffffff';

        ctx.shadowColor = needleColor;
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(nx, ny);
        ctx.strokeStyle = needleColor;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Needle tip
        ctx.beginPath();
        ctx.arc(nx, ny, 3, 0, Math.PI * 2);
        ctx.fillStyle = needleColor;
        ctx.fill();

        // Center pivot
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#444444';
        ctx.fill();

        // Angle text below gauge
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 3;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${d.bodyAngle.toFixed(0)}°`, cx, cy + 16);

        ctx.restore();
    }

    // -------------------------------------------------------------------
    // LANDING: Flash landing quality + frozen distance
    // -------------------------------------------------------------------

    _renderLanding(ctx, width, height, d) {
        // Show frozen distance (top-left, same position as flight)
        this._renderFlightDistance(ctx, width, height, d);

        // Brief landing quality flash (visible for ~2 seconds)
        if (this._landingFlashTimer < 2.0) {
            const alpha = this._landingFlashTimer < 1.5
                ? 1.0
                : 1.0 - (this._landingFlashTimer - 1.5) / 0.5; // fade out last 0.5s

            ctx.save();

            const cx = width / 2;
            const cy = height * 0.4;

            // Determine landing text and color
            let text, color;
            if (d.landingQuality >= 2.5) {
                text = 'TELEMARK!';
                color = '#44ff88'; // bright green
            } else if (d.landingQuality >= 1.0) {
                text = 'Bra!';
                color = '#ffdd44'; // yellow
            } else if (d.landingQuality >= 0) {
                text = 'OK';
                color = '#ffaa44'; // orange
            } else {
                text = 'Svakt';
                color = '#ff6644'; // red-orange
            }

            ctx.globalAlpha = Math.max(0, alpha);

            // Background pill
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            const pillW = 200;
            const pillH = 56;
            this._roundRect(ctx, cx - pillW / 2, cy - pillH / 2, pillW, pillH, pillH / 2);
            ctx.fill();

            // Scale-in effect on first frames
            const scaleT = Math.min(this._landingFlashTimer / 0.15, 1);
            const scale = 0.6 + 0.4 * scaleT;

            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(scale, scale);
            ctx.translate(-cx, -cy);

            // Text
            ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            ctx.shadowBlur = 6;
            ctx.fillStyle = color;
            ctx.font = 'bold 34px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, cx, cy);

            ctx.restore();
            ctx.restore();
        }
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
