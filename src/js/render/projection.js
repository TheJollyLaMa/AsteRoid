// The world is always 800 wide; the view can be wider and centres the world with offsetX.
const WORLD_VIEW_WIDTH = 800;
const MAX_VIEW_WIDTH = 1600;
const VIEW = { width: WORLD_VIEW_WIDTH, height: 600, offsetX: 0 };

function setViewWidth(width) {
    const w = Math.round(Math.max(WORLD_VIEW_WIDTH, Math.min(MAX_VIEW_WIDTH, Number(width) || WORLD_VIEW_WIDTH)));
    VIEW.width = w;
    VIEW.offsetX = (w - WORLD_VIEW_WIDTH) / 2;
    return w;
}

// Overview: top-down map; the level scrolls toward the bottom of the screen.
const OVERVIEW_SHIP_LINE = 560;

function projectOverview(point, scrollY) {
    return {
        x: point.x + VIEW.offsetX,
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

module.exports = { VIEW, setViewWidth, WORLD_VIEW_WIDTH, MAX_VIEW_WIDTH, OVERVIEW_SHIP_LINE, POV, projectOverview, povCamera, projectPov, povFade };
