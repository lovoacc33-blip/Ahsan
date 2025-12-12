import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js'; // Added for effect

// --- Game Constants ---
const LANE_WIDTH = 6;       
const LANES = [-LANE_WIDTH, 0, LANE_WIDTH]; 
const PLAYER_RUN_HEIGHT = 1.0; 
const JUMP_HEIGHT = 4.0;
const JUMP_DURATION = 0.4; 
const RUN_SPEED_BASE = 15; 
const RUN_SPEED_INCREASE = 0.5; 
const OBSTACLE_SPAWN_Z = -150; 
const OBSTACLE_CULL_Z = 10;    
const ROAD_LENGTH = 100;
const ROAD_WIDTH = LANE_WIDTH * 3 + 2;

// --- Game State Variables ---
let scene, camera, renderer, composer;
let clock = new THREE.Clock();
let gameLoopId;
let isGameOver = false;
let currentLane = 1; 
let isJumping = false;
let jumpStartTime = 0;
let score = 0;
let currentSpeed = RUN_SPEED_BASE;
let obstacles = [];
let timeSinceLastObstacle = 0; 

// --- Initialization ---
function initThreeJS() {
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x87ceeb, 20, 100); // Light blue sky

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(LANES[currentLane], PLAYER_RUN_HEIGHT, 0);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Post-processing setup (Simple effects)
    const renderPass = new RenderPass(scene, camera);
    composer = new EffectComposer(renderer);
    composer.addPass(renderPass);
    
    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
}

// --- Environment Creation (Matches your Screenshot) ---
function createEnvironment() {
    
    // Road Material: Green Grass Stripes
    const roadMaterialDark = new THREE.MeshLambertMaterial({ color: 0x4f8e3f }); 
    const roadMaterialLight = new THREE.MeshLambertMaterial({ color: 0x6aa84f }); 
    
    // Shoulder Material: Brown Earth Walls
    const shoulderMaterial = new THREE.MeshLambertMaterial({ color: 0x964b00 }); 
    
    // Light Blue Sky
    scene.background = new THREE.Color(0x87ceeb);

    for (let i = 0; i < 3; i++) {
        const chunk = new THREE.Group();
        chunk.position.z = -i * ROAD_LENGTH;
        
        // Road Surface (Alternating lanes)
        for (let l = 0; l < LANES.length; l++) {
            const laneGeo = new THREE.PlaneGeometry(LANE_WIDTH, ROAD_LENGTH);
            const laneMat = (l % 2 === 0) ? roadMaterialDark : roadMaterialLight;
            const laneMesh = new THREE.Mesh(laneGeo, laneMat);
            laneMesh.rotation.x = -Math.PI / 2;
            laneMesh.position.set(LANES[l], 0.01, 0);
            chunk.add(laneMesh);
        }
        
        // Side Walls (Brown Banks)
        const wallGeo = new THREE.BoxGeometry(3, 15, ROAD_LENGTH);
        const wallMeshL = new THREE.Mesh(wallGeo, shoulderMaterial);
        const wallMeshR = new THREE.Mesh(wallGeo, shoulderMaterial);
        wallMeshL.position.set(-ROAD_WIDTH / 2, 7.5, 0);
        wallMeshR.position.set(ROAD_WIDTH / 2, 7.5, 0);
        chunk.add(wallMeshL);
        chunk.add(wallMeshR);

        // Simple Tree Assets (Matches your Screenshot)
        const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6e2c00 });
        const foliageMat = new THREE.MeshLambertMaterial({ color: 0x38761d });
        
        for(let j = 0; j < 4; j++) {
            const zPos = (j * 40) - (ROAD_LENGTH * 0.5);
            
            // Trunk
            const trunkGeo = new THREE.CylinderGeometry(0.8, 0.8, 10, 8);
            const trunkL = new THREE.Mesh(trunkGeo, trunkMat);
            trunkL.position.set(-ROAD_WIDTH/2 - 4, 5, zPos);
            
            // Foliage (Simple Octagonal Cone)
            const foliageGeo = new THREE.ConeGeometry(4, 5, 8);
            const foliageL = new THREE.Mesh(foliageGeo, foliageMat);
            foliageL.position.set(-ROAD_WIDTH/2 - 4, 12.5, zPos);
            
            chunk.add(trunkL, foliageL);
            
            // Duplicate for Right Side
            const trunkR = trunkL.clone();
            trunkR.position.x = ROAD_WIDTH/2 + 4;
            const foliageR = foliageL.clone();
            foliageR.position.x = ROAD_WIDTH/2 + 4;
            
            chunk.add(trunkR, foliageR);
        }

        scene.add(chunk);
    }

    scene.children.filter(c => c instanceof THREE.Group).forEach(c => {
        c.userData.type = 'RoadChunk';
    });

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    scene.add(new THREE.DirectionalLight(0xffffff, 1.0).position.set(5, 15, 10));
}

// --- Obstacle Management (Matches your Screenshot) ---
function createObstacle(lane, type) {
    let geometry, material, height;
    
    switch (type) {
        case 'jump': // Spikes/Log (forces jump)
            geometry = new THREE.ConeGeometry(1, 1, 8);
            material = new THREE.MeshLambertMaterial({ color: 0x333333 }); 
            height = 0.5;
            break;
            
        case 'slide': // Log/Bar (forces slide)
            geometry = new THREE.CylinderGeometry(0.5, 0.5, LANE_WIDTH * 0.8, 16); 
            material = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
            height = PLAYER_RUN_HEIGHT + 2.0;
            break;
            
        case 'wall': // Box/Wall (forces dodge L/R)
            geometry = new THREE.BoxGeometry(LANE_WIDTH * 0.8, 2, 1); 
            material = new THREE.MeshLambertMaterial({ color: 0x696969 }); 
            height = 1.0;
            break;
    }
    
    const mesh = new THREE.Mesh(geometry, material);
    
    if (type === 'jump') {
        // Place multiple spikes across the lane
        const spikeGroup = new THREE.Group();
        for(let i = 0; i < 5; i++) {
            const spike = mesh.clone();
            spike.position.x = (i - 2) * 1.5;
            spikeGroup.add(spike);
        }
        spikeGroup.position.set(LANES[lane], height, OBSTACLE_SPAWN_Z);
        spikeGroup.userData = { type: 'Obstacle', obstacleType: type, collided: false };
        scene.add(spikeGroup);
        obstacles.push(spikeGroup);
        return;
    }
    
    if (type === 'slide') {
        mesh.rotation.z = Math.PI / 2; // Log lies horizontally
    }
    
    mesh.position.set(LANES[lane], height, OBSTACLE_SPAWN_Z);
    
    mesh.userData = { 
        type: 'Obstacle', 
        obstacleType: type,
        collided: false 
    }; 
    
    obstacles.push(mesh);
    scene.add(mesh);
}

function generateObstacles(delta) {
    const minInterval = 15 / currentSpeed; 
    timeSinceLastObstacle += delta;

    if (timeSinceLastObstacle < minInterval) return;
    timeSinceLastObstacle = 0; 
    
    const lane = Math.floor(Math.random() * 3);
    const types = ['jump', 'slide', 'wall'];
    const type = types[Math.floor(Math.random() * types.length)]; 

    createObstacle(lane, type);
}

// --- Game Logic and Animation Loop ---
function initGame() {
    clock.start();
    startGameLoop();
}

function resetGame() {
    isGameOver = false;
    currentLane = 1;
    score = 0;
    currentSpeed = RUN_SPEED_BASE;
    
    camera.position.set(LANES[currentLane], PLAYER_RUN_HEIGHT, 0);
    
    obstacles.forEach(o => scene.remove(o));
    obstacles = [];
    
    document.getElementById('score-counter').innerText = 'SCORE: 0';
    
    clock.start();
    startGameLoop();
}

function startGameLoop() {
    if (gameLoopId) cancelAnimationFrame(gameLoopId);
    animate();
}

function gameOver() {
    isGameOver = true;
    cancelAnimationFrame(gameLoopId);
    alert(`Game Over! Final Score: ${Math.floor(score)}`);
    resetGame();
}

function moveLane(direction) {
    if (isJumping || isGameOver) return; 
    currentLane = Math.max(0, Math.min(2, currentLane + direction));
}

function jump() {
    if (isJumping || isGameOver) return;
    isJumping = true;
    jumpStartTime = clock.getElapsedTime();
}

function checkCollisions() {
    const playerCollisionBox = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(camera.position.x, camera.position.y, camera.position.z),
        new THREE.Vector3(LANE_WIDTH * 0.8, PLAYER_RUN_HEIGHT, 1)
    );

    obstacles.forEach(obstacle => {
        if (obstacle.userData.collided) return;
        
        const obstacleBox = new THREE.Box3().setFromObject(obstacle);
        
        if (playerCollisionBox.intersectsBox(obstacleBox)) {
            // Simple logic: if collision, check if jump or slide evaded it.
            if (obstacle.userData.obstacleType === 'jump' && isJumping && camera.position.y > obstacle.position.y + 0.5) {
                return; // Jump successful
            }
            if (obstacle.userData.obstacleType === 'slide' && camera.position.y < obstacle.position.y - 0.5) {
                return; // Slide successful
            }
             
            gameOver();
            obstacle.userData.collided = true;
        }
    });
}

function animate() {
    gameLoopId = requestAnimationFrame(animate);

    if (isGameOver) return;

    const delta = clock.getDelta();
    const elapsed = clock.getElapsedTime();
    
    currentSpeed = RUN_SPEED_BASE + Math.floor(elapsed / 10) * RUN_SPEED_INCREASE;
    
    if (isJumping) {
        const timeInJump = elapsed - jumpStartTime;
        const progress = timeInJump / JUMP_DURATION;
        
        if (progress < 1) {
            const jumpY = JUMP_HEIGHT * 4 * (progress - progress * progress);
            camera.position.y = PLAYER_RUN_HEIGHT + jumpY;
        } else {
            isJumping = false;
            camera.position.y = PLAYER_RUN_HEIGHT;
        }
    }
    
    const targetX = LANES[currentLane];
    camera.position.x += (targetX - camera.position.x) * 0.1;

    const distance = currentSpeed * delta;
    
    scene.children.filter(c => c.userData.type === 'RoadChunk').forEach(chunk => {
        chunk.position.z += distance;
        if (chunk.position.z >= 50) { 
            let minZ = 0;
            scene.children.filter(c => c.userData.type === 'RoadChunk').forEach(other => {
                minZ = Math.min(minZ, other.position.z);
            });
            chunk.position.z = minZ - ROAD_LENGTH; 
        }
    });

    obstacles.forEach(obstacle => { obstacle.position.z += distance; });

    for (let i = obstacles.length - 1; i >= 0; i--) {
        if (obstacles[i].position.z > OBSTACLE_CULL_Z) {
            scene.remove(obstacles[i]);
            obstacles.splice(i, 1);
        }
    }
    
    checkCollisions();
    generateObstacles(delta);

    score += distance * 0.1; 
    document.getElementById('score-counter').innerText = `SCORE: ${Math.floor(score)}`;

    composer.render();
}

// --- Event Handlers ---
document.addEventListener('keydown', (e) => {
    if (isGameOver) return;
    switch (e.key) {
        case 'ArrowLeft': case 'a': moveLane(-1); break;
        case 'ArrowRight': case 'd': moveLane(1); break;
        case 'ArrowUp': case 'w': case ' ': jump(); break;
    }
});

// Touch/Mobile controls for the simple game (using jump/movement only)
document.addEventListener('touchstart', (e) => {
    if (isGameOver || e.touches.length === 0) return;
    const touchX = e.touches[0].clientX;
    const center = window.innerWidth / 2;

    if (touchX < center - 50) {
        moveLane(-1); 
    } else if (touchX > center + 50) {
        moveLane(1); 
    } else {
        jump();
    }
}, false);


// --- Kickoff ---
initThreeJS();
createEnvironment(); 
initGame();
