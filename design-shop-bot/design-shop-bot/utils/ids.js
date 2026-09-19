const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Random 6-letter ID like "#ABCXYZ", guaranteed unique against `existing` (a Set/array of ids). */
function generateId(existingIds = []) {
    const existing = new Set(existingIds);
    let id;
    do {
        id = '#' + Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
    } while (existing.has(id));
    return id;
}

module.exports = { generateId };
