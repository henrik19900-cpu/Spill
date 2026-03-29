const PREFIX = 'vinterol_';

export default class Storage {
  /**
   * Save a value to localStorage under the prefixed key.
   * @param {string} key
   * @param {*} value - Will be JSON-stringified
   */
  save(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) {
      console.warn(`Storage.save failed for key "${key}":`, e);
    }
  }

  /**
   * Load a value from localStorage.
   * @param {string} key
   * @param {*} defaultValue - Returned if key is missing or parse fails
   * @returns {*}
   */
  load(key, defaultValue = null) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw === null) return defaultValue;
      return JSON.parse(raw);
    } catch (e) {
      console.warn(`Storage.load failed for key "${key}":`, e);
      return defaultValue;
    }
  }

  /**
   * Remove a single key from localStorage.
   * @param {string} key
   */
  remove(key) {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch (e) {
      console.warn(`Storage.remove failed for key "${key}":`, e);
    }
  }

  /**
   * Clear all game data (keys with the vinterol_ prefix).
   */
  clear() {
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch (e) {
      console.warn('Storage.clear failed:', e);
    }
  }
}
