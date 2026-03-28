/**
 * AssetLoader.js - Lightweight asset loader for Vinter-OL Spill
 *
 * Since sounds are generated procedurally (AudioManager) and graphics are
 * drawn on canvas (Renderer), this loader currently handles JSON data only
 * (hill profiles, competition configs, etc.).  It can be extended later for
 * images or other asset types.
 */

export default class AssetLoader {
  constructor() {
    /** @type {Map<string, any>} Cached assets keyed by name */
    this._cache = new Map();

    /** Total items requested in the current loadAll batch */
    this._totalItems = 0;

    /** Items loaded so far in the current batch */
    this._loadedItems = 0;
  }

  // -----------------------------------------------------------------------
  // JSON
  // -----------------------------------------------------------------------

  /**
   * Fetch and parse a JSON file. The result is stored in the cache under
   * the given URL (or an explicit key if provided via loadAll).
   *
   * @param {string} url
   * @param {string} [key] – optional cache key (defaults to url)
   * @returns {Promise<any>} parsed JSON
   */
  async loadJSON(url, key) {
    const cacheKey = key || url;

    // Return from cache if already loaded
    if (this._cache.has(cacheKey)) {
      return this._cache.get(cacheKey);
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`AssetLoader: failed to fetch ${url} (${response.status})`);
    }

    const data = await response.json();
    this._cache.set(cacheKey, data);
    return data;
  }

  /**
   * Retrieve a previously loaded JSON asset by its cache key.
   *
   * @param {string} key
   * @returns {any|undefined}
   */
  getJSON(key) {
    return this._cache.get(key);
  }

  // -----------------------------------------------------------------------
  // Batch loading
  // -----------------------------------------------------------------------

  /**
   * Load multiple assets described by a manifest array.
   *
   * Each entry: `{ type: 'json', key: 'hillProfile', url: '/data/hill.json' }`
   *
   * @param {Array<{type: string, key: string, url: string}>} manifest
   * @returns {Promise<void>}
   */
  async loadAll(manifest) {
    if (!manifest || manifest.length === 0) return;

    this._totalItems = manifest.length;
    this._loadedItems = 0;

    const promises = manifest.map(async (entry) => {
      try {
        switch (entry.type) {
          case 'json':
            await this.loadJSON(entry.url, entry.key);
            break;
          default:
            console.warn(`AssetLoader: unsupported asset type "${entry.type}" for key "${entry.key}"`);
            break;
        }
      } catch (err) {
        console.error(`AssetLoader: error loading "${entry.key}":`, err);
      } finally {
        this._loadedItems++;
      }
    });

    await Promise.all(promises);
  }

  // -----------------------------------------------------------------------
  // Status queries
  // -----------------------------------------------------------------------

  /**
   * Check whether an asset with the given key has been loaded.
   *
   * @param {string} key
   * @returns {boolean}
   */
  isLoaded(key) {
    return this._cache.has(key);
  }

  /**
   * Returns loading progress as a number between 0 and 1.
   * If no batch load is in progress (totalItems === 0), returns 1.
   *
   * @returns {number}
   */
  getProgress() {
    if (this._totalItems === 0) return 1;
    return this._loadedItems / this._totalItems;
  }
}
