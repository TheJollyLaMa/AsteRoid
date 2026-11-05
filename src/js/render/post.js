// Optional CRT post layer: scanlines + vignette, pre-rendered once.
const { VIEW } = require('./projection');
const { makeCanvas } = require('./assets');

let overlay;
let overlayWidth = 0;
function crtOverlay() {
    if (overlay !== undefined && overlayWidth === VIEW.width) return overlay;
    overlayWidth = VIEW.width;
    overlay = makeCanvas(VIEW.width, VIEW.height);
    if (!overlay) return overlay;
    const c = overlay.getContext('2d');
    c.fillStyle = 'rgba(0, 0, 0, 0.16)';
    for (let y = 0; y < VIEW.height; y += 3) c.fillRect(0, y, VIEW.width, 1);
    const g = c.createRadialGradient(VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.35, VIEW.width / 2, VIEW.height / 2, VIEW.width * 0.65);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    c.fillStyle = g;
    c.fillRect(0, 0, VIEW.width, VIEW.height);
    return overlay;
}

function drawCrt(ctx, time = 0) {
    const img = crtOverlay();
    if (!img) return;
    ctx.drawImage(img, 0, 0);
    // Faint rolling refresh bar.
    const y = ((time * 60) % (VIEW.height + 120)) - 60;
    ctx.fillStyle = 'rgba(160, 220, 255, 0.025)';
    ctx.fillRect(0, y, VIEW.width, 50);
}

module.exports = { drawCrt };
