const socket = io();

// --- 3D Scene Setup ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.15);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

// Audio Setup (Web Audio API Synthesizer)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playAudio(type, pan = 0) {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const panner = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : null;

  if (type === 'step') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(80, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(10, audioCtx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.15);
  } else if (type === 'scream') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(600, audioCtx.currentTime + 0.8);
    gain.gain.setValueAtTime(0.8, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.8);
  }

  if (panner) {
    panner.pan.value = pan;
    osc.connect(panner);
    panner.connect(gain);
  } else {
    osc.connect(gain);
  }
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + (type === 'step' ? 0.15 : 0.8));
}

// --- Procedural Textures Generator ---
function createProceduralTexture(type) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d');

  if (type === 'wall') {
    ctx.fillStyle = '#222225'; ctx.fillRect(0,0,256,256);
    ctx.fillStyle = '#18181a';
    for(let i=0; i<500; i++) ctx.fillRect(Math.random()*256, Math.random()*256, 2, 2);
  } else if (type === 'door') {
    ctx.fillStyle = '#4a2e18'; ctx.fillRect(0,0,256,256);
    ctx.strokeStyle = '#2b1a0e'; ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, 236, 236); ctx.strokeRect(20, 20, 216, 100);
  }
  return new THREE.CanvasTexture(canvas);
}

const wallMat = new THREE.MeshStandardMaterial({ map: createProceduralTexture('wall') });
const doorMat = new THREE.MeshStandardMaterial({ map: createProceduralTexture('door') });

// --- Environment Construction ---
// Main Room
const roomGroup = new THREE.Group();
const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: 0x111111 }));
floor.rotation.x = -Math.PI / 2;
roomGroup.add(floor);

// Left/Right Corridors (Pitch Black)
const leftCorridor = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 3), new THREE.MeshBasicMaterial({ color: 0x000000 }));
leftCorridor.position.set(-9, 2, 0);
const rightCorridor = leftCorridor.clone();
rightCorridor.position.set(9, 2, 0);
scene.add(leftCorridor, rightCorridor);

// Doors & Buttons
let doors = {
  left: { mesh: new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.5, 2), doorMat), closed: false, btnPos: new THREE.Vector3(-4, 1, -1.5) },
  right: { mesh: new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.5, 2), doorMat), closed: false, btnPos: new THREE.Vector3(4, 1, -1.5) }
};

doors.left.mesh.position.set(-4.9, 1.75, 0);
doors.right.mesh.position.set(4.9, 1.75, 0);
roomGroup.add(doors.left.mesh, doors.right.mesh);

// Interactive Buttons
const btnGeo = new THREE.BoxGeometry(0.3, 0.4, 0.1);
const btnMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
const btnLeft = new THREE.Mesh(btnGeo, btnMat);
btnLeft.position.copy(doors.left.btnPos);
const btnRight = new THREE.Mesh(btnGeo, btnMat);
btnRight.position.copy(doors.right.btnPos);
roomGroup.add(btnLeft, btnRight);

// Lights
const roomLight = new THREE.PointLight(0xffaa55, 1, 8);
roomLight.position.set(0, 3, 0);
roomGroup.add(roomLight);
scene.add(roomGroup);

// --- TV Monitor & Dynamic Render Target ---
const tvTarget = new THREE.WebGLRenderTarget(512, 512);
const tvCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
const tvScreenMat = new THREE.MeshBasicMaterial({ map: tvTarget.texture });

const tvMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 0.2), new THREE.MeshStandardMaterial({ color: 0x050505 }));
tvMesh.position.set(0, 2, -4.8);
const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1), tvScreenMat);
tvScreen.position.set(0, 2, -4.69);
scene.add(tvMesh, tvScreen);

// Rules Canvas for Prep Phase
const rulesCanvas = document.createElement('canvas');
rulesCanvas.width = 512; rulesCanvas.height = 512;
const rCtx = rulesCanvas.getContext('2d');
rCtx.fillStyle = '#000033'; rCtx.fillRect(0, 0, 512, 512);
rCtx.fillStyle = '#ffffff'; rCtx.font = '24px Arial';
rCtx.fillText("ПРАВИЛА ИГРЫ:", 20, 50);
rCtx.font = '18px Arial';
rCtx.fillText("1. Слушай шаги в наушниках (Слева/Справа).", 20, 100);
rCtx.fillText("2. Закрывай дверь, откуда идет монстр.", 20, 140);
rCtx.fillText("3. Можно закрыть ТОЛЬКО ОДНУ дверь!", 20, 180);
rCtx.fillText("4. У вас 4 секунды до его прихода.", 20, 220);
rCtx.fillText("5. Следите за ТВ-камерами!", 20, 260);
const rulesTexture = new THREE.CanvasTexture(rulesCanvas);

// --- Player Setup & Controls ---
const player = new THREE.Object3D();
player.position.set(0, 1.6, 0);
scene.add(player);
player.add(camera);

let keyState = {};
window.addEventListener('keydown', e => keyState[e.code] = true);
window.addEventListener('keyup', e => keyState[e.code] = false);

// Touch Support
let isMobile = 'ontouchstart' in window;
if (isMobile) document.getElementById('touch-zone').style.display = 'block';

// --- Game Logic Variables ---
let gameState = 'PREP'; // 'PREP' or 'GAME'
let prepTimer = 60;
let monsterTimer = 4;
let monsterSide = 'left'; // 'left' or 'right'
let cameraViews = [];

// Networked Players Models
let otherPlayers = {};

function createPlayerModel() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.5), new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
  body.position.y = 0.75;
  group.add(body);
  return group;
}

// --- Door Toggle Logic ---
function toggleDoor(side) {
  if (side === 'left') {
    doors.left.closed = !doors.left.closed;
    if (doors.left.closed) doors.right.closed = false; // Closed only one!
  } else {
    doors.right.closed = !doors.right.closed;
    if (doors.right.closed) doors.left.closed = false;
  }
}

// --- Multiplayer Sockets ---
socket.on('currentPlayers', (serverPlayers) => {
  Object.keys(serverPlayers).forEach(id => {
    if (id !== socket.id) {
      otherPlayers[id] = createPlayerModel();
      scene.add(otherPlayers[id]);
    }
  });
});

socket.on('newPlayer', (p) => {
  otherPlayers[p.id] = createPlayerModel();
  scene.add(otherPlayers[p.id]);
});

socket.on('playerMoved', (p) => {
  if (otherPlayers[p.id]) {
    otherPlayers[p.id].position.set(p.x, 0, p.z);
    otherPlayers[p.id].rotation.y = p.yaw;
  }
});

socket.on('playerDisconnected', (id) => {
  if (otherPlayers[id]) {
    scene.remove(otherPlayers[id]);
    delete otherPlayers[id];
  }
});

socket.on('chatMessage', (data) => {
  showBubble(data.id, data.msg);
});

// Roblox-Style Chat Bubbles
function showBubble(id, text) {
  let bubble = document.getElementById(`bubble-${id}`);
  if (!bubble) {
    bubble = document.createElement('div');
    bubble.id = `bubble-${id}`;
    bubble.className = 'bubble';
    document.getElementById('bubble-container').appendChild(bubble);
  }
  bubble.innerText = text;
  bubble.style.display = 'block';
  setTimeout(() => { bubble.style.display = 'none'; }, 4000);
}

function updateBubbles() {
  Object.keys(otherPlayers).forEach(id => {
    const bubble = document.getElementById(`bubble-${id}`);
    if (bubble && bubble.style.display !== 'none') {
      const pos = otherPlayers[id].position.clone().add(new THREE.Vector3(0, 2, 0));
      pos.project(camera);
      const x = (pos.x * .5 + .5) * window.innerWidth;
      const y = (-(pos.y * .5) + .5) * window.innerHeight;
      bubble.style.left = `${x}px`;
      bubble.style.top = `${y}px`;
    }
  });
}

// Chat Input
document.getElementById('chat-btn').addEventListener('click', sendChat);
document.getElementById('chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

function sendChat() {
  const input = document.getElementById('chat-input');
  if (input.value.trim() !== '') {
    socket.emit('chatMessage', input.value);
    input.value = '';
  }
}

// --- Timers & Monster Cycle ---
setInterval(() => {
  if (gameState === 'PREP') {
    prepTimer--;
    document.getElementById('timer-display').innerText = `ПОДГОТОВКА: ${prepTimer}s`;
    if (prepTimer <= 0) {
      gameState = 'GAME';
      doors.left.closed = false;
      doors.right.closed = false;
      monsterSide = Math.random() > 0.5 ? 'left' : 'right';
    }
  } else if (gameState === 'GAME') {
    monsterTimer--;
    
    // Play Footstep Stereo Sound based on proximity/time
    const pan = monsterSide === 'left' ? -0.8 : 0.8;
    playAudio('step', pan);

    if (monsterTimer <= 0) {
      // Check Win/Loss
      if (doors[monsterSide].closed) {
        playAudio('scream', pan); // Monster screams at closed door
        document.getElementById('status-display').innerText = "ОБОРВАЛОСЬ! Монстр ушел. Ожидайте следующего...";
      } else {
        document.getElementById('status-display').innerText = "ТЕБЯ ПОЙМАЛИ! Игра перезапускается...";
        gameState = 'PREP';
        prepTimer = 10;
      }
      monsterTimer = 4;
      monsterSide = Math.random() > 0.5 ? 'left' : 'right';
    } else {
      document.getElementById('status-display').innerText = `Монстр подбирается... Осталось: ${monsterTimer}s`;
    }
  }
}, 1000);

// TV Camera Switcher
let camIndex = 0;
setInterval(() => {
  camIndex = (camIndex + 1) % 3;
}, 4000);

// Game Loop
function animate() {
  requestAnimationFrame(animate);

  // Movement Logic
  const speed = 0.08;
  if (keyState['KeyW']) player.translateZ(-speed);
  if (keyState['KeyS']) player.translateZ(speed);
  if (keyState['KeyA']) player.translateX(-speed);
  if (keyState['KeyD']) player.translateX(speed);

  // Keep player inside room bounds
  player.position.x = THREE.MathUtils.clamp(player.position.x, -4.5, 4.5);
  player.position.z = THREE.MathUtils.clamp(player.position.z, -4.5, 4.5);

  socket.emit('playerMove', { x: player.position.x, z: player.position.z, yaw: player.rotation.y });

  // Update Door Animations
  doors.left.mesh.position.z = THREE.MathUtils.lerp(doors.left.mesh.position.z, doors.left.closed ? 0 : -2, 0.1);
  doors.right.mesh.position.z = THREE.MathUtils.lerp(doors.right.mesh.position.z, doors.right.closed ? 0 : -2, 0.1);

  // Check Interaction Proximity
  const distLeft = player.position.distanceTo(doors.left.btnPos);
  const distRight = player.position.distanceTo(doors.right.btnPos);
  const btnUI = document.getElementById('interact-btn');

  if (distLeft < 2 || distRight < 2) {
    btnUI.style.display = 'flex';
    if (keyState['KeyE']) {
      toggleDoor(distLeft < 2 ? 'left' : 'right');
      keyState['KeyE'] = false; // debounce
    }
  } else {
    btnUI.style.display = 'none';
  }

  // --- TV Monitor Rendering ---
  if (gameState === 'PREP') {
    tvScreen.material.map = rulesTexture;
  } else {
    tvScreen.material.map = tvTarget.texture;
    // Set TV Camera views: 0 = Overhead Room, 1 = Left Monster POV, 2 = Right Monster POV
    if (camIndex === 0) {
      tvCamera.position.set(0, 4.5, 0);
      tvCamera.lookAt(0, 0, 0);
    } else if (camIndex === 1) {
      tvCamera.position.set(-8, 1.6, 0);
      tvCamera.lookAt(player.position);
    } else {
      tvCamera.position.set(8, 1.6, 0);
      tvCamera.lookAt(player.position);
    }

    tvMesh.visible = false; tvScreen.visible = false; // Hide TV during render pass
    renderer.setRenderTarget(tvTarget);
    renderer.render(scene, tvCamera);
    renderer.setRenderTarget(null);
    tvMesh.visible = true; tvScreen.visible = true;
  }

  updateBubbles();
  renderer.render(scene, camera);
}

btnUI = document.getElementById('interact-btn');
btnUI.addEventListener('click', () => {
  if (player.position.distanceTo(doors.left.btnPos) < 2) toggleDoor('left');
  else if (player.position.distanceTo(doors.right.btnPos) < 2) toggleDoor('right');
});

animate();
