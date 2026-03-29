/**
 * SettingsScreen.js - Settings UI for Vinter-OL Skihopp
 *
 * Renders directly to Canvas 2D context. Designed for mobile portrait (~390x844).
 * Provides volume slider, haptic toggle, difficulty selection, and control type.
 */

export default class SettingsScreen {
    /**
     * @param {object} settings - {volume: 70, haptic: true, difficulty: 'normal', controlType: 'swipe'}
     */
    constructor(settings = {}) {
        this._settings = {
            volume: settings.volume ?? 70,
            haptic: settings.haptic ?? true,
            difficulty: settings.difficulty ?? 'normal',
            controlType: settings.controlType ?? 'swipe',
        };

        // Cached hit areas (recalculated each render)
        this._backRect = null;
        this._saveRect = null;
        this._sliderRect = null;
        this._hapticToggleRect = null;
        this._difficultyRects = [];  // [{rect, value}]
        this._controlRects = [];     // [{rect, value}]

        // Animation
        this._time = 0;
        this._pressedButton = null;
    }

    // -------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------

    getSettings() {
        return { ...this._settings };
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
        this._renderVolumeRow(ctx, width, height);
        this._renderHapticRow(ctx, width, height);
        this._renderDifficultyRow(ctx, width, height);
        this._renderControlRow(ctx, width, height);
        this._renderSaveButton(ctx, width, height);
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
        ctx.fillText('INNSTILLINGER', width / 2, headerY);
        ctx.restore();

        // Separator line
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(20, headerY + 30);
        ctx.lineTo(width - 20, headerY + 30);
        ctx.stroke();
        ctx.restore();
    }

    _getRowY(index) {
        return 120 + index * 60;
    }

    _renderVolumeRow(ctx, width, height) {
        const rowY = this._getRowY(0);
        const padX = 24;
        const labelSize = Math.min(width * 0.04, 16);
        const valueSize = Math.min(width * 0.035, 14);

        // Label
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = `500 ${labelSize}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('Lyd volum', padX, rowY + 14);
        ctx.restore();

        // Value text
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.font = `600 ${valueSize}px sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${Math.round(this._settings.volume)}%`, width - padX, rowY + 14);
        ctx.restore();

        // Slider track
        const trackX = padX;
        const trackW = width - padX * 2;
        const trackY = rowY + 34;
        const trackH = 8;
        const trackR = trackH / 2;

        // Track background
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        this._roundRect(ctx, trackX, trackY, trackW, trackH, trackR);
        ctx.fill();

        // Track fill
        const fillW = (this._settings.volume / 100) * trackW;
        if (fillW > 0) {
            const fillGrad = ctx.createLinearGradient(trackX, trackY, trackX + fillW, trackY);
            fillGrad.addColorStop(0, '#1e56a0');
            fillGrad.addColorStop(1, '#3b82f6');
            ctx.fillStyle = fillGrad;
            this._roundRect(ctx, trackX, trackY, fillW, trackH, trackR);
            ctx.fill();
        }

        // Knob
        const knobX = trackX + fillW;
        const knobR = 10;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(knobX, trackY + trackH / 2, knobR, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;
        ctx.beginPath();
        ctx.arc(knobX, trackY + trackH / 2, knobR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Store slider rect (expanded hit area)
        this._sliderRect = { x: trackX, y: trackY - 14, w: trackW, h: trackH + 28, trackX, trackW };
    }

    _renderHapticRow(ctx, width, height) {
        const rowY = this._getRowY(1);
        const padX = 24;
        const labelSize = Math.min(width * 0.04, 16);

        // Label
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = `500 ${labelSize}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('Haptic feedback', padX, rowY + 30);
        ctx.restore();

        // Toggle switch
        const toggleW = 56;
        const toggleH = 30;
        const toggleX = width - padX - toggleW;
        const toggleY = rowY + 30 - toggleH / 2;
        const toggleR = toggleH / 2;

        ctx.save();
        // Track
        if (this._settings.haptic) {
            const grad = ctx.createLinearGradient(toggleX, toggleY, toggleX + toggleW, toggleY);
            grad.addColorStop(0, '#1e56a0');
            grad.addColorStop(1, '#3b82f6');
            ctx.fillStyle = grad;
        } else {
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
        }
        this._roundRect(ctx, toggleX, toggleY, toggleW, toggleH, toggleR);
        ctx.fill();

        // Knob
        const knobRadius = toggleH / 2 - 3;
        const knobCX = this._settings.haptic
            ? toggleX + toggleW - knobRadius - 4
            : toggleX + knobRadius + 4;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(knobCX, toggleY + toggleH / 2, knobRadius, 0, Math.PI * 2);
        ctx.fill();

        // ON/OFF text
        const statusSize = Math.min(width * 0.028, 11);
        ctx.fillStyle = this._settings.haptic ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)';
        ctx.font = `600 ${statusSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (this._settings.haptic) {
            ctx.fillText('ON', toggleX + 18, toggleY + toggleH / 2);
        } else {
            ctx.fillText('OFF', toggleX + toggleW - 18, toggleY + toggleH / 2);
        }

        ctx.restore();

        this._hapticToggleRect = { x: toggleX, y: toggleY, w: toggleW, h: toggleH };
    }

    _renderDifficultyRow(ctx, width, height) {
        const rowY = this._getRowY(2);
        const padX = 24;
        const labelSize = Math.min(width * 0.04, 16);

        // Label
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = `500 ${labelSize}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('Vanskelighetsgrad', padX, rowY + 14);
        ctx.restore();

        // 3 buttons
        const options = [
            { label: 'ENKEL', value: 'easy' },
            { label: 'NORMAL', value: 'normal' },
            { label: 'VANSKELIG', value: 'hard' },
        ];

        const btnGap = 8;
        const totalW = width - padX * 2;
        const btnW = (totalW - btnGap * (options.length - 1)) / options.length;
        const btnH = 34;
        const btnY = rowY + 32;
        const btnR = btnH / 2;
        const btnFontSize = Math.min(width * 0.03, 12);

        this._difficultyRects = [];

        for (let i = 0; i < options.length; i++) {
            const opt = options[i];
            const btnX = padX + i * (btnW + btnGap);
            const selected = this._settings.difficulty === opt.value;

            ctx.save();

            if (selected) {
                const grad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
                grad.addColorStop(0, '#2563b0');
                grad.addColorStop(1, '#1a4a8a');
                ctx.fillStyle = grad;
            } else {
                ctx.fillStyle = 'rgba(255,255,255,0.08)';
            }
            this._roundRect(ctx, btnX, btnY, btnW, btnH, btnR);
            ctx.fill();

            // Border
            ctx.strokeStyle = selected ? 'rgba(100,170,255,0.4)' : 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 1;
            this._roundRect(ctx, btnX, btnY, btnW, btnH, btnR);
            ctx.stroke();

            // Text
            ctx.fillStyle = selected ? '#ffffff' : 'rgba(255,255,255,0.5)';
            ctx.font = `${selected ? 700 : 500} ${btnFontSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(opt.label, btnX + btnW / 2, btnY + btnH / 2);

            ctx.restore();

            this._difficultyRects.push({ x: btnX, y: btnY, w: btnW, h: btnH, value: opt.value });
        }
    }

    _renderControlRow(ctx, width, height) {
        const rowY = this._getRowY(3) + 10;
        const padX = 24;
        const labelSize = Math.min(width * 0.04, 16);

        // Label
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = `500 ${labelSize}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('Kontroller', padX, rowY + 14);
        ctx.restore();

        // 2 buttons
        const options = [
            { label: 'SVEIP', value: 'swipe' },
            { label: 'TILT', value: 'tilt' },
        ];

        const btnGap = 12;
        const totalW = width - padX * 2;
        const btnW = (totalW - btnGap) / 2;
        const btnH = 34;
        const btnY = rowY + 32;
        const btnR = btnH / 2;
        const btnFontSize = Math.min(width * 0.035, 14);

        this._controlRects = [];

        for (let i = 0; i < options.length; i++) {
            const opt = options[i];
            const btnX = padX + i * (btnW + btnGap);
            const selected = this._settings.controlType === opt.value;

            ctx.save();

            if (selected) {
                const grad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
                grad.addColorStop(0, '#2563b0');
                grad.addColorStop(1, '#1a4a8a');
                ctx.fillStyle = grad;
            } else {
                ctx.fillStyle = 'rgba(255,255,255,0.08)';
            }
            this._roundRect(ctx, btnX, btnY, btnW, btnH, btnR);
            ctx.fill();

            ctx.strokeStyle = selected ? 'rgba(100,170,255,0.4)' : 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 1;
            this._roundRect(ctx, btnX, btnY, btnW, btnH, btnR);
            ctx.stroke();

            ctx.fillStyle = selected ? '#ffffff' : 'rgba(255,255,255,0.5)';
            ctx.font = `${selected ? 700 : 500} ${btnFontSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(opt.label, btnX + btnW / 2, btnY + btnH / 2);

            ctx.restore();

            this._controlRects.push({ x: btnX, y: btnY, w: btnW, h: btnH, value: opt.value });
        }
    }

    _renderSaveButton(ctx, width, height) {
        const padX = 24;
        const btnW = width - padX * 2;
        const btnH = 52;
        const btnX = padX;
        const btnY = height - 100;
        const btnR = btnH / 2;
        const isPressed = this._pressedButton === 'save';

        ctx.save();

        if (isPressed) {
            ctx.translate(btnX + btnW / 2, btnY + btnH / 2);
            ctx.scale(0.96, 0.96);
            ctx.translate(-(btnX + btnW / 2), -(btnY + btnH / 2));
        }

        // Blue pill button
        const grad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
        if (isPressed) {
            grad.addColorStop(0, '#1a4a8a');
            grad.addColorStop(1, '#163d72');
        } else {
            grad.addColorStop(0, '#2563b0');
            grad.addColorStop(0.5, '#1e56a0');
            grad.addColorStop(1, '#1a4a8a');
        }

        ctx.shadowColor = 'rgba(37,99,176,0.4)';
        ctx.shadowBlur = isPressed ? 6 : 12;
        ctx.shadowOffsetY = isPressed ? 1 : 4;

        ctx.fillStyle = grad;
        this._roundRect(ctx, btnX, btnY, btnW, btnH, btnR);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        // Border
        ctx.strokeStyle = 'rgba(100,170,255,0.3)';
        ctx.lineWidth = 1;
        this._roundRect(ctx, btnX, btnY, btnW, btnH, btnR);
        ctx.stroke();

        // Label
        const fontSize = Math.min(width * 0.048, 19);
        ctx.fillStyle = '#ffffff';
        ctx.font = `700 ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('LAGRE', btnX + btnW / 2, btnY + btnH / 2);

        ctx.restore();

        this._saveRect = { x: btnX, y: btnY, w: btnW, h: btnH };
    }

    // -------------------------------------------------------------------
    // Input handling
    // -------------------------------------------------------------------

    /**
     * @param {number} x
     * @param {number} y
     * @returns {string|null} 'back', 'save', or null
     */
    handleTap(x, y) {
        // Back button
        if (this._backRect && this._hitTest(x, y, this._backRect)) {
            return 'back';
        }

        // Save button
        if (this._saveRect && this._hitTest(x, y, this._saveRect)) {
            this._pressedButton = 'save';
            setTimeout(() => { this._pressedButton = null; }, 150);
            return 'save';
        }

        // Volume slider
        if (this._sliderRect && this._hitTest(x, y, this._sliderRect)) {
            const ratio = Math.max(0, Math.min(1,
                (x - this._sliderRect.trackX) / this._sliderRect.trackW));
            this._settings.volume = Math.round(ratio * 100);
            return null;
        }

        // Haptic toggle
        if (this._hapticToggleRect && this._hitTest(x, y, this._hapticToggleRect)) {
            this._settings.haptic = !this._settings.haptic;
            return null;
        }

        // Difficulty buttons
        for (const btn of this._difficultyRects) {
            if (this._hitTest(x, y, btn)) {
                this._settings.difficulty = btn.value;
                return null;
            }
        }

        // Control type buttons
        for (const btn of this._controlRects) {
            if (this._hitTest(x, y, btn)) {
                this._settings.controlType = btn.value;
                return null;
            }
        }

        return null;
    }

    // -------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------

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
