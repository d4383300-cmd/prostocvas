const socket = io();

let myNickname = "Зритель";
if (window.Telegram && window.Telegram.WebApp) {
    window.Telegram.WebApp.ready();
    const user = window.Telegram.WebApp.initDataUnsafe?.user;
    if (user) {
        myNickname = user.username ? `@${user.username}` : `${user.first_name || ''} ${user.last_name || ''}`.trim();
    }
}

// Three.js
const canvas = document.getElementById('canvas3d');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020204);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 50);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);

// Освещение
const ambient = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambient);

const screenLight = new THREE.PointLight(0xffffff, 1.2, 12);
screenLight.position.set(0, 3, -4);
scene.add(screenLight);

// --- УМЕНЬШЕННЫЙ ЗАЛ ---
const floorMat = new THREE.MeshStandardMaterial({ color: 0x22080a, roughness: 0.8 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 16), floorMat);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const wallMat = new THREE.MeshStandardMaterial({ color: 0x100b08 });
const backWall = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), wallMat);
backWall.position.set(0, 3, -8);
scene.add(backWall);

const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(16, 6), wallMat);
leftWall.position.set(-6, 3, 0);
leftWall.rotation.y = Math.PI / 2;
scene.add(leftWall);

const rightWall = leftWall.clone();
rightWall.position.x = 6;
rightWall.rotation.y = -Math.PI / 2;
scene.add(rightWall);

// Кресла
const chairMat = new THREE.MeshStandardMaterial({ color: 0x4a0000 });
for (let row = 0; row < 3; row++) {
    for (let col = -2; col <= 2; col++) {
        if (col === 0) continue;
        const group = new THREE.Group();
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.6), chairMat);
        seat.position.y = 0.2;
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.1), chairMat);
        back.position.set(0, 0.5, -0.25);
        group.add(seat, back);
        group.position.set(col * 0.9, 0, row * 1.5 - 1);
        scene.add(group);
    }
}

// --- ВИДЕО ЭКРАН И ТЕКСТУРА ---
const videoElement = document.getElementById('htmlVideo');
const iframeElement = document.getElementById('iframeVideo');

const videoCanvas = document.createElement('canvas');
videoCanvas.width = 640; videoCanvas.height = 360;
const vCtx = videoCanvas.getContext('2d');

const screenTexture = new THREE.CanvasTexture(videoCanvas);
const screenMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 4.5),
    new THREE.MeshBasicMaterial({ map: screenTexture })
);
screenMesh.position.set(0, 3, -7.9);
scene.add(screenMesh);

let currentVideoType = 'none';

function applyVideoState(state) {
    currentVideoType = state.type;

    if (state.type === 'direct') {
        iframeElement.style.display = 'none';
        videoElement.src = state.url;
        videoElement.currentTime = state.currentTime || 0;
        videoElement.play().catch(() => {});
    } else {
        // Хостинги YouTube / VK / RuTube
        let embedUrl = state.url;
        if (state.type === 'youtube') {
            const match = state.url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
            const id = match ? match[1] : '';
            embedUrl = `https://www.youtube.com/embed/${id}?autoplay=1&start=${Math.floor(state.currentTime || 0)}&enablejsapi=1`;
        }
        iframeElement.src = embedUrl;
    }
}

// Игроки
let myId = null;
let remotePlayers = {};
let localPos = { x: 0, y: 0.8, z: 3 };
let yaw = 0, pitch = 0;
const keys = {};

canvas.addEventListener('click', () => {
    if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock();
    }
});

document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas) {
        yaw -= e.movementX * 0.002;
        pitch -= e.movementY * 0.002;
        pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, pitch));
        camera.rotation.set(pitch, yaw, 0, 'YXZ');
    }
});

// Уменьшенные модели персонажей
function createHumanModel(nickname) {
    const group = new THREE.Group();

    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.2, 0.7),
        new THREE.MeshStandardMaterial({ color: 0x1565c0 })
    );
    body.position.y = 0.35;
    group.add(body);

    const headGroup = new THREE.Group();
    headGroup.position.y = 0.85;

    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0xffdbac })
    );
    headGroup.add(head);
    group.add(headGroup);

    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 256; labelCanvas.height = 128;
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture }));
    sprite.position.y = 1.3;
    sprite.scale.set(1.8, 0.9, 1);
    group.add(sprite);

    group.userData = { nickname, canvas: labelCanvas, texture: labelTexture, msgTimer: null };
    updatePlayerLabel(group, "");

    return group;
}

function updatePlayerLabel(group, message) {
    const { nickname, canvas, texture } = group.userData;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 128);

    if (message) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
        ctx.beginPath();
        ctx.roundRect(20, 10, 216, 50, 10);
        ctx.fill();

        ctx.font = "Bold 14px Arial";
        ctx.fillStyle = "#000000";
        ctx.textAlign = "center";
        ctx.fillText(message, 128, 40);
    }

    ctx.font = "Bold 16px Arial";
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "#000000";
    ctx.shadowBlur = 4;
    ctx.textAlign = "center";
    ctx.fillText(nickname, 128, 90);

    texture.needsUpdate = true;
}

// Чат и события
const chatInput = document.getElementById('chatInput');
const chatHistory = document.getElementById('chatHistory');

document.addEventListener('keydown', (e) => {
    if ((e.code === 'KeyT' || e.key === 'е') && document.activeElement !== chatInput) {
        document.exitPointerLock();
        const modal = document.getElementById('videoModal');
        modal.style.display = modal.style.display === 'block' ? 'none' : 'block';
    }

    if (e.code === 'Enter') {
        if (document.activeElement === chatInput) {
            const text = chatInput.value.trim();
            if (text) socket.emit('chatMessage', text);
            chatInput.value = '';
            chatInput.style.display = 'none';
            canvas.requestPointerLock();
        } else {
            document.exitPointerLock();
            chatInput.style.display = 'block';
            chatInput.focus();
        }
    }

    keys[e.code] = true;
});
document.addEventListener('keyup', (e) => keys[e.code] = false);

function submitVideoUrl() {
    const url = document.getElementById('videoUrlInput').value.trim();
    if (url) {
        socket.emit('changeVideo', url);
        document.getElementById('videoModal').style.display = 'none';
        canvas.requestPointerLock();
    }
}

socket.emit('join', { nickname: myNickname });

socket.on('init', (data) => {
    myId = data.id;
    for (let id in data.players) {
        if (id !== myId) addRemotePlayer(data.players[id]);
    }
    applyVideoState(data.videoState);
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
        remotePlayers[p.id].target = { x: p.x, y: p.y, z: p.z, ry: p.rotY };
    }
});

socket.on('chatMessage', (data) => {
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-msg';
    msgEl.innerHTML = `<b>${data.nickname}:</b> ${data.text}`;
    chatHistory.appendChild(msgEl);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    let model = (data.id === myId) ? null : remotePlayers[data.id]?.mesh;
    if (model) {
        updatePlayerLabel(model, data.text);
        if (model.userData.msgTimer) clearTimeout(model.userData.msgTimer);
        model.userData.msgTimer = setTimeout(() => updatePlayerLabel(model, ""), 4000);
    }
});

socket.on('videoStateUpdate', (state) => {
    applyVideoState(state);
});

function addRemotePlayer(p) {
    const mesh = createHumanModel(p.nickname);
    mesh.position.set(p.x, p.y - 0.5, p.z);
    scene.add(mesh);
    remotePlayers[p.id] = { mesh, target: { x: p.x, y: p.y - 0.5, z: p.z, ry: p.rotY } };
}

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (document.pointerLockElement === canvas) {
        const speed = 2.5 * delta;
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        forward.y = 0; forward.normalize();
        const side = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        side.y = 0; side.normalize();

        let moved = false;
        if (keys['KeyW']) { localPos.x += forward.x * speed; localPos.z += forward.z * speed; moved = true; }
        if (keys['KeyS']) { localPos.x -= forward.x * speed; localPos.z -= forward.z * speed; moved = true; }
        if (keys['KeyA']) { localPos.x -= side.x * speed; localPos.z -= side.z * speed; moved = true; }
        if (keys['KeyD']) { localPos.x += side.x * speed; localPos.z += side.z * speed; moved = true; }

        localPos.x = Math.max(-5.5, Math.min(5.5, localPos.x));
        localPos.z = Math.max(-7.5, Math.min(7.5, localPos.z));

        camera.position.set(localPos.x, localPos.y, localPos.z);

        if (moved) {
            socket.emit('move', { x: localPos.x, y: localPos.y, z: localPos.z, rotY: yaw });
        }
    }

    for (let id in remotePlayers) {
        const p = remotePlayers[id];
        p.mesh.position.x += (p.target.x - p.mesh.position.x) * 0.1;
        p.mesh.position.y += (p.target.y - p.mesh.position.y) * 0.1;
        p.mesh.position.z += (p.target.z - p.mesh.position.z) * 0.1;
        p.mesh.rotation.y += (p.target.ry - p.mesh.rotation.y) * 0.1;
    }

    // Рендер кадров видео на 3D холст
    if (currentVideoType === 'direct' && videoElement.readyState >= videoElement.HAVE_CURRENT_DATA) {
        vCtx.drawImage(videoElement, 0, 0, 640, 360);
        screenTexture.needsUpdate = true;
    } else if (currentVideoType !== 'direct') {
        vCtx.fillStyle = '#050508';
        vCtx.fillRect(0, 0, 640, 360);
        vCtx.fillStyle = '#ff0055';
        vCtx.font = 'Bold 20px Arial';
        vCtx.textAlign = 'center';
        vCtx.fillText('ТРАНСЛЯЦИЯ ВКЛЮЧЕНА НА ЭКРАНЕ', 320, 180);
        screenTexture.needsUpdate = true;
    }

    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
