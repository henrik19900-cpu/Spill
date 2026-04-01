/**
 * HUD.js - TV broadcast-style overlay for Vinter-OL Skihopp
 *
 * Polished, phase-specific rendering inspired by real ski jumping broadcasts.
 * Optimized for mobile readability with minimum 16px text, bold numbers,
 * and text shadows throughout.
 *
 * Phases: INRUN, TAKEOFF, FLIGHT, LANDING.
 *
 * Data consumed from hudData:
 *   speed, distance, bodyAngle, windSpeed, windDirection,
 *   phase, takeoffQuality, landingQuality, kPoint,
 *   feedback { flash, takeoffRing, tuckGlow, landingBar },
 *   heightAboveGround, isTucked
 */

export default class HUD {
    constructor() {
        this._time = 0;
        this._displayedDistance = 0;
        this._landingFlashTimer = 0;
        this._landingPhaseEntered = false;
        this._takeoffFlashTimer = 0;
        this._takeoffFlashColor = null;
        this._prevPhase = null;
        this._takeoffPhaseTime = 0;
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
            kPoint: 0,
            feedback: {},
            heightAboveGround: 0,
            isTucked: false,
            ...hudData,
        };

        // Smoothly animate distance counter
        const distDelta = d.distance - this._displayedDistance;
        this._displayedDistance += distDelta * 0.15;
        if (Math.abs(distDelta) < 0.05) this._displayedDistance = d.distance;

        // Track phase transitions
        if (d.phase !== this._prevPhase) {
            if (d.phase === 'TAKEOFF') {
                this._takeoffPhaseTime = 0;
                this._takeoffFlashTimer = 0;
                this._takeoffFlashColor = null;
            }
            if (d.phase === 'LANDING') {
                this._landingPhaseEntered = true;
                this._landingFlashTimer = 0;
            }
            this._prevPhase = d.phase;
        }

        if (d.phase === 'TAKEOFF') {
            this._takeoffPhaseTime += 0.016;
        }
        if (d.phase === 'LANDING') {
            this._landingFlashTimer += 0.016;
        }
        if (d.phase !== 'LANDING') {
            this._landingPhaseEntered = false;
        }

        // Detect takeoff quality flash
        if (d.phase === 'TAKEOFF' && d.takeoffQuality !== null && !this._takeoffFlashColor) {
            if (d.takeoffQuality >= 0.9) this._takeoffFlashColor = '#44ff88';
            else if (d.takeoffQuality >= 0.5) this._takeoffFlashColor = '#ffdd44';
            else this._takeoffFlashColor = '#ff5544';
            this._takeoffFlashTimer = 0;
        }
        if (this._takeoffFlashColor) {
            this._takeoffFlashTimer += 0.016;
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

        // Phase pill (top-center)
        this._renderPhasePill(ctx, width, height, d);
    }

    // -------------------------------------------------------------------
    // Shared helpers: panels, pills, text
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

    _drawPanel(ctx, x, y, w, h, r = 10) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        this._roundRect(ctx, x, y, w, h, r);
        ctx.fill();
        // Subtle border for definition
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    /** Standard text shadow: 2px black for mobile readability */
    _setTextShadow(ctx) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = 2;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
    }

    _setShadow(ctx, blur = 4) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = blur;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 1;
    }

    _clearShadow(ctx) {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
    }

    // -------------------------------------------------------------------
    // Phase pill (top-center colored label)
    // -------------------------------------------------------------------

    _renderPhasePill(ctx, width, _height, d) {
        const labels = {
            INRUN: { text: 'TILLØP', color: '#3388ff' },
            TAKEOFF: { text: 'SATS', color: '#ff8833' },
            FLIGHT: { text: 'SVEV', color: '#00cccc' },
            LANDING: { text: 'LANDING', color: '#44cc66' },
        };
        const info = labels[d.phase];
        if (!info) return;

        ctx.save();
        const pillH = 32;
        ctx.font = 'bold 16px sans-serif';
        const tw = ctx.measureText(info.text).width;
        const pillW = tw + 32;
        const px = (width - pillW) / 2;
        const py = 14;

        // Pill background
        ctx.fillStyle = info.color;
        ctx.globalAlpha = 0.9;
        this._roundRect(ctx, px, py, pillW, pillH, pillH / 2);
        ctx.fill();

        // Pill text
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        this._setTextShadow(ctx);
        ctx.fillText(info.text, width / 2, py + pillH / 2);
        this._clearShadow(ctx);
        ctx.restore();
    }

    // -------------------------------------------------------------------
    // INRUN: Speed + tuck circle indicator + speed bar
    // -------------------------------------------------------------------

    _renderInrun(ctx, width, height, d) {
        const speedKmh = Math.round(d.speed * 3.6);
        const x = 24;
        const y = height - 90;

        ctx.save();

        // Dark rounded panel bottom-left
        const panelW = 170;
        const panelH = 76;
        this._drawPanel(ctx, x - 12, y - 12, panelW, panelH, 14);

        // Large speed number (44px bold)
        this._setTextShadow(ctx);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 44px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(speedKmh), x, y + panelH / 2 - 8);

        // "km/h" unit (14px)
        const numW = ctx.measureText(String(speedKmh)).width;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = '14px sans-serif';
        ctx.fillText('km/h', x + numW + 6, y + panelH / 2 - 6);
        this._clearShadow(ctx);

        ctx.restore();

        // Tuck indicator circle (right of speed panel)
        this._renderTuckCircle(ctx, x + panelW + 20, y + panelH / 2 - 12, d);

        // Speed progress bar at bottom
        this._renderSpeedBar(ctx, width, height, d);
    }

    /** Green circle when tucked, red when not */
    _renderTuckCircle(ctx, cx, cy, d) {
        ctx.save();
        const radius = 14;
        const fb = d.feedback || {};
        const tuckAlpha = fb.tuckGlow ? fb.tuckGlow.alpha : (d.isTucked ? 1.0 : 0.0);
        const isTucked = tuckAlpha > 0.3;

        const color = isTucked ? '#44ff64' : '#ff4444';
        const glowColor = isTucked ? 'rgba(68, 255, 100, 0.5)' : 'rgba(255, 68, 68, 0.3)';

        // Glow
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 10;

        // Circle background
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.9;
        ctx.fill();
        this._clearShadow(ctx);

        // Inner icon: checkmark if tucked, dash if not
        ctx.globalAlpha = 1.0;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        if (isTucked) {
            // Checkmark
            ctx.beginPath();
            ctx.moveTo(cx - 5, cy);
            ctx.lineTo(cx - 1, cy + 4);
            ctx.lineTo(cx + 6, cy - 4);
            ctx.stroke();
        } else {
            // Dash
            ctx.beginPath();
            ctx.moveTo(cx - 5, cy);
            ctx.lineTo(cx + 5, cy);
            ctx.stroke();
        }

        // Label below
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('TUCK', cx, cy + radius + 3);

        ctx.restore();
    }

    _renderSpeedBar(ctx, width, height, d) {
        const barY = height - 20;
        const barH = 6;
        const barMargin = 24;
        const barW = width - barMargin * 2;
        const maxSpeedKmh = 95;
        const speedKmh = d.speed * 3.6;
        const fill = Math.min(speedKmh / maxSpeedKmh, 1);

        ctx.save();

        // Track background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
        this._roundRect(ctx, barMargin, barY, barW, barH, 3);
        ctx.fill();

        // Filled portion
        if (fill > 0.01) {
            const grad = ctx.createLinearGradient(barMargin, 0, barMargin + barW, 0);
            grad.addColorStop(0, 'rgba(80, 160, 255, 0.7)');
            grad.addColorStop(0.6, 'rgba(100, 220, 255, 0.9)');
            grad.addColorStop(1, 'rgba(255, 255, 255, 1.0)');
            ctx.fillStyle = grad;
            this._roundRect(ctx, barMargin, barY, barW * fill, barH, 3);
            ctx.fill();

            // Glow at leading edge
            ctx.shadowColor = 'rgba(130, 210, 255, 0.6)';
            ctx.shadowBlur = 8;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(barMargin + barW * fill, barY + barH / 2, 3, 0, Math.PI * 2);
            ctx.fill();
            this._clearShadow(ctx);
        }

        ctx.restore();
    }

    // -------------------------------------------------------------------
    // TAKEOFF: Shrinking timing ring + "SATS!" + quality flash
    // -------------------------------------------------------------------

    _renderTakeoff(ctx, width, height, d) {
        const cx = width / 2;
        const cy = height * 0.38;
        const fb = d.feedback || {};

        ctx.save();

        // Ring progress: 0 -> 1 over the takeoff window
        const ringProgress = fb.takeoffRing ? fb.takeoffRing.progress : this._takeoffPhaseTime * 5;
        const p = Math.min(ringProgress, 1);

        // Ring shrinks from 90px radius to small center
        const maxR = 90;
        const minR = 20;
        const r = maxR - (maxR - minR) * p;

        // Green target zone in center (clearly visible)
        const targetR = minR + 10;
        ctx.strokeStyle = 'rgba(68, 255, 100, 0.45)';
        ctx.lineWidth = 18;
        ctx.beginPath();
        ctx.arc(cx, cy, targetR, 0, Math.PI * 2);
        ctx.stroke();

        // Brighter center fill of the target
        ctx.fillStyle = 'rgba(68, 255, 100, 0.15)';
        ctx.beginPath();
        ctx.arc(cx, cy, targetR - 6, 0, Math.PI * 2);
        ctx.fill();

        // Inner bright ring of target
        ctx.strokeStyle = 'rgba(68, 255, 100, 0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, targetR - 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, targetR + 8, 0, Math.PI * 2);
        ctx.stroke();

        // The shrinking ring
        const pulse = 0.5 + Math.sin(this._time * 14) * 0.5;
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.6 + pulse * 0.4})`;
        ctx.lineWidth = 5;
        ctx.shadowColor = 'rgba(255, 255, 255, 0.6)';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        this._clearShadow(ctx);

        // Inner thin ring (follows main ring)
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.25 + pulse * 0.2})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
        ctx.stroke();

        // Center crosshair dot
        ctx.fillStyle = `rgba(255, 255, 255, ${0.5 + pulse * 0.5})`;
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fill();

        // "SATS!" text - 28px bold, pulsing scale
        const textPulse = 1.0 + Math.sin(this._time * 12) * 0.12;
        ctx.save();
        const textY = cy + r + 48;
        ctx.translate(cx, textY);
        ctx.scale(textPulse, textPulse);
        ctx.translate(-cx, -textY);

        this._setTextShadow(ctx);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('SATS!', cx, textY);
        this._clearShadow(ctx);
        ctx.restore();

        // Quality flash after tap
        if (this._takeoffFlashColor && this._takeoffFlashTimer < 0.6) {
            const fAlpha = this._takeoffFlashTimer < 0.3
                ? 1.0
                : 1.0 - (this._takeoffFlashTimer - 0.3) / 0.3;
            ctx.globalAlpha = Math.max(0, fAlpha);
            // Full-screen flash tint
            ctx.fillStyle = this._takeoffFlashColor;
            ctx.globalAlpha = Math.max(0, fAlpha) * 0.18;
            ctx.fillRect(0, 0, width, height);
            ctx.globalAlpha = 1.0;
        }

        ctx.restore();
    }

    // -------------------------------------------------------------------
    // FLIGHT: Distance, K-ref, speed, height, wind, angle gauge
    // -------------------------------------------------------------------

    _renderFlight(ctx, width, height, d) {
        this._renderFlightInfoPanel(ctx, width, height, d);
        this._renderFlightWind(ctx, width, height, d);
        this._renderFlightAngleGauge(ctx, width, height, d);
    }

    _renderFlightInfoPanel(ctx, width, _height, d) {
        const x = 22;
        const y = 56;

        ctx.save();

        // Compute layout heights
        let panelH = 58;
        if (d.kPoint && this._displayedDistance > 0) panelH += 26;
        if (d.speed > 0) panelH += 22;
        if (d.heightAboveGround > 0) panelH += 22;

        // Background panel
        this._drawPanel(ctx, x - 10, y - 36, 190, panelH, 12);

        // Distance: 36px bold white
        const dist = this._displayedDistance.toFixed(1);
        this._setTextShadow(ctx);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(dist, x, y);

        // "m" suffix
        const numW = ctx.measureText(dist).width;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = 'bold 22px sans-serif';
        ctx.fillText(' m', x + numW, y + 2);
        this._clearShadow(ctx);

        let lineY = y + 28;

        // K-point reference: 18px, green if positive, red if negative
        if (d.kPoint && this._displayedDistance > 0) {
            const diff = this._displayedDistance - d.kPoint;
            const kText = diff >= 0 ? `K +${diff.toFixed(1)}` : `K ${diff.toFixed(1)}`;
            const kColor = diff >= 0 ? '#44ff88' : '#ff5544';
            ctx.fillStyle = kColor;
            ctx.font = 'bold 18px sans-serif';
            ctx.textAlign = 'left';
            this._setTextShadow(ctx);
            ctx.fillText(kText, x, lineY);
            this._clearShadow(ctx);
            lineY += 24;
        }

        // Speed in flight: 14px below K-point
        if (d.speed > 0) {
            const speedKmh = Math.round(d.speed * 3.6);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'left';
            this._setTextShadow(ctx);
            ctx.fillText(`${speedKmh} km/h`, x, lineY);
            this._clearShadow(ctx);
            lineY += 22;
        }

        // Height above ground
        if (d.heightAboveGround > 0.5) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'left';
            this._setTextShadow(ctx);
            ctx.fillText(`Høyde: ${d.heightAboveGround.toFixed(1)}m`, x, lineY);
            this._clearShadow(ctx);
        }

        ctx.restore();
    }

    _renderFlightWind(ctx, width, _height, d) {
        const x = width - 22;
        const y = 56;

        ctx.save();

        // Background panel
        const panelW = 120;
        const panelH = 52;
        this._drawPanel(ctx, x - panelW + 8, y - 32, panelW, panelH, 12);

        // Wind arrow
        const arrowX = x - panelW + 30;
        const arrowY = y - 6;
        const windDir = (d.windDirection || 0) * (Math.PI / 180);
        const arrowLen = 12;

        ctx.save();
        ctx.translate(arrowX, arrowY);
        ctx.rotate(windDir);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-arrowLen, 0);
        ctx.lineTo(arrowLen, 0);
        ctx.stroke();

        // Arrowhead
        ctx.beginPath();
        ctx.moveTo(arrowLen, 0);
        ctx.lineTo(arrowLen - 6, -4);
        ctx.moveTo(arrowLen, 0);
        ctx.lineTo(arrowLen - 6, 4);
        ctx.stroke();
        ctx.restore();

        // Wind speed text
        this._setTextShadow(ctx);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(d.windSpeed.toFixed(1), x - 6, y - 10);

        // "m/s" label
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText('m/s', x - 6, y + 10);
        this._clearShadow(ctx);

        ctx.restore();
    }

    _renderFlightAngleGauge(ctx, width, height, d) {
        const r = 60;
        const cx = width - r - 22;
        const cy = height - r - 32;

        // Angle range: 10 to 55 degrees
        const minDeg = 10;
        const maxDeg = 55;
        const arcStart = Math.PI;
        const arcSweep = Math.PI;

        ctx.save();

        // Background semicircle panel
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        ctx.arc(cx, cy, r + 10, Math.PI, 0, false);
        ctx.lineTo(cx + r + 10, cy + 12);
        ctx.lineTo(cx - r - 10, cy + 12);
        ctx.closePath();
        ctx.fill();

        // Track arc (dim)
        ctx.beginPath();
        ctx.arc(cx, cy, r - 5, arcStart, 0, false);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 12;
        ctx.lineCap = 'butt';
        ctx.stroke();

        // Green zone: 30-40 degrees (clearly highlighted)
        const greenStartFrac = (30 - minDeg) / (maxDeg - minDeg);
        const greenEndFrac = (40 - minDeg) / (maxDeg - minDeg);
        const greenStart = arcStart + greenStartFrac * arcSweep;
        const greenEnd = arcStart + greenEndFrac * arcSweep;

        ctx.beginPath();
        ctx.arc(cx, cy, r - 5, greenStart, greenEnd, false);
        ctx.strokeStyle = 'rgba(0, 200, 100, 0.55)';
        ctx.lineWidth = 12;
        ctx.stroke();

        // Bright sweet spot: 33-37 degrees
        const sweetStartFrac = (33 - minDeg) / (maxDeg - minDeg);
        const sweetEndFrac = (37 - minDeg) / (maxDeg - minDeg);
        const sweetStart = arcStart + sweetStartFrac * arcSweep;
        const sweetEnd = arcStart + sweetEndFrac * arcSweep;

        ctx.beginPath();
        ctx.arc(cx, cy, r - 5, sweetStart, sweetEnd, false);
        ctx.strokeStyle = 'rgba(0, 255, 120, 0.9)';
        ctx.lineWidth = 12;
        ctx.stroke();

        // Tick marks
        const ticks = [10, 20, 30, 40, 50];
        for (const tickVal of ticks) {
            const frac = (tickVal - minDeg) / (maxDeg - minDeg);
            const angle = arcStart + frac * arcSweep;
            const inner = r - 16;
            const outer = r - 5;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
            ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.stroke();
        }

        // Needle with shadow
        const clampedAngle = Math.max(minDeg, Math.min(maxDeg, d.bodyAngle));
        const angleFrac = (clampedAngle - minDeg) / (maxDeg - minDeg);
        const needleAngle = arcStart + angleFrac * arcSweep;
        const needleLen = r - 18;
        const nx = cx + Math.cos(needleAngle) * needleLen;
        const ny = cy + Math.sin(needleAngle) * needleLen;

        const inGreen = d.bodyAngle >= 30 && d.bodyAngle <= 40;
        const needleColor = inGreen ? '#44ff88' : '#ffffff';

        // Needle shadow (darker, offset)
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(nx, ny);
        ctx.strokeStyle = needleColor;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Needle glow
        ctx.shadowColor = needleColor;
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(nx, ny);
        ctx.strokeStyle = needleColor;
        ctx.lineWidth = 3;
        ctx.stroke();
        this._clearShadow(ctx);

        // Needle tip glow
        ctx.beginPath();
        ctx.arc(nx, ny, 4, 0, Math.PI * 2);
        ctx.fillStyle = needleColor;
        ctx.shadowColor = needleColor;
        ctx.shadowBlur = 6;
        ctx.fill();
        this._clearShadow(ctx);

        // Center pivot
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#666666';
        ctx.fill();

        // Angle text below
        this._setTextShadow(ctx);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${d.bodyAngle.toFixed(0)}°`, cx, cy + 22);
        this._clearShadow(ctx);

        ctx.restore();
    }

    // -------------------------------------------------------------------
    // LANDING: Frozen distance + TAP prompt + quality flash
    // -------------------------------------------------------------------

    _renderLanding(ctx, width, height, d) {
        // Show frozen distance (top-left, same panel as flight)
        this._renderFlightInfoPanel(ctx, width, height, d);

        const cx = width / 2;
        const cy = height * 0.45;

        // "TAP!" prompt if landing quality not yet set
        if (d.landingQuality === 0) {
            const pulse = 0.6 + 0.4 * Math.abs(Math.sin(this._time * 14));
            // Scale pulsing 1.0 - 1.2
            const scalePulse = 1.0 + 0.2 * Math.abs(Math.sin(this._time * 6));

            ctx.save();
            ctx.globalAlpha = pulse;

            // Scale transform for pulsing
            ctx.translate(cx, cy);
            ctx.scale(scalePulse, scalePulse);
            ctx.translate(-cx, -cy);

            // Glow shadow
            ctx.shadowColor = 'rgba(68, 255, 136, 0.7)';
            ctx.shadowBlur = 20;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;

            // "TAP!" 52px bold green
            ctx.fillStyle = '#44ff88';
            ctx.font = 'bold 52px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('TAP!', cx, cy);

            // Double render for extra glow intensity
            ctx.shadowBlur = 30;
            ctx.shadowColor = 'rgba(68, 255, 136, 0.4)';
            ctx.fillText('TAP!', cx, cy);

            this._clearShadow(ctx);
            ctx.restore();
            return;
        }

        // Landing quality flash (1.5s visible)
        if (this._landingFlashTimer < 1.8) {
            // Scale-in: 0.6 -> 1.0 over 0.2s, then hold, then fade
            const scaleT = Math.min(this._landingFlashTimer / 0.2, 1);
            const scale = 0.6 + 0.4 * this._easeOutBack(scaleT);
            const alpha = this._landingFlashTimer < 1.3
                ? 1.0
                : 1.0 - (this._landingFlashTimer - 1.3) / 0.5;

            // Determine text and color
            let text, color;
            if (d.landingQuality >= 0.9) {
                text = 'TELEMARK!';
                color = '#44ff88';
            } else if (d.landingQuality >= 0.6) {
                text = 'Bra!';
                color = '#ffdd44';
            } else if (d.landingQuality >= 0.3) {
                text = 'OK';
                color = '#ffaa44';
            } else {
                text = 'Svakt';
                color = '#ff5544';
            }

            ctx.save();
            ctx.globalAlpha = Math.max(0, alpha);

            // Background pill
            ctx.font = 'bold 38px sans-serif';
            const tw = ctx.measureText(text).width;
            const pillW = tw + 52;
            const pillH = 64;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            this._roundRect(ctx, cx - pillW / 2, cy - pillH / 2, pillW, pillH, pillH / 2);
            ctx.fill();

            // Scaled text
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(scale, scale);
            ctx.translate(-cx, -cy);

            ctx.shadowColor = color;
            ctx.shadowBlur = 12;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.fillStyle = color;
            ctx.font = 'bold 38px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, cx, cy);
            this._clearShadow(ctx);

            ctx.restore();
            ctx.restore();
        }
    }

    // -------------------------------------------------------------------
    // Easing helpers
    // -------------------------------------------------------------------

    _easeOutBack(t) {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
}
