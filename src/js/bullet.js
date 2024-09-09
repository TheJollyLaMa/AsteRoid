// bullet.js

const Bullet = function(x, y, angle, canvas) {
    this.x = x;
    this.y = y;
    this.size = 2; // Adding size property for collision detection
    this.velocity = {
        x: Math.cos(angle) * 5, // Speed of the bullet in the x direction
        y: Math.sin(angle) * 5  // Speed of the bullet in the y direction
    };
    this.lifespan = 100; // Bullets disappear after 100 frames
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
};

Bullet.prototype.update = function() {
    this.x += this.velocity.x;
    this.y += this.velocity.y;
    this.lifespan--;

    // Wrap around screen edges
    if (this.x > this.canvas.width) this.x = 0;
    if (this.x < 0) this.x = this.canvas.width;
    if (this.y > this.canvas.height) this.y = 0;
    if (this.y < 0) this.y = this.canvas.height;
};

Bullet.prototype.draw = function() {
    this.context.beginPath();
    this.context.arc(this.x, this.y, this.size, 0, Math.PI * 2); // Using this.size
    this.context.fillStyle = 'white';
    this.context.fill();
};

module.exports = Bullet;