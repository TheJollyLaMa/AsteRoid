const { pick, range } = require('./rng');
const { PRIZES } = require('./prizes');
const Asteroid = require('./asteroid');

function chooseVaultLevel(tier, rng) { return tier === 1 ? pick(rng, [9, 10]) : pick(rng, [19, 20]); }
function createVault(tier, level, rng) {
    const x = range(rng, 300, 500);
    const y = range(rng, 1700, 2400);
    const prize = pick(rng, PRIZES[tier]);
    const guards = Array.from({ length: 8 }, (_, index) => {
        const angle = index * Math.PI / 4;
        const guard = new Asteroid({
            id: `vault-${tier}-${level}-${index}`, x: x + Math.cos(angle) * 80, y: y + Math.sin(angle) * 80,
            size: index === 0 ? 26 : 20, hp: index === 0 ? 8 : 5, shooter: true,
            fireCooldown: range(rng, 0.25, 0.8), rng
        });
        guard.kind = index === 0 ? 'generator' : 'guard';
        guard.vaultGuard = true;
        guard.vaultTier = tier;
        return guard;
    });
    return { tier, level, x, y, size: 36, prize, guards, captured: false, spawned: false, shielded: true };
}
function markGuardDestroyed(vault, guard) {
    if (!vault || !guard.vaultGuard || guard.destroyNotified) return false;
    guard.destroyNotified = true;
    if (vault.guards.every((entry) => entry.hp <= 0)) vault.shielded = false;
    return true;
}
module.exports = { chooseVaultLevel, createVault, markGuardDestroyed };
