/**
 * HUD.js - TV broadcast-style overlay for Vinter-OL Skihopp
 *
 * Polished, phase-specific rendering inspired by real ski jumping broadcasts.
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

    _drawPanel(ctx, x, y, w, h, r = 8) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this._roundRect(ctx, x, y, w, h, r);
        ctx.fill();
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
        const pillH = 28;
        ctx.font = 'bold 14px sans-serif';
        const tw = ctx.measureText(info.text).width;
        const pillW = tw + 24;
        const px = (width - pillW) / 2;
        const py = 12;

        // Pill background
        ctx.fillStyle = info.color;
        ctx.globalAlpha = 0.85;
        this._roundRect(ctx, px, py, pillW, pillH, pillH / 2);
        ctx.fill();

        // Pill text
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        this._setShadow(ctx, 2);
        ctx.fillText(info.text, width / 2, py + pillH / 2);
        this._clearShadow(ctx);
        ctx.restore();
    }

    // -------------------------------------------------------------------
    // INRUN: Speed + tuck indicator + speed bar
    // -------------------------------------------------------------------

    _renderInrun(ctx, width, height, d) {
        const speedKmh = Math.round(d.speed * 3.6);
        const x = 24;
        const y = height - 80;

        ctx.save();

        // Dark panel bottom-left
        const panelW = 140;
        const panelH = 68;
        this._drawPanel(ctx, x - 10, y - 10, panelW, panelH, 10);

        // Large speed number
        this._setShadow(ctx, 5);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 46px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(speedKmh), x, y + panelH / 2 - 8);

        // "km/h" unit
        ctx.font = 'bold 46px sans-serif';
        const numW = ctx.measureText(String(speedKmh)).width;
        this._clearShadow(ctx);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.font = '16px sans-serif';
        ctx.fillText('km/h', x + numW + 6, y + panelH / 2 - 6);

        ctx.restore();

        // Tuck indicator bar (right of speed panel)
        this._renderTuckIndicator(ctx, x + panelW + 12, y - 10, height, d);

        // Speed progress bar at bottom
        this._renderSpeedBar(ctx, width, height, d);
    }

    _renderTuckIndicator(ctx, x, y, _height, d) {
        ctx.save();
        const barW = 8;
        const barH = 68;

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this._roundRect(ctx, x, y, barW, barH, 4);
        ctx.fill();

        // Tuck glow alpha from feedback or isTucked flag
        const fb = d.feedback || {};
        const tuckAlpha = fb.tuckGlow ? fb.tuckGlow.alpha : (d.isTucked ? 1.0 : 0.0);
        const fillColor = tuckAlpha > 0.3 ? `rgba(68, 255, 100, ${tuckAlpha})` : `rgba(255, 80, 60, ${0.7 - tuckAlpha * 0.5})`;
        const fillH = barH * Math.max(0.08, tuckAlpha);

        ctx.fillStyle = fillColor;
        this._roundRect(ctx, x, y + barH - fillH, barW, fillH, 4);
        ctx.fill();

        // Label
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('TUCK', x + barW / 2, y - 2);

        ctx.restore();
    }

    _renderSpeedBar(ctx, width, height, d) {
        const barY = height - 18;
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

        // Ring shrinks from large to small
        const maxR = Math.min(width, height) * 0.22;
        const minR = 18;
        const r = maxR - (maxR - minR) * p;

        // Green target zone in center (always visible)
        const targetR = minR + 8;
        ctx.strokeStyle = 'rgba(68, 255, 100, 0.35)';
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.arc(cx, cy, targetR, 0, Math.PI * 2);
        ctx.stroke();

        // Brighter center dot of the target
        ctx.fillStyle = 'rgba(68, 255, 100, 0.2)';
        ctx.beginPath();
        ctx.arc(cx, cy, targetR - 4, 0, Math.PI * 2);
        ctx.fill();

        // The shrinking ring
        const pulse = 0.5 + Math.sin(this._time * 14) * 0.5;
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.6 + pulse * 0.4})`;
        ctx.lineWidth = 4;
        ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        this._clearShadow(ctx);

        // Inner thin ring
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.25 + pulse * 0.2})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
        ctx.stroke();

        // Center crosshair dot
        ctx.fillStyle = `rgba(255, 255, 255, ${0.5 + pulse * 0.5})`;
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fill();

        // "SATS!" text - fast pulsing
        const textPulse = 1.0 + Math.sin(this._time * 12) * 0.1;
        ctx.save();
        ctx.translate(cx, cy + r + 44);
        ctx.scale(textPulse, textPulse);
        ctx.translate(-cx, -(cy + r + 44));

        this._setShadow(ctx, 8);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 38px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('SATS!', cx, cy + r + 44);
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
        const x = 20;
        const y = 48;

        ctx.save();

        // Compute layout heights
        let panelH = 52;
        if (d.kPoint && this._displayedDistance > 0) panelH += 22;
        if (d.speed > 0) panelH += 20;
        if (d.heightAboveGround > 0) panelH += 20;

        // Background panel
        this._drawPanel(ctx, x - 8, y - 32, 180, panelH, 10);

        // Distance: large bold
        const dist = this._displayedDistance.toFixed(1);
        this._setShadow(ctx, 5);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(dist, x, y);

        // "m" suffix
        ctx.font = 'bold 36px sans-serif';
        const numW = ctx.measureText(dist).width;
        this._clearShadow(ctx);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.font = 'bold 22px sans-serif';
        ctx.fillText(' m', x + numW, y + 2);

        let lineY = y + 24;

        // K-point reference
        if (d.kPoint && this._displayedDistance > 0) {
            const diff = this._displayedDistance - d.kPoint;
            const kText = diff >= 0 ? `K +${diff.toFixed(1)}` : `K ${diff.toFixed(1)}`;
            const kColor = diff >= 0 ? '#44ff88' : '#ff5544';
            ctx.fillStyle = kColor;
            ctx.font = 'bold 18px sans-serif';
            ctx.textAlign = 'left';
            this._setShadow(ctx, 3);
            ctx.fillText(kText, x, lineY);
            this._clearShadow(ctx);
            lineY += 22;
        }

        // Speed in flight
        if (d.speed > 0) {
            const speedKmh = Math.round(d.speed * 3.6);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
            ctx.font = '18px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(`${speedKmh} km/h`, x, lineY);
            lineY += 20;
        }

        // Height above ground
        if (d.heightAboveGround > 0.5) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.font = '16px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(`Høyde: ${d.heightAboveGround.toFixed(1)}m`, x, lineY);
        }

        ctx.restore();
    }

    _renderFlightWind(ctx, width, _height, d) {
        const x = width - 22;
        const y = 52;

        ctx.save();

        // Background panel
        const panelW = 110;
        const panelH = 48;
        this._drawPanel(ctx, x - panelW + 8, y - 30, panelW, panelH, 10);

        // Wind arrow
        const arrowX = x - panelW + 28;
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
        this._setShadow(ctx, 3);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(d.windSpeed.toFixed(1), x - 6, y - 10);

        // "m/s" label
        this._clearShadow(ctx);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '13px sans-serif';
        ctx.fillText('m/s', x - 6, y + 8);

        ctx.restore();
    }

    _renderFlightAngleGauge(ctx, width, height, d) {
        const cx = width - 72;
        const cy = height - 82;
        const r = 50;

        // Angle range: 10 to 55 degrees
        const minDeg = 10;
        const maxDeg = 55;
        const arcStart = Math.PI;
        const arcSweep = Math.PI;

        ctx.save();

        // Background semicircle panel
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.beginPath();
        ctx.arc(cx, cy, r + 8, Math.PI, 0, false);
        ctx.lineTo(cx + r + 8, cy + 10);
        ctx.lineTo(cx - r - 8, cy + 10);
        ctx.closePath();
        ctx.fill();

        // Track arc (dim)
        ctx.beginPath();
        ctx.arc(cx, cy, r - 4, arcStart, 0, false);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 10;
        ctx.lineCap = 'butt';
        ctx.stroke();

        // Green zone: 30-40 degrees
        const greenStartFrac = (30 - minDeg) / (maxDeg - minDeg);
        const greenEndFrac = (40 - minDeg) / (maxDeg - minDeg);
        const greenStart = arcStart + greenStartFrac * arcSweep;
        const greenEnd = arcStart + greenEndFrac * arcSweep;

        ctx.beginPath();
        ctx.arc(cx, cy, r - 4, greenStart, greenEnd, false);
        ctx.strokeStyle = 'rgba(0, 200, 100, 0.5)';
        ctx.lineWidth = 10;
        ctx.stroke();

        // Bright sweet spot: 33-37 degrees
        const sweetStartFrac = (33 - minDeg) / (maxDeg - minDeg);
        const sweetEndFrac = (37 - minDeg) / (maxDeg - minDeg);
        const sweetStart = arcStart + sweetStartFrac * arcSweep;
        const sweetEnd = arcStart + sweetEndFrac * arcSweep;

        ctx.beginPath();
        ctx.arc(cx, cy, r - 4, sweetStart, sweetEnd, false);
        ctx.strokeStyle = 'rgba(0, 255, 120, 0.85)';
        ctx.lineWidth = 10;
        ctx.stroke();

        // Tick marks
        const ticks = [10, 20, 30, 40, 50];
        for (const tickVal of ticks) {
            const frac = (tickVal - minDeg) / (maxDeg - minDeg);
            const angle = arcStart + frac * arcSweep;
            const inner = r - 14;
            const outer = r - 5;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
            ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.lineWidth = 1.5;
            ctx.lineCap = 'round';
            ctx.stroke();
        }

        // Needle
        const clampedAngle = Math.max(minDeg, Math.min(maxDeg, d.bodyAngle));
        const angleFrac = (clampedAngle - minDeg) / (maxDeg - minDeg);
        const needleAngle = arcStart + angleFrac * arcSweep;
        const needleLen = r - 16;
        const nx = cx + Math.cos(needleAngle) * needleLen;
        const ny = cy + Math.sin(needleAngle) * needleLen;

        const inGreen = d.bodyAngle >= 30 && d.bodyAngle <= 40;
        const needleColor = inGreen ? '#44ff88' : '#ffffff';

        ctx.shadowColor = needleColor;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(nx, ny);
        ctx.strokeStyle = needleColor;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.stroke();
        this._clearShadow(ctx);

        // Needle tip glow
        ctx.beginPath();
        ctx.arc(nx, ny, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = needleColor;
        ctx.fill();

        // Center pivot
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#555555';
        ctx.fill();

        // Angle text below
        this._setShadow(ctx, 3);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${d.bodyAngle.toFixed(0)}°`, cx, cy + 18);
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
            ctx.save();

            // Pulsing green prompt
            ctx.globalAlpha = pulse;
            this._setShadow(ctx, 16);
            ctx.shadowColor = 'rgba(68, 255, 136, 0.6)';
            ctx.fillStyle = '#44ff88';
            ctx.font = 'bold 56px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
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
            const pillW = tw + 48;
            const pillH = 60;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
            this._roundRect(ctx, cx - pillW / 2, cy - pillH / 2, pillW, pillH, pillH / 2);
            ctx.fill();

            // Scaled text
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(scale, scale);
            ctx.translate(-cx, -cy);

            this._setShadow(ctx, 8);
            ctx.shadowColor = color;
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
