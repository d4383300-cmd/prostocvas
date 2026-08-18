const socket = io();

const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
let myNickname = "Зритель #" + Math.floor(Math.random() * 899 + 100);

// 1. Сцены
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020204);

const cssScene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 50);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('webgl').appendChild(renderer.domElement);

const cssRenderer = new THREE.CSS3DRenderer();
cssRenderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('css3d').appendChild(cssRenderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.7));

// 2. 3D Зал
const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.MeshStandardMaterial({ color: 0x1a0507, roughness: 0.8 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const wallMat = new THREE.MeshStandardMaterial({ color: 0x0d090a });
const backWall = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), wallMat);
backWall.position.set(0, 2.5, -5);
scene.add(backWall);

const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), wallMat);
leftWall.position.set(-5, 2.5, 0);
leftWall.rotation.y = Math.PI / 2;
scene.add(leftWall);

const rightWall = leftWall.clone();
rightWall.position.x = 5;
rightWall.rotation.y = -Math.PI / 2;
scene.add(rightWall);

const frameMat = new THREE.MeshStandardMaterial({ color: 0x330000 });
const topFrame = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.2, 0.1), frameMat);
topFrame.position.set(0, 4.8, -4.9);
scene.add(topFrame);

// 3. Canvas для эффектов под элекран
const screenCanvas = document.createElement('canvas');
screenCanvas.width = 1280;
screenCanvas.height = 720;
const screenCtx = screenCanvas.getContext('2d');
const screenTexture = new THREE.CanvasTexture(screenCanvas);

const screenMat = new THREE.MeshBasicMaterial({ map: screenTexture });
const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(8, 4.5), screenMat);
screenMesh.position.set(0, 2.6, -4.9);
scene.add(screenMesh);

// 4. Кресла
const SEAT_POSITIONS_X = [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5];
const chairMat = new THREE.MeshStandardMaterial({ color: 0x5a0000 });
const armMat = new THREE.MeshStandardMaterial({ color: 0x111111 });

SEAT_POSITIONS_X.forEach((posX) => {
    const chair = new THREE.Group();

    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.15, 0.7), chairMat);
    seat.position.set(0, 0.4, 0);
    chair.add(seat);

    const back = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.15), chairMat);
    back.position.set(0, 0.8, 0.3);
    chair.add(back);

    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.6), armMat);
    armL.position.set(-0.42, 0.55, 0);
    const armR = armL.clone();
    armR.position.x = 0.42;
    chair.add(armL, armR);

    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4), armMat);
    leg.position.set(0, 0.2, 0);
    chair.add(leg);

    chair.position.set(posX, 0, 2.0);
    scene.add(chair);
});

// 5. CSS3D Экран (Iframe YouTube / Rutube / VK)
const iframe = document.createElement('iframe');
iframe.style.width = '800px';
iframe.style.height = '450px';
iframe.style.border = '0px';
iframe.allow = 'autoplay; encrypted-media; fullscreen';

const cssObject = new THREE.CSS3DObject(iframe);
cssObject.position.set(0, 2.6, -4.89);
cssObject.scale.set(8 / 800, 4.5 / 450, 1);
cssScene.add(cssObject);

let currentVideoTime = 0;
let currentVideoUrl = '';

function updateVideoFrame(url, time) {
    currentVideoUrl = url;
    currentVideoTime = time;
    let embedUrl = url;

    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        const id = url.split('v=')[1] || url.split('/').pop();
        embedUrl = `https://www.youtube.com/embed/${id}?autoplay=1&start=${Math.floor(time)}`;
    } else if (url.includes('rutube.ru')) {
        const id = url.split('/').pop();
        embedUrl = `https://rutube.ru/play/embed/${id}`;
    } else if (url.includes('vk.com') || url.includes('vkvideo.ru')) {
        embedUrl = url; // VK Embed ссылка
    }
    iframe.src = embedUrl;
}

// 6. Персонажи
function createFaceTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffdbac';
    ctx.fillRect(0, 0, 128, 128);

    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(35, 45, 8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(93, 45, 8, 0, Math.PI * 2); ctx.fill();

    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(64, 70, 25, 0.2, Math.PI - 0.2); ctx.stroke();

    return new THREE.CanvasTexture(canvas);
}

const faceTexture = createFaceTexture();

function createSeatedPlayer(nickname, bodyColor = 0x1565c0) {
    const group = new THREE.Group();

    const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.6, 0.4),
        new THREE.MeshStandardMaterial({ color: bodyColor })
    );
    body.position.set(0, 0.6, 0);
    group.add(body);

    const legs = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.15, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x0d47a1 })
    );
    legs.position.set(0, 0.4, -0.2);
    group.add(legs);

    const headMat = [
        new THREE.MeshStandardMaterial({ color: 0xffdbac }),
        new THREE.MeshStandardMaterial({ color: 0xffdbac }),
        new THREE.MeshStandardMaterial({ color: 0xffdbac }),
        new THREE.MeshStandardMaterial({ color: 0xffdbac }),
        new THREE.MeshStandardMaterial({ color: 0x3e2723 }),
        new THREE.MeshStandardMaterial({ map: faceTexture })
    ];

    const headGroup = new THREE.Group();
    headGroup.name = "headGroup";
    headGroup.position.set(0, 1.05, 0);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), headMat);
    headGroup.add(head);
    group.add(headGroup);

    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 256; labelCanvas.height = 128;
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture }));
    sprite.position.set(0, 1.5, 0);
    sprite.scale.set(1.6, 0.8, 1);
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

// 7. Управление
let myId = null;
let mySeatIndex = null;
let remotePlayers = {};
let myMesh = null;
let yaw = 0, pitch = 0;
let isStreamMode = false;

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
    if (e.code === 'Enter' && document.activeElement !== chatInput) {
        toggleChat();
    }
});

function submitVideoUrl() {
    const url = document.getElementById('videoUrlInput').value.trim();
    if (url) {
        socket.emit('changeVideo', url);
        modal.style.display = 'none';
        document.getElementById('videoUrlInput').value = '';
    }
}

// 8. Сеть
socket.emit('join', { nickname: myNickname });

socket.on('fullRoom', (msg) => {
    const overlay = document.getElementById('fullOverlay');
    overlay.innerText = msg;
    overlay.style.display = 'flex';
});

socket.on('init', (data) => {
    document.getElementById('fullOverlay').style.display = 'none';

    myId = data.id;
    mySeatIndex = data.seatIndex;

    if (!myMesh) {
        myMesh = createSeatedPlayer(myNickname, 0x2e7d32);
        myMesh.position.set(SEAT_POSITIONS_X[mySeatIndex], 0, 2.0);
        scene.add(myMesh);
    }

    resetCameraPosition();

    for (let id in data.players) {
        if (id !== myId) addRemotePlayer(data.players[id]);
    }
    
    handleVideoState(data.videoState);
});

socket.on('playerJoined', (p) => addRemotePlayer(p));
socket.on('playerLeft', (id) => {
    if (remotePlayers[id]) {
        scene.remove(remotePlayers[id].mesh);
        delete remotePlayers[id];
    }
});
socket.on('playerLooked', (data) => {
    if (remotePlayers[data.id]) {
        const headGroup = remotePlayers[data.id].mesh.getObjectByName("headGroup");
        if (headGroup) headGroup.rotation.y = data.rotY;
    }
});
socket.on('chatMessage', (data) => {
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-msg';
    msgEl.innerHTML = `<b>${data.nickname}:</b> ${data.text}`;
    chatHistory.appendChild(msgEl);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    let model = data.id === myId ? myMesh : remotePlayers[data.id]?.mesh;
    if (model) {
        updatePlayerLabel(model, data.text);
        setTimeout(() => updatePlayerLabel(model, ""), 4000);
    }
});

socket.on('videoStateUpdate', (state) => {
    handleVideoState(state);
});

function handleVideoState(state) {
    isStreamMode = !!state.isStreamMode;
    updateVideoFrame(state.url, state.currentTime);
}

function resetCameraPosition() {
    if (mySeatIndex !== null) {
        const seatX = SEAT_POSITIONS_X[mySeatIndex];
        camera.position.set(seatX, 1.05, 2.0);
        camera.rotation.set(0, 0, 0);
        yaw = 0;
        pitch = 0;
    }
}

function addRemotePlayer(p) {
    const mesh = createSeatedPlayer(p.nickname);
    mesh.position.set(p.x, 0, p.z);
    scene.add(mesh);
    remotePlayers[p.id] = { mesh };
}

// 9. Анимация Canvas-экрана
let clock = new THREE.Clock();

function renderScreenContent(time) {
    screenCtx.fillStyle = '#080810';
    screenCtx.fillRect(0, 0, 1280, 720);

    if (isStreamMode) {
        screenCtx.fillStyle = '#ff0055';
        screenCtx.font = 'Bold 48px Arial';
        screenCtx.fillText('LIVE STREAM SHOW', 420, 100);

        const colors = ['#ff0055', '#00ffcc', '#ffcc00', '#9900ff'];
        for (let i = 0; i < 4; i++) {
            const x = 300 + i * 220;
            const bounce = Math.abs(Math.sin(time * 6 + i)) * 60;
            
            screenCtx.fillStyle = colors[i];
            screenCtx.fillRect(x, 400 - bounce, 80, 120);
            screenCtx.fillStyle = '#ffdbac';
            screenCtx.beginPath();
            screenCtx.arc(x + 40, 350 - bounce, 30, 0, Math.PI * 2);
            screenCtx.fill();
        }

        screenCtx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        screenCtx.beginPath();
        screenCtx.moveTo(640 + Math.sin(time * 2) * 300, 0);
        screenCtx.lineTo(200, 720);
        screenCtx.lineTo(1080, 720);
        screenCtx.fill();

    } else {
        screenCtx.fillStyle = '#111122';
        screenCtx.fillRect(50, 50, 1180, 620);

        screenCtx.fillStyle = '#00ffcc';
        screenCtx.font = 'Bold 36px Arial';
        screenCtx.fillText('▶ PLAYING VIDEO', 100, 120);

        const currentSec = Math.floor(currentVideoTime + clock.getElapsedTime());
        const mins = String(Math.floor(currentSec / 60)).padStart(2, '0');
        const secs = String(currentSec % 60).padStart(2, '0');
        
        screenCtx.fillStyle = '#ffffff';
        screenCtx.font = 'Bold 28px Arial';
        screenCtx.fillText(`TIME: ${mins}:${secs}`, 100, 180);

        for (let i = 0; i < 30; i++) {
            const h = Math.abs(Math.sin(time * 4 + i * 0.5)) * 250 + 20;
            screenCtx.fillStyle = `hsl(${(i * 12 + time * 50) % 360}, 100%, 50%)`;
            screenCtx.fillRect(100 + i * 36, 600 - h, 24, h);
        }
    }

    screenTexture.needsUpdate = true;
}

function animate() {
    requestAnimationFrame(animate);

    const time = clock.getElapsedTime();
    renderScreenContent(time);

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
