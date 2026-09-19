// Tiny JSON-file "database". No MongoDB / Postgres required.
// Each file in /data is a single JSON object, cached in memory and
// flushed to disk on every write (writes are infrequent for this bot,
// so this is simpler and more portable than a real DB / ORM).

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const cache = new Map();

function filePath(name) {
    return path.join(DATA_DIR, `${name}.json`);
}

function load(name) {
    if (cache.has(name)) return cache.get(name);

    const fp = filePath(name);
    let data = {};
    if (fs.existsSync(fp)) {
        try {
            const raw = fs.readFileSync(fp, 'utf8').trim();
            data = raw ? JSON.parse(raw) : {};
        } catch (err) {
            console.error(`[store] Failed to parse data/${name}.json, starting fresh.`, err);
            data = {};
        }
    }
    cache.set(name, data);
    return data;
}

function save(name) {
    const data = cache.get(name) ?? {};
    fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2));
}

/**
 * Get the whole JSON object for a store (e.g. "orders").
 */
function all(name) {
    return load(name);
}

/**
 * Get a value at data[name][guildId], defaulting to `fallback` (and
 * persisting that default) if it doesn't exist yet.
 */
function get(name, guildId, fallback) {
    const data = load(name);
    if (!(guildId in data)) {
        data[guildId] = fallback;
        save(name);
    }
    return data[guildId];
}

/**
 * Set data[name][guildId] = value and persist immediately.
 */
function set(name, guildId, value) {
    const data = load(name);
    data[guildId] = value;
    save(name);
    return value;
}

/**
 * Mutate data[name][guildId] in place via `mutator(current)` then persist.
 * `mutator` may return a new value to replace the slot entirely.
 */
function update(name, guildId, fallback, mutator) {
    const data = load(name);
    if (!(guildId in data)) data[guildId] = fallback;
    const result = mutator(data[guildId]);
    if (result !== undefined) data[guildId] = result;
    save(name);
    return data[guildId];
}

module.exports = { all, get, set, update, save, load };
