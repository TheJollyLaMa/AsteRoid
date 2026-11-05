// collision.js

function checkCollision(obj1, obj2) {
    const dx = obj1.x - obj2.x;
    const dy = obj1.y - obj2.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Use the size of both objects for accurate detection
    return distance < (obj1.size || 0) + (obj1.radius || 0) + (obj2.size || 0);
}

module.exports = checkCollision;