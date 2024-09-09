(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
const Spaceship = require('./spaceship');
const Asteroid = require('./asteroid');
const checkCollision = require('./collision');

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let gameOver = false; // Game over state
let gameWon = false;  // Game win state
let gameOverTimer = 0; // Timer to delay game over screen
const GAME_OVER_DELAY = 2000; // 2-second delay before showing game over

// Create the spaceship in the center of the canvas
const spaceship = new Spaceship(canvas.width / 2, canvas.height / 2, canvas);

// Create multiple asteroids
let asteroids = [];
for (let i = 0; i < 5; i++) {
    asteroids.push(new Asteroid(null, null, null, canvas));
}

// Game loop
function gameLoop(timestamp) {
    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (gameWon) {
        displayGameWin();
        return; // Stop the game if the player has won
    }

    // Update and draw the spaceship and fragments
    spaceship.update();
    spaceship.draw();

    // Update and draw asteroids if the game is not over
    if (!gameOver) {
        asteroids.forEach((asteroid, asteroidIndex) => {
            asteroid.update();
            asteroid.draw();

            // Check for bullet collisions with this asteroid
            spaceship.bullets.forEach((bullet, bulletIndex) => {
                if (checkCollision(bullet, asteroid)) {
                    spaceship.bullets.splice(bulletIndex, 1);
                    const fragments = asteroid.breakApart();
                    asteroids.splice(asteroidIndex, 1);
                    asteroids = asteroids.concat(fragments);
                }
            });

            // Check for collisions between the spaceship and the asteroid
            if (checkCollision(spaceship, asteroid)) {
                spaceship.breakApart(); // Break the spaceship into fragments
                gameOver = true; // Set game over state
                gameOverTimer = timestamp; // Set the timestamp of when the game over was triggered
            }
        });
    } else {
        // Delay the game over screen by a few seconds
        const timeElapsed = timestamp - gameOverTimer;
        if (timeElapsed > GAME_OVER_DELAY) {
            displayGameOver();
        }
    }

    requestAnimationFrame(gameLoop); // Call the next frame
}

// Function to display game over message
function displayGameOver() {
    ctx.fillStyle = 'white';
    ctx.font = '40px Arial';
    ctx.fillText('Game Over', canvas.width / 2 - 100, canvas.height / 2);
}

// Function to display game win message
function displayGameWin() {
    ctx.fillStyle = 'white';
    ctx.font = '40px Arial';
    ctx.fillText('You Win!', canvas.width / 2 - 80, canvas.height / 2);
}

// Start the game loop with timestamp
requestAnimationFrame(gameLoop);
},{"./asteroid":2,"./collision":4,"./spaceship":5}],2:[function(require,module,exports){
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
},{}],3:[function(require,module,exports){
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
},{}],4:[function(require,module,exports){
// collision.js

function checkCollision(obj1, obj2) {
    const dx = obj1.x - obj2.x;
    const dy = obj1.y - obj2.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Use the size of both objects for accurate detection
    return distance < obj1.size + obj2.size;
}

module.exports = checkCollision;
},{}],5:[function(require,module,exports){
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
},{"./bullet":3}]},{},[1]);
