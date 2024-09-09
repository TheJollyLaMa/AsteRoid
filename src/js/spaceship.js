const Bullet = require('./bullet');

const Spaceship = function(x, y, canvas) {
    this.x = x;
    this.y = y;
    this.rotation = 0;
    this.velocity = { x: 0, y: 0 };
    this.acceleration = 0.05;
    this.rotationSpeed = 0.05;
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.keys = {};
    this.bullets = [];
    this.size = 15; // Approximate radius of the spaceship for collision detection
    this.brokenApart = false; // State to track if the ship is breaking apart
    this.fragments = []; // Holds the ship's broken pieces

    // Bind keyboard events
    document.addEventListener('keydown', (e) => {
        this.keys[e.key] = true;
        if (e.key === ' ') this.shoot(); // Shoot a bullet when spacebar is pressed
    });
    document.addEventListener('keyup', (e) => {
        this.keys[e.key] = false;
    });
};

// Method to shoot bullets
Spaceship.prototype.shoot = function() {
    this.bullets.push(new Bullet(this.x, this.y, this.rotation, this.canvas));
};

// Method to break the spaceship into fragments
Spaceship.prototype.breakApart = function() {
    if (this.brokenApart) return; // Prevent breaking apart multiple times

    console.log("Breaking apart!");

    // Create fragments from the ship
    for (let i = 0; i < 5; i++) {
        const fragment = {
            x: this.x,
            y: this.y,
            velocity: {
                x: (Math.random() - 0.5) * 4, // Random velocity in x direction
                y: (Math.random() - 0.5) * 4  // Random velocity in y direction
            },
            rotation: this.rotation + Math.random() * 0.5, // Random rotation
            size: Math.random() * 5 + 5 // Random fragment size
        };
        this.fragments.push(fragment);
        console.log('Fragment:', fragment); // Log fragment details
    }

    this.brokenApart = true; // Mark the ship as broken
    this.bullets = []; // Remove all bullets
};

// Method to update the spaceship and its fragments
Spaceship.prototype.update = function() {
    if (!this.brokenApart) {
        // Normal spaceship behavior if not broken
        if (this.keys['ArrowLeft']) {
            this.rotation -= this.rotationSpeed;
        }
        if (this.keys['ArrowRight']) {
            this.rotation += this.rotationSpeed;
        }
        if (this.keys['ArrowUp']) {
            this.velocity.x += Math.cos(this.rotation) * this.acceleration;
            this.velocity.y += Math.sin(this.rotation) * this.acceleration;
        }

        this.x += this.velocity.x;
        this.y += this.velocity.y;

        // Wrap the spaceship around the screen edges
        if (this.x > this.canvas.width) this.x = 0;
        if (this.x < 0) this.x = this.canvas.width;
        if (this.y > this.canvas.height) this.y = 0;
        if (this.y < 0) this.y = this.canvas.height;

        // Update bullets
        this.bullets = this.bullets.filter(bullet => bullet.lifespan > 0);
        this.bullets.forEach(bullet => bullet.update());
    } else {
        // Update ship fragments if broken
        this.fragments = this.fragments.filter(fragment => {
            // Stop fragment movement if it hits the screen edges
            if (fragment.x <= 0 || fragment.x >= this.canvas.width ||
                fragment.y <= 0 || fragment.y >= this.canvas.height) {
                fragment.velocity.x = 0;
                fragment.velocity.y = 0;
            }

            // If the fragment has velocity, update its position
            if (fragment.velocity.x !== 0 || fragment.velocity.y !== 0) {
                fragment.x += fragment.velocity.x;
                fragment.y += fragment.velocity.y;
                console.log(`Fragment moving to: (${fragment.x}, ${fragment.y})`); // Log updated positions
                return true; // Keep this fragment in the update loop
            }
            
            // If the fragment has stopped, remove it from the update loop
            console.log(`Fragment stopped at: (${fragment.x}, ${fragment.y})`);
            return false; // Remove this fragment from the update loop
        });
    }
};

// Method to draw the spaceship and its fragments
Spaceship.prototype.draw = function() {
    if (!this.brokenApart) {
        // Draw the spaceship normally if not broken
        this.context.save();
        this.context.translate(this.x, this.y);
        this.context.rotate(this.rotation);
        this.context.beginPath();
        this.context.moveTo(15, 0);
        this.context.lineTo(-10, -10);
        this.context.lineTo(-10, 10);
        this.context.closePath();
        this.context.strokeStyle = 'white';
        this.context.stroke();
        this.context.restore();

        // Draw the bullets
        this.bullets.forEach(bullet => bullet.draw());
    } else {
        // Draw the ship fragments
        this.fragments.forEach(fragment => {
            this.context.save();
            this.context.translate(fragment.x, fragment.y);
            this.context.rotate(fragment.rotation);
            this.context.beginPath();
            this.context.arc(0, 0, fragment.size, 0, Math.PI * 2); // Draw fragment as small circle
            this.context.strokeStyle = 'white';
            this.context.stroke();
            this.context.restore();

            console.log(`Drawing fragment at: (${fragment.x}, ${fragment.y}) with size ${fragment.size}`); // Log drawing positions
        });
    }
};

module.exports = Spaceship;