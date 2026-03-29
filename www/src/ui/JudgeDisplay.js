/**
 * JudgeDisplay.js - Animated judge score reveal for Vinter-OL Skihopp
 *
 * Shows 5 judge cards that flip in sequentially with 3D rotation,
 * distance points, style points, wind compensation, and total score
 * with glowing golden animation and particle burst.
 * Canvas 2D, mobile portrait (~390x844).
 */

export default class JudgeDisplay {
    constructor() {
        this._time = 0;

        // Particle system for total score burst
        this._particles = [];
        this._particlesBurst = false;

        // Country flags for judges (Norway, Finland, Austria, Japan, Germany)
        this._judgeCountries = [
            { code: 'NOR', colors: ['#BA0C2F', '#FFFFFF', '#00205B'] },
            { code: 'FIN', colors: ['#FFFFFF', '#003580', '#FFFFFF'] },
            { code: 'AUT', colors: ['#ED2939', '#FFFFFF', '#ED2939'] },
            { code: 'JPN', colors: ['#FFFFFF', '#BC002D', '#FFFFFF'] },
            { code: 'GER', colors: ['#000000', '#DD0000', '#FFCC00'] },
        ];
    }

    // -------------------------------------------------------------------
    // Main render
    // -------------------------------------------------------------------

    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} width
     * @param {number} height
     * @param {object} judgeData
     *   { judges: [5 scores], distancePoints, stylePoints, windComp,
     *     totalPoints, distance, rating, ratingTier, animationProgress (0-1) }
     *
     * Animation phases (TV-broadcast style):
     *   0.0 - 0.2  Distance slides in from top (huge "132.5 m" text)
     *   0.2 - 0.7  5 judge cards appear one-by-one
     *   0.7 - 0.8  Strikethrough lines on highest / lowest scores
     *   0.8 - 0.9  Breakdown fades in (stilpoeng, lengdepoeng, vindkomp)
     *   0.9 - 1.0  Total score drops in with golden glow + rating text
     */
    render(ctx, width, height, judgeData = {}) {
        this._time += 0.016;

        const d = {
            judges: [0, 0, 0, 0, 0],
            distancePoints: 0,
            stylePoints: 0,
            windComp: 0,
            totalPoints: 0,
            distance: 0,
            rating: '',
            ratingTier: 'B',
            animationProgress: 1,
            ...judgeData,
        };

        this._renderBackground(ctx, width, height);
        this._renderDistance(ctx, width, height, d);
        this._renderJudgeCards(ctx, width, height, d);
        this._renderBreakdown(ctx, width, height, d);
        this._renderTotal(ctx, width, height, d);
        this._renderParticles(ctx, width, height, d);
    }

    // -------------------------------------------------------------------
    // Background overlay
    // -------------------------------------------------------------------

    _renderBackground(ctx, width, height) {
        // Semi-transparent dark overlay with vignette
        ctx.fillStyle = 'rgba(6, 8, 20, 0.85)';
        ctx.fillRect(0, 0, width, height);

        // Radial vignette for depth
        const vignette = ctx.createRadialGradient(
            width / 2, height * 0.4, width * 0.2,
            width / 2, height * 0.4, width * 0.9
        );
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.3)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, width, height);

        // Subtle spotlight on cards area
        const spot = ctx.createRadialGradient(
            width / 2, height * 0.22, 0,
            width / 2, height * 0.22, width * 0.5
        );
        spot.addColorStop(0, 'rgba(60,100,180,0.06)');
        spot.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = spot;
        ctx.fillRect(0, 0, width, height * 0.5);
    }

    // -------------------------------------------------------------------
    // Title
    // -------------------------------------------------------------------

    _renderTitle(ctx, width, height, d) {
        const y = height * 0.07;

        ctx.save();
        // Title with subtle glow
        ctx.shadowColor = 'rgba(150,200,255,0.3)';
        ctx.shadowBlur = 10;
        ctx.fillStyle = 'rgba(200,220,255,0.7)';
        ctx.font = `600 ${Math.min(width * 0.04, 16)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.letterSpacing = '3px';
        ctx.fillText('D O M M E R N E S   K A R A K T E R E R', width / 2, y);
        ctx.restore();

        // Decorative accent lines
        const lineW = Math.min(width * 0.35, 140);
        const lineY = y + 14;
        ctx.save();
        // Left line with gradient
        const leftGrad = ctx.createLinearGradient(width / 2 - lineW, lineY, width / 2, lineY);
        leftGrad.addColorStop(0, 'rgba(150,200,255,0)');
        leftGrad.addColorStop(1, 'rgba(150,200,255,0.3)');
        ctx.strokeStyle = leftGrad;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(width / 2 - lineW, lineY);
        ctx.lineTo(width / 2 - 4, lineY);
        ctx.stroke();

        // Right line with gradient
        const rightGrad = ctx.createLinearGradient(width / 2, lineY, width / 2 + lineW, lineY);
        rightGrad.addColorStop(0, 'rgba(150,200,255,0.3)');
        rightGrad.addColorStop(1, 'rgba(150,200,255,0)');
        ctx.strokeStyle = rightGrad;
        ctx.beginPath();
        ctx.moveTo(width / 2 + 4, lineY);
        ctx.lineTo(width / 2 + lineW, lineY);
        ctx.stroke();

        // Center diamond
        ctx.fillStyle = 'rgba(150,200,255,0.4)';
        ctx.beginPath();
        ctx.moveTo(width / 2, lineY - 3);
        ctx.lineTo(width / 2 + 3, lineY);
        ctx.lineTo(width / 2, lineY + 3);
        ctx.lineTo(width / 2 - 3, lineY);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    // -------------------------------------------------------------------
    // Judge cards with 3D flip animation
    // -------------------------------------------------------------------

    _renderJudgeCards(ctx, width, height, d) {
        const judges = d.judges;
        const progress = d.animationProgress;
        const cardCount = 5;

        // Find highest and lowest for strikethrough
        const sorted = [...judges].map((s, i) => ({ score: s, idx: i }))
            .sort((a, b) => a.score - b.score);
        const lowestIdx = sorted[0].idx;
        const highestIdx = sorted[cardCount - 1].idx;

        // Card dimensions - more generous sizing
        const cardW = Math.min((width - 30) / cardCount - 6, 68);
        const cardH = cardW * 1.45;
        const totalW = cardCount * cardW + (cardCount - 1) * 6;
        const startX = (width - totalW) / 2;
        const cardY = height * 0.14;

        for (let i = 0; i < cardCount; i++) {
            // Each card flips in at a staggered point in animation
            const cardStart = i * 0.10;
            const cardEnd = cardStart + 0.15;
            const cardProgress = Math.max(0, Math.min(1, (progress - cardStart) / (cardEnd - cardStart)));

            if (cardProgress <= 0) continue;

            const x = startX + i * (cardW + 6);
            const isDropped = i === lowestIdx || i === highestIdx;

            // 3D flip effect: simulate Y-axis rotation
            // cardProgress 0->0.5: card back rotating to edge
            // cardProgress 0.5->1: card front rotating from edge to face
            const flipPhase = cardProgress;
            const flipAngle = flipPhase < 0.5
                ? (flipPhase / 0.5) * Math.PI / 2  // 0 to 90 degrees
                : Math.PI / 2 - ((flipPhase - 0.5) / 0.5) * Math.PI / 2; // 90 to 0 degrees
            const scaleX = Math.cos(flipAngle);
            const showFront = flipPhase >= 0.5;

            const alpha = Math.min(1, cardProgress * 3);

            ctx.save();
            ctx.globalAlpha = alpha;

            // Apply horizontal squeeze for 3D flip
            ctx.translate(x + cardW / 2, cardY + cardH / 2);
            ctx.scale(Math.max(0.01, scaleX), 1);
            ctx.translate(-(x + cardW / 2), -(cardY + cardH / 2));

            if (showFront) {
                this._drawCardFront(ctx, x, cardY, cardW, cardH, i, judges[i], isDropped, lowestIdx);
            } else {
                this._drawCardBack(ctx, x, cardY, cardW, cardH);
            }

            ctx.restore();
        }
    }

    _drawCardBack(ctx, x, y, w, h) {
        const r = 8;

        // Card background - dark blue
        const grad = ctx.createLinearGradient(x, y, x, y + h);
        grad.addColorStop(0, 'rgba(30,50,100,0.9)');
        grad.addColorStop(1, 'rgba(15,30,60,0.9)');
        ctx.fillStyle = grad;
        this._roundRect(ctx, x, y, w, h, r);
        ctx.fill();

        // Border
        ctx.strokeStyle = 'rgba(100,150,220,0.4)';
        ctx.lineWidth = 1.5;
        this._roundRect(ctx, x, y, w, h, r);
        ctx.stroke();

        // Olympic rings pattern (tiny)
        ctx.fillStyle = 'rgba(100,150,220,0.15)';
        ctx.font = `${w * 0.25}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', x + w / 2, y + h / 2);

        // Cross-hatch pattern
        ctx.save();
        ctx.beginPath();
        this._roundRect(ctx, x + 4, y + 4, w - 8, h - 8, r - 2);
        ctx.clip();
        ctx.strokeStyle = 'rgba(100,150,220,0.08)';
        ctx.lineWidth = 0.5;
        for (let i = -h; i < w + h; i += 8) {
            ctx.beginPath();
            ctx.moveTo(x + i, y);
            ctx.lineTo(x + i + h, y + h);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x + i, y + h);
            ctx.lineTo(x + i + h, y);
            ctx.stroke();
        }
        ctx.restore();
    }

    _drawCardFront(ctx, x, y, w, h, judgeIdx, score, isDropped, lowestIdx) {
        const r = 8;
        const country = this._judgeCountries[judgeIdx];

        // Card shadow
        ctx.save();
        ctx.shadowColor = isDropped ? 'rgba(0,0,0,0.3)' : 'rgba(50,100,200,0.3)';
        ctx.shadowBlur = isDropped ? 4 : 10;
        ctx.shadowOffsetY = 3;

        // Card background
        if (isDropped) {
            const grad = ctx.createLinearGradient(x, y, x, y + h);
            grad.addColorStop(0, 'rgba(40,40,50,0.7)');
            grad.addColorStop(1, 'rgba(25,25,35,0.7)');
            ctx.fillStyle = grad;
        } else {
            const grad = ctx.createLinearGradient(x, y, x, y + h);
            grad.addColorStop(0, 'rgba(240,245,255,0.95)');
            grad.addColorStop(0.3, 'rgba(220,232,248,0.92)');
            grad.addColorStop(1, 'rgba(200,218,240,0.90)');
            ctx.fillStyle = grad;
        }
        this._roundRect(ctx, x, y, w, h, r);
        ctx.fill();
        ctx.restore();

        // Border
        ctx.strokeStyle = isDropped ? 'rgba(255,255,255,0.1)' : 'rgba(100,150,220,0.5)';
        ctx.lineWidth = isDropped ? 1 : 1.5;
        this._roundRect(ctx, x, y, w, h, r);
        ctx.stroke();

        // Country flag stripe at top of card
        const flagH = Math.max(4, h * 0.045);
        const flagY = y + 1;
        ctx.save();
        ctx.beginPath();
        // Clip to rounded top corners
        this._roundRect(ctx, x + 1, y + 1, w - 2, flagH * 3, { tl: r - 1, tr: r - 1, br: 0, bl: 0 });
        ctx.clip();
        for (let fi = 0; fi < 3; fi++) {
            ctx.fillStyle = isDropped ? this._dimColor(country.colors[fi]) : country.colors[fi];
            ctx.fillRect(x, flagY + fi * flagH, w, flagH);
        }
        ctx.restore();

        // Country code label
        const labelSize = Math.min(w * 0.17, 10);
        ctx.fillStyle = isDropped ? 'rgba(255,255,255,0.2)' : 'rgba(30,50,80,0.5)';
        ctx.font = `600 ${labelSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(country.code, x + w / 2, y + flagH * 3 + 4);

        // Judge number
        ctx.fillStyle = isDropped ? 'rgba(255,255,255,0.15)' : 'rgba(30,50,80,0.35)';
        ctx.font = `${Math.min(w * 0.15, 9)}px sans-serif`;
        ctx.fillText(`DOMMER ${judgeIdx + 1}`, x + w / 2, y + flagH * 3 + 4 + labelSize + 2);

        // Score number - the main attraction
        const fontSize = Math.min(w * 0.42, 26);
        ctx.font = `800 ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const scoreText = score.toFixed(1);
        const scoreY = y + h * 0.60;

        if (isDropped) {
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
        } else {
            // Dark text on light card
            ctx.fillStyle = '#1a2a4a';
        }
        ctx.fillText(scoreText, x + w / 2, scoreY);

        // Strikethrough for dropped scores
        if (isDropped) {
            const textW = ctx.measureText(scoreText).width;
            ctx.strokeStyle = 'rgba(255,60,60,0.7)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x + w / 2 - textW / 2 - 4, scoreY);
            ctx.lineTo(x + w / 2 + textW / 2 + 4, scoreY);
            ctx.stroke();

            // Label
            ctx.fillStyle = 'rgba(255,80,80,0.6)';
            ctx.font = `700 ${Math.min(w * 0.14, 9)}px sans-serif`;
            ctx.textBaseline = 'bottom';
            ctx.fillText(judgeIdx === lowestIdx ? 'LAVEST' : 'H\u00D8YEST', x + w / 2, y + h - 5);
        } else {
            // Decorative line under score
            const lineW = w * 0.5;
            ctx.strokeStyle = 'rgba(50,100,180,0.2)';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(x + w / 2 - lineW / 2, scoreY + fontSize * 0.5 + 3);
            ctx.lineTo(x + w / 2 + lineW / 2, scoreY + fontSize * 0.5 + 3);
            ctx.stroke();
        }
    }

    _dimColor(color) {
        // Return a dimmed version of a hex color
        if (color === '#FFFFFF') return 'rgba(255,255,255,0.15)';
        if (color === '#000000') return 'rgba(80,80,80,0.4)';
        // Parse hex color and return with low opacity
        const hex = color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `rgba(${r},${g},${b},0.2)`;
    }

    // -------------------------------------------------------------------
    // Score breakdown
    // -------------------------------------------------------------------

    _renderBreakdown(ctx, width, height, d) {
        const breakdownProgress = Math.max(0, Math.min(1, (d.animationProgress - 0.55) / 0.22));
        if (breakdownProgress <= 0) return;

        ctx.save();
        ctx.globalAlpha = breakdownProgress;

        const startY = height * 0.44;
        const lineHeight = 42;
        const padX = width * 0.08;
        const contentW = width - padX * 2;
        const labelX = padX + 12;
        const valueX = padX + contentW - 12;

        const rows = [
            { label: 'Lengdepoeng', value: d.distancePoints, icon: '\u2192', color: '#7BC8FF' },
            { label: 'Stilpoeng', value: d.stylePoints, icon: '\u2605', color: '#7BFFB0' },
            { label: 'Vindkompensasjon', value: d.windComp, icon: '\u2248', color: d.windComp >= 0 ? '#A0FFA0' : '#FFA888' },
        ];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const y = startY + i * lineHeight;
            const rowAlpha = Math.max(0, Math.min(1, (breakdownProgress - i * 0.12) / 0.35));

            if (rowAlpha <= 0) continue;

            ctx.save();
            ctx.globalAlpha *= rowAlpha;

            // Slide in from left
            const slideOffset = (1 - this._easeOutCubic(rowAlpha)) * -30;

            // Background bar with rounded corners
            const barX = padX + slideOffset;
            const barY = y - lineHeight / 2 + 4;
            const barH = lineHeight - 8;

            const barGrad = ctx.createLinearGradient(barX, barY, barX + contentW, barY);
            barGrad.addColorStop(0, 'rgba(255,255,255,0.06)');
            barGrad.addColorStop(0.5, 'rgba(255,255,255,0.03)');
            barGrad.addColorStop(1, 'rgba(255,255,255,0.06)');
            ctx.fillStyle = barGrad;
            this._roundRect(ctx, barX, barY, contentW, barH, barH / 2);
            ctx.fill();

            // Thin border
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineWidth = 0.5;
            this._roundRect(ctx, barX, barY, contentW, barH, barH / 2);
            ctx.stroke();

            // Icon
            ctx.fillStyle = row.color;
            ctx.globalAlpha *= 0.5;
            ctx.font = `${Math.min(width * 0.04, 16)}px sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(row.icon, labelX + slideOffset, y + 1);
            ctx.globalAlpha /= 0.5;

            // Label
            ctx.fillStyle = 'rgba(255,255,255,0.65)';
            ctx.font = `400 ${Math.min(width * 0.037, 15)}px sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(row.label, labelX + 22 + slideOffset, y + 1);

            // Value with color coding
            ctx.fillStyle = row.color;
            ctx.font = `700 ${Math.min(width * 0.045, 18)}px sans-serif`;
            ctx.textAlign = 'right';
            const prefix = row.value >= 0 && row.label === 'Vindkompensasjon' ? '+' : '';
            ctx.fillText(`${prefix}${row.value.toFixed(1)}`, valueX + slideOffset, y + 1);

            ctx.restore();
        }

        // Animated divider line before total
        const divY = startY + rows.length * lineHeight - 6;
        const divProgress = Math.max(0, Math.min(1, (breakdownProgress - 0.4) / 0.3));
        if (divProgress > 0) {
            ctx.save();
            ctx.globalAlpha *= divProgress;

            // Gradient line that expands from center
            const divW = contentW * divProgress;
            const divCenter = width / 2;
            const lineGrad = ctx.createLinearGradient(
                divCenter - divW / 2, divY, divCenter + divW / 2, divY
            );
            lineGrad.addColorStop(0, 'rgba(200,180,100,0)');
            lineGrad.addColorStop(0.2, 'rgba(200,180,100,0.3)');
            lineGrad.addColorStop(0.5, 'rgba(220,200,120,0.5)');
            lineGrad.addColorStop(0.8, 'rgba(200,180,100,0.3)');
            lineGrad.addColorStop(1, 'rgba(200,180,100,0)');

            ctx.strokeStyle = lineGrad;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(divCenter - divW / 2, divY);
            ctx.lineTo(divCenter + divW / 2, divY);
            ctx.stroke();
            ctx.restore();
        }

        ctx.restore();
    }

    // -------------------------------------------------------------------
    // Total score with golden glow
    // -------------------------------------------------------------------

    _renderTotal(ctx, width, height, d) {
        const totalProgress = Math.max(0, Math.min(1, (d.animationProgress - 0.82) / 0.18));
        if (totalProgress <= 0) return;

        const y = height * 0.66;

        ctx.save();

        // Scale-in with overshoot
        const scale = this._easeOutBack(totalProgress);
        ctx.translate(width / 2, y);
        ctx.scale(scale, scale);
        ctx.translate(-width / 2, -y);
        ctx.globalAlpha = Math.min(1, totalProgress * 2.5);

        // Background pill
        const pillW = Math.min(width * 0.7, 280);
        const pillH = 72;
        const pillX = (width - pillW) / 2;
        const pillY = y - pillH / 2;

        // Animated golden glow behind the pill
        const glowPulse = 0.7 + Math.sin(this._time * 3) * 0.3;
        ctx.save();
        ctx.shadowColor = `rgba(255,200,50,${0.4 * glowPulse})`;
        ctx.shadowBlur = 30 + Math.sin(this._time * 2.5) * 10;

        // Pill gradient - golden tones
        const pillGrad = ctx.createLinearGradient(pillX, pillY, pillX, pillY + pillH);
        pillGrad.addColorStop(0, 'rgba(60,50,20,0.85)');
        pillGrad.addColorStop(0.3, 'rgba(50,40,15,0.80)');
        pillGrad.addColorStop(0.7, 'rgba(40,35,12,0.80)');
        pillGrad.addColorStop(1, 'rgba(30,25,10,0.85)');
        ctx.fillStyle = pillGrad;
        this._roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
        ctx.fill();
        ctx.restore();

        // Golden border with animated glow
        const borderGrad = ctx.createLinearGradient(pillX, pillY, pillX + pillW, pillY + pillH);
        const shift = (Math.sin(this._time * 2) + 1) / 2;
        borderGrad.addColorStop(0, `rgba(255,200,60,${0.4 + shift * 0.3})`);
        borderGrad.addColorStop(0.5, `rgba(255,220,100,${0.6 + shift * 0.2})`);
        borderGrad.addColorStop(1, `rgba(255,180,40,${0.4 + shift * 0.3})`);
        ctx.strokeStyle = borderGrad;
        ctx.lineWidth = 2;
        this._roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
        ctx.stroke();

        // Inner highlight
        ctx.save();
        ctx.beginPath();
        this._roundRect(ctx, pillX + 2, pillY + 2, pillW - 4, pillH * 0.4, { tl: pillH / 2, tr: pillH / 2, br: 8, bl: 8 });
        ctx.clip();
        const innerGlow = ctx.createLinearGradient(pillX, pillY, pillX, pillY + pillH * 0.4);
        innerGlow.addColorStop(0, 'rgba(255,220,100,0.1)');
        innerGlow.addColorStop(1, 'rgba(255,220,100,0)');
        ctx.fillStyle = innerGlow;
        ctx.fillRect(pillX, pillY, pillW, pillH * 0.4);
        ctx.restore();

        // "TOTALPOENG" label
        ctx.fillStyle = 'rgba(255,220,150,0.7)';
        ctx.font = `600 ${Math.min(width * 0.03, 12)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('TOTALPOENG', width / 2, y - 8);

        // Score number with golden glow
        ctx.save();
        ctx.shadowColor = `rgba(255,200,50,${0.6 * glowPulse})`;
        ctx.shadowBlur = 20;

        // Golden gradient text
        const textSize = Math.min(width * 0.095, 38);
        ctx.font = `800 ${textSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        // Text gradient (gold)
        const textGrad = ctx.createLinearGradient(width / 2 - 40, y - 5, width / 2 + 40, y + textSize);
        textGrad.addColorStop(0, '#FFE88A');
        textGrad.addColorStop(0.3, '#FFFFFF');
        textGrad.addColorStop(0.5, '#FFD95A');
        textGrad.addColorStop(0.7, '#FFFFFF');
        textGrad.addColorStop(1, '#FFC940');
        ctx.fillStyle = textGrad;

        ctx.fillText(d.totalPoints.toFixed(1), width / 2, y - 5);
        ctx.restore();

        ctx.restore();

        // Trigger particle burst once
        if (totalProgress >= 0.9 && !this._particlesBurst) {
            this._particlesBurst = true;
            this._spawnParticles(width / 2, y, width);
        }

        // Reset particle burst flag when animation resets
        if (totalProgress <= 0) {
            this._particlesBurst = false;
        }

        // Tap to continue hint
        if (totalProgress >= 1) {
            const pulse = 0.3 + Math.sin(this._time * 3.5) * 0.3;
            ctx.save();
            ctx.globalAlpha = pulse;
            ctx.fillStyle = 'rgba(255,220,150,0.6)';
            ctx.font = `400 ${Math.min(width * 0.035, 14)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Trykk for \u00E5 fortsette', width / 2, height * 0.82);

            // Small chevron
            const chevY = height * 0.82 + 18 + Math.sin(this._time * 4) * 2;
            ctx.strokeStyle = 'rgba(255,220,150,0.4)';
            ctx.lineWidth = 1.5;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(width / 2 - 6, chevY);
            ctx.lineTo(width / 2, chevY + 4);
            ctx.lineTo(width / 2 + 6, chevY);
            ctx.stroke();
            ctx.restore();
        }
    }

    // -------------------------------------------------------------------
    // Particle burst effect
    // -------------------------------------------------------------------

    _spawnParticles(cx, cy, width) {
        const count = 40;
        this._particles = [];
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
            const speed = 2 + Math.random() * 4;
            const size = 2 + Math.random() * 4;
            // Gold/white/warm color palette
            const colors = ['#FFD700', '#FFFFFF', '#FFA500', '#FFE88A', '#FF6347', '#FFD700'];
            this._particles.push({
                x: cx,
                y: cy,
                vx: Math.cos(angle) * speed * (0.5 + Math.random()),
                vy: Math.sin(angle) * speed * (0.5 + Math.random()) - 1,
                size: size,
                life: 1.0,
                decay: 0.008 + Math.random() * 0.015,
                color: colors[Math.floor(Math.random() * colors.length)],
                gravity: 0.03 + Math.random() * 0.04,
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.2,
                type: Math.random() > 0.6 ? 'star' : 'circle',
            });
        }
    }

    _renderParticles(ctx, width, height, d) {
        if (this._particles.length === 0) return;

        const alive = [];
        for (const p of this._particles) {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += p.gravity;
            p.vx *= 0.99;
            p.life -= p.decay;
            p.rotation += p.rotSpeed;

            if (p.life <= 0) continue;
            alive.push(p);

            ctx.save();
            ctx.globalAlpha = p.life * p.life; // Quadratic fade
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);

            if (p.type === 'star') {
                // Draw a small 4-point star
                ctx.fillStyle = p.color;
                ctx.beginPath();
                const s = p.size * p.life;
                for (let j = 0; j < 4; j++) {
                    const a = (j / 4) * Math.PI * 2;
                    const aHalf = ((j + 0.5) / 4) * Math.PI * 2;
                    ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
                    ctx.lineTo(Math.cos(aHalf) * s * 0.4, Math.sin(aHalf) * s * 0.4);
                }
                ctx.closePath();
                ctx.fill();
            } else {
                // Circle with glow
                ctx.beginPath();
                ctx.arc(0, 0, p.size * p.life, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 6;
                ctx.fill();
            }
            ctx.restore();
        }
        this._particles = alive;
    }

    // -------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------

    /**
     * Ease-out-back for pop-in effect (slight overshoot).
     * @param {number} t - 0 to 1
     * @returns {number}
     */
    _easeOutBack(t) {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }

    _easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    _roundRect(ctx, x, y, w, h, r) {
        let tl, tr, br, bl;
        if (typeof r === 'number') {
            tl = tr = br = bl = r;
        } else {
            tl = r.tl || 0;
            tr = r.tr || 0;
            br = r.br || 0;
            bl = r.bl || 0;
        }
        ctx.beginPath();
        ctx.moveTo(x + tl, y);
        ctx.lineTo(x + w - tr, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
        ctx.lineTo(x + w, y + h - br);
        ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
        ctx.lineTo(x + bl, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
        ctx.lineTo(x, y + tl);
        ctx.quadraticCurveTo(x, y, x + tl, y);
        ctx.closePath();
    }
}
