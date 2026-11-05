// Per-level space backdrops: tinted gradient, a big Mandelblum "nebula"
// (screen-blended so its black matte vanishes) and pixel starfield parallax.
const { VIEW, MAX_VIEW_WIDTH } = require('./projection');
const { getImage, backdropKeyFor } = require('./assets');

const SECTOR2_TINTS = [
    ['#05051b', '#15103f'], ['#02141c', '#074b58'], ['#120522', '#3c145f']
];

const LEVEL_TINTS = [
    ['#04040c', '#0b1430'],
    ['#03060c', '#0a2430'],
    ['#06040e', '#1e0f33'],
    ['#05030a', '#2a0f24'],
    ['#02060a', '#0c2a22'],
    ['#07030a', '#33140f'],
    ['#03030c', '#141a3a'],
    ['#080308', '#3a0f1c'],
    ['#04020c', '#25103d'],
    ['#0a0204', '#3d0b0b']
];

function levelTint(levelNumber) {
    const n = Math.max(1, Math.floor(Number(levelNumber) || 1));
    if (n >= 11) return SECTOR2_TINTS[(n - 11) % SECTOR2_TINTS.length];
    return LEVEL_TINTS[(n - 1) % LEVEL_TINTS.length];
}

function createStarfield(count, width, height, seed = 7) {
    let s = seed >>> 0;
    const rnd = () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const palette = ['#ffffff', '#bfe9ff', '#ffd6f5', '#fff2b0'];
    return Array.from({ length: count }, () => ({
        x: rnd() * width,
        y: rnd() * height,
        depth: 0.15 + rnd() * 0.85,
        twinkle: rnd() * Math.PI * 2,
        color: palette[Math.floor(rnd() * palette.length)]
    }));
}

function drawNebula(ctx, levelNumber, cx, cy, size, alpha, rotation = 0) {
    const img = getImage(backdropKeyFor(levelNumber));
    if (!img) return false;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    const w = size;
    const h = size * (img.naturalHeight / img.naturalWidth);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
    return true;
}

function createOverviewBackground() {
    const stars = createStarfield(340, MAX_VIEW_WIDTH, VIEW.height, 11);
    return function drawOverviewBackground(ctx, game) {
        const [top, bottom] = levelTint(game.level && game.level.number);
        const g = ctx.createLinearGradient(0, 0, 0, VIEW.height);
        g.addColorStop(0, top);
        g.addColorStop(1, bottom);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, VIEW.width, VIEW.height);
        const scroll = game.scrollY || 0;
        // Slow-drifting giant Mandelblum far behind everything.
        const ny = ((scroll * 0.05) % (VIEW.height * 2.2)) - VIEW.height * 0.6;
        drawNebula(ctx, game.level ? game.level.number : 1, VIEW.width * 0.62, ny, 980, 0.42, (game.time || 0) * 0.01);
        const time = game.time || 0;
        for (const star of stars) {
            if (star.x > VIEW.width) continue;
            const y = (star.y + scroll * star.depth * 0.6) % VIEW.height;
            const tw = 0.55 + 0.45 * Math.sin(time * 3 + star.twinkle);
            ctx.globalAlpha = (0.25 + star.depth * 0.6) * tw;
            ctx.fillStyle = star.color;
            const size = star.depth > 0.8 ? 2 : 1;
            ctx.fillRect(Math.round(star.x), Math.round(y), size, size);
            if (star.depth > 0.92) {
                ctx.globalAlpha *= 0.5;
                ctx.fillRect(Math.round(star.x), Math.round(y) - star.depth * 6, 1, star.depth * 5);
            }
        }
        ctx.globalAlpha = 1;
    };
}

module.exports = { LEVEL_TINTS, SECTOR2_TINTS, levelTint, createStarfield, drawNebula, createOverviewBackground };
