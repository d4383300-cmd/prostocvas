const socket = io();

// Извлечение никнейма из Telegram WebApp
let tgNickname = "Гость";
if (window.Telegram && window.Telegram.WebApp) {
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();
    const user = window.Telegram.WebApp.initDataUnsafe?.user;
    if (user) {
        tgNickname = user.username ? `@${user.username}` : `${user.first_name || ''} ${user.last_name || ''}`.trim();
    }
}

// 3D Scene Setup
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0c);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

// Освещение
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
dirLight.position.set(0, 10, 5);
scene.add(dirLight);

// --- Экран и Видео ---
const video = document.createElement('video');
video.crossOrigin = "anonymous";
video.playsInline = true;

const videoTexture = new THREE.VideoTexture(video);
videoTexture.minFilter = THREE.LinearFilter;
videoTexture.magFilter = THREE.LinearFilter;

// Зал Кинотеатра
const screenMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 6.75),
    new THREE.MeshBasicMaterial({ map: videoTexture, side: THREE.DoubleSide })
);
screenMesh.position.set(0, 4, -5);
scene.add(screenMesh);

// Пол
const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshStandardMaterial({ color: 0x111115, roughness: 0.8 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// Игроки и управление
let myId = null;
let remotePlayers = {};
let localPlayerData = { x: 0, y: 0, z: 3, rotY: 0, action: 'idle' };
const keys = {};

// Создание скелетной 3D модели аватара с головой и никнеймом
function createHumanoidModel(nickname) {
    const group = new THREE.Group();

    // Материалы
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3366ff });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffcc99 });
    const limbMat = new THREE.MeshStandardMaterial({ color: 0x222222 });

    // Торс
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), bodyMat);
    torso.position.y = 0.85;
    group.add(torso);

    // Голова (Скелет головы)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), headMat);
    head.position.y = 1.4;
    group.add(head);

    // Ноги (для анимации)
    const leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6), limbMat);
    leftLeg.position.set(-0.15, 0.3, 0);
    const rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6), limbMat);
    rightLeg.position.set(0.15, 0.3, 0);
    
    group.add(leftLeg);
    group.add(rightLeg);

    // Никнейм над головой (Canvas Texture)
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, 256, 64);
    ctx.font = "Bold 24px Arial";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText(nickname, 128, 40);

    const labelTexture = new THREE.CanvasTexture(canvas);
    const labelSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture }));
    labelSprite.position.y = 1.8;
    labelSprite.scale.set(1.5, 0.375, 1);
    group.add(labelSprite);

    group.userData = { leftLeg, rightLeg, animTime: 0 };
    return group;
}

// Анимация шага
function animateLegs(model, isMoving, delta) {
    const { leftLeg, rightLeg } = model.userData;
    if (isMoving) {
        model.userData.animTime += delta * 10;
        leftLeg.rotation.x = Math.sin(model.userData.animTime) * 0.5;
        rightLeg.rotation.x = -Math.sin(model.userData.animTime) * 0.5;
    } else {
        leftLeg.rotation.x = 0;
        rightLeg.rotation.x = 0;
    }
}

// Socket Подключение
socket.emit('join', { nickname: tgNickname });

socket.on('init', (data) => {
    myId = data.id;
    for (let id in data.players) {
        if (id !== myId) {
            addRemotePlayer(data.players[id]);
        }
    }
    if (data.videoState.url) applyVideoState(data.videoState);
});

socket.on('playerJoined', (p) => addRemotePlayer(p));
socket.on('playerLeft', (id) => {
    if (remotePlayers[id]) {
        scene.remove(remotePlayers[id].mesh);
        delete remotePlayers[id];
    }
});

socket.on('playerMoved', (p) => {
    if (remotePlayers[p.id]) {
        remotePlayers[p.id].targetPos = { x: p.x, y: p.y, z: p.z };
        remotePlayers[p.id].targetRotY = p.rotY;
        remotePlayers[p.id].action = p.action;
    }
});

socket.on('videoStateUpdate', (state) => applyVideoState(state));

function addRemotePlayer(p) {
    const mesh = createHumanoidModel(p.nickname);
    mesh.position.set(p.x, p.y, p.z);
    scene.add(mesh);
    remotePlayers[p.id] = {
        mesh,
        targetPos: { x: p.x, y: p.y, z: p.z },
        targetRotY: p.rotY,
        action: 'idle'
    };
}

// Синхронизация Видео секунда в секунду
function applyVideoState(state) {
    if (!state.url) return;
    if (video.src !== state.url) {
        video.src = state.url;
        video.load();
    }
    
    // Расчет времени с учетом задержки сети
    const timePassed = (Date.now() - state.lastUpdate) / 1000;
    const targetTime = state.currentTime + (state.isPlaying ? timePassed : 0);

    if (Math.abs(video.currentTime - targetTime) > 0.3) {
        video.currentTime = targetTime;
    }

    if (state.isPlaying && video.paused) {
        video.play().catch(() => {});
    } else if (!state.isPlaying && !video.paused) {
        video.pause();
    }
}

// Модальное окно ввода URL
window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 't' || e.key.toLowerCase() === 'е') {
        toggleUrlModal();
    }
    keys[e.code] = true;
});
window.addEventListener('keyup', (e) => keys[e.code] = false);

function toggleUrlModal() {
    const modal = document.getElementById('urlModal');
    modal.style.display = modal.style.display === 'block' ? 'none' : 'block';
}

function submitUrl() {
    const url = document.getElementById('urlInput').value.trim();
    if (url) {
        socket.emit('changeVideo', url);
        toggleUrlModal();
    }
}

// Адаптивный виртуальный джойстик для смартфонов
if ('ontouchstart' in window) {
    const joystickZone = document.getElementById('joystickZone');
    const joystickKnob = document.getElementById('joystickKnob');
    joystickZone.style.display = 'block';

    let moveTouch = null;
    let joystickVector = { x: 0, y: 0 };

    joystickZone.addEventListener('touchstart', (e) => {
        moveTouch = e.touches[0];
    });

    joystickZone.addEventListener('touchmove', (e) => {
        if (!moveTouch) return;
        const touch = Array.from(e.touches).find(t => t.identifier === moveTouch.identifier);
        if (!touch) return;

        const rect = joystickZone.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        let dx = touch.clientX - centerX;
        let dy = touch.clientY - centerY;
        const dist = Math.min(Math.hypot(dx, dy), 40);

        const angle = Math.atan2(dy, dx);
        joystickVector.x = Math.cos(angle) * (dist / 40);
        joystickVector.y = Math.sin(angle) * (dist / 40);

        joystickKnob.style.transform = `translate(${joystickVector.x * 30}px, ${joystickVector.y * 30}px)`;
    });

    const resetJoystick = () => {
        joystickVector = { x: 0, y: 0 };
        joystickKnob.style.transform = `translate(0px, 0px)`;
        moveTouch = null;
    };

    joystickZone.addEventListener('touchend', resetJoystick);
    joystickZone.addEventListener('touchcancel', resetJoystick);

    window.mobileMoveVector = joystickVector;
}

// Игровой цикл и рендеринг
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    // Движение локального игрока
    let moveX = 0, moveZ = 0;
    if (keys['KeyW'] || keys['ArrowUp']) moveZ -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) moveZ += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) moveX -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) moveX += 1;

    if (window.mobileMoveVector) {
        moveX += window.mobileMoveVector.x;
        moveZ += window.mobileMoveVector.y;
    }

    const isMoving = Math.abs(moveX) > 0.1 || Math.abs(moveZ) > 0.1;

    if (isMoving) {
        localPlayerData.x += moveX * delta * 3;
        localPlayerData.z += moveZ * delta * 3;
        localPlayerData.rotY = Math.atan2(moveX, moveZ);
        localPlayerData.action = 'walk';

        // Ограничение движения границами комнаты
        localPlayerData.x = Math.max(-10, Math.min(10, localPlayerData.x));
        localPlayerData.z = Math.max(-4, Math.min(10, localPlayerData.z));

        socket.emit('move', localPlayerData);
    } else {
        localPlayerData.action = 'idle';
    }

    // Позиционирование камеры за игроком
    camera.position.set(localPlayerData.x, localPlayerData.y + 2.5, localPlayerData.z + 4);
    camera.lookAt(localPlayerData.x, localPlayerData.y + 1.2, localPlayerData.z - 2);

    // Плакатная плавность (LERP) для всех остальных сетевых игроков
    for (let id in remotePlayers) {
        const p = remotePlayers[id];
        p.mesh.position.x += (p.targetPos.x - p.mesh.position.x) * 0.15;
        p.mesh.position.y += (p.targetPos.y - p.mesh.position.y) * 0.15;
        p.mesh.position.z += (p.targetPos.z - p.mesh.position.z) * 0.15;
        p.mesh.rotation.y += (p.targetRotY - p.mesh.rotation.y) * 0.15;

        const isRemoteMoving = Math.hypot(p.targetPos.x - p.mesh.position.x, p.targetPos.z - p.mesh.position.z) > 0.05;
        animateLegs(p.mesh, isRemoteMoving, delta);
    }

    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
