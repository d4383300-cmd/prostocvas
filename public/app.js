const socket = io();
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

let myNickname = "Зритель";
if (window.Telegram && window.Telegram.WebApp) {
    window.Telegram.WebApp.ready();
    const user = window.Telegram.WebApp.initDataUnsafe?.user;
    if (user) myNickname = user.username ? `@${user.username}` : user.first_name;
}

// 1. Сцена и Рендереры
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x040306);

const cssScene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 100);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('webgl').appendChild(renderer.domElement);

const cssRenderer = new THREE.CSS3DRenderer();
cssRenderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('css3d').appendChild(cssRenderer.domElement);

// 2. Освещение
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const stageLight = new THREE.SpotLight(0xffaa55, 1.2);
stageLight.position.set(0, 6, -1);
stageLight.target.position.set(0, 2.5, -4.8);
scene.add(stageLight);
scene.add(stageLight.target);

// 3. Архитектура Зала
const wallMat = new THREE.MeshStandardMaterial({ color: 0x160c10, roughness: 0.9 });
const carpetMat = new THREE.MeshStandardMaterial({ color: 0x420610, roughness: 0.7 });
const woodMat = new THREE.MeshStandardMaterial({ color: 0x1c0e08, roughness: 0.5 });

const mainFloor = new THREE.Mesh(new THREE.BoxGeometry(12, 0.2, 12), carpetMat);
mainFloor.position.set(0, 0, 1);
scene.add(mainFloor);

const stepRow2 = new THREE.Mesh(new THREE.BoxGeometry(12, 0.6, 4), woodMat);
stepRow2.position.set(0, 0.3, 4.2);
scene.add(stepRow2);

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

// 4. Главный Экран (YouTube/RuTube)
const screenFrame = new THREE.Mesh(new THREE.BoxGeometry(8.4, 4.9, 0.1), woodMat);
screenFrame.position.set(0, 2.8, -4.95);
scene.add(screenFrame);

const screenMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(8, 4.5), screenMat);
screenMesh.position.set(0, 2.8, -4.89);
scene.add(screenMesh);

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

// 5. ВЫСОКИЙ УЗКИЙ ЭКРАН СЛЕВА (Камера наблюдения за зрителями)
const leftDisplayMat = new THREE.MeshBasicMaterial({ color: 0x111122 });
const leftDisplayMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 3.5), leftDisplayMat);
leftDisplayMesh.position.set(-5.88, 3.2, 1.0);
leftDisplayMesh.rotation.y = Math.PI / 2;
scene.add(leftDisplayMesh);

const observerCamera = new THREE.PerspectiveCamera(50, 2.0 / 3.5, 0.1, 50);
const renderTarget = new THREE.WebGLRenderTarget(256, 448);
leftDisplayMat.map = renderTarget.texture;

// 6. ЭКРАН СПРАВА (Трансляция чата Telegram -1004349256495)
const chatCanvas = document.createElement('canvas');
chatCanvas.width = 512; chatCanvas.height = 256;
const chatCtx = chatCanvas.getContext('2d');
const chatTexture = new THREE.CanvasTexture(chatCanvas);

const rightDisplayMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(3.5, 2.0),
    new THREE.MeshBasicMaterial({ map: chatTexture })
);
rightDisplayMesh.position.set(5.88, 3.2, 1.0);
rightDisplayMesh.rotation.y = -Math.PI / 2;
scene.add(rightDisplayMesh);

function updateWallChat(user, text) {
    chatCtx.fillStyle = '#0f0c1b';
    chatCtx.fillRect(0, 0, 512, 256);

    chatCtx.strokeStyle = '#ff0055';
    chatCtx.lineWidth = 6;
    chatCtx.strokeRect(0, 0, 512, 256);

    chatCtx.font = 'Bold 22px Arial';
    chatCtx.fillStyle = '#ffaa00';
    chatCtx.fillText('💬 ЧАТ TELEGRAM', 20, 40);

    chatCtx.font = 'Bold 20px Arial';
    chatCtx.fillStyle = '#00e5ff';
    chatCtx.fillText(`${user}:`, 20, 85);

    chatCtx.font = '18px Arial';
    chatCtx.fillStyle = '#ffffff';

    // Разбивка длинного текста на строки
    const words = text.split(' ');
    let line = '', y = 120;
    for (let n = 0; n < words.length; n++) {
        let testLine = line + words[n] + ' ';
        if (chatCtx.measureText(testLine).width > 470 && n > 0) {
            chatCtx.fillText(line, 20, y);
            line = words[n] + ' ';
            y += 28;
        } else {
            line = testLine;
        }
    }
    chatCtx.fillText(line, 20, y);
    chatTexture.needsUpdate = true;
}
updateWallChat('Система', 'Ожидание сообщений из группы...');

socket.on('telegramWallMessage', data => updateWallChat(data.user, data.text));

// 7. Места и Кресла
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
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.85, 0.12), chairMat);
    back.position.set(0, 0.6, 0.25);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.5), armMat);
    armL.position.set(-0.38, 0.35, 0);
    const armR = armL.clone();
    armR.position.x = 0.38;

    chair.add(seat, back, armL, armR);
    chair.position.set(pos.x, pos.y - 0.5, pos.z);
    scene.add(chair);
});

// 8. Персонажи (Высокие + Глаза)
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
    const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const eyePupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.65, 0.26), bodyMat);
    body.position.set(0, 0.05, 0);
    group.add(body);

    const headGroup = new THREE.Group();
    headGroup.name = "headGroup";
    headGroup.position.set(0, 0.5, 0);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), skinMat);
    const hairMesh = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.09, 0.30), hairMat);
    hairMesh.position.set(0, 0.15, 0);

    const eyeLeft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), eyeWhiteMat);
    eyeLeft.position.set(-0.07, 0.03, -0.145);
    const pupilLeft = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.025), eyePupilMat);
    pupilLeft.position.set(-0.07, 0.03, -0.148);

    const eyeRight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), eyeWhiteMat);
    eyeRight.position.set(0.07, 0.03, -0.145);
    const pupilRight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.025), eyePupilMat);
    pupilRight.position.set(0.07, 0.03, -0.148);

    headGroup.add(head, hairMesh, eyeLeft, pupilLeft, eyeRight, pupilRight);
    group.add(headGroup);

    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.48, 0.1), bodyMat);
    armL.position.set(-0.30, 0.08, 0.05);
    armL.rotation.x = -0.2;
    const armR = armL.clone();
    armR.position.x = 0.30;
    group.add(armL, armR);

    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 128;
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }));
    sprite.position.set(0, 1.05, 0);
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

// 9. NPC
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

// 10. Управление, Поворот головы и Селфи на "X"
let yaw = 0, pitch = 0;
let myId = null, mySeatIndex = null, myMesh = null;
let remotePlayers = {};
let isSelfieMode = false;

const webglEl = document.getElementById('webgl');
webglEl.addEventListener('click', (e) => {
    // Если нажат ЛКМ в режиме Селфи — делай снимок!
    if (isSelfieMode) {
        takeSelfie();
        return;
    }

    if (!isMobile && document.pointerLockElement !== webglEl) {
        webglEl.requestPointerLock();
    }
});

function updateMyLook() {
    // Поворачиваем голову нашего же персонажа в локальной сцене!
    if (myMesh) {
        const headGroup = myMesh.getObjectByName("headGroup");
        if (headGroup) headGroup.rotation.y = yaw;
    }
    socket.emit('look', { rotY: yaw });
}

document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === webglEl && !isSelfieMode) {
        yaw -= e.movementX * 0.002;
        pitch -= e.movementY * 0.002;
        pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, pitch));
        camera.rotation.set(pitch, yaw, 0, 'YXZ');
        updateMyLook();
    }
});

// Нажатие на кнопку "X" — Режим Селфи
document.addEventListener('keydown', (e) => {
    if ((e.code === 'KeyX' || e.key === 'ч' || e.key === 'Ч') && document.activeElement !== document.getElementById('chatInput')) {
        toggleSelfieMode();
    }
});

function toggleSelfieMode() {
    if (!myMesh) return;
    isSelfieMode = !isSelfieMode;

    if (isSelfieMode) {
        if (document.pointerLockElement) document.exitPointerLock();
        // Взлетаем перед лицом персонажа
        const myPos = SEAT_POSITIONS[mySeatIndex];
        camera.position.set(myPos.x, myPos.y + 0.9, myPos.z - 1.6);
        camera.lookAt(myPos.x, myPos.y + 0.45, myPos.z);
    } else {
        resetCameraToPlayer();
    }
}

function resetCameraToPlayer() {
    isSelfieMode = false;
    const myPos = SEAT_POSITIONS[mySeatIndex];
    camera.position.set(myPos.x, myPos.y + 0.45, myPos.z);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
}

function takeSelfie() {
    renderer.render(scene, camera);
    const imgData = renderer.domElement.toDataURL('image/png');

    fetch('/api/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            data: imgData,
            targetChatId: '-1004349256495',
            isSelfie: true,
            nickname: myNickname
        })
    });

    resetCameraToPlayer();
}

// 11. Ракурсы для Telegram-бота (/start)
socket.on('requestLiveCapture', (req) => {
    const oldPos = camera.position.clone();
    const oldRot = camera.rotation.clone();
    const oldFov = camera.fov;

    camera.fov = 70;
    camera.updateProjectionMatrix();

    // Разные варианты шаблонов ракурса
    switch (req.angle) {
        case 'players':
            camera.position.set(0, 1.8, -1.0);
            camera.lookAt(0, 0.8, 2.5);
            break;
        case 'top':
            camera.position.set(0, 5.5, 5.5);
            camera.lookAt(0, 1.0, 0);
            break;
        case 'side':
            camera.position.set(-5.0, 2.5, 2.5);
            camera.lookAt(1.0, 1.0, 2.5);
            break;
        case 'close':
            camera.position.set(0, 1.5, -0.5);
            camera.lookAt(0, 0.9, 1.5);
            break;
        default: // 'front'
            camera.position.set(0, 2.2, -4.5);
            camera.lookAt(0, 1.2, 3.0);
            break;
    }

    renderer.render(scene, camera);
    const imgData = renderer.domElement.toDataURL('image/png');

    camera.fov = oldFov;
    camera.updateProjectionMatrix();
    camera.position.copy(oldPos);
    camera.rotation.copy(oldRot);

    fetch('/api/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: imgData, targetChatId: req.requestedChatId })
    });
});

// 12. Логика Подключения
socket.emit('join', { nickname: myNickname });

socket.on('init', (data) => {
    myId = data.id;
    mySeatIndex = data.seatIndex;
    resetCameraToPlayer();

    myMesh = createPersonModel(myNickname, 0x2e7d32);
    myMesh.position.set(SEAT_POSITIONS[mySeatIndex].x, SEAT_POSITIONS[mySeatIndex].y - 0.2, SEAT_POSITIONS[mySeatIndex].z);
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
    const chatHistory = document.getElementById('chatHistory');
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

// 13. Анимационный Цикл и Камера Наблюдения
let observerTimer = 0;
let currentTargetIndex = 0;

function animate() {
    requestAnimationFrame(animate);

    // Плавное слежение камеры слева за участниками
    observerTimer += 0.015;
    if (observerTimer > 4) {
        observerTimer = 0;
        currentTargetIndex = (currentTargetIndex + 1) % SEAT_POSITIONS.length;
    }
    const targetSeat = SEAT_POSITIONS[currentTargetIndex];
    observerCamera.position.set(-5.5, 3.5, -2.0);
    observerCamera.lookAt(targetSeat.x, targetSeat.y + 0.3, targetSeat.z);

    // Рендер сцены в левый экран
    leftDisplayMesh.visible = false;
    renderer.setRenderTarget(renderTarget);
    renderer.render(scene, observerCamera);
    renderer.setRenderTarget(null);
    leftDisplayMesh.visible = true;

    // Главный рендер
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
