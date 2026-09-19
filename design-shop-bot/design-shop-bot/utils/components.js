const { ActionRowBuilder, ButtonBuilder } = require('discord.js');

function findButtonRows(node) {
    const results = [];
    if (node?.data?.type === 1 && Array.isArray(node.components)) {
        results.push(node);
    }
    if (Array.isArray(node?.components)) {
        for (const child of node.components) results.push(...findButtonRows(child));
    }
    return results;
}

function traverseAndReplace(node, replacer) {
    const replaced = replacer(node);
    if (replaced !== node) return replaced;

    if (Array.isArray(node?.components)) {
        node.components = node.components.map((child) => traverseAndReplace(child, replacer));
    }
    return node;
}

/**
 * Returns a new component tree (safe to pass to `components:` on an
 * edit/update) with every button in every action row disabled. Works for
 * both classic messages and Components V2 containers, since it walks the
 * whole tree rather than assuming a flat structure.
 */
function disableAllButtons(components) {
    return components.map((root) =>
        traverseAndReplace(root, (node) => {
            if (node?.data?.type === 1) {
                return new ActionRowBuilder().addComponents(node.components.map((btn) => ButtonBuilder.from(btn).setDisabled(true)));
            }
            return node;
        })
    );
}

module.exports = { findButtonRows, traverseAndReplace, disableAllButtons };
