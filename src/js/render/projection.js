const VIEW = { width: 800, height: 600 };

// Overview: top-down map; the level scrolls toward the bottom of the screen.
const OVERVIEW_SHIP_LINE = 560;

function projectOverview(point, scrollY) {
    return {
        x: point.x,
        y: OVERVIEW_SHIP_LINE - (point.y - scrollY),
        scale: 1
    };
}

// POV: chase camera sitting just above and behind the ship, looking down the level.
const POV = {
    focal: 420,
    cameraHeight: 30,
    cameraBack: 50,
    horizon: 250,
    near: 8,
    far: 1700
};

function povCamera(ship) {
    return { x: ship.x, y: ship.y - POV.cameraBack };
}

function projectPov(point, camera, height = 0) {
    const depth = point.y - camera.y;
    if (depth < POV.near) return null;
    const scale = POV.focal / depth;
    return {
        x: VIEW.width / 2 + (point.x - camera.x) * scale,
        y: POV.horizon + (POV.cameraHeight - height) * scale,
        scale,
        depth
    };
}

function povFade(depth) {
    return Math.max(0, Math.min(1, 1.15 - depth / POV.far));
}

module.exports = { VIEW, OVERVIEW_SHIP_LINE, POV, projectOverview, povCamera, projectPov, povFade };
