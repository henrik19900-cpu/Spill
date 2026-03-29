/**
 * TutorialScreen.js - Interactive tutorial/introduction before first jump
 * Shows the 4 phases of ski jumping with animated touch instructions.
 */

export default class TutorialScreen {
    constructor() {
        this._currentPage = 0;
        this._totalPages = 4;
        this._touchStartTime = 0;
        this._animTime = 0;
        this._pageTransition = 0; // 0..1 fade-in progress
    }

    reset() {
        this._currentPage = 0;
        this._animTime = 0;
        this._pageTransition = 0;
    }

    /**
     * @returns {boolean} true if tutorial is complete
     */
    isComplete() {
        return this._currentPage >= this._totalPages;
    }

    handleTap() {
        this._currentPage++;
        this._animTime = 0;
        this._pageTransition = 0;
    }

    update(dt) {
        this._animTime += dt;
        if (this._pageTransition < 1) {
            this._pageTransition = Math.min(1, this._pageTransition + dt * 3);
        }
    }

    render(ctx, w, h) {
        // Dark overlay
        ctx.fillStyle = 'rgba(10, 10, 30, 0.92)';
        ctx.fillRect(0, 0, w, h);

        const cx = w / 2;
        const pages = [
            {
                title: 'TILLØP',
                color: '#4488ff',
                desc: 'HOLD fingeren på skjermen\nfor å holde tuck-posisjon',
                hint: 'Bedre tuck = høyere fart!',
            },
            {
                title: 'AVHOPP',
                color: '#ff8844',
                desc: 'SLIPP og TAP i riktig øyeblikk\nved hoppkanten',
                hint: 'Perfekt timing = lengre hopp!',
            },
            {
                title: 'SVEV',
                color: '#44ddff',
                desc: 'SVEIP opp/ned for å justere\nkroppsvinkelen',
                hint: 'Optimal vinkel ≈ 35° for maks lengde',
            },
            {
                title: 'LANDING',
                color: '#44ff88',
                desc: 'TAP når du treffer bakken\nfor telemark-landing',
                hint: 'God telemark = høyere stilpoeng!',
            },
        ];

        if (this._currentPage >= this._totalPages) return;

        const page = pages[this._currentPage];
        const t = this._animTime;
        const fadeIn = this._easeOut(this._pageTransition);
        const pulse = 0.5 + 0.5 * Math.sin(t * 3);

        ctx.save();
        ctx.globalAlpha = fadeIn;

        // --- Page indicator dots at top ---
        const dotY = h * 0.08;
        const dotSpacing = 22;
        const dotsStartX = cx - ((this._totalPages - 1) * dotSpacing) / 2;
        for (let i = 0; i < this._totalPages; i++) {
            const isCurrent = i === this._currentPage;
            const r = isCurrent ? 6 : 3.5;
            ctx.beginPath();
            ctx.arc(dotsStartX + i * dotSpacing, dotY, r, 0, Math.PI * 2);
            if (isCurrent) {
                ctx.fillStyle = '#ffffff';
                ctx.fill();
                // Glow ring on current dot
                ctx.strokeStyle = `rgba(255,255,255,${0.3 + 0.2 * pulse})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(dotsStartX + i * dotSpacing, dotY, 10, 0, Math.PI * 2);
                ctx.stroke();
            } else {
                ctx.fillStyle = i < this._currentPage ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)';
                ctx.fill();
            }
        }

        // --- Phase label ---
        ctx.fillStyle = page.color;
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`FASE ${this._currentPage + 1} AV 4`, cx, h * 0.14);

        // --- Title ---
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 44px sans-serif';
        ctx.fillText(page.title, cx, h * 0.21);

        // Colored underline accent
        const titleMetrics = ctx.measureText(page.title);
        const lineHalfW = titleMetrics.width * 0.4;
        ctx.strokeStyle = page.color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - lineHalfW, h * 0.245);
        ctx.lineTo(cx + lineHalfW, h * 0.245);
        ctx.stroke();

        // --- Animated illustration area ---
        const illustY = h * 0.42;
        const illustH = h * 0.22;
        this._drawIllustration(ctx, cx, illustY, this._currentPage, page.color, w, illustH, t);

        // --- Description text ---
        ctx.fillStyle = '#ffffff';
        ctx.font = '20px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const lines = page.desc.split('\n');
        const descY = h * 0.62;
        lines.forEach((line, i) => {
            ctx.fillText(line, cx, descY + i * 28);
        });

        // --- Hint box ---
        const hintY = h * 0.73;
        const hintW = Math.min(w * 0.85, 380);
        const hintH = 48;
        // Background pill
        ctx.fillStyle = `rgba(${this._hexToRgb(page.color)},0.1)`;
        this._roundRect(ctx, cx - hintW / 2, hintY - hintH / 2, hintW, hintH, 14);
        ctx.fill();
        // Border
        ctx.strokeStyle = `rgba(${this._hexToRgb(page.color)},0.25)`;
        ctx.lineWidth = 1;
        this._roundRect(ctx, cx - hintW / 2, hintY - hintH / 2, hintW, hintH, 14);
        ctx.stroke();
        // Hint icon
        ctx.fillStyle = page.color;
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(`💡 ${page.hint}`, cx, hintY);

        // --- "Tap to continue" / "Tap to start" ---
        const isLast = this._currentPage === this._totalPages - 1;
        const tapText = isLast ? 'TAP FOR Å STARTE' : 'TAP FOR Å FORTSETTE →';
        const tapAlpha = 0.4 + 0.6 * pulse;
        ctx.fillStyle = `rgba(255,255,255,${tapAlpha.toFixed(2)})`;
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText(tapText, cx, h * 0.87);

        // Page counter at bottom
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.font = '13px sans-serif';
        ctx.fillText(`${this._currentPage + 1} / ${this._totalPages}`, cx, h * 0.93);

        ctx.restore();
    }

    // -----------------------------------------------------------------------
    // Animated illustrations per page
    // -----------------------------------------------------------------------
    _drawIllustration(ctx, cx, cy, pageIndex, color, w, areaH, t) {
        ctx.save();
        ctx.translate(cx, cy);

        const s = Math.min(w * 0.16, 65);

        switch (pageIndex) {
            case 0: this._drawTilloep(ctx, s, color, t); break;
            case 1: this._drawAvhopp(ctx, s, color, t); break;
            case 2: this._drawSvev(ctx, s, color, t); break;
            case 3: this._drawLanding(ctx, s, color, t); break;
        }

        ctx.restore();
    }

    // --- PAGE 1: TILLØP  ---
    // Animated hand holding, speed gauge fills up
    _drawTilloep(ctx, s, color, t) {
        // Slope line
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-s * 2, -s * 0.2);
        ctx.lineTo(s * 2, s * 0.6);
        ctx.stroke();

        // Crouched stick figure
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        // Head
        ctx.beginPath();
        ctx.arc(-s * 0.15, -s * 0.65, s * 0.18, 0, Math.PI * 2);
        ctx.stroke();
        // Bent body
        ctx.beginPath();
        ctx.moveTo(-s * 0.15, -s * 0.47);
        ctx.lineTo(s * 0.15, -s * 0.05);
        ctx.lineTo(-s * 0.15, s * 0.15);
        ctx.stroke();
        // Legs tucked
        ctx.beginPath();
        ctx.moveTo(-s * 0.15, s * 0.15);
        ctx.lineTo(s * 0.1, s * 0.25);
        ctx.stroke();
        // Skis
        ctx.strokeStyle = '#aaaaaa';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-s * 0.5, s * 0.25);
        ctx.lineTo(s * 0.7, s * 0.25);
        ctx.stroke();

        // --- Animated hand HOLDING ---
        const handX = s * 1.3;
        const handY = -s * 0.4;
        // Pulsing press rings (ripple out from hand)
        const holdPhase = (t * 0.8) % 1;
        for (let i = 0; i < 3; i++) {
            const ripple = (holdPhase + i * 0.33) % 1;
            const rAlpha = 1 - ripple;
            ctx.strokeStyle = `rgba(255,255,255,${(rAlpha * 0.3).toFixed(2)})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(handX, handY, s * 0.3 + ripple * s * 0.5, 0, Math.PI * 2);
            ctx.stroke();
        }
        // Hand circle (pressed down)
        const pressScale = 0.95 + 0.05 * Math.sin(t * 6);
        ctx.fillStyle = 'rgba(68,136,255,0.2)';
        ctx.beginPath();
        ctx.arc(handX, handY, s * 0.32 * pressScale, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(handX, handY, s * 0.32 * pressScale, 0, Math.PI * 2);
        ctx.stroke();
        // Finger icon
        this._drawFingerIcon(ctx, handX, handY, s * 0.2);
        // HOLD label
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('HOLD', handX, handY + s * 0.55);

        // --- Speed gauge ---
        const gaugeX = -s * 1.4;
        const gaugeY = -s * 0.6;
        const gaugeW = s * 0.35;
        const gaugeH = s * 1.6;
        // Gauge background
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        this._roundRect(ctx, gaugeX - gaugeW / 2, gaugeY, gaugeW, gaugeH, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        this._roundRect(ctx, gaugeX - gaugeW / 2, gaugeY, gaugeW, gaugeH, 6);
        ctx.stroke();
        // Fill level animates up and down (simulating hold = speed building)
        const fillPct = 0.3 + 0.6 * (0.5 + 0.5 * Math.sin(t * 1.2 - Math.PI / 2));
        const fillH = gaugeH * fillPct;
        const fillTop = gaugeY + gaugeH - fillH;
        // Gradient fill
        const grd = ctx.createLinearGradient(0, fillTop + fillH, 0, fillTop);
        grd.addColorStop(0, 'rgba(68,136,255,0.6)');
        grd.addColorStop(1, 'rgba(68,200,255,0.9)');
        ctx.fillStyle = grd;
        this._roundRect(ctx, gaugeX - gaugeW / 2 + 2, fillTop, gaugeW - 4, fillH - 2, 4);
        ctx.fill();
        // Label
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '10px sans-serif';
        ctx.fillText('FART', gaugeX, gaugeY - 8);
        // Speed value
        const speedVal = Math.round(60 + fillPct * 35);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(`${speedVal}`, gaugeX, gaugeY + gaugeH + 14);
        ctx.font = '9px sans-serif';
        ctx.fillText('km/t', gaugeX, gaugeY + gaugeH + 26);
    }

    // --- PAGE 2: AVHOPP ---
    // Timing ring shrinks, hand taps at right moment, green flash
    _drawAvhopp(ctx, s, color, t) {
        // Ramp and edge
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-s * 2, s * 0.4);
        ctx.lineTo(s * 0.2, 0);
        ctx.stroke();
        // Edge marker
        ctx.fillStyle = color;
        this._roundRect(ctx, s * 0.15, -s * 0.1, 5, s * 0.2, 2);
        ctx.fill();

        // Jumper at edge
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(s * 0.0, -s * 0.55, s * 0.16, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(s * 0.0, -s * 0.39);
        ctx.lineTo(s * 0.0, s * 0.0);
        ctx.stroke();
        // Legs
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-s * 0.15, s * 0.15);
        ctx.moveTo(0, 0);
        ctx.lineTo(s * 0.15, s * 0.15);
        ctx.stroke();

        // --- Shrinking timing ring ---
        const ringCx = 0;
        const ringCy = -s * 0.15;
        const ringCycle = 2.5; // seconds per cycle
        const phase = (t % ringCycle) / ringCycle;
        const maxR = s * 1.2;
        const minR = s * 0.25;
        const ringR = maxR - (maxR - minR) * phase;
        const isPerfect = phase > 0.75 && phase < 0.9;

        // Outer timing ring (shrinking)
        ctx.strokeStyle = isPerfect
            ? `rgba(100,255,100,${0.6 + 0.4 * Math.sin(t * 20)})`
            : `rgba(255,136,68,${0.3 + 0.4 * (1 - phase)})`;
        ctx.lineWidth = isPerfect ? 4 : 3;
        ctx.beginPath();
        ctx.arc(ringCx, ringCy, ringR, 0, Math.PI * 2);
        ctx.stroke();

        // Target zone (inner ring - always visible)
        ctx.strokeStyle = 'rgba(100,255,100,0.3)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(ringCx, ringCy, minR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Green flash when ring hits perfect zone
        if (isPerfect) {
            const flashAlpha = 0.15 + 0.1 * Math.sin(t * 15);
            ctx.fillStyle = `rgba(100,255,100,${flashAlpha.toFixed(2)})`;
            ctx.beginPath();
            ctx.arc(ringCx, ringCy, s * 0.8, 0, Math.PI * 2);
            ctx.fill();
        }

        // --- Hand icon that taps at perfect moment ---
        const handX = s * 1.3;
        const handY = -s * 0.6;
        const tapBounce = isPerfect ? -s * 0.08 * Math.abs(Math.sin(t * 12)) : 0;
        ctx.fillStyle = isPerfect ? 'rgba(100,255,100,0.2)' : 'rgba(255,136,68,0.15)';
        ctx.beginPath();
        ctx.arc(handX, handY + tapBounce, s * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = isPerfect ? 'rgba(100,255,100,0.7)' : 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(handX, handY + tapBounce, s * 0.3, 0, Math.PI * 2);
        ctx.stroke();
        this._drawFingerIcon(ctx, handX, handY + tapBounce, s * 0.18);
        // TAP label
        ctx.fillStyle = isPerfect ? '#88ff88' : '#ffffff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('TAP!', handX, handY + s * 0.5);
    }

    // --- PAGE 3: SVEV ---
    // Angle gauge with needle, hand swiping up/down, green zone at 35 deg
    _drawSvev(ctx, s, color, t) {
        // Trajectory arc background
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-s * 1.8, -s * 0.1);
        ctx.quadraticCurveTo(0, -s * 1, s * 1.8, s * 0.6);
        ctx.stroke();

        // V-style jumper in flight
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        // Head
        ctx.beginPath();
        ctx.arc(-s * 0.2, -s * 0.45, s * 0.13, 0, Math.PI * 2);
        ctx.stroke();
        // Body (roughly horizontal)
        ctx.beginPath();
        ctx.moveTo(-s * 0.07, -s * 0.45);
        ctx.lineTo(s * 0.5, -s * 0.35);
        ctx.stroke();
        // V-style skis
        ctx.strokeStyle = '#aaaaaa';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(s * 0.5, -s * 0.35);
        ctx.lineTo(s * 1.0, -s * 0.58);
        ctx.moveTo(s * 0.5, -s * 0.35);
        ctx.lineTo(s * 1.0, -s * 0.12);
        ctx.stroke();

        // --- Animated angle gauge (semicircle) ---
        const gaugeX = -s * 1.1;
        const gaugeY = s * 0.15;
        const gaugeR = s * 0.7;
        // Gauge background arc (0 to 60 degrees mapped)
        const startAngle = -Math.PI / 2 - Math.PI / 6; // -60 deg from vertical
        const endAngle = -Math.PI / 2 + Math.PI / 3;   // +60 deg
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 8;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.arc(gaugeX, gaugeY, gaugeR, startAngle, endAngle);
        ctx.stroke();

        // Green zone around 35 degrees
        const deg35 = -Math.PI / 2 + (35 / 60) * (endAngle - startAngle + Math.PI / 6) - Math.PI / 6;
        const zoneHalf = 0.12;
        ctx.strokeStyle = 'rgba(100,255,100,0.35)';
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(gaugeX, gaugeY, gaugeR, deg35 - zoneHalf, deg35 + zoneHalf);
        ctx.stroke();

        // Animated needle (oscillates, occasionally hitting 35 zone)
        const needleAngle = startAngle + (endAngle - startAngle) * (0.5 + 0.35 * Math.sin(t * 1.5));
        const needleLen = gaugeR * 0.85;
        const nx = gaugeX + Math.cos(needleAngle) * needleLen;
        const ny = gaugeY + Math.sin(needleAngle) * needleLen;
        // Needle is in green zone?
        const inGreen = Math.abs(needleAngle - deg35) < zoneHalf;
        ctx.strokeStyle = inGreen ? '#88ff88' : color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(gaugeX, gaugeY);
        ctx.lineTo(nx, ny);
        ctx.stroke();
        // Center dot
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(gaugeX, gaugeY, 4, 0, Math.PI * 2);
        ctx.fill();
        // Degree readout
        const currentDeg = Math.round(15 + (0.5 + 0.35 * Math.sin(t * 1.5)) * 45);
        ctx.fillStyle = inGreen ? '#88ff88' : '#ffffff';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${currentDeg}°`, gaugeX, gaugeY + gaugeR + 18);
        // "35°" label on green zone
        ctx.fillStyle = 'rgba(100,255,100,0.7)';
        ctx.font = '11px sans-serif';
        const labelX = gaugeX + Math.cos(deg35) * (gaugeR + 16);
        const labelY = gaugeY + Math.sin(deg35) * (gaugeR + 16);
        ctx.fillText('35°', labelX, labelY);

        // --- Animated swipe hand ---
        const handX = s * 1.3;
        const swipeRange = s * 0.6;
        const swipeY = Math.sin(t * 2) * swipeRange;
        // Trail
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(handX, -swipeRange);
        ctx.lineTo(handX, swipeRange);
        ctx.stroke();
        ctx.setLineDash([]);
        // Arrow indicators
        const arrowAlpha = 0.3 + 0.2 * Math.sin(t * 4);
        ctx.strokeStyle = `rgba(255,255,255,${arrowAlpha.toFixed(2)})`;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        // Up arrow
        ctx.beginPath();
        ctx.moveTo(handX - 6, -swipeRange + 8);
        ctx.lineTo(handX, -swipeRange);
        ctx.lineTo(handX + 6, -swipeRange + 8);
        ctx.stroke();
        // Down arrow
        ctx.beginPath();
        ctx.moveTo(handX - 6, swipeRange - 8);
        ctx.lineTo(handX, swipeRange);
        ctx.lineTo(handX + 6, swipeRange - 8);
        ctx.stroke();
        // Hand circle
        ctx.fillStyle = 'rgba(68,221,255,0.15)';
        ctx.beginPath();
        ctx.arc(handX, swipeY, s * 0.28, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(handX, swipeY, s * 0.28, 0, Math.PI * 2);
        ctx.stroke();
        this._drawFingerIcon(ctx, handX, swipeY, s * 0.16);
        // Label
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('SVEIP', handX, swipeRange + 20);
    }

    // --- PAGE 4: LANDING ---
    // Jumper approaching ground, hand taps, TELEMARK flash
    _drawLanding(ctx, s, color, t) {
        // Slope (landing area)
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-s * 2, -s * 0.6);
        ctx.lineTo(s * 2, s * 0.35);
        ctx.stroke();
        // Snow surface texture
        for (let i = 0; i < 6; i++) {
            const sx = -s * 1.5 + i * s * 0.6;
            const sy = -s * 0.6 + (sx + s * 2) * (0.95 / (s * 4)) * s;
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx + s * 0.3, sy + 2);
            ctx.stroke();
        }

        // Animated jumper descending toward ground
        const landCycle = 3.0;
        const phase = (t % landCycle) / landCycle;
        const justLanded = phase > 0.6 && phase < 0.85;
        const preApproach = phase <= 0.6;

        // Jumper position (descends along arc)
        let jx, jy;
        if (preApproach) {
            const p = phase / 0.6;
            jx = -s * 1.0 + p * s * 1.3;
            jy = -s * 0.9 + p * p * s * 0.8;
        } else {
            jx = s * 0.3;
            jy = -s * 0.1;
        }

        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';

        if (justLanded) {
            // Telemark pose
            // Head
            ctx.beginPath();
            ctx.arc(jx, jy - s * 0.5, s * 0.14, 0, Math.PI * 2);
            ctx.stroke();
            // Body upright
            ctx.beginPath();
            ctx.moveTo(jx, jy - s * 0.36);
            ctx.lineTo(jx, jy);
            ctx.stroke();
            // Split legs (telemark)
            ctx.beginPath();
            ctx.moveTo(jx, jy);
            ctx.lineTo(jx + s * 0.28, jy + s * 0.1);
            ctx.moveTo(jx, jy);
            ctx.lineTo(jx - s * 0.22, jy + s * 0.12);
            ctx.stroke();
            // Arms spread wide
            ctx.beginPath();
            ctx.moveTo(jx - s * 0.4, jy - s * 0.35);
            ctx.lineTo(jx, jy - s * 0.25);
            ctx.lineTo(jx + s * 0.4, jy - s * 0.35);
            ctx.stroke();

            // "TELEMARK!" flash
            const flashPhase = ((phase - 0.6) / 0.25);
            const flashAlpha = Math.sin(flashPhase * Math.PI);
            const flashScale = 0.8 + flashPhase * 0.4;
            ctx.save();
            ctx.globalAlpha = flashAlpha;
            ctx.fillStyle = color;
            ctx.font = `bold ${Math.round(22 * flashScale)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('TELEMARK!', jx, jy - s * 0.85);
            // Glow behind text
            ctx.fillStyle = `rgba(68,255,136,${(flashAlpha * 0.15).toFixed(2)})`;
            ctx.beginPath();
            ctx.arc(jx, jy - s * 0.85, s * 0.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // Impact particles
            for (let i = 0; i < 5; i++) {
                const angle = -Math.PI / 2 + (i - 2) * 0.4;
                const dist = s * 0.2 + flashPhase * s * 0.4;
                const px = jx + Math.cos(angle) * dist;
                const py = jy + s * 0.12 + Math.sin(angle) * dist * 0.3;
                const pAlpha = (1 - flashPhase) * 0.5;
                ctx.fillStyle = `rgba(255,255,255,${pAlpha.toFixed(2)})`;
                ctx.beginPath();
                ctx.arc(px, py, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        } else {
            // Flying/approaching pose
            ctx.beginPath();
            ctx.arc(jx - s * 0.1, jy - s * 0.08, s * 0.12, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(jx, jy - s * 0.08);
            ctx.lineTo(jx + s * 0.45, jy);
            ctx.stroke();
            // Skis
            ctx.strokeStyle = '#aaaaaa';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(jx + s * 0.45, jy);
            ctx.lineTo(jx + s * 0.9, jy - s * 0.15);
            ctx.moveTo(jx + s * 0.45, jy);
            ctx.lineTo(jx + s * 0.9, jy + s * 0.15);
            ctx.stroke();
        }

        // --- Hand tap icon ---
        const handX = s * 1.4;
        const handY = -s * 0.6;
        const tapPhase = justLanded;
        const tapOffset = tapPhase ? Math.abs(Math.sin(t * 14)) * s * 0.06 : 0;
        ctx.fillStyle = tapPhase ? 'rgba(68,255,136,0.2)' : 'rgba(68,255,136,0.1)';
        ctx.beginPath();
        ctx.arc(handX, handY + tapOffset, s * 0.28, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = tapPhase ? 'rgba(100,255,100,0.7)' : 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(handX, handY + tapOffset, s * 0.28, 0, Math.PI * 2);
        ctx.stroke();
        this._drawFingerIcon(ctx, handX, handY + tapOffset, s * 0.16);
        ctx.fillStyle = tapPhase ? '#88ff88' : '#ffffff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('TAP!', handX, handY + s * 0.48);
    }

    // -----------------------------------------------------------------------
    // Helper: draw a small finger/hand icon (pointing down)
    // -----------------------------------------------------------------------
    _drawFingerIcon(ctx, x, y, size) {
        ctx.save();
        ctx.translate(x, y);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        // Simplified finger pointing down
        const sz = size;
        ctx.beginPath();
        // Fingertip (rounded)
        ctx.arc(0, sz * 0.3, sz * 0.28, 0, Math.PI);
        // Finger body
        ctx.lineTo(-sz * 0.28, -sz * 0.5);
        ctx.quadraticCurveTo(-sz * 0.28, -sz * 0.7, 0, -sz * 0.7);
        ctx.quadraticCurveTo(sz * 0.28, -sz * 0.7, sz * 0.28, -sz * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    // -----------------------------------------------------------------------
    // Utility: hex color to "r,g,b" string
    // -----------------------------------------------------------------------
    _hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `${r},${g},${b}`;
    }

    _roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
    }

    _easeOut(t) {
        return 1 - (1 - t) * (1 - t);
    }
}
