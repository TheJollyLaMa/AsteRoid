// collision.js

function checkCollision(obj1, obj2) {
    const dx = obj1.x - obj2.x;
    const dy = obj1.y - obj2.y;
    const radius = (obj1.size || 0) + (obj1.radius || 0) + (obj2.size || 0);
    return radius > 0 && dx * dx + dy * dy < radius * radius;
}

module.exports = checkCollision;