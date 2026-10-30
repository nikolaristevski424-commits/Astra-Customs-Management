const test = require('node:test');
const assert = require('node:assert/strict');
const verify = require('../utils/accountVerification');
const rogoid = require('../utils/rogoid');

const GUILD = '1488378242846036070';
const DISCORD = '1255248600850497568';
const OTHER = '1453383083913904234';
const ROBLOX = '1432640960';

test('RoGoid uses the documented api.rogoid.xyz v1 endpoint', async () => {
    assert.equal(rogoid.BASE_URL, 'https://api.rogoid.xyz/v1/verifications/');
    let calls = 0;
    const result = await rogoid.discordToRoblox(GUILD, DISCORD, {
        env: { ROGOID_API_KEY: 'rgd_test_secret', GUILD_ID: GUILD },
        get: async (url, config) => {
            calls++;
            assert.equal(url, 'https://api.rogoid.xyz/v1/verifications/' + DISCORD);
            assert.equal(config.headers.Authorization, 'Bearer rgd_test_secret');
            assert.ok(!url.includes('rgd_test_secret'));
            return { status: 200, data: { discordId: DISCORD, robloxId: ROBLOX,
                robloxUsername: 'TestUser', verificationMethod: 'oauth' } };
        }
    });
    assert.equal(result, ROBLOX);
    assert.equal(calls, 1);
});

test('RoGoid 404, mismatch and missing key cannot verify an account', async () => {
    assert.equal(await rogoid.discordToRoblox(GUILD, DISCORD, {
        env: { ROGOID_API_KEY: 'rgd_test_secret' },
        get: async () => ({ status: 404 })
    }), null);
    assert.equal(rogoid.readVerifiedAccount({ discordId: OTHER, robloxId: ROBLOX }, DISCORD), null);
    assert.equal(rogoid.readVerifiedAccount({ discordId: DISCORD, robloxId: 'abc' }, DISCORD), null);
    let calls = 0;
    assert.equal(await rogoid.discordToRoblox(GUILD, DISCORD, {
        env: {},
        get: async () => { calls++; return { status: 200, data: { discordId: DISCORD, robloxId: ROBLOX }}; }
    }), null);
    assert.equal(calls, 0);
});

test('Bloxlink takes priority; RoGoid is not contacted for a verified buyer', async () => {
    let secondaryCalls = 0;
    const result = await verify.verifyPurchaseBuyer(GUILD, ROBLOX, DISCORD, {
        bloxlinkLookup: async () => DISCORD,
        rogoidLookup: async () => { secondaryCalls++; return ROBLOX; }
    });
    assert.deepEqual(result, { userId: DISCORD, source: 'bloxlink' });
    assert.equal(secondaryCalls, 0);
});

test('When Bloxlink has no result, RoGoid can verify the reserved customer by matching Roblox IDs', async () => {
    const result = await verify.verifyPurchaseBuyer(GUILD, ROBLOX, DISCORD, {
        bloxlinkLookup: async () => null,
        rogoidLookup: async (guild, discord) => {
            assert.equal(guild, GUILD);
            assert.equal(discord, DISCORD);
            return ROBLOX;
        }
    });
    assert.deepEqual(result, { userId: DISCORD, source: 'rogoid' });
});

test('RoGoid never auto-verifies an unknown buyer without a reserved Discord customer', async () => {
    let calls = 0;
    const result = await verify.verifyPurchaseBuyer(GUILD, ROBLOX, null, {
        bloxlinkLookup: async () => null,
        rogoidLookup: async () => { calls++; return ROBLOX; }
    });
    assert.deepEqual(result, { userId: null, source: null });
    assert.equal(calls, 0);
});

test('RoGoid mismatches and provider errors fail closed', async () => {
    for (const rogoidLookup of [
        async () => '12345',
        async () => null,
        async () => { throw new Error('upstream offline'); }
    ]) {
        const result = await verify.verifyPurchaseBuyer(GUILD, ROBLOX, DISCORD, {
            bloxlinkLookup: async () => null, rogoidLookup
        });
        assert.deepEqual(result, { userId: null, source: null });
    }
});

test('Conflicting Bloxlink identity cannot be silently overridden by RoGoid', async () => {
    let calls = 0;
    const result = await verify.verifyPurchaseBuyer(GUILD, ROBLOX, DISCORD, {
        bloxlinkLookup: async () => OTHER,
        rogoidLookup: async () => { calls++; return ROBLOX; }
    });
    assert.deepEqual(result, { userId: OTHER, source: 'bloxlink' });
    assert.equal(calls, 0);
});

test('Standalone Discord-to-Roblox lookups use Bloxlink then RoGoid', async () => {
    let secondaryCalls = 0;
    const primary = await verify.discordToRobloxWithSource(GUILD, DISCORD, {
        bloxlinkLookup: async () => ROBLOX,
        rogoidLookup: async () => { secondaryCalls++; return ROBLOX; }
    });
    assert.deepEqual(primary, { userId: ROBLOX, source: 'bloxlink' });
    assert.equal(secondaryCalls, 0);
    const fallback = await verify.discordToRobloxWithSource(GUILD, DISCORD, {
        bloxlinkLookup: async () => null, rogoidLookup: async () => ROBLOX
    });
    assert.deepEqual(fallback, { userId: ROBLOX, source: 'rogoid' });
});
