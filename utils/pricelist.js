const store = require('./store');
const { defaultPricelist } = require('./pricelistDefaults');

const STORE = 'pricelist';

function getPricelist(guildId) {
    const defaults = defaultPricelist();
    const saved = store.get(STORE, guildId, defaults);
    return {
        ...defaults,
        ...saved,
        commandPacks: saved.commandPacks || defaults.commandPacks,
        singleCommands: saved.singleCommands || defaults.singleCommands,
        products: saved.products || defaults.products,
        basicPack: { ...defaults.basicPack, ...(saved.basicPack || {}) },
        basicPackAddons: saved.basicPackAddons || defaults.basicPackAddons,
        fullPack: { ...defaults.fullPack, ...(saved.fullPack || {}) },
    };
}

/** Every priceable item flattened, tagged with which section + index it lives at (for autocomplete / setprice). */
function flatten(guildId) {
    const pl = getPricelist(guildId);
    const items = [];
    pl.commandPacks.forEach((item, i) => items.push({ section: 'commandPacks', index: i, ...item }));
    pl.singleCommands.forEach((item, i) => items.push({ section: 'singleCommands', index: i, ...item }));
    pl.products.forEach((item, i) => items.push({ section: 'products', index: i, ...item }));
    items.push({ section: 'basicPack', index: null, name: pl.basicPack.name, price: pl.basicPack.price });
    pl.basicPackAddons.forEach((item, i) => items.push({ section: 'basicPackAddons', index: i, ...item }));
    items.push({ section: 'fullPack', index: null, name: pl.fullPack.name, price: pl.fullPack.price });
    return items;
}

function setPrice(guildId, section, index, price) {
    return store.update(STORE, guildId, defaultPricelist(), (pl) => {
        if (section === 'basicPack') pl.basicPack.price = price;
        else if (section === 'fullPack') pl.fullPack.price = price;
        else if (Array.isArray(pl[section]) && pl[section][index]) pl[section][index].price = price;
        return pl;
    });
}

module.exports = { getPricelist, flatten, setPrice };
