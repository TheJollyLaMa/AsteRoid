const PLAYER_COLORS = ['#7fd7ff', '#d8e4ef', '#7dff8c', '#ffe65c', '#ff8a5c'];

function getPlayers(game) {
    const candidates = Array.isArray(game && game.players) ? game.players : (Array.isArray(game && game.ships) ? game.ships : []);
    const result = candidates.map((player, index) => ({
        player,
        ship: player && (player.ship || player),
        index: Number.isInteger(player && player.index) ? player.index : index,
        score: Number((player && (player.score ?? (player.stats && player.stats.score))) ?? (game && game.playerStats && game.playerStats[index] && game.playerStats[index].score)) || 0
    })).filter((entry) => entry.ship && Number.isFinite(Number(entry.ship.x)) && Number.isFinite(Number(entry.ship.y)));
    if (game && game.ship && !result.some((entry) => entry.ship === game.ship)) {
        result.unshift({ player: game.ship, ship: game.ship, index: 0, score: Number(game.score) || 0 });
    }
    if (!result.length && game && game.ship) result.push({ player: game.ship, ship: game.ship, index: 0, score: Number(game.score) || 0 });
    return result.slice(0, 5).map((entry, index) => ({ ...entry, color: PLAYER_COLORS[entry.index % PLAYER_COLORS.length] || PLAYER_COLORS[index] }));
}

const MINI_DRAW_SCALE = 0.5;

function playerScale(count, ship) {
    const mini = Number(ship && ship.miniHits) > 0 ? MINI_DRAW_SCALE : 1;
    if (Number.isFinite(Number(ship && ship.scale))) return Number(ship.scale) * mini;
    if (count <= 2) return mini;
    if (count === 3) return 0.8 * mini;
    return 0.7 * mini;
}

function versusMode(game) {
    return Boolean(game && (game.mode === 'versus' || game.multiplayerMode === 'versus' || game.multiplayer && game.multiplayer.mode === 'versus'));
}

module.exports = { PLAYER_COLORS, getPlayers, playerScale, versusMode, MINI_DRAW_SCALE };
