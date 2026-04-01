/**
 * smoke.mjs - Minimal smoke test for the Vinter-OL ski jumping codebase
 *
 * Validates that all modules parse, export the expected symbols, core classes
 * instantiate without throwing, and basic game logic (physics, scoring, wind)
 * produces sane results.
 *
 * Run:  node --experimental-vm-modules tests/smoke.mjs
 *       (or simply: node tests/smoke.mjs  on Node >= 22)
 */

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// Minimal browser-API shims so modules that reference DOM/Canvas don't crash
// on import.
// ---------------------------------------------------------------------------

globalThis.addEventListener = globalThis.addEventListener || (() => {});
globalThis.removeEventListener = globalThis.removeEventListener || (() => {});
globalThis.location = { search: '', href: '', pathname: '/', hash: '' };
globalThis.history = { pushState: () => {}, replaceState: () => {} };
globalThis.window = globalThis;
globalThis.document = {
    createElement: (tag) => {
        if (tag === 'canvas') {
            return {
                width: 390, height: 844,
                getContext: () => createMockCtx(),
                style: {},
                addEventListener: () => {},
            };
        }
        return { style: {}, addEventListener: () => {}, appendChild: () => {} };
    },
    getElementById: () => ({
        getContext: () => createMockCtx(),
        width: 390, height: 844,
        style: {},
        addEventListener: () => {},
        appendChild: () => {},
    }),
    addEventListener: () => {},
    body: { appendChild: () => {}, style: {} },
    documentElement: { style: {} },
    querySelector: () => null,
    querySelectorAll: () => [],
};
Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'node-smoke-test', vibrate: () => {}, maxTouchPoints: 0 },
    writable: true, configurable: true,
});
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.AudioContext = class AudioContext {
    constructor() { this.state = 'suspended'; }
    createGain() { return { gain: { value: 1, setValueAtTime: () => {} }, connect: () => {}, disconnect: () => {} }; }
    createOscillator() { return { type: 'sine', frequency: { value: 440, setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, connect: () => {}, start: () => {}, stop: () => {}, addEventListener: () => {} }; }
    createDynamicsCompressor() { return { threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 }, connect: () => {} }; }
    createBiquadFilter() { return { type: 'lowpass', frequency: { value: 0, setValueAtTime: () => {}, linearRampToValueAtTime: () => {} }, Q: { value: 0 }, connect: () => {}, disconnect: () => {} }; }
    resume() { return Promise.resolve(); }
    get currentTime() { return 0; }
    get destination() { return {}; }
};
globalThis.webkitAudioContext = globalThis.AudioContext;
globalThis.localStorage = {
    _data: {},
    getItem(k) { return this._data[k] ?? null; },
    setItem(k, v) { this._data[k] = String(v); },
    removeItem(k) { delete this._data[k]; },
};
globalThis.Image = class Image {
    constructor() { this.onload = null; this.onerror = null; }
    set src(_) { if (this.onload) setTimeout(this.onload, 0); }
};
globalThis.matchMedia = () => ({ matches: false, addEventListener: () => {} });
globalThis.screen = { orientation: { type: 'portrait-primary', addEventListener: () => {} } };
globalThis.innerWidth = 390;
globalThis.innerHeight = 844;
globalThis.devicePixelRatio = 2;
globalThis.performance = globalThis.performance || { now: () => Date.now() };

function createMockGradient() {
    return { addColorStop: () => {} };
}

function createMockCtx() {
    const noop = () => {};
    const gradientFn = () => createMockGradient();
    return new Proxy({}, {
        get(target, prop) {
            if (prop === 'canvas') return { width: 390, height: 844 };
            if (prop === 'createLinearGradient') return gradientFn;
            if (prop === 'createRadialGradient') return gradientFn;
            if (prop === 'createPattern') return () => ({});
            if (prop === 'measureText') return () => ({ width: 10 });
            if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
            if (prop in target) return target[prop];
            return typeof prop === 'string' ? noop : undefined;
        },
        set(target, prop, value) { target[prop] = value; return true; },
    });
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  PASS  ${name}`);
    } catch (err) {
        failed++;
        console.error(`  FAIL  ${name}`);
        console.error(`        ${err.message}`);
    }
}

async function testAsync(name, fn) {
    try {
        await fn();
        passed++;
        console.log(`  PASS  ${name}`);
    } catch (err) {
        failed++;
        console.error(`  FAIL  ${name}`);
        console.error(`        ${err.message}`);
    }
}

// ---------------------------------------------------------------------------
// 1. JSON data files
// ---------------------------------------------------------------------------

console.log('\n=== JSON Data Files ===');

const hillsData = JSON.parse(readFileSync('www/src/data/hills.json', 'utf8'));
const configData = JSON.parse(readFileSync('www/src/data/config.json', 'utf8'));
const athletesData = JSON.parse(readFileSync('www/src/data/athletes.json', 'utf8'));

test('hills.json has K90, K120', () => {
    assert.ok(hillsData.K90, 'Missing K90');
    assert.ok(hillsData.K120, 'Missing K120');
    assert.ok(hillsData.K90.kPoint === 90);
    assert.ok(hillsData.K120.kPoint === 120);
});

test('config.json parses', () => {
    assert.ok(typeof configData === 'object');
});

test('athletes.json is non-empty array or object', () => {
    if (Array.isArray(athletesData)) assert.ok(athletesData.length > 0);
    else assert.ok(Object.keys(athletesData).length > 0);
});

// ---------------------------------------------------------------------------
// 2. Core module imports
// ---------------------------------------------------------------------------

console.log('\n=== Module Imports ===');

const { Vec2, GRAVITY, clamp, lerp, degToRad, radToDeg, smoothstep, turbulenceNoise } =
    await import('../www/src/core/Physics.js');

test('Physics exports Vec2 class', () => {
    assert.ok(typeof Vec2 === 'function');
    const v = new Vec2(3, 4);
    assert.ok(Math.abs(v.length() - 5) < 0.001);
});

test('Physics exports utility functions', () => {
    assert.ok(Math.abs(GRAVITY - 9.81) < 0.01);
    assert.equal(clamp(5, 0, 3), 3);
    assert.equal(clamp(-1, 0, 3), 0);
    assert.ok(Math.abs(lerp(0, 10, 0.5) - 5) < 0.001);
    assert.ok(Math.abs(degToRad(180) - Math.PI) < 0.001);
    assert.ok(Math.abs(radToDeg(Math.PI) - 180) < 0.001);
});

const { GameState } = await import('../www/src/core/Game.js');

test('GameState enum exists with expected phases', () => {
    assert.ok(GameState.INRUN, 'Missing INRUN');
    assert.ok(GameState.FLIGHT, 'Missing FLIGHT');
    assert.ok(GameState.LANDING, 'Missing LANDING');
});

// ---------------------------------------------------------------------------
// 3. Event modules - Hill, Wind, Jumper, ScoringSystem, Physics
// ---------------------------------------------------------------------------

console.log('\n=== Ski Jumping Core Classes ===');

const HillMod = await import('../www/src/events/skihopp/Hill.js');
const Hill = HillMod.default;

test('Hill instantiates from K90 config', () => {
    const hill = new Hill(hillsData.K90);
    assert.equal(hill.kPoint, 90);
    assert.equal(hill.name, hillsData.K90.name);
});

test('Hill generates profile points', () => {
    const hill = new Hill(hillsData.K120);
    // The hill should have generated inrun, table, landing, outrun points
    const profile = hill.getFullProfile ? hill.getFullProfile() : null;
    // At minimum, the internal arrays should be populated
    assert.ok(hill._inrunPoints.length > 0, 'No inrun points generated');
    assert.ok(hill._landingPoints.length > 0, 'No landing points generated');
});

const WindMod = await import('../www/src/events/skihopp/Wind.js');
const Wind = WindMod.default;

test('Wind instantiates and updates', () => {
    const wind = new Wind();
    // Update for a few ticks
    for (let i = 0; i < 10; i++) {
        wind.update(0.016);
    }
    // Speed should be a number in valid range
    const speed = wind.getSpeed ? wind.getSpeed() : wind._speed;
    assert.ok(typeof speed === 'number', 'Wind speed is not a number');
    assert.ok(speed >= 0 && speed <= 10, `Wind speed out of range: ${speed}`);
});

const JumperMod = await import('../www/src/events/skihopp/Jumper.js');
const Jumper = JumperMod.default;

test('Jumper instantiates with default state', () => {
    const j = new Jumper();
    assert.equal(j.x, 0);
    assert.equal(j.y, 0);
    assert.equal(j.phase, 'MENU');
    assert.equal(j.isAirborne, false);
});

const ScoringMod = await import('../www/src/events/skihopp/ScoringSystem.js');
const ScoringSystem = ScoringMod.default;

test('ScoringSystem instantiates with K90 config', () => {
    const scorer = new ScoringSystem(hillsData.K90);
    assert.equal(scorer.kPoint, 90);
});

test('ScoringSystem calculates distance points', () => {
    const scorer = new ScoringSystem(hillsData.K90);
    if (typeof scorer.distancePoints === 'function') {
        // Jumping exactly to K-point should give 60 points (FIS base)
        const pts = scorer.distancePoints(90);
        assert.ok(typeof pts === 'number', 'distancePoints did not return a number');
        assert.ok(pts > 0, `Distance points should be positive for K-point jump, got ${pts}`);
    }
});

const PhysicsMod = await import('../www/src/events/skihopp/SkihoppPhysics.js');
const SkihoppPhysics = PhysicsMod.default;

test('SkihoppPhysics instantiates via static init', () => {
    const hill = new Hill(hillsData.K90);
    const mockGame = {
        config: configData,
        state: GameState.INRUN,
    };
    const physics = SkihoppPhysics.init(mockGame, hill);
    assert.ok(physics instanceof SkihoppPhysics);
    assert.ok(physics.jumper, 'No jumper state created');
});

// ---------------------------------------------------------------------------
// 4. Data layer - Storage, ProgressionManager
// ---------------------------------------------------------------------------

console.log('\n=== Data Layer ===');

const StorageMod = await import('../www/src/data/Storage.js');
const Storage = StorageMod.default;

test('Storage save/load round-trip', () => {
    const store = new Storage();
    store.save('test_key', { score: 42 });
    const loaded = store.load('test_key');
    assert.deepEqual(loaded, { score: 42 });
});

test('Storage load returns default for missing key', () => {
    const store = new Storage();
    const val = store.load('nonexistent_key_12345', 'default_val');
    assert.equal(val, 'default_val');
});

// ---------------------------------------------------------------------------
// 5. Physics sanity checks
// ---------------------------------------------------------------------------

console.log('\n=== Physics Sanity ===');

test('Vec2 arithmetic', () => {
    const a = new Vec2(1, 2);
    const b = new Vec2(3, 4);
    const sum = a.add(b);
    assert.ok(Math.abs(sum.x - 4) < 0.001);
    assert.ok(Math.abs(sum.y - 6) < 0.001);
});

test('smoothstep returns values in [0,1]', () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1.0]) {
        const v = smoothstep(t);
        assert.ok(v >= 0 && v <= 1, `smoothstep(${t}) = ${v} out of range`);
    }
});

test('turbulenceNoise returns finite values', () => {
    for (let t = 0; t < 5; t += 0.5) {
        const v = turbulenceNoise(t, 42);
        assert.ok(Number.isFinite(v), `turbulenceNoise(${t}) = ${v} is not finite`);
    }
});

// ---------------------------------------------------------------------------
// 6. Cross-cutting: all 26 JS files parse as valid ES modules
// ---------------------------------------------------------------------------

console.log('\n=== Module Parse Check (all 26 files) ===');

const allFiles = [
    'www/src/core/AssetLoader.js',
    'www/src/core/AudioManager.js',
    'www/src/core/Game.js',
    'www/src/core/InputManager.js',
    'www/src/core/Physics.js',
    'www/src/core/Renderer.js',
    'www/src/data/ProgressionManager.js',
    'www/src/data/Storage.js',
    'www/src/events/skihopp/Hill.js',
    'www/src/events/skihopp/Jumper.js',
    'www/src/events/skihopp/ReplaySystem.js',
    'www/src/events/skihopp/ScoringSystem.js',
    'www/src/events/skihopp/SkihoppControls.js',
    'www/src/events/skihopp/SkihoppGame.js',
    'www/src/events/skihopp/SkihoppPhysics.js',
    'www/src/events/skihopp/SkihoppRenderer.js',
    'www/src/events/skihopp/Tournament.js',
    'www/src/events/skihopp/Wind.js',
    'www/src/ui/HUD.js',
    'www/src/ui/HillSelectScreen.js',
    'www/src/ui/JudgeDisplay.js',
    'www/src/ui/MenuScreen.js',
    'www/src/ui/Scoreboard.js',
    'www/src/ui/SettingsScreen.js',
    'www/src/ui/StatsScreen.js',
    'www/src/ui/TutorialScreen.js',
];

for (const file of allFiles) {
    await testAsync(`import ${file}`, async () => {
        await import(`../${file}`);
    });
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('\n' + '='.repeat(50));
console.log(`  Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('='.repeat(50));

if (failed > 0) {
    process.exit(1);
}
