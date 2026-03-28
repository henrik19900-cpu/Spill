/**
 * JudgeDisplay.js - Animated judge score reveal for Vinter-OL Skihopp
 *
 * Shows 5 judge cards that pop in sequentially, distance points, style points,
 * wind compensation, and total score with glow effect.
 * Canvas 2D, mobile portrait (~390x844).
 */

export default class JudgeDisplay {
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
     * @param {object} judgeData
     *   { judges: [5 scores], distancePoints, stylePoints, windComp,
     *     totalPoints, animationProgress (0-1) }
     */
    render(ctx, width, height, judgeData = {}) {
        this._time += 0.016;

        const d = {
            judges: [0, 0, 0, 0, 0],
            distancePoints: 0,
            stylePoints: 0,
            windComp: 0,
            totalPoints: 0,
            animationProgress: 1,
            ...judgeData,
        };

        this._renderBackground(ctx, width, height);
        this._renderTitle(ctx, width, height, d);
        this._renderJudgeCards(ctx, width, height, d);
        this._renderBreakdown(ctx, width, height, d);
        this._renderTotal(ctx, width, height, d);
    }

    // -------------------------------------------------------------------
    // Background overlay
    // -------------------------------------------------------------------

    _renderBackground(ctx, width, height) {
        // Semi-transparent dark overlay (rendered on top of game scene)
        ctx.fillStyle = 'rgba(10, 12, 28, 0.82)';
        ctx.fillRect(0, 0, width, height);
    }

    // -------------------------------------------------------------------
    // Title
    // -------------------------------------------------------------------

    _renderTitle(ctx, width, height, d) {
        const y = height * 0.10;

        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = `bold ${Math.min(width * 0.045, 18)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('DOMMERNES KARAKTERER', width / 2, y);
        ctx.restore();

        // Accent line
        const lineW = Math.min(width * 0.5, 200);
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo((width - lineW) / 2, y + 16);
        ctx.lineTo((width + lineW) / 2, y + 16);
        ctx.stroke();
    }

    // -------------------------------------------------------------------
    // Judge cards
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

        // Card dimensions
        const cardW = Math.min((width - 40) / cardCount - 8, 62);
        const cardH = cardW * 1.3;
        const totalW = cardCount * cardW + (cardCount - 1) * 8;
        const startX = (width - totalW) / 2;
        const cardY = height * 0.18;

        for (let i = 0; i < cardCount; i++) {
            // Each card appears at a staggered point in animation
            const cardStart = i * 0.12;           // starts appearing
            const cardEnd = cardStart + 0.18;      // fully visible
            const cardProgress = Math.max(0, Math.min(1, (progress - cardStart) / (cardEnd - cardStart)));

            if (cardProgress <= 0) continue;

            const x = startX + i * (cardW + 8);
            const isDropped = i === lowestIdx || i === highestIdx;

            // Pop-in effect: scale from 0 to 1 with overshoot
            const scale = this._easeOutBack(cardProgress);
            const alpha = Math.min(1, cardProgress * 2);

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(x + cardW / 2, cardY + cardH / 2);
            ctx.scale(scale, scale);
            ctx.translate(-(x + cardW / 2), -(cardY + cardH / 2));

            // Card background
            const r = 10;
            if (isDropped) {
                ctx.fillStyle = 'rgba(255,255,255,0.06)';
            } else {
                const grad = ctx.createLinearGradient(x, cardY, x, cardY + cardH);
                grad.addColorStop(0, 'rgba(60,80,120,0.7)');
                grad.addColorStop(1, 'rgba(30,45,75,0.7)');
                ctx.fillStyle = grad;
            }

            this._roundRect(ctx, x, cardY, cardW, cardH, r);
            ctx.fill();

            // Card border
            ctx.strokeStyle = isDropped ? 'rgba(255,255,255,0.1)' : 'rgba(150,200,255,0.3)';
            ctx.lineWidth = 1.5;
            this._roundRect(ctx, x, cardY, cardW, cardH, r);
            ctx.stroke();

            // Judge number label
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.font = `${Math.min(cardW * 0.18, 11)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(`D${i + 1}`, x + cardW / 2, cardY + 6);

            // Score number
            const score = judges[i];
            const fontSize = Math.min(cardW * 0.38, 22);
            ctx.font = `bold ${fontSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            if (isDropped) {
                ctx.fillStyle = 'rgba(255,255,255,0.3)';
            } else {
                ctx.fillStyle = '#ffffff';
            }

            const scoreText = score.toFixed(1);
            const scoreY = cardY + cardH * 0.55;
            ctx.fillText(scoreText, x + cardW / 2, scoreY);

            // Strikethrough line for dropped scores
            if (isDropped && cardProgress >= 0.8) {
                const textW = ctx.measureText(scoreText).width;
                ctx.strokeStyle = 'rgba(255,80,80,0.7)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x + cardW / 2 - textW / 2 - 3, scoreY);
                ctx.lineTo(x + cardW / 2 + textW / 2 + 3, scoreY);
                ctx.stroke();

                // "Strøket" label (dropped)
                ctx.fillStyle = 'rgba(255,80,80,0.5)';
                ctx.font = `${Math.min(cardW * 0.15, 9)}px sans-serif`;
                ctx.fillText(i === lowestIdx ? 'LAV' : 'HØY', x + cardW / 2, cardY + cardH - 10);
            }

            ctx.restore();
        }
    }

    // -------------------------------------------------------------------
    // Score breakdown
    // -------------------------------------------------------------------

    _renderBreakdown(ctx, width, height, d) {
        // Only show after cards have mostly appeared
        const breakdownProgress = Math.max(0, Math.min(1, (d.animationProgress - 0.6) / 0.2));
        if (breakdownProgress <= 0) return;

        ctx.save();
        ctx.globalAlpha = breakdownProgress;

        const startY = height * 0.46;
        const lineHeight = 38;
        const labelX = width * 0.18;
        const valueX = width * 0.82;

        const rows = [
            { label: 'Lengdepoeng', value: d.distancePoints, color: '#88ccff' },
            { label: 'Stilpoeng', value: d.stylePoints, color: '#88ffaa' },
            { label: 'Vindkompensasjon', value: d.windComp, color: d.windComp >= 0 ? '#aaffaa' : '#ffaa88' },
        ];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const y = startY + i * lineHeight;
            const rowAlpha = Math.max(0, Math.min(1, (breakdownProgress - i * 0.15) / 0.4));

            if (rowAlpha <= 0) continue;

            ctx.save();
            ctx.globalAlpha *= rowAlpha;

            // Background bar
            ctx.fillStyle = 'rgba(255,255,255,0.04)';
            this._roundRect(ctx, labelX - 10, y - 14, valueX - labelX + 50, 30, 6);
            ctx.fill();

            // Label
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.font = `${Math.min(width * 0.038, 15)}px sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(row.label, labelX, y);

            // Value
            ctx.fillStyle = row.color;
            ctx.font = `bold ${Math.min(width * 0.042, 17)}px sans-serif`;
            ctx.textAlign = 'right';
            const prefix = row.value >= 0 && row.label === 'Vindkompensasjon' ? '+' : '';
            ctx.fillText(`${prefix}${row.value.toFixed(1)}`, valueX, y);

            ctx.restore();
        }

        // Divider line before total
        const divY = startY + rows.length * lineHeight - 4;
        const divProgress = Math.max(0, Math.min(1, (breakdownProgress - 0.5) / 0.3));
        if (divProgress > 0) {
            ctx.save();
            ctx.globalAlpha *= divProgress;
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 1;
            const divW = (valueX - labelX + 50) * divProgress;
            ctx.beginPath();
            ctx.moveTo(labelX - 10, divY);
            ctx.lineTo(labelX - 10 + divW, divY);
            ctx.stroke();
            ctx.restore();
        }

        ctx.restore();
    }

    // -------------------------------------------------------------------
    // Total score
    // -------------------------------------------------------------------

    _renderTotal(ctx, width, height, d) {
        const totalProgress = Math.max(0, Math.min(1, (d.animationProgress - 0.85) / 0.15));
        if (totalProgress <= 0) return;

        const y = height * 0.66;

        ctx.save();

        // Scale-in effect
        const scale = this._easeOutBack(totalProgress);
        ctx.translate(width / 2, y);
        ctx.scale(scale, scale);
        ctx.translate(-width / 2, -y);
        ctx.globalAlpha = Math.min(1, totalProgress * 2);

        // Background pill
        const pillW = Math.min(width * 0.6, 240);
        const pillH = 60;
        const pillX = (width - pillW) / 2;
        const pillY = y - pillH / 2;

        const grad = ctx.createLinearGradient(pillX, pillY, pillX, pillY + pillH);
        grad.addColorStop(0, 'rgba(40,60,100,0.7)');
        grad.addColorStop(1, 'rgba(20,35,65,0.7)');
        ctx.fillStyle = grad;
        this._roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
        ctx.fill();

        // Border glow
        ctx.strokeStyle = 'rgba(100,180,255,0.4)';
        ctx.lineWidth = 2;
        ctx.shadowColor = 'rgba(100,180,255,0.5)';
        ctx.shadowBlur = 16;
        this._roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // "Totalpoeng" label
        ctx.fillStyle = 'rgba(200,220,255,0.6)';
        ctx.font = `${Math.min(width * 0.032, 13)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('TOTALPOENG', width / 2, y - 6);

        // Score number with glow
        ctx.shadowColor = 'rgba(150,220,255,0.8)';
        ctx.shadowBlur = 20;
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.min(width * 0.08, 32)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(d.totalPoints.toFixed(1), width / 2, y - 2);

        ctx.restore();

        // Tap to continue hint (appears at the end)
        if (totalProgress >= 1) {
            const pulse = 0.4 + Math.sin(this._time * 4) * 0.3;
            ctx.save();
            ctx.globalAlpha = pulse;
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.font = `${Math.min(width * 0.035, 14)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Trykk for å fortsette', width / 2, height * 0.82);
            ctx.restore();
        }
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
