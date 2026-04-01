import Storage from './Storage.js';

const ACHIEVEMENTS_DEF = [
  { id: 'first_jump',      name: 'Første hopp',       description: 'Fullfør et hopp',                          icon: '🎿' },
  { id: 'k_point',         name: 'K-punkt!',          description: 'Land forbi K-punktet',                     icon: '🎯' },
  { id: 'perfect_takeoff', name: 'Perfekt timing',    description: 'Perfekt satskvalitet (>0.95)',              icon: '⚡' },
  { id: 'telemark_master', name: 'Telemark-mester',   description: '3 perfekte telemark-landinger p\u00e5 rad', icon: '🏅' },
  { id: 'century_jump',    name: '\u00c5rhundrehoppet', description: 'Over 140m p\u00e5 K120',                  icon: '💯' },
  { id: 'ski_flyer',       name: 'Flyger!',           description: 'Over 200m p\u00e5 K185',                   icon: '🦅' },
  { id: 'style_king',      name: 'Stildansen',        description: 'Stilkarakter over 55 (av 60)',              icon: '💃' },
  { id: 'wind_fighter',    name: 'Vindkjemper',       description: 'Godt hopp (>K) i sterk motvind (>2.5 m/s)', icon: '🌬️' },
];

// K-points per hill for reference
const K_POINTS = {
  K90: 90,
  K120: 120,
  K185: 185,
};

// XP required per level (cumulative thresholds)
function xpForLevel(level) {
  // Quadratic curve: level 2 = 100, level 3 = 250, etc.
  if (level <= 1) return 0;
  return Math.floor(50 * (level - 1) * level);
}

export default class ProgressionManager {
  constructor() {
    this.storage = new Storage();
    this._loadAll();
  }

  // ----------------------------------------------------------------
  // Internal persistence
  // ----------------------------------------------------------------

  _loadAll() {
    this.records = this.storage.load('records', {});           // { hillKey: distance }
    this.bestScores = this.storage.load('bestScores', {});     // { hillKey: points }
    this.jumpHistory = this.storage.load('jumpHistory', []);   // array of jump objects
    this.totalJumps = this.storage.load('totalJumps', 0);
    this.perfectTelemarks = this.storage.load('perfectTelemarks', 0); // consecutive count
    this.unlockedHills = this.storage.load('unlockedHills', ['K90']);
    this.achievements = this.storage.load('achievements', {});  // { id: true }
    this.xp = this.storage.load('xp', 0);
    this.level = this.storage.load('level', 1);
    this.settings = this.storage.load('settings', {
      volume: 0.8,
      haptic: true,
      difficulty: 'normal',
      controlType: 'tap',
    });
  }

  _saveAll() {
    this.storage.save('records', this.records);
    this.storage.save('bestScores', this.bestScores);
    this.storage.save('jumpHistory', this.jumpHistory);
    this.storage.save('totalJumps', this.totalJumps);
    this.storage.save('perfectTelemarks', this.perfectTelemarks);
    this.storage.save('unlockedHills', this.unlockedHills);
    this.storage.save('achievements', this.achievements);
    this.storage.save('xp', this.xp);
    this.storage.save('level', this.level);
    this.storage.save('settings', this.settings);
  }

  // ----------------------------------------------------------------
  // Records
  // ----------------------------------------------------------------

  getRecord(hillKey) {
    return this.records[hillKey] || 0;
  }

  setRecord(hillKey, distance) {
    if (distance > this.getRecord(hillKey)) {
      this.records[hillKey] = distance;
      this.storage.save('records', this.records);
    }
  }

  getRecords() {
    return { ...this.records };
  }

  getBestScore(hillKey) {
    return this.bestScores[hillKey] || 0;
  }

  setBestScore(hillKey, points) {
    if (points > this.getBestScore(hillKey)) {
      this.bestScores[hillKey] = points;
      this.storage.save('bestScores', this.bestScores);
    }
  }

  // ----------------------------------------------------------------
  // Stats / Jump tracking
  // ----------------------------------------------------------------

  getTotalJumps() {
    return this.totalJumps;
  }

  addJump(hillKey, distance, points, landingQuality) {
    const jumpData = {
      hillKey,
      distance,
      points,
      landingQuality,
      timestamp: Date.now(),
    };

    this.totalJumps++;
    this.storage.save('totalJumps', this.totalJumps);

    // Keep last 200 jumps to avoid unbounded growth
    this.jumpHistory.push(jumpData);
    if (this.jumpHistory.length > 200) {
      this.jumpHistory = this.jumpHistory.slice(-200);
    }
    this.storage.save('jumpHistory', this.jumpHistory);

    // Update records
    this.setRecord(hillKey, distance);
    this.setBestScore(hillKey, points);

    // Track consecutive perfect telemarks
    if (landingQuality === 'telemark') {
      this.perfectTelemarks++;
    } else {
      this.perfectTelemarks = 0;
    }
    this.storage.save('perfectTelemarks', this.perfectTelemarks);

    return jumpData;
  }

  getStats() {
    const bestDistances = { ...this.records };

    // Average score across all recorded jumps
    let totalPoints = 0;
    let perfectLandings = 0;
    const jumpsByHill = {};

    for (const jump of this.jumpHistory) {
      totalPoints += jump.points || 0;
      if (jump.landingQuality === 'telemark') {
        perfectLandings++;
      }
      if (!jumpsByHill[jump.hillKey]) {
        jumpsByHill[jump.hillKey] = 0;
      }
      jumpsByHill[jump.hillKey]++;
    }

    const avgScore = this.jumpHistory.length > 0
      ? totalPoints / this.jumpHistory.length
      : 0;

    return {
      totalJumps: this.totalJumps,
      bestDistances,
      avgScore: Math.round(avgScore * 10) / 10,
      perfectLandings,
      jumpsByHill,
      level: this.level,
      xp: this.xp,
    };
  }

  // ----------------------------------------------------------------
  // Hill Unlocks
  // ----------------------------------------------------------------

  isHillUnlocked(hillKey) {
    if (hillKey === 'K90') return true;
    return this.unlockedHills.includes(hillKey);
  }

  checkUnlocks() {
    const newlyUnlocked = [];

    // K120: 5 jumps over 80m on K90
    if (!this.unlockedHills.includes('K120')) {
      const k90Over80 = this.jumpHistory.filter(
        (j) => j.hillKey === 'K90' && j.distance >= 80
      ).length;
      if (k90Over80 >= 5) {
        this.unlockedHills.push('K120');
        newlyUnlocked.push('K120');
      }
    }

    // K185: 5 jumps over 130m on K120
    if (!this.unlockedHills.includes('K185')) {
      const k120Over130 = this.jumpHistory.filter(
        (j) => j.hillKey === 'K120' && j.distance >= 130
      ).length;
      if (k120Over130 >= 5) {
        this.unlockedHills.push('K185');
        newlyUnlocked.push('K185');
      }
    }

    if (newlyUnlocked.length > 0) {
      this.storage.save('unlockedHills', this.unlockedHills);
    }

    return newlyUnlocked;
  }

  getUnlockedHills() {
    return [...this.unlockedHills];
  }

  // ----------------------------------------------------------------
  // Achievements
  // ----------------------------------------------------------------

  getAchievements() {
    return ACHIEVEMENTS_DEF.map((def) => ({
      ...def,
      unlocked: !!this.achievements[def.id],
    }));
  }

  /**
   * Check and unlock achievements after a jump.
   * @param {Object} jumpData - { hillKey, distance, points, landingQuality,
   *                              takeoffQuality, styleScore, windSpeed }
   * @returns {Array} Newly unlocked achievement definitions
   */
  checkAchievements(jumpData) {
    const newlyUnlocked = [];

    const unlock = (id) => {
      if (!this.achievements[id]) {
        this.achievements[id] = true;
        const def = ACHIEVEMENTS_DEF.find((a) => a.id === id);
        if (def) newlyUnlocked.push({ ...def, unlocked: true });
      }
    };

    // first_jump - Complete a jump
    unlock('first_jump');

    // k_point - Land past the K-point
    const kPoint = K_POINTS[jumpData.hillKey] || 0;
    if (jumpData.distance >= kPoint && kPoint > 0) {
      unlock('k_point');
    }

    // perfect_takeoff - Takeoff quality > 0.95
    if (jumpData.takeoffQuality != null && jumpData.takeoffQuality > 0.95) {
      unlock('perfect_takeoff');
    }

    // telemark_master - 3 perfect telemarks in a row
    if (this.perfectTelemarks >= 3) {
      unlock('telemark_master');
    }

    // century_jump - Over 140m on K120
    if (jumpData.hillKey === 'K120' && jumpData.distance > 140) {
      unlock('century_jump');
    }

    // ski_flyer - Over 200m on K185
    if (jumpData.hillKey === 'K185' && jumpData.distance > 200) {
      unlock('ski_flyer');
    }

    // style_king - Style score over 55 (of 60)
    if (jumpData.styleScore != null && jumpData.styleScore > 55) {
      unlock('style_king');
    }

    // wind_fighter - Good jump (>K) in strong headwind (>2.5 m/s)
    if (
      jumpData.windSpeed != null &&
      jumpData.windSpeed > 2.5 &&
      jumpData.distance >= kPoint &&
      kPoint > 0
    ) {
      unlock('wind_fighter');
    }

    if (newlyUnlocked.length > 0) {
      this.storage.save('achievements', this.achievements);
    }

    return newlyUnlocked;
  }

  // ----------------------------------------------------------------
  // XP / Level
  // ----------------------------------------------------------------

  getLevel() {
    return this.level;
  }

  getXP() {
    return this.xp;
  }

  getXPForNextLevel() {
    return xpForLevel(this.level + 1);
  }

  /**
   * Add XP and level up if threshold is reached.
   * @param {number} amount
   * @returns {{ newLevel: boolean, level: number }} Whether the player leveled up
   */
  addXP(amount) {
    this.xp += Math.floor(amount);
    let leveled = false;

    // Check for level-ups (cap at 50)
    while (this.level < 50 && this.xp >= xpForLevel(this.level + 1)) {
      this.level++;
      leveled = true;
    }

    this.storage.save('xp', this.xp);
    this.storage.save('level', this.level);

    return { newLevel: leveled, level: this.level };
  }

  // ----------------------------------------------------------------
  // Streak / Combo
  // ----------------------------------------------------------------

  /**
   * Store the current combo-streak length (e.g. consecutive good jumps).
   * Called by SkihoppGame when comboCount >= 2.
   * @param {number} count
   */
  setStreak(count) {
    const prev = this.storage.load('bestStreak', 0);
    if (count > prev) {
      this.storage.save('bestStreak', count);
    }
  }

  getStreak() {
    return this.storage.load('bestStreak', 0);
  }

  // ----------------------------------------------------------------
  // Settings
  // ----------------------------------------------------------------

  getSettings() {
    return { ...this.settings };
  }

  saveSettings(settings) {
    this.settings = { ...this.settings, ...settings };
    this.storage.save('settings', this.settings);
  }
}
