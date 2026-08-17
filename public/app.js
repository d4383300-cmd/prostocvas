const socket = io();

// Никнейм
let myNickname = "Зритель";
if (window.Telegram && window.Telegram.WebApp) {
    window.Telegram.WebApp.ready();
    const user = window.Telegram.WebApp.initDataUnsafe?.user;
    if (user) {
        myNickname = user.username ? `@${user.username}` : `${user.first_name || ''} ${user.last_name || ''}`.trim();
    }
}

// Three.js Сцена
const canvas = document.getElementById('canvas3d');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050508);
scene.fog = new THREE.FogExp2(0x050508, 0.04);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

// Свет
const ambientLight = new THREE.AmbientLight(0xffe6cc, 0.3);
scene.add(ambientLight);

const screenLight = new THREE.PointLight(0xffffff, 1.5, 20);
screenLight.position.set(0, 5, -8);
scene.add(screenLight);

// --- ДЕТАЛИЗИРОВАННЫЙ ТЕАТР ---
// Пол (Красный ковер)
const floorMat = new THREE.MeshStandardMaterial({ color: 0x3d0c11, roughness: 0.9 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 30), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// Стены (Дерево)
const wallMat = new THREE.MeshStandardMaterial({ color: 0x1f110a, roughness: 0.6 });
const backWall = new THREE.Mesh(new THREE.PlaneGeometry(24, 10), wallMat);
backWall.position.set(0, 5, -15);
scene.add(backWall);

const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(30, 10), wallMat);
leftWall.position.set(-12, 5, 0);
leftWall.rotation.y = Math.PI / 2;
scene.add(leftWall);

const rightWall = leftWall.clone();
rightWall.position.x = 12;
rightWall.rotation.y = -Math.PI / 2;
scene.add(rightWall);

// Кресла
const chairMat = new THREE.MeshStandardMaterial({ color: 0x660000 });
for (let row = 0; row < 4; row++) {
    for (let col = -4; col <= 4; col += 2) {
        const chairGroup = new THREE.Group();
        const seat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 1), chairMat);
        seat.position.y = 0.4;
        const back = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1, 0.2), chairMat);
        back.position.set(0, 0.9, -0.4);
        chairGroup.add(seat, back);
        chairGroup.position.set(col * 1.2, 0, row * 2.5 - 2);
        scene.add(chairGroup);
    }
}

// 3D Экран
const videoCanvas = document.createElement('canvas');
videoCanvas.width = 1024; videoCanvas.height = 576;
const vCtx = videoCanvas.getContext('2d');
vCtx.fillStyle = '#000'; vCtx.fillRect(0, 0, 1024, 576);

const videoTexture = new THREE.CanvasTexture(videoCanvas);
const screenMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 7.87),
    new THREE.MeshBasicMaterial({ map: videoTexture })
);
screenMesh.position.set(0, 5, -14.8);
scene.add(screenMesh);

// Игроки
let myId = null;
let remotePlayers = {};
let localPos = { x: 0, y: 1.2, z: 5 };
let yaw = 0, pitch = 0;
const keys = {};

// Захват мыши
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

// Создание 3D Человека с облачком чата
function createHumanModel(nickname) {
    const group = new THREE.Group();

    // Тело
    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.35, 1.2),
        new THREE.MeshStandardMaterial({ color: 0x1e88e5 })
    );
    body.position.y = 0.6;
    group.add(body);

    // Голова
    const headGroup = new THREE.Group();
    headGroup.name = "headGroup";
    headGroup.position.y = 1.4;

    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0xffcc99 })
    );
    headGroup.add(head);
    group.add(headGroup);

    // Спрайт Никнейма и Облачка сообщений (Roblox style)
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 512; labelCanvas.height = 256;
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture }));
    sprite.position.y = 2.1;
    sprite.scale.set(3, 1.5, 1);
    sprite.name = "labelSprite";
    group.add(sprite);

    group.userData = { nickname, canvas: labelCanvas, texture: labelTexture, msgTimer: null };
    updatePlayerLabel(group, "");

    return group;
}

function updatePlayerLabel(group, message) {
    const { nickname, canvas, texture } = group.userData;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 512, 256);

    // Если есть сообщение - рисуем облачко
    if (message) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
        ctx.beginPath();
        ctx.roundRect(50, 20, 412, 100, 20);
        ctx.fill();

        ctx.font = "Bold 26px Arial";
        ctx.fillStyle = "#000000";
        ctx.textAlign = "center";
        ctx.fillText(message, 256, 75);
    }

    // Никнейм
    ctx.font = "Bold 30px Arial";
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "#000000";
    ctx.shadowBlur = 6;
    ctx.textAlign = "center";
    ctx.fillText(nickname, 256, 170);

    texture.needsUpdate = true;
}

// Чат
const chatInput = document.getElementById('chatInput');
const chatHistory = document.getElementById('chatHistory');

document.addEventListener('keydown', (e) => {
    // Ввод ссылки по нажатию "T"
    if ((e.code === 'KeyT' || e.key === 'е') && document.activeElement !== chatInput) {
        document.exitPointerLock();
        const modal = document.getElementById('videoModal');
        modal.style.display = modal.style.display === 'block' ? 'none' : 'block';
    }

    // Открытие чата на Enter
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

// Сетевая синхронизация
socket.emit('join', { nickname: myNickname });

socket.on('init', (data) => {
    myId = data.id;
    for (let id in data.players) {
        if (id !== myId) addRemotePlayer(data.players[id]);
    }
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
    // Добавление в интерфейс чата
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-msg';
    msgEl.innerHTML = `<b>${data.nickname}:</b> ${data.text}`;
    chatHistory.appendChild(msgEl);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    // Отображение облачка над головой
    let model = (data.id === myId) ? null : remotePlayers[data.id]?.mesh;
    if (model) {
        updatePlayerLabel(model, data.text);
        if (model.userData.msgTimer) clearTimeout(model.userData.msgTimer);
        model.userData.msgTimer = setTimeout(() => updatePlayerLabel(model, ""), 5000);
    }
});

socket.on('videoStateUpdate', (state) => {
    const frame = document.getElementById('screenFrame');
    if (state.type === 'youtube') {
        const id = state.url.split('v=')[1] || state.url.split('/').pop();
        frame.src = `https://www.youtube.com/embed/${id}?autoplay=1&controls=0`;
    } else {
        frame.src = state.url;
    }
});

function addRemotePlayer(p) {
    const mesh = createHumanModel(p.nickname);
    mesh.position.set(p.x, p.y - 0.8, p.z);
    scene.add(mesh);
    remotePlayers[p.id] = { mesh, target: { x: p.x, y: p.y - 0.8, z: p.z, ry: p.rotY } };
}

// Главный цикл
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    // Управление передвижением
    if (document.pointerLockElement === canvas) {
        const speed = 4 * delta;
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        forward.y = 0; forward.normalize();
        const side = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        side.y = 0; side.normalize();

        let moved = false;
        if (keys['KeyW']) { localPos.x += forward.x * speed; localPos.z += forward.z * speed; moved = true; }
        if (keys['KeyS']) { localPos.x -= forward.x * speed; localPos.z -= forward.z * speed; moved = true; }
        if (keys['KeyA']) { localPos.x -= side.x * speed; localPos.z -= side.z * speed; moved = true; }
        if (keys['KeyD']) { localPos.x += side.x * speed; localPos.z += side.z * speed; moved = true; }

        // Границы зала (Защита от выхода за стены)
        localPos.x = Math.max(-11, Math.min(11, localPos.x));
        localPos.z = Math.max(-13, Math.min(13, localPos.z));

        camera.position.set(localPos.x, localPos.y, localPos.z);

        if (moved) {
            socket.emit('move', { x: localPos.x, y: localPos.y, z: localPos.z, rotY: yaw });
        }
    }

    // Плавность движения других игроков
    for (let id in remotePlayers) {
        const p = remotePlayers[id];
        p.mesh.position.x += (p.target.x - p.mesh.position.x) * 0.1;
        p.mesh.position.y += (p.target.y - p.mesh.position.y) * 0.1;
        p.mesh.position.z += (p.target.z - p.mesh.position.z) * 0.1;
        p.mesh.rotation.y += (p.target.ry - p.mesh.rotation.y) * 0.1;
    }

    // Заглушка рендера экрана
    vCtx.fillStyle = '#111';
    vCtx.fillRect(0, 0, 1024, 576);
    vCtx.fillStyle = '#ff0055';
    vCtx.font = '30px Arial';
    vCtx.textAlign = 'center';
    vCtx.fillText('ТРАНСЛЯЦИЯ ВИДЕОПОТОКА (ХУЮТУБ)', 512, 288);
    videoTexture.needsUpdate = true;

    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
