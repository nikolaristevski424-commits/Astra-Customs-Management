const store = require('./store');
const KEY = 'purchaseReceipts';
function get(guildId, receiptKey) { return store.get(KEY, guildId, {})[receiptKey] || null; }
function update(guildId, receiptKey, patch) {
  return store.update(KEY, guildId, {}, (receipts) => {
    const current = receipts[receiptKey] || { key:receiptKey, createdAt:Date.now() };
    receipts[receiptKey] = { ...current, ...patch, updatedAt:Date.now() };
    return receipts;
  })[receiptKey];
}
function list(guildId) { return Object.values(store.get(KEY, guildId, {})); }
module.exports = { get, update, list };
