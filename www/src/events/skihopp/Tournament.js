/**
 * Tournament.js - Competition mode for ski jumping
 * Manages multiple rounds with multiple jumpers (AI + human player).
 */

export default class Tournament {
  constructor(athletes, hillConfig, scoringSystem) {
    this.athletes = athletes.map((a, i) => ({
      ...a,
      id: i,
      jumps: [],
      totalPoints: 0,
      rank: 0,
    }));
    this.hillConfig = hillConfig;
    this.scoringSystem = scoringSystem;

    this.currentRound = 0;
    this.totalRounds = 2;
    this.currentJumperIndex = 0;
    this.isActive = false;
    this.isFinished = false;
  }

  start() {
    this.currentRound = 1;
    this.currentJumperIndex = 0;
    this.isActive = true;
    this.isFinished = false;

    for (const a of this.athletes) {
      a.jumps = [];
      a.totalPoints = 0;
      a.rank = 0;
    }
  }

  getCurrentJumper() {
    return this.athletes[this.currentJumperIndex] || null;
  }

  isHumanTurn() {
    const jumper = this.getCurrentJumper();
    return jumper && jumper.isHuman === true;
  }

  /**
   * Simulate an AI jump based on the athlete's skill level.
   * Returns a score result object.
   */
  simulateAIJump(wind) {
    const athlete = this.getCurrentJumper();
    if (!athlete || athlete.isHuman) return null;

    const skill = athlete.skill;
    const randomFactor = 0.85 + Math.random() * 0.3; // 0.85 - 1.15

    // Simulate jump parameters based on skill
    const maxDistance = this.hillConfig.hillSize;
    const kPoint = this.hillConfig.kPoint;
    const baseDistance = kPoint * (0.8 + skill * 0.25);
    const distance = baseDistance * randomFactor;

    const takeoffQuality = Math.min(1, skill * (0.7 + Math.random() * 0.4));
    const flightStability = Math.min(1, skill * (0.6 + Math.random() * 0.5));
    const landingQuality = Math.min(1, skill * (0.5 + Math.random() * 0.6));

    const result = this.scoringSystem.calculateScore({
      distance,
      takeoffQuality,
      flightStability,
      landingQuality,
      windSpeed: wind ? wind.getSpeed() : 0.5 + Math.random() * 1.5,
      windDirection: wind ? wind.getDirection() : Math.random() * 360,
      gate: this.hillConfig.defaultGate,
      jumperNationality: athlete.country || null,
    });

    return { ...result, distance, athleteName: athlete.name, country: athlete.country };
  }

  /**
   * Record a jump result for the current jumper.
   */
  recordJump(result) {
    const athlete = this.getCurrentJumper();
    if (!athlete) return;

    athlete.jumps.push({
      round: this.currentRound,
      distance: result.distance,
      totalPoints: result.totalPoints,
      judges: result.judges,
      distancePoints: result.distancePoints,
      stylePoints: result.stylePoints,
    });

    athlete.totalPoints = athlete.jumps.reduce((sum, j) => sum + j.totalPoints, 0);
  }

  /**
   * Advance to the next jumper. Returns status object.
   */
  nextJumper(wind) {
    this.currentJumperIndex++;

    if (this.currentJumperIndex >= this.athletes.length) {
      // End of round
      if (this.currentRound >= this.totalRounds) {
        this._calculateRankings();
        this.isFinished = true;
        this.isActive = false;
        return { status: 'finished', rankings: this.getRankings() };
      }

      // Start next round - in round 2, only top 30 jump (or all if fewer)
      this.currentRound++;
      this.currentJumperIndex = 0;

      // Shift wind conditions for the new round
      if (wind && typeof wind.shiftForNewRound === 'function') {
        wind.shiftForNewRound();
      }

      if (this.currentRound === 2) {
        this._calculateRankings();
        // Reverse order for round 2 (worst first, best last)
        this.athletes.sort((a, b) => a.totalPoints - b.totalPoints);
      }

      return { status: 'newRound', round: this.currentRound };
    }

    return { status: 'nextJumper', jumper: this.getCurrentJumper() };
  }

  _calculateRankings() {
    const sorted = [...this.athletes].sort((a, b) => b.totalPoints - a.totalPoints);
    sorted.forEach((a, i) => { a.rank = i + 1; });
  }

  getRankings() {
    this._calculateRankings();
    return [...this.athletes].sort((a, b) => a.rank - b.rank);
  }

  getMedalists() {
    const rankings = this.getRankings();
    return {
      gold: rankings[0] || null,
      silver: rankings[1] || null,
      bronze: rankings[2] || null,
    };
  }

  getStandings() {
    return this.getRankings().map(a => ({
      rank: a.rank,
      name: a.name,
      country: a.country,
      isHuman: a.isHuman || false,
      jumps: a.jumps,
      totalPoints: Math.round(a.totalPoints * 10) / 10,
    }));
  }

  getRoundInfo() {
    return {
      round: this.currentRound,
      totalRounds: this.totalRounds,
      jumperNumber: this.currentJumperIndex + 1,
      totalJumpers: this.athletes.length,
      isHumanTurn: this.isHumanTurn(),
    };
  }
}
