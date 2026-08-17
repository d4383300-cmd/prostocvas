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

scene.add(new THREE.AmbientLight(0xffffff, 0.4));

// 2. Постройка Архитектуры Зала, Ступеней и Лестницы
const wallMat = new THREE.MeshStandardMaterial({ color: 0x0a0708, roughness: 0.9 });
const stepMat = new THREE.MeshStandardMaterial({ color: 0x1f191b, roughness: 0.7 });

// Ступенчатый пол (Ряд 1 ниже, Ряд 2 выше)
const row1Floor = new THREE.Mesh(new THREE.BoxGeometry(10, 0.2, 3), stepMat);
row1Floor.position.set(0, 0, 1.5);
scene.add(row1Floor);

const row2Floor = new THREE.Mesh(new THREE.BoxGeometry(10, 0.8, 3), stepMat);
row2Floor.position.set(0, 0.3, 4.5);
scene.add(row2Floor);

// Лестница по центру
for (let i = 0; i < 3; i++) {
    const stair = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 0.4), stepMat);
    stair.position.set(0, i * 0.15 + 0.05, 3.0 + i * 0.4);
    scene.add(stair);
}

// Входная Дверь сзади
const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.5, 0.1), new THREE.MeshBasicMaterial({ color: 0x000000 }));
doorFrame.position.set(-3.5, 1.9, 5.9);
scene.add(doorFrame);

const doorLight = new THREE.PointLight(0xffaa55, 1, 4);
doorLight.position.set(-3.5, 2.0, 5.5);
scene.add(doorLight);

// 3. 12 Кресел (2 ряда по 6 мест)
const SEATS = [];
const row1X = [-3.5, -2.3, -1.1, 1.1, 2.3, 3.5];
const row2X = [-3.5, -2.3, -1.1, 1.1, 2.3, 3.5];

const chairMat = new THREE.MeshStandardMaterial({ color: 0x660000 });
function buildSeat(x, y, z, id) {
    const group = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.6), chairMat);
    seat.position.set(0, 0.4, 0);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.12), chairMat);
    back.position.set(0, 0.75, 0.25);
    group.add(seat, back);
    group.position.set(x, y, z);
    scene.add(group);
    SEATS.push({ id, pos: new THREE.Vector3(x, y + 0.1, z), occupied: false });
}

row1X.forEach((x, i) => buildSeat(x, 0.1, 1.5, i));
row2X.forEach((x, i) => buildSeat(x, 0.7, 4.5, i + 6));

// 4. Проектор и Эффект Света
const spotLight = new THREE.SpotLight(0xffffff, 5);
spotLight.position.set(0, 4, 5.5);
spotLight.target.position.set(0, 2.5, -4.9);
spotLight.angle = Math.PI / 6;
spotLight.penumbra = 0.8;
scene.add(spotLight);
scene.add(spotLight.target);

// Экран WebGL & CSS3D
const screenMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(8, 4.5), screenMat);
screenMesh.position.set(0, 2.6, -4.9);
scene.add(screenMesh);

const iframe = document.createElement('iframe');
iframe.style.width = '800px'; iframe.style.height = '450px'; iframe.style.border = '0';
const cssObject = new THREE.CSS3DObject(iframe);
cssObject.position.set(0, 2.6, -4.89);
cssObject.scale.set(8 / 800, 4.5 / 450, 1);
cssScene.add(cssObject);

const textureLoader = new THREE.TextureLoader();
function updateVideoFrame(url, time) {
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        const videoId = url.split('v=')[1] || url.split('/').pop();
        iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&start=${Math.floor(time)}`;
        textureLoader.load(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`, (tex) => {
            screenMat.map = tex; screenMat.needsUpdate = true;
        });
    }
}

// 5. Улучшенные Модели Персонажей (Руки, Ноги, Волосы, Кожа)
const skinColors = [0xffdbac, 0xf1c27d, 0xe0ac69, 0x8d5524, 0xc68642];
const hairColors = [0x090806, 0x2c222b, 0x716355, 0xb89778, 0xa52a2a];
const clothesColors = [0x1565c0, 0x2e7d32, 0xc62828, 0x6a1b9a, 0xef6c00, 0x37474f];

function createAdvancedHuman(skinColor, hairColor, shirtColor) {
    const group = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: skinColor });
    const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor });
    const hairMat = new THREE.MeshStandardMaterial({ color: hairColor });

    // Торс
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.25), shirtMat);
    body.position.set(0, 0.6, 0);
    group.add(body);

    // Голова
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), skinMat);
    head.position.set(0, 0.95, 0);
    group.add(head);

    // Волосы
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.1, 0.27), hairMat);
    hair.position.set(0, 1.08, 0);
    group.add(hair);

    // Руки
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), shirtMat);
    armL.position.set(-0.27, 0.55, 0.05);
    armL.rotation.x = -0.3;
    const armR = armL.clone();
    armR.position.x = 0.27;
    group.add(armL, armR);

    // Ноги (Сидячее положение)
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.35), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    legL.position.set(-0.12, 0.38, -0.15);
    const legR = legL.clone();
    legR.position.x = 0.12;
    group.add(legL, legR);

    // Спрайт для Смайлика-Реакции
    const emojiCanvas = document.createElement('canvas');
    emojiCanvas.width = 64; emojiCanvas.height = 64;
    const emojiTex = new THREE.CanvasTexture(emojiCanvas);
    const emojiSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex }));
    emojiSprite.position.set(0, 1.35, 0);
    emojiSprite.scale.set(0.5, 0.5, 1);
    group.add(emojiSprite);

    group.userData = { emojiCanvas, emojiTex };
    return group;
}

function showReaction(npcGroup, emoji) {
    const { emojiCanvas, emojiTex } = npcGroup.userData;
    const ctx = emojiCanvas.getContext('2d');
    ctx.clearRect(0, 0, 64, 64);
    ctx.font = '40px serif';
    ctx.fillText(emoji, 10, 45);
    emojiTex.needsUpdate = true;
    setTimeout(() => {
        ctx.clearRect(0, 0, 64, 64);
        emojiTex.needsUpdate = true;
    }, 3000);
}

// 6. Генерация и Логика NPC
const activeNPCs = [];
function spawnNPCs() {
    for (let i = 0; i < 9; i++) { // 9 NPC занимают места
        const skin = skinColors[Math.floor(Math.random() * skinColors.length)];
        const hair = hairColors[Math.floor(Math.random() * hairColors.length)];
        const shirt = clothesColors[Math.floor(Math.random() * clothesColors.length)];
        
        const npc = createAdvancedHuman(skin, hair, shirt);
        const freeSeat = SEATS.find(s => !s.occupied);
        if (freeSeat) {
            freeSeat.occupied = true;
            npc.position.copy(freeSeat.pos);
            scene.add(npc);
            activeNPCs.push({ mesh: npc, seat: freeSeat });
        }
    }
}
spawnNPCs();

// Эмоции NPC при просмотре
const emojis = ['😱', '😂', '🔥', '👏', '😍', '😮'];
setInterval(() => {
    if (activeNPCs.length > 0) {
        const randomNpc = activeNPCs[Math.floor(Math.random() * activeNPCs.length)];
        showReaction(randomNpc.mesh, emojis[Math.floor(Math.random() * emojis.length)]);
    }
}, 4000);

// Ротация NPC (Уходит 1, приходит 1)
socket.on('rotateNPC', () => {
    if (activeNPCs.length > 0) {
        const leaving = activeNPCs.shift();
        leaving.seat.occupied = false;
        scene.remove(leaving.mesh);

        const skin = skinColors[Math.floor(Math.random() * skinColors.length)];
        const hair = hairColors[Math.floor(Math.random() * hairColors.length)];
        const shirt = clothesColors[Math.floor(Math.random() * clothesColors.length)];

        const newNpc = createAdvancedHuman(skin, hair, shirt);
        const freeSeat = SEATS.find(s => !s.occupied);
        if (freeSeat) {
            freeSeat.occupied = true;
            newNpc.position.copy(freeSeat.pos);
            scene.add(newNpc);
            activeNPCs.push({ mesh: newNpc, seat: freeSeat });
        }
    }
});

// 7. Камера и Захват Медиа (Фото / Запись Видео)
let yaw = 0, pitch = 0;
camera.position.set(0, 1.2, 4.5);

socket.on('requestCapture', async (data) => {
    const oldPos = camera.position.clone();
    const oldRot = camera.rotation.clone();

    if (data.type === 'photo') {
        camera.position.set(0, 2.2, 5.2);
        camera.lookAt(0, 1.8, -4.9);
        renderer.render(scene, camera);
        const base64 = renderer.domElement.toDataURL('image/png');
        
        camera.position.copy(oldPos);
        camera.rotation.copy(oldRot);

        fetch('/api/media', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'photo', data: base64 })
        });
    } else if (data.type === 'video') {
        const stream = renderer.domElement.captureStream(30);
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        const chunks = [];

        recorder.ondataavailable = e => chunks.push(e.data);
        recorder.onstop = async () => {
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
        
        // Анимация камеры 5 секунд: Плавный перелет с людей на экран
        let startTime = Date.now();
        const animInterval = setInterval(() => {
            let elapsed = (Date.now() - startTime) / 1000;
            if (elapsed <= 3) {
                // Плавный поворот на зрителей
                camera.position.set(2, 2.0, 1.0);
                camera.lookAt(-2, 1.0, 4.0);
            } else if (elapsed <= 6) {
                // Перевод взгляда на экран
                camera.position.set(0, 2.0, 4.8);
                camera.lookAt(0, 2.6, -4.9);
            } else {
                clearInterval(animInterval);
                recorder.stop();
            }
            renderer.render(scene, camera);
        }, 1000 / 30);
    }
});

// Управление и Чат
socket.emit('join', { nickname: myNickname });
socket.on('init', (data) => {
    updateVideoFrame(data.videoState.url, data.videoState.currentTime);
});

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
    cssRenderer.render(cssScene, camera);
}
animate();
