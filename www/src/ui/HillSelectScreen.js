/**
 * HillSelectScreen.js - Hill selection UI for Vinter-OL Skihopp
 *
 * Renders directly to Canvas 2D context. Designed for mobile portrait (~390x844).
 * Shows hill cards with silhouettes, records, and lock states.
 */

export default class HillSelectScreen {
    /**
     * @param {object} progressionManager - must have isHillUnlocked(hillKey) method
     */
    constructor(progressionManager) {
        this._progression = progressionManager;

        this._hills = [
            {
                key: 'K90',
                name: 'Normalbakke K90',
                kPoint: 90,
                unlockHint: null,
            },
            {
                key: 'K120',
                name: 'Storbakke K120',
                kPoint: 120,
                unlockHint: 'L\u00e5s opp: 5 hopp over 80m p\u00e5 K90',
            },
            {
                key: 'K185',
                name: 'Vikersundbakken K185',
                kPoint: 185,
                unlockHint: 'L\u00e5s opp: 5 hopp over 115m p\u00e5 K120',
            },
        ];

        this._records = { K90: null, K120: null, K185: null };

        // Cached hit areas
        this._backRect = null;
        this._cardRects = []; // [{x, y, w, h, key, unlocked}]

        // Press state
        this._pressedCard = null;

        // Animation
        this._time = 0;
    }

    // -------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------

    /**
     * @param {object} records - e.g. {K90: 85.5, K120: 132.0, K185: null}
     */
    setRecords(records) {
        this._records = { ...this._records, ...records };
    }

    // -------------------------------------------------------------------
    // Rendering
    // -------------------------------------------------------------------

    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} width
     * @param {number} height
     */
    render(ctx, width, height) {
        this._time += 0.016;

        this._renderBackground(ctx, width, height);
        this._renderHeader(ctx, width, height);
        this._renderCards(ctx, width, height);
    }

    _renderBackground(ctx, width, height) {
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, '#020510');
        grad.addColorStop(0.3, '#081028');
        grad.addColorStop(0.6, '#0f1a3a');
        grad.addColorStop(1, '#0a1530');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
    }

    _renderHeader(ctx, width, height) {
        const headerY = 60;
        const fontSize = Math.min(width * 0.065, 26);

        // Back arrow hit area
        const arrowSize = 44;
        this._backRect = { x: 10, y: headerY - arrowSize / 2, w: arrowSize, h: arrowSize };

        // Back arrow
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.font = `400 ${Math.min(width * 0.07, 28)}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('\u2190', 20, headerY);
        ctx.restore();

        // Title
        ctx.save();
        ctx.fillStyle = '#e8f0ff';
        ctx.font = `700 ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('VELG BAKKE', width / 2, headerY);
        ctx.restore();

        // Separator
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(20, headerY + 30);
        ctx.lineTo(width - 20, headerY + 30);
        ctx.stroke();
        ctx.restore();
    }

    _renderCards(ctx, width, height) {
        this._cardRects = [];

        const padX = 20;
        const cardW = width - padX * 2;
        const cardH = 160;
        const cardGap = 16;
        const startY = 120;
        const cardR = 16;

        for (let i = 0; i < this._hills.length; i++) {
            const hill = this._hills[i];
            const cardX = padX;
            const cardY = startY + i * (cardH + cardGap);
            const unlocked = this._isUnlocked(hill.key);
            const isPressed = this._pressedCard === hill.key && unlocked;

            ctx.save();

            // Press scale animation
            if (isPressed) {
                ctx.translate(cardX + cardW / 2, cardY + cardH / 2);
                ctx.scale(0.97, 0.97);
                ctx.translate(-(cardX + cardW / 2), -(cardY + cardH / 2));
            }

            // Card background with gradient
            const cardGrad = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
            if (unlocked) {
                cardGrad.addColorStop(0, 'rgba(20,35,65,0.9)');
                cardGrad.addColorStop(1, 'rgba(15,25,50,0.95)');
            } else {
                cardGrad.addColorStop(0, 'rgba(15,20,35,0.7)');
                cardGrad.addColorStop(1, 'rgba(10,15,28,0.8)');
            }

            ctx.shadowColor = 'rgba(0,0,0,0.3)';
            ctx.shadowBlur = 10;
            ctx.shadowOffsetY = 4;
            ctx.fillStyle = cardGrad;
            this._roundRect(ctx, cardX, cardY, cardW, cardH, cardR);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;

            // Border
            ctx.strokeStyle = unlocked ? 'rgba(80,130,200,0.25)' : 'rgba(255,255,255,0.06)';
            ctx.lineWidth = 1;
            this._roundRect(ctx, cardX, cardY, cardW, cardH, cardR);
            ctx.stroke();

            // Left side: hill silhouette
            const silhouetteW = cardW * 0.35;
            ctx.save();
            ctx.beginPath();
            this._roundRect(ctx, cardX, cardY, silhouetteW, cardH, { tl: cardR, tr: 0, br: 0, bl: cardR });
            ctx.clip();
            this._renderHillSilhouette(ctx, cardX, cardY, silhouetteW, cardH, hill, unlocked);
            ctx.restore();

            // Right side: text info
            const textX = cardX + silhouetteW + 16;
            const textMaxW = cardW - silhouetteW - 32;

            if (unlocked) {
                this._renderCardTextUnlocked(ctx, textX, cardY, textMaxW, cardH, hill);
            } else {
                this._renderCardTextLocked(ctx, textX, cardY, textMaxW, cardH, hill);
            }

            // Locked overlay
            if (!unlocked) {
                ctx.save();
                ctx.fillStyle = 'rgba(5,8,18,0.55)';
                this._roundRect(ctx, cardX, cardY, cardW, cardH, cardR);
                ctx.fill();

                // Lock icon
                const lockSize = Math.min(width * 0.09, 36);
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.font = `${lockSize}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('\uD83D\uDD12', cardX + cardW / 2, cardY + cardH / 2 - 12);

                // Unlock hint
                if (hill.unlockHint) {
                    const hintSize = Math.min(width * 0.03, 12);
                    ctx.fillStyle = 'rgba(255,255,255,0.4)';
                    ctx.font = `400 ${hintSize}px sans-serif`;
                    ctx.fillText(hill.unlockHint, cardX + cardW / 2, cardY + cardH / 2 + 20);
                }

                ctx.restore();
            }

            ctx.restore();

            this._cardRects.push({ x: cardX, y: cardY, w: cardW, h: cardH, key: hill.key, unlocked });
        }
    }

    _renderHillSilhouette(ctx, x, y, w, h, hill, unlocked) {
        // Background gradient for silhouette area
        const grad = ctx.createLinearGradient(x, y, x, y + h);
        grad.addColorStop(0, unlocked ? 'rgba(10,20,45,0.8)' : 'rgba(8,12,25,0.8)');
        grad.addColorStop(1, unlocked ? 'rgba(8,15,35,0.9)' : 'rgba(5,8,18,0.9)');
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, w, h);

        // Draw hill profile line
        ctx.save();
        const lineColor = unlocked ? 'rgba(100,170,255,0.6)' : 'rgba(100,170,255,0.2)';
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        // Scale factor based on hill K-point for visual variety
        const scale = hill.kPoint / 185;  // normalize to K185

        ctx.beginPath();

        // Tower top
        const towerTopX = x + w * 0.25;
        const towerTopY = y + h * 0.15;

        // Starting from tower top
        ctx.moveTo(towerTopX, towerTopY);

        // In-run slope
        const inrunEndX = x + w * 0.55;
        const inrunEndY = y + h * (0.35 + scale * 0.1);
        ctx.lineTo(inrunEndX, inrunEndY);

        // Takeoff lip (slight curve up)
        const lipX = x + w * 0.60;
        const lipY = inrunEndY - 4;
        ctx.quadraticCurveTo(inrunEndX + (lipX - inrunEndX) * 0.5, inrunEndY - 2, lipX, lipY);

        // Landing hill (steep curve down)
        const landMidX = x + w * 0.72;
        const landMidY = y + h * (0.55 + scale * 0.1);
        const landEndX = x + w * 0.88;
        const landEndY = y + h * 0.82;
        ctx.quadraticCurveTo(landMidX, landMidY, landEndX, landEndY);

        // Outrun
        const outrunX = x + w * 0.98;
        const outrunY = y + h * 0.88;
        ctx.quadraticCurveTo(landEndX + 8, landEndY + 6, outrunX, outrunY);

        ctx.stroke();

        // Fill below the hill line
        ctx.lineTo(outrunX, y + h);
        ctx.lineTo(towerTopX, y + h);
        ctx.closePath();
        const fillGrad = ctx.createLinearGradient(x, y, x, y + h);
        fillGrad.addColorStop(0, unlocked ? 'rgba(40,80,160,0.15)' : 'rgba(40,80,160,0.05)');
        fillGrad.addColorStop(1, unlocked ? 'rgba(20,50,120,0.25)' : 'rgba(20,50,120,0.08)');
        ctx.fillStyle = fillGrad;
        ctx.fill();

        // Tower vertical line
        ctx.strokeStyle = unlocked ? 'rgba(100,170,255,0.3)' : 'rgba(100,170,255,0.1)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(towerTopX, towerTopY);
        ctx.lineTo(towerTopX, y + h * 0.92);
        ctx.stroke();

        ctx.restore();
    }

    _renderCardTextUnlocked(ctx, textX, cardY, maxW, cardH, hill) {
        const nameSize = Math.min(maxW * 0.12, 17);
        const detailSize = Math.min(maxW * 0.09, 13);
        const recordSize = Math.min(maxW * 0.09, 13);

        let lineY = cardY + 32;

        // Hill name
        ctx.save();
        ctx.fillStyle = '#e8f0ff';
        ctx.font = `700 ${nameSize}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(hill.name, textX, lineY);
        ctx.restore();
        lineY += 28;

        // K-punkt
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = `400 ${detailSize}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`K-punkt: ${hill.kPoint}m`, textX, lineY);
        ctx.restore();
        lineY += 24;

        // Record
        const record = this._records[hill.key];
        ctx.save();
        if (record != null) {
            ctx.fillStyle = '#d4a843';
            ctx.font = `600 ${recordSize}px sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(`Din rekord: ${record}m`, textX, lineY);
        } else {
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.font = `400 ${recordSize}px sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText('Ingen rekord', textX, lineY);
        }
        ctx.restore();

        // Subtle arrow indicator on the right
        lineY = cardY + cardH / 2;
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.font = `400 ${Math.min(maxW * 0.12, 18)}px sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText('\u203A', textX + maxW - 4, lineY);
        ctx.restore();
    }

    _renderCardTextLocked(ctx, textX, cardY, maxW, cardH, hill) {
        const nameSize = Math.min(maxW * 0.12, 17);
        const detailSize = Math.min(maxW * 0.09, 13);

        let lineY = cardY + 38;

        // Hill name (dimmed)
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = `700 ${nameSize}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(hill.name, textX, lineY);
        ctx.restore();
        lineY += 28;

        // K-punkt (dimmed)
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.font = `400 ${detailSize}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`K-punkt: ${hill.kPoint}m`, textX, lineY);
        ctx.restore();
    }

    // -------------------------------------------------------------------
    // Input handling
    // -------------------------------------------------------------------

    /**
     * @param {number} x
     * @param {number} y
     * @returns {string|null} hillKey ('K90', 'K120', 'K185') or null
     */
    handleTap(x, y) {
        // Back button
        if (this._backRect && this._hitTest(x, y, this._backRect)) {
            return 'back';
        }

        // Hill cards
        for (const card of this._cardRects) {
            if (!card.unlocked) continue;
            if (this._hitTest(x, y, card)) {
                this._pressedCard = card.key;
                setTimeout(() => { this._pressedCard = null; }, 150);
                return card.key;
            }
        }

        return null;
    }

    // -------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------

    _isUnlocked(hillKey) {
        if (!this._progression) return hillKey === 'K90';
        if (typeof this._progression.isHillUnlocked === 'function') {
            return this._progression.isHillUnlocked(hillKey);
        }
        // Fallback: K90 always unlocked
        return hillKey === 'K90';
    }

    _hitTest(x, y, rect) {
        return x >= rect.x && x <= rect.x + rect.w &&
               y >= rect.y && y <= rect.y + rect.h;
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
