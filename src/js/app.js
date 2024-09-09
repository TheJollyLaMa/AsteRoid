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