const socket = io();

const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
if (isMobile) {
    document.getElementById('joystickZone').style.display = 'block';
}

let myNickname = "Зритель";
if (window.Telegram && window.Telegram.WebApp) {
    window.Telegram.WebApp.ready();
    const user = window.Telegram.WebApp.initDataUnsafe?.user;
    if (user) myNickname = user.username ? `@${user.username}` : user.first_name;
}

// 1. WebGL & CSS3D Сцены
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020204);

const cssScene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 50);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('webgl').appendChild(renderer.domElement);

const cssRenderer = new THREE.CSS3DRenderer();
cssRenderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('css3d').appendChild(cssRenderer.domElement);

// Освещение
scene.add(new THREE.AmbientLight(0xffffff, 0.5));

// 2. 3D Театр
const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 16),
    new THREE.MeshStandardMaterial({ color: 0x22080a })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const wallMat = new THREE.MeshStandardMaterial({ color: 0x100b08 });
const backWall = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), wallMat);
backWall.position.set(0, 3, -8);
scene.add(backWall);

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

// 3. НАСТОЯЩИЙ CSS3D ВИДЕО ЭКРАН (Прямо в 3D мире!)
const iframe = document.createElement('iframe');
iframe.style.width = '800px';
iframe.style.height = '450px';
iframe.style.border = '0px';
iframe.allow = 'autoplay';

const cssObject = new THREE.CSS3DObject(iframe);
cssObject.position.set(0, 3, -7.89);
cssObject.scale.set(8 / 800, 4.5 / 450, 1);
cssScene.add(cssObject);

function updateVideoFrame(url, time) {
    let embedUrl = url;
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        const id = url.split('v=')[1] || url.split('/').pop();
        embedUrl = `https://www.youtube.com/embed/${id}?autoplay=1&start=${Math.floor(time)}`;
    } else if (url.includes('rutube.ru')) {
        const id = url.split('/').pop();
        embedUrl = `https://rutube.ru/play/embed/${id}`;
    }
    iframe.src = embedUrl;
}

// 4. Текстура Лица Персонажа
function createFaceTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffdbac';
    ctx.fillRect(0, 0, 128, 128);

    // Глаза
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(35, 45, 10, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(93, 45, 10, 0, Math.PI * 2); ctx.fill();

    // Улыбка
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(64, 70, 30, 0.2, Math.PI - 0.2); ctx.stroke();

    return new THREE.CanvasTexture(canvas);
}

const faceTexture = createFaceTexture();

function createHumanModel(nickname) {
    const group = new THREE.Group();

    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.2, 0.7),
        new THREE.MeshStandardMaterial({ color: 0x1565c0 })
    );
    body.position.y = 0.35;
    group.add(body);

    const headMat = [
        new THREE.MeshStandardMaterial({ color: 0xffdbac }),
        new THREE.MeshStandardMaterial({ color: 0xffdbac }),
        new THREE.MeshStandardMaterial({ color: 0xffdbac }),
        new THREE.MeshStandardMaterial({ color: 0xffdbac }),
        new THREE.MeshStandardMaterial({ map: faceTexture }), // Лицо спереди
        new THREE.MeshStandardMaterial({ color: 0xffdbac })
    ];

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), headMat);
    head.position.y = 0.85;
    group.add(head);

    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 256; labelCanvas.height = 128;
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture }));
    sprite.position.y = 1.3;
    sprite.scale.set(1.8, 0.9, 1);
    group.add(sprite);

    group.userData = { nickname, canvas: labelCanvas, texture: labelTexture };
    updatePlayerLabel(group, "");

    return group;
}

function updatePlayerLabel(group, message) {
    const { nickname, canvas, texture } = group.userData;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 128);

    if (message) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
        ctx.beginPath(); ctx.roundRect(20, 10, 216, 50, 10); ctx.fill();
        ctx.font = "Bold 14px Arial"; ctx.fillStyle = "#000000"; ctx.textAlign = "center";
        ctx.fillText(message, 128, 40);
    }

    ctx.font = "Bold 16px Arial"; ctx.fillStyle = "#ffffff"; ctx.textAlign = "center";
    ctx.fillText(nickname, 128, 90);
    texture.needsUpdate = true;
}

// 5. Управление (ПК и Сенсорное)
let myId = null;
let remotePlayers = {};
let localPos = { x: 0, y: 0.8, z: 3 };
let yaw = 0, pitch = 0;
const keys = {};

const webglEl = document.getElementById('webgl');
webglEl.addEventListener('click', () => {
    if (!isMobile && document.pointerLockElement !== webglEl) webglEl.requestPointerLock();
});

document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === webglEl) {
        yaw -= e.movementX * 0.002;
        pitch -= e.movementY * 0.002;
        pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, pitch));
        camera.rotation.set(pitch, yaw, 0, 'YXZ');
    }
});

// Сенсорный осмотр экраном на телефоне
let touchStartX = 0, touchStartY = 0;
document.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1 && e.touches[0].clientX > window.innerWidth / 2) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }
});
document.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && e.touches[0].clientX > window.innerWidth / 2) {
        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;
        yaw -= dx * 0.005;
        pitch -= dy * 0.005;
        pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, pitch));
        camera.rotation.set(pitch, yaw, 0, 'YXZ');
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }
});

// Чат и кнопка видео
const chatInput = document.getElementById('chatInput');
const chatHistory = document.getElementById('chatHistory');
const modal = document.getElementById('videoModal');

document.getElementById('btnChat').onclick = () => {
    chatInput.style.display = chatInput.style.display === 'block' ? 'none' : 'block';
    if (chatInput.style.display === 'block') chatInput.focus();
};
document.getElementById('btnVideo').onclick = () => {
    modal.style.display = modal.style.display === 'block' ? 'none' : 'block';
};

document.addEventListener('keydown', (e) => {
    if ((e.code === 'KeyT' || e.key === 'е') && document.activeElement !== chatInput) {
        modal.style.display = modal.style.display === 'block' ? 'none' : 'block';
    }
    if (e.code === 'Enter') {
        if (document.activeElement === chatInput) {
            const text = chatInput.value.trim();
            if (text) socket.emit('chatMessage', text);
            chatInput.value = '';
            chatInput.style.display = 'none';
        } else {
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
        modal.style.display = 'none';
    }
}

// 6. Сетевая синхронизация
socket.emit('join', { nickname: myNickname });

socket.on('init', (data) => {
    myId = data.id;
    for (let id in data.players) {
        if (id !== myId) addRemotePlayer(data.players[id]);
    }
    updateVideoFrame(data.videoState.url, data.videoState.currentTime);
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
        setTimeout(() => updatePlayerLabel(model, ""), 4000);
    }
});
socket.on('videoStateUpdate', (state) => {
    updateVideoFrame(state.url, state.currentTime);
});

function addRemotePlayer(p) {
    const mesh = createHumanModel(p.nickname);
    mesh.position.set(p.x, p.y - 0.5, p.z);
    scene.add(mesh);
    remotePlayers[p.id] = { mesh, target: { x: p.x, y: p.y - 0.5, z: p.z, ry: p.rotY } };
}

// 7. Игровой цикл
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

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

    for (let id in remotePlayers) {
        const p = remotePlayers[id];
        p.mesh.position.x += (p.target.x - p.mesh.position.x) * 0.1;
        p.mesh.position.y += (p.target.y - p.mesh.position.y) * 0.1;
        p.mesh.position.z += (p.target.z - p.mesh.position.z) * 0.1;
        p.mesh.rotation.y += (p.target.ry - p.mesh.rotation.y) * 0.1;
    }

    renderer.render(scene, camera);
    cssRenderer.render(cssScene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    cssRenderer.setSize(window.innerWidth, window.innerHeight);
});
