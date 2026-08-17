const socket = io();
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

let myNickname = "Зритель";
if (window.Telegram && window.Telegram.WebApp) {
    window.Telegram.WebApp.ready();
    const user = window.Telegram.WebApp.initDataUnsafe?.user;
    if (user) myNickname = user.username ? `@${user.username}` : user.first_name;
}

// 1. Инициализация Сцены и Рендереров
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x040306);

const cssScene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 100);

// preserveDrawingBuffer: true КРИТИЧЕСКИ ВАЖЕН, ЧТОБЫ СКРИНШОТЫ НЕ БЫЛИ ЧЕРНЫМИ
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('webgl').appendChild(renderer.domElement);

const cssRenderer = new THREE.CSS3DRenderer();
cssRenderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('css3d').appendChild(cssRenderer.domElement);

// 2. Освещение Зала
const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambientLight);

// Подсветка сцены и экрана
const stageLight = new THREE.SpotLight(0xffaa55, 1.2);
stageLight.position.set(0, 6, -1);
stageLight.target.position.set(0, 2.5, -4.8);
scene.add(stageLight);
scene.add(stageLight.target);

// 3. Архитектура Зала (Стены, Пол, Потолок)
const wallMat = new THREE.MeshStandardMaterial({ color: 0x160c10, roughness: 0.9 });
const carpetMat = new THREE.MeshStandardMaterial({ color: 0x420610, roughness: 0.7 });
const woodMat = new THREE.MeshStandardMaterial({ color: 0x1c0e08, roughness: 0.5 });

// Пол основного зала
const mainFloor = new THREE.Mesh(new THREE.BoxGeometry(12, 0.2, 12), carpetMat);
mainFloor.position.set(0, 0, 1);
scene.add(mainFloor);

// Подъем для второго ряда
const stepRow2 = new THREE.Mesh(new THREE.BoxGeometry(12, 0.6, 4), woodMat);
stepRow2.position.set(0, 0.3, 4.2);
scene.add(stepRow2);

// Стены кинотеатра
const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 7, 12), wallMat);
leftWall.position.set(-6, 3.3, 1);
scene.add(leftWall);

const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 7, 12), wallMat);
rightWall.position.set(6, 3.3, 1);
scene.add(rightWall);

const backWall = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 0.2), wallMat);
backWall.position.set(0, 3.3, 7);
scene.add(backWall);

const ceiling = new THREE.Mesh(new THREE.BoxGeometry(12, 0.2, 12), wallMat);
ceiling.position.set(0, 6.8, 1);
scene.add(ceiling);

// Настенные светильники (бра)
function addWallLamp(x, y, z) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.2), new THREE.MeshBasicMaterial({ color: 0xffaa33 }));
    lamp.position.set(x, y, z);
    scene.add(lamp);

    const light = new THREE.PointLight(0xffaa33, 0.5, 5);
    light.position.set(x, y, z);
    scene.add(light);
}
addWallLamp(-5.8, 3.5, -1);
addWallLamp(-5.8, 3.5, 3);
addWallLamp(5.8, 3.5, -1);
addWallLamp(5.8, 3.5, 3);

// 4. Экран Кинотеатра
const screenFrame = new THREE.Mesh(new THREE.BoxGeometry(8.4, 4.9, 0.1), woodMat);
screenFrame.position.set(0, 2.8, -4.95);
scene.add(screenFrame);

const screenMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(8, 4.5), screenMat);
screenMesh.position.set(0, 2.8, -4.89);
scene.add(screenMesh);

// CSS3D Iframe
const iframe = document.createElement('iframe');
iframe.style.width = '800px';
iframe.style.height = '450px';
iframe.style.border = '0';
iframe.allow = 'autoplay; encrypted-media';

const cssObject = new THREE.CSS3DObject(iframe);
cssObject.position.set(0, 2.8, -4.88);
cssObject.scale.set(8 / 800, 4.5 / 450, 1);
cssScene.add(cssObject);

const textureLoader = new THREE.TextureLoader();

// Очищаем ссылку от лишних query-параметров, чтобы превью грузилось без CORS-ошибки
function parseVideoUrl(url, time = 0) {
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        let cleanUrl = url.split('?')[0];
        let id = cleanUrl.split('v=')[1]?.split('&')[0] || cleanUrl.split('/').pop();
        if (!id || id.includes('watch')) {
            const match = url.match(/[?&]v=([^&]+)/);
            if (match) id = match[1];
        }
        if (id) {
            textureLoader.load(`https://img.youtube.com/vi/${id}/hqdefault.jpg`, tex => {
                screenMat.map = tex;
                screenMat.needsUpdate = true;
            }, undefined, () => {});
            return `https://www.youtube.com/embed/${id}?autoplay=1&start=${Math.floor(time)}`;
        }
    }
    if (url.includes('rutube.ru')) {
        const id = url.split('/').filter(Boolean).pop();
        return `https://rutube.ru/play/embed/${id}`;
    }
    return url;
}

function updateVideoFrame(url, time) {
    iframe.src = parseVideoUrl(url, time);
}

// 5. Места и Кресла
const SEAT_POSITIONS = [
    { x: -3.0, y: 0.6, z: 1.5 }, { x: -1.8, y: 0.6, z: 1.5 }, { x: -0.6, y: 0.6, z: 1.5 },
    { x: 0.6, y: 0.6, z: 1.5 },  { x: 1.8, y: 0.6, z: 1.5 },  { x: 3.0, y: 0.6, z: 1.5 },
    { x: -3.0, y: 1.2, z: 4.2 }, { x: -1.8, y: 1.2, z: 4.2 }, { x: -0.6, y: 1.2, z: 4.2 },
    { x: 0.6, y: 1.2, z: 4.2 },  { x: 1.8, y: 1.2, z: 4.2 },  { x: 3.0, y: 1.2, z: 4.2 }
];

const chairMat = new THREE.MeshStandardMaterial({ color: 0x800000, roughness: 0.5 });
const armMat = new THREE.MeshStandardMaterial({ color: 0x111111 });

SEAT_POSITIONS.forEach(pos => {
    const chair = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.6), chairMat);
    seat.position.set(0, 0.2, 0);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.75, 0.12), chairMat);
    back.position.set(0, 0.55, 0.25);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.5), armMat);
    armL.position.set(-0.38, 0.35, 0);
    const armR = armL.clone();
    armR.position.x = 0.38;

    chair.add(seat, back, armL, armR);
    chair.position.set(pos.x, pos.y - 0.5, pos.z);
    scene.add(chair);
});

// 6. Персонажи
const skinColors = [0xffdbac, 0xf1c27d, 0xe0ac69, 0x8d5524];
const hairColors = [0x090806, 0x2c222b, 0x716355, 0xa52a2a];
const shirtColors = [0x1565c0, 0x2e7d32, 0xc62828, 0x6a1b9a, 0xef6c00];

function createPersonModel(nickname, shirtColor = 0x1565c0) {
    const group = new THREE.Group();
    const skin = skinColors[Math.floor(Math.random() * skinColors.length)];
    const hair = hairColors[Math.floor(Math.random() * hairColors.length)];

    const bodyMat = new THREE.MeshStandardMaterial({ color: shirtColor });
    const skinMat = new THREE.MeshStandardMaterial({ color: skin });
    const hairMat = new THREE.MeshStandardMaterial({ color: hair });

    // Тело
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 0.25), bodyMat);
    body.position.set(0, -0.1, 0);
    group.add(body);

    // Голова
    const headGroup = new THREE.Group();
    headGroup.name = "headGroup";
    headGroup.position.set(0, 0.25, 0);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), skinMat);
    const hairMesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.28), hairMat);
    hairMesh.position.set(0, 0.14, 0);

    headGroup.add(head, hairMesh);
    group.add(headGroup);

    // Руки
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.38, 0.1), bodyMat);
    armL.position.set(-0.28, -0.05, 0.05);
    armL.rotation.x = -0.2;
    const armR = armL.clone();
    armR.position.x = 0.28;
    group.add(armL, armR);

    // Никнейм
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 128;
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }));
    sprite.position.set(0, 0.75, 0);
    sprite.scale.set(1.4, 0.7, 1);
    group.add(sprite);

    group.userData = { nickname, canvas, texture };
    updateLabel(group, "");

    return group;
}

function updateLabel(group, msg) {
    const { nickname, canvas, texture } = group.userData;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 128);

    if (msg) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
        ctx.beginPath(); ctx.roundRect(15, 10, 226, 50, 10); ctx.fill();
        ctx.font = "Bold 16px Arial"; ctx.fillStyle = "#000000"; ctx.textAlign = "center";
        ctx.fillText(msg, 128, 42);
    }

    ctx.font = "Bold 18px Arial"; ctx.fillStyle = "#ffffff"; ctx.textAlign = "center";
    ctx.fillText(nickname, 128, 92);
    texture.needsUpdate = true;
}

// 7. Расстановка NPC во Второй Ряд (Места 6..11)
const npcNames = ['Алексей', 'Мария', 'Дмитрий', 'Елена', 'Кирилл', 'Ольга'];
const activeNPCs = [];

function initBackRowNPCs() {
    for (let i = 6; i < 12; i++) {
        const name = npcNames[i - 6];
        const shirt = shirtColors[(i - 6) % shirtColors.length];
        const npc = createPersonModel(name, shirt);
        const pos = SEAT_POSITIONS[i];
        npc.position.set(pos.x, pos.y - 0.2, pos.z);
        scene.add(npc);
        activeNPCs.push(npc);
    }
}
initBackRowNPCs();

// Реакции NPC
const reactions = ['🔥', '🍿', '😂', '👏', '😱', '👍'];
setInterval(() => {
    if (activeNPCs.length > 0) {
        const npc = activeNPCs[Math.floor(Math.random() * activeNPCs.length)];
        const emoji = reactions[Math.floor(Math.random() * reactions.length)];
        updateLabel(npc, emoji);
        setTimeout(() => updateLabel(npc, ""), 3000);
    }
}, 4000);

// 8. Управление Камерой и Кадры
let yaw = 0, pitch = 0;
let myId = null, mySeatIndex = null, myMesh = null;
let remotePlayers = {};

const webglEl = document.getElementById('webgl');
webglEl.addEventListener('click', () => {
    if (!isMobile && document.pointerLockElement !== webglEl) {
        webglEl.requestPointerLock();
    }
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

// Захват кадра: камера переходит в обзорный режим над всем залом
socket.on('requestLiveCapture', (data) => {
    const oldPos = camera.position.clone();
    const oldRot = camera.rotation.clone();

    if (data.type === 'photo') {
        // Вид сзади сверху на весь зал и всех зрителей
        camera.position.set(0, 3.2, 6.2);
        camera.lookAt(0, 1.8, -4.8);
        renderer.render(scene, camera);

        const imgData = renderer.domElement.toDataURL('image/png');

        camera.position.copy(oldPos);
        camera.rotation.copy(oldRot);

        fetch('/api/media', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'photo', data: imgData })
        });
    } else {
        const stream = renderer.domElement.captureStream(30);
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        const chunks = [];

        recorder.ondataavailable = e => chunks.push(e.data);
        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = () => {
                fetch('/api/media', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'video', data: reader.result })
                });
            };
            camera.position.copy(oldPos);
            camera.rotation.copy(oldRot);
        };

        recorder.start();

        let elapsed = 0;
        const animInterval = setInterval(() => {
            elapsed += 0.1;
            if (elapsed < 3) {
                // Плавный пролет над всем залом
                camera.position.set(-3.5, 2.5, 5.0);
                camera.lookAt(1.5, 1.2, 0.0);
            } else if (elapsed < 6) {
                camera.position.set(0, 3.2, 6.2);
                camera.lookAt(0, 1.8, -4.8);
            } else {
                clearInterval(animInterval);
                recorder.stop();
            }
            renderer.render(scene, camera);
        }, 100);
    }
});

// 9. Чат и Взаимодействие
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

chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });
document.addEventListener('keydown', e => {
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

// 10. Подключение и Сеть
socket.emit('join', { nickname: myNickname });

socket.on('init', (data) => {
    myId = data.id;
    mySeatIndex = data.seatIndex;
    const pos = SEAT_POSITIONS[mySeatIndex];

    // Уровень глаз игрока
    camera.position.set(pos.x, pos.y + 0.35, pos.z);
    camera.rotation.set(0, 0, 0);

    myMesh = createPersonModel(myNickname, 0x2e7d32);
    myMesh.position.set(pos.x, pos.y - 0.2, pos.z);
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
        updateLabel(model, data.text);
        setTimeout(() => updateLabel(model, ""), 4000);
    }
});

socket.on('videoStateUpdate', state => updateVideoFrame(state.url, state.currentTime));

function addRemotePlayer(p) {
    const mesh = createPersonModel(p.nickname);
    mesh.position.set(p.x, p.y - 0.2, p.z);
    scene.add(mesh);
    remotePlayers[p.id] = { mesh };
}

// 11. Основной Цикл Рендера
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
