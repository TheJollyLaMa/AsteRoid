const MAX_PLAYERS = 5;
function scaleForPlayers(count) {
    if (!Number.isInteger(count) || count < 1 || count > MAX_PLAYERS) throw new RangeError('Player count must be between 1 and 5.');
    return count <= 2 ? 1 : count === 3 ? 0.8 : 0.7;
}
function groupPlayers(list, max = MAX_PLAYERS) {
    if (!Number.isInteger(max) || max < 1 || max > MAX_PLAYERS) throw new RangeError('Group size must be from 1 to 5.');
    const groups = [];
    for (let i = 0; i < list.length; i += max) groups.push(list.slice(i, i + max));
    return groups;
}
function createPlayerStats(count) {
    return Array.from({ length: count }, (_, index) => ({ index, score: 0, shotsFired: 0, hits: 0, kills: 0, livesLost: 0, alive: true, reachedGate: false }));
}
function awardScore(stats, index, points, mode = 'coop') {
    if (mode === 'versus') stats[index].score += points;
    else stats.forEach((player) => { player.score += points; });
    return stats;
}
function canEndLevel(players, mode) {
    const alive = players.filter((player) => player.alive);
    if (!alive.length) return true;
    return mode === 'coop' ? alive.some((player) => player.reachedGate) : alive.every((player) => player.reachedGate);
}
module.exports = { MAX_PLAYERS, scaleForPlayers, groupPlayers, createPlayerStats, awardScore, canEndLevel };
