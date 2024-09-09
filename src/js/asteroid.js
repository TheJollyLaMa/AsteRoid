// asteroid.js

const Asteroid = function(x, y, size, canvas) {
    this.x = x || Math.random() * canvas.width;
    this.y = y || Math.random() * canvas.height;
    this.size = size || Math.random() * 30 + 20; // Random size between 20 and 50
    this.velocity = {
        x: (Math.random() - 0.5) * 2, // Random velocity between -1 and 1
        y: (Math.random() - 0.5) * 2
    };
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
};

// Method to update the asteroid's position
Asteroid.prototype.update = function() {
    this.x += this.velocity.x;
    this.y += this.velocity.y;

    // Wrap around screen edges
    if (this.x > this.canvas.width) this.x = 0;
    if (this.x < 0) this.x = this.canvas.width;
    if (this.y > this.canvas.height) this.y = 0;
    if (this.y < 0) this.y = this.canvas.height;
};

// Method to draw the asteroid
Asteroid.prototype.draw = function() {
    this.context.beginPath();
    this.context.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    this.context.strokeStyle = 'white';
    this.context.stroke();
};

// Method to break the asteroid into smaller pieces
Asteroid.prototype.breakApart = function() {
    if (this.size > 15) { // Only break if the asteroid is large enough
        const fragments = [];
        for (let i = 0; i < 2; i++) {
            fragments.push(new Asteroid(this.x, this.y, this.size / 2, this.canvas));
        }
        return fragments;
    }
    return [];
};

module.exports = Asteroid;