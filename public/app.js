const socket = io();
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

let myNickname = "Зритель";
if (window.Telegram && window.Telegram.WebApp) {
    window.Telegram.WebApp.ready();
    const user = window.Telegram.WebApp.initDataUnsafe?.user;
    if (user) myNickname = user.username ? `@${user.username}` : user.first_name;
}

// 1. Сцены
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020204);

const cssScene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 100);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('webgl').appendChild(renderer.domElement);

const cssRenderer = new THREE.CSS3DRenderer();
cssRenderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('css3d').appendChild(cssRenderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.5));

// 2. Архитектура Зала
const stepMat = new THREE.MeshStandardMaterial({ color: 0x1f191b });
const floor1 = new THREE.Mesh(new THREE.BoxGeometry(10, 0.2, 3), stepMat);
floor1.position.set(0, 0, 1.5);
scene.add(floor1);

const floor2 = new THREE.Mesh(new THREE.BoxGeometry(10, 0.8, 3), stepMat);
floor2.position.set(0, 0.3, 4.5);
scene.add(floor2);

// 3. Плеер (YouTube, RuTube, VK Видео)
const screenMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(8, 4.5), screenMat);
screenMesh.position.set(0, 2.6, -4.9);
scene.add(screenMesh);

const iframe = document.createElement('iframe');
iframe.style.width = '800px';
iframe.style.height = '450px';
iframe.style.border = '0';
iframe.allow = 'autoplay; encrypted-media';

const cssObject = new THREE.CSS3DObject(iframe);
cssObject.position.set(0, 2.6, -4.89);
cssObject.scale.set(8 / 800, 4.5 / 450, 1);
cssScene.add(cssObject);

const textureLoader = new THREE.TextureLoader();

function parseVideoUrl(url, time = 0) {
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        const id = url.split('v=')[1]?.split('&')[0] || url.split('/').pop();
        textureLoader.load(`https://img.youtube.com/vi/${id}/hqdefault.jpg`, tex => {
            screenMat.map = tex;
            screenMat.needsUpdate = true;
        });
        return `https://www.youtube.com/embed/${id}?autoplay=1&start=${Math.floor(time)}`;
    }
    if (url.includes('rutube.ru')) {
        const id = url.split('/').filter(Boolean).pop();
        return `https://rutube.ru/play/embed/${id}`;
    }
    if (url.includes('vk.com')) {
        return url; // Прямой embed URL от VK
    }
    return url;
}

function updateVideoFrame(url, time) {
    iframe.src = parseVideoUrl(url, time);
}

// 4. Постройка 12 Кресел
const SEAT_POSITIONS = [
    { x: -3.5, y: 0.5, z: 1.5 }, { x: -2.1, y: 0.5, z: 1.5 }, { x: -0.7, y: 0.5, z: 1.5 },
    { x: 0.7, y: 0.5, z: 1.5 }, { x: 2.1, y: 0.5, z: 1.5 }, { x: 3.5, y: 0.5, z: 1.5 },
    { x: -3.5, y: 1.1, z: 4.5 }, { x: -2.1, y: 1.1, z: 4.5 }, { x: -0.7, y: 1.1, z: 4.5 },
    { x: 0.7, y: 1.1, z: 4.5 }, { x: 2.1, y: 1.1, z: 4.5 }, { x: 3.5, y: 1.1, z: 4.5 }
];

const chairMat = new THREE.MeshStandardMaterial({ color: 0x660000 });
SEAT_POSITIONS.forEach(pos => {
    const group = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.6), chairMat);
    seat.position.set(0, 0.4, 0);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.12), chairMat);
    back.position.set(0, 0.75, 0.25);
    group.add(seat, back);
    group.position.set(pos.x, pos.y - 0.4, pos.z);
    scene.add(group);
});

// 5. Модели Персонажей
const skinColors = [0xffdbac, 0xf1c27d, 0x8d5524, 0xc68642];
const hairColors = [0x090806, 0x2c222b, 0x716355, 0xb89778];
const clothesColors = [0x1565c0, 0x2e7d32, 0xc62828, 0x6a1b9a];

function createHumanModel(nickname, shirtColor = 0x1565c0) {
    const group = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: skinColors[Math.floor(Math.random() * skinColors.length)] });
    const hairMat = new THREE.MeshStandardMaterial({ color: hairColors[Math.floor(Math.random() * hairColors.length)] });
    const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.25), shirtMat);
    body.position.set(0, 0.5, 0);
    group.add(body);

    const headGroup = new THREE.Group();
    headGroup.name = "headGroup";
    headGroup.position.set(0, 0.85, 0);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), skinMat);
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.08, 0.27), hairMat);
    hair.position.set(0, 0.14, 0);
    headGroup.add(head, hair);
    group.add(headGroup);

    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), shirtMat);
    armL.position.set(-0.26, 0.45, 0.05);
    armL.rotation.x = -0.3;
    const armR = armL.clone();
    armR.position.x = 0.26;
    group.add(armL, armR);

    // Никнейм над головой
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 256; labelCanvas.height = 128;
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture }));
    sprite.position.set(0, 1.3, 0);
    sprite.scale.set(1.6, 0.8, 1);
    group.add(sprite);

    group.userData = { nickname, canvas: labelCanvas, texture: labelTexture };
    updatePlayerLabel(group, "");

    return group;
}

function updatePlayerLabel(group, msg) {
    const { nickname, canvas, texture } = group.userData;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 128);

    if (msg) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
        ctx.beginPath(); ctx.roundRect(20, 10, 216, 50, 10); ctx.fill();
        ctx.font = "Bold 14px Arial"; ctx.fillStyle = "#000000"; ctx.textAlign = "center";
        ctx.fillText(msg, 128, 40);
    }

    ctx.font = "Bold 16px Arial"; ctx.fillStyle = "#ffffff"; ctx.textAlign = "center";
    ctx.fillText(nickname, 128, 90);
    texture.needsUpdate = true;
}

// 6. Управление Камерой (ПК + Мобильные)
let yaw = 0, pitch = 0;
let myId = null, mySeatIndex = null, myMesh = null;
let remotePlayers = {};

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
        socket.emit('look', { rotY: yaw });
    }
});

let touchStartX = 0, touchStartY = 0;
document.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }
});
document.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;
        yaw -= dx * 0.004;
        pitch -= dy * 0.004;
        pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, pitch));
        camera.rotation.set(pitch, yaw, 0, 'YXZ');
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        socket.emit('look', { rotY: yaw });
    }
});

// 7. Чат и Модалки UI
const chatInputContainer = document.getElementById('chatInputContainer');
const chatInput = document.getElementById('chatInput');
const chatHistory = document.getElementById('chatHistory');
const modal = document.getElementById('videoModal');

function toggleChat() {
    const isVisible = chatInputContainer.style.display === 'flex';
    chatInputContainer.style.display = isVisible ? 'none' : 'flex';
    if (!isVisible) chatInput.focus();
}

function sendMessage() {
    const text = chatInput.value.trim();
    if (text) socket.emit('chatMessage', text);
    chatInput.value = '';
    chatInputContainer.style.display = 'none';
}

document.getElementById('btnChat').onclick = toggleChat;
document.getElementById('btnVideo').onclick = () => {
    modal.style.display = modal.style.display === 'block' ? 'none' : 'block';
};

chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
});

document.addEventListener('keydown', (e) => {
    if ((e.code === 'KeyT' || e.key === 'е') && document.activeElement !== chatInput) {
        modal.style.display = modal.style.display === 'block' ? 'none' : 'block';
    }
    if (e.code === 'Enter' && document.activeElement !== chatInput) toggleChat();
});

function submitVideoUrl() {
    const url = document.getElementById('videoUrlInput').value.trim();
    if (url) {
        socket.emit('changeVideo', url);
        modal.style.display = 'none';
        document.getElementById('videoUrlInput').value = '';
    }
}

// 8. Сетевая Синхронизация
socket.emit('join', { nickname: myNickname });

socket.on('init', (data) => {
    myId = data.id;
    mySeatIndex = data.seatIndex;
    const pos = SEAT_POSITIONS[mySeatIndex];

    camera.position.set(pos.x, pos.y + 0.3, pos.z);
    camera.rotation.set(0, 0, 0);

    myMesh = createHumanModel(myNickname, 0x2e7d32);
    myMesh.position.set(pos.x, pos.y - 0.4, pos.z);
    scene.add(myMesh);

    for (let id in data.players) {
        if (id !== myId) addRemotePlayer(data.players[id]);
    }

    updateVideoFrame(data.videoState.url, data.videoState.currentTime);
});

socket.on('playerJoined', p => addRemotePlayer(p));
socket.on('playerLeft', id => {
    if (remotePlayers[id]) {
        scene.remove(remotePlayers[id].mesh);
        delete remotePlayers[id];
    }
});

socket.on('playerLooked', data => {
    if (remotePlayers[data.id]) {
        const headGroup = remotePlayers[data.id].mesh.getObjectByName("headGroup");
        if (headGroup) headGroup.rotation.y = data.rotY;
    }
});

socket.on('chatMessage', data => {
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-msg';
    msgEl.innerHTML = `<b>${data.nickname}:</b> ${data.text}`;
    chatHistory.appendChild(msgEl);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    const model = data.id === myId ? myMesh : remotePlayers[data.id]?.mesh;
    if (model) {
        updatePlayerLabel(model, data.text);
        setTimeout(() => updatePlayerLabel(model, ""), 4000);
    }
});

socket.on('videoStateUpdate', state => updateVideoFrame(state.url, state.currentTime));

function addRemotePlayer(p) {
    const mesh = createHumanModel(p.nickname);
    mesh.position.set(p.x, p.y - 0.4, p.z);
    scene.add(mesh);
    remotePlayers[p.id] = { mesh };
}

// 9. Анимация
function animate() {
    requestAnimationFrame(animate);
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
