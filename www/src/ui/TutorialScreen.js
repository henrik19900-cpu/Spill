/**
 * TutorialScreen.js - Quick tutorial/introduction before first jump
 * Shows the 4 phases of ski jumping with touch instructions.
 */

export default class TutorialScreen {
    constructor() {
        this._currentPage = 0;
        this._totalPages = 4;
        this._touchStartTime = 0;
        this._animTime = 0;
    }

    reset() {
        this._currentPage = 0;
        this._animTime = 0;
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
    }

    update(dt) {
        this._animTime += dt;
    }

    render(ctx, w, h) {
        // Dark overlay
        ctx.fillStyle = 'rgba(10, 10, 30, 0.92)';
        ctx.fillRect(0, 0, w, h);

        const cx = w / 2;
        const pages = [
            {
                title: 'TILLØP',
                icon: 'crouch',
                color: '#4488ff',
                desc: 'Hold fingeren på skjermen\nfor å holde tuck-posisjon.',
                hint: 'Jo bedre tuck, jo høyere fart!',
            },
            {
                title: 'AVHOPP',
                icon: 'takeoff',
                color: '#ff8844',
                desc: 'Slipp og TAP i riktig øyeblikk\nnår du når hoppkanten.',
                hint: 'Perfekt timing = lengre hopp!',
            },
            {
                title: 'SVEV',
                icon: 'flight',
                color: '#44ddff',
                desc: 'Dra fingeren OPP/NED\nfor å justere kroppsvinkelen.',
                hint: 'Optimal vinkel ≈ 35° for maks lengde',
            },
            {
                title: 'LANDING',
                icon: 'landing',
                color: '#44ff88',
                desc: 'TAP når du treffer bakken\nfor telemark-landing.',
                hint: 'God telemark = høyere stilpoeng!',
            },
        ];

        if (this._currentPage >= this._totalPages) return;

        const page = pages[this._currentPage];
        const pulse = 0.5 + 0.5 * Math.sin(this._animTime * 3);

        // Page indicator dots
        const dotY = h * 0.12;
        for (let i = 0; i < this._totalPages; i++) {
            ctx.beginPath();
            ctx.arc(cx - 30 + i * 20, dotY, i === this._currentPage ? 5 : 3, 0, Math.PI * 2);
            ctx.fillStyle = i === this._currentPage ? '#ffffff' : 'rgba(255,255,255,0.3)';
            ctx.fill();
        }

        // Phase number
        ctx.fillStyle = page.color;
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`FASE ${this._currentPage + 1} AV 4`, cx, h * 0.17);

        // Title
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 42px sans-serif';
        ctx.fillText(page.title, cx, h * 0.25);

        // Decorative line
        ctx.strokeStyle = page.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - 60, h * 0.29);
        ctx.lineTo(cx + 60, h * 0.29);
        ctx.stroke();

        // Draw phase illustration
        this._drawIllustration(ctx, cx, h * 0.42, page.icon, page.color, w);

        // Description
        ctx.fillStyle = '#ffffff';
        ctx.font = '20px sans-serif';
        const lines = page.desc.split('\n');
        lines.forEach((line, i) => {
            ctx.fillText(line, cx, h * 0.6 + i * 28);
        });

        // Hint box
        const hintY = h * 0.72;
        const hintW = w * 0.8;
        const hintH = 44;
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        this._roundRect(ctx, cx - hintW / 2, hintY - hintH / 2, hintW, hintH, 12);
        ctx.fill();
        ctx.fillStyle = page.color;
        ctx.font = '16px sans-serif';
        ctx.fillText(page.hint, cx, hintY);

        // "Tap to continue" / "Tap to start"
        const isLast = this._currentPage === this._totalPages - 1;
        const tapText = isLast ? 'TAP FOR Å STARTE' : 'TAP FOR Å FORTSETTE →';
        const tapAlpha = 0.5 + 0.5 * pulse;
        ctx.fillStyle = `rgba(255,255,255,${tapAlpha.toFixed(2)})`;
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText(tapText, cx, h * 0.88);

        // Skip hint
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '14px sans-serif';
        ctx.fillText(`${this._currentPage + 1} / ${this._totalPages}`, cx, h * 0.93);
    }

    _drawIllustration(ctx, cx, cy, icon, color, w) {
        ctx.save();
        ctx.translate(cx, cy);

        const s = Math.min(w * 0.15, 60); // scale

        switch (icon) {
            case 'crouch': {
                // Stick figure crouching with hand icon
                ctx.strokeStyle = color;
                ctx.lineWidth = 3;
                ctx.lineCap = 'round';
                // Slope line
                ctx.beginPath();
                ctx.moveTo(-s * 1.5, -s * 0.3);
                ctx.lineTo(s * 1.5, s * 0.8);
                ctx.strokeStyle = 'rgba(255,255,255,0.2)';
                ctx.stroke();
                // Crouched body
                ctx.strokeStyle = color;
                ctx.beginPath();
                ctx.arc(-s * 0.1, -s * 0.6, s * 0.2, 0, Math.PI * 2); // head
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(-s * 0.1, -s * 0.4);
                ctx.lineTo(s * 0.2, 0);
                ctx.lineTo(-s * 0.1, s * 0.2); // bent body
                ctx.stroke();
                // Skis
                ctx.strokeStyle = '#aaaaaa';
                ctx.beginPath();
                ctx.moveTo(-s * 0.5, s * 0.2);
                ctx.lineTo(s * 0.7, s * 0.2);
                ctx.stroke();
                // Hand icon
                this._drawHandIcon(ctx, s * 0.8, -s * 0.8, s * 0.5, 'HOLD');
                break;
            }
            case 'takeoff': {
                // Jumper at edge with timing ring
                ctx.strokeStyle = 'rgba(255,255,255,0.2)';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(-s * 1.5, s * 0.3);
                ctx.lineTo(0, 0);
                ctx.stroke();
                // Edge marker
                ctx.fillStyle = color;
                ctx.fillRect(-2, -4, 4, 8);
                // Jumper silhouette
                ctx.strokeStyle = color;
                ctx.beginPath();
                ctx.arc(s * 0.3, -s * 0.5, s * 0.15, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(s * 0.3, -s * 0.35);
                ctx.lineTo(s * 0.3, s * 0.1);
                ctx.stroke();
                // Timing ring
                const ringR = s * 0.7;
                const progress = (this._animTime * 0.5) % 1;
                ctx.strokeStyle = `rgba(255,136,68,${0.3 + 0.7 * progress})`;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(0, 0, ringR * progress, 0, Math.PI * 2);
                ctx.stroke();
                // Hand icon
                this._drawHandIcon(ctx, s * 0.8, -s * 0.8, s * 0.4, 'TAP!');
                break;
            }
            case 'flight': {
                // V-style jumper with angle arc
                ctx.strokeStyle = 'rgba(255,255,255,0.15)';
                ctx.lineWidth = 2;
                // Trajectory arc
                ctx.beginPath();
                ctx.moveTo(-s * 1.2, -s * 0.2);
                ctx.quadraticCurveTo(0, -s * 0.8, s * 1.2, s * 0.5);
                ctx.stroke();
                // Jumper body horizontal
                ctx.strokeStyle = color;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(-s * 0.1, -s * 0.45, s * 0.12, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(0, -s * 0.45);
                ctx.lineTo(s * 0.6, -s * 0.35);
                ctx.stroke();
                // V-style skis
                ctx.strokeStyle = '#aaaaaa';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(s * 0.6, -s * 0.35);
                ctx.lineTo(s * 1.2, -s * 0.6);
                ctx.moveTo(s * 0.6, -s * 0.35);
                ctx.lineTo(s * 1.2, -s * 0.1);
                ctx.stroke();
                // Angle indicator
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(s * 0.6, -s * 0.35, s * 0.4, -0.5, 0.5);
                ctx.stroke();
                ctx.fillStyle = color;
                ctx.font = 'bold 14px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('35°', s * 1.1, -s * 0.35);
                // Swipe arrows
                this._drawSwipeArrows(ctx, -s * 0.8, 0, s * 0.5);
                break;
            }
            case 'landing': {
                // Telemark pose
                ctx.strokeStyle = 'rgba(255,255,255,0.15)';
                ctx.lineWidth = 2;
                // Slope
                ctx.beginPath();
                ctx.moveTo(-s * 1.2, -s * 0.5);
                ctx.lineTo(s * 1.5, s * 0.3);
                ctx.stroke();
                // Telemark jumper
                ctx.strokeStyle = color;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(0, -s * 0.6, s * 0.13, 0, Math.PI * 2);
                ctx.stroke();
                // Body upright
                ctx.beginPath();
                ctx.moveTo(0, -s * 0.47);
                ctx.lineTo(0, -s * 0.1);
                ctx.stroke();
                // Split legs
                ctx.beginPath();
                ctx.moveTo(0, -s * 0.1);
                ctx.lineTo(s * 0.3, s * 0.05);
                ctx.moveTo(0, -s * 0.1);
                ctx.lineTo(-s * 0.25, s * 0.1);
                ctx.stroke();
                // Arms spread
                ctx.beginPath();
                ctx.moveTo(-s * 0.4, -s * 0.4);
                ctx.lineTo(0, -s * 0.3);
                ctx.lineTo(s * 0.4, -s * 0.4);
                ctx.stroke();
                // Hand icon
                this._drawHandIcon(ctx, s * 0.8, -s * 0.8, s * 0.4, 'TAP!');
                break;
            }
        }

        ctx.restore();
    }

    _drawHandIcon(ctx, x, y, size, label) {
        // Finger/hand circle
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Label
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x, y);
    }

    _drawSwipeArrows(ctx, x, y, size) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        // Up arrow
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - size);
        ctx.moveTo(x - 6, y - size + 8);
        ctx.lineTo(x, y - size);
        ctx.lineTo(x + 6, y - size + 8);
        ctx.stroke();
        // Down arrow
        ctx.beginPath();
        ctx.moveTo(x, y + 8);
        ctx.lineTo(x, y + 8 + size);
        ctx.moveTo(x - 6, y + size);
        ctx.lineTo(x, y + 8 + size);
        ctx.lineTo(x + 6, y + size);
        ctx.stroke();
        // Label
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('SVEIP', x, y + size + 24);
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
}
