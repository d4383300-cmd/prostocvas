const socket = io();
let currentUser = null;
let activeReply = null;

// Запуск приложения
setTimeout(() => {
    const intro = document.getElementById('intro-screen');
    const app = document.getElementById('app');
    if (intro) intro.style.display = 'none';
    if (app) app.classList.remove('hidden');
}, 3000);

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.vista-nav .vista-btn').forEach(el => el.classList.remove('active'));
    
    const targetTab = document.getElementById(`tab-${tabName}`);
    if (targetTab) targetTab.classList.add('active');
    
    if (window.event && window.event.target) {
        window.event.target.classList.add('active');
    }
}

// Профиль
function updateUserUI(user) {
    currentUser = user;
    const nickEl = document.getElementById('prof-nick');
    const dateEl = document.getElementById('prof-date');
    const badgeEl = document.getElementById('prof-badge');
    const statusEl = document.getElementById('prof-status');
    const bindBtn = document.getElementById('tg-bind-btn');

    if (nickEl) nickEl.innerText = user.nick;
    if (dateEl) dateEl.innerText = user.regDate;
    
    if (user.verified) {
        if (badgeEl) badgeEl.innerHTML = '<span style="color:#00E5FF;">✔️</span>';
        if (statusEl) statusEl.innerHTML = '<b style="color:#00E676;">Подтвержден ✔️</b>';
        if (bindBtn) bindBtn.style.display = 'none';
    } else if (bindBtn && user.tgLink) {
        bindBtn.href = user.tgLink;
    }
}

socket.on('init_user', updateUserUI);
socket.on('user_updated', updateUserUI);

// Смена собственного никнейма (до 6 символов)
function changeCustomNick() {
    const input = document.getElementById('custom-nick-input');
    if (!input || !input.value.trim()) return;
    const newNick = input.value.trim();
    if (newNick.length > 6) {
        alert('Никнейм не должен превышать 6 символов!');
        return;
    }
    socket.emit('change_nick', newNick);
    input.value = '';
}

// Работа с ЧАТОМ и Ответы
function setReply(msgId, sender, text) {
    activeReply = { id: msgId, sender, text };
    const preview = document.getElementById('reply-preview');
    const targetText = document.getElementById('reply-target-text');
    if (preview && targetText) {
        targetText.innerText = `Ответ для ${sender}: "${text.substring(0, 20)}..."`;
        preview.classList.remove('hidden');
    }
}

function cancelReply() {
    activeReply = null;
    const preview = document.getElementById('reply-preview');
    if (preview) preview.classList.add('hidden');
}

function sendMessage() {
    const input = document.getElementById('msg-input');
    if (input && input.value.trim()) {
        socket.emit('send_message', {
            text: input.value.trim(),
            replyTo: activeReply
        });
        input.value = '';
        cancelReply();
    }
}

socket.on('new_message', (msg) => {
    const box = document.getElementById('chat-box');
    if (!box) return;

    const div = document.createElement('div');
    div.className = `chat-msg ${msg.isBot ? 'bot' : ''}`;
    
    // Формирование локального времени
    const localTime = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let replyHTML = '';
    if (msg.replyTo) {
        replyHTML = `<div class="reply-quote"><b>${msg.replyTo.sender}:</b> ${msg.replyTo.text}</div>`;
    }

    const verifyBadge = msg.verified ? ` <span style="color:#00E5FF;">✔️</span>` : '';
    div.innerHTML = `${replyHTML}<small style="color:#666">[${localTime}]</small> <b>${msg.sender}</b>${verifyBadge}: ${msg.text}`;
    
    div.onclick = () => setReply(msg.id, msg.sender, msg.text);

    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
});

// 🎮 2D MULTIPLAYER GAME ENGINE
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let gameState = { players: {} };
let myPos = { x: 400, y: 250, vx: 0, vy: 0, smoking: false };

socket.on('game_state', (state) => {
    gameState = state;
});

// Управление ДЖОЙСТИКОМ
const stick = document.getElementById('joystick-stick');
const base = document.getElementById('joystick-base');
let drag = false;

if (base) {
    base.addEventListener('pointerdown', () => drag = true);
    window.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const rect = base.getBoundingClientRect();
        const dx = e.clientX - (rect.left + 40);
        const dy = e.clientY - (rect.top + 40);
        const dist = Math.min(Math.hypot(dx, dy), 30);
        const angle = Math.atan2(dy, dx);
        
        stick.style.transform = `translate(${Math.cos(angle)*dist}px, ${Math.sin(angle)*dist}px)`;
        myPos.vx = Math.cos(angle) * (dist / 10);
        myPos.vy = Math.sin(angle) * (dist / 10);
    });

    window.addEventListener('pointerup', () => {
        drag = false;
        stick.style.transform = `translate(0px, 0px)`;
        myPos.vx = 0; myPos.vy = 0;
    });
}

function triggerSmoke() {
    myPos.smoking = true;
    setTimeout(() => myPos.smoking = false, 4000);
}

// Главный игровой цикл (Плавная интерполяция)
function gameLoop() {
    // Границы мира
    myPos.x = Math.max(20, Math.min(780, myPos.x + myPos.vx));
    myPos.y = Math.max(20, Math.min(480, myPos.y + myPos.vy));

    socket.emit('player_move', { x: myPos.x, y: myPos.y, smoking: myPos.smoking });

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Отрисовка Казино-автомата на карте
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(700, 30, 60, 60);
    ctx.fillStyle = '#000';
    ctx.fillText("🎰 СЛОТЫ", 705, 65);

    // Отрисовка всех игроков
    Object.keys(gameState.players).forEach(id => {
        const p = gameState.players[id];
        
        // Темнокожий скин
        ctx.fillStyle = '#5c3a21';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
        ctx.fill();

        // Прическа
        ctx.fillStyle = '#111';
        ctx.fillRect(p.x - 10, p.y - 18, 20, 8);

        // Никнейм
        ctx.fillStyle = '#FFF';
        ctx.font = '12px Segoe UI';
        ctx.textAlign = 'center';
        ctx.fillText(p.nick || 'Игрок', p.x, p.y - 22);

        // Анимация курения (Дым)
        if (p.smoking) {
            ctx.fillStyle = 'rgba(200, 200, 200, 0.6)';
            ctx.beginPath();
            ctx.arc(p.x + 12, p.y - 5, 4, 0, Math.PI * 2);
            ctx.arc(p.x + 18, p.y - 12, 6, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);

// Казино
function openCasino() { document.getElementById('casino-modal').classList.remove('hidden'); }
function closeCasino() { document.getElementById('casino-modal').classList.add('hidden'); }
function spinSlots() {
    const symbols = ['🍎', '🍋', '🍒', '7️⃣', '💎'];
    const s1 = symbols[Math.floor(Math.random()*symbols.length)];
    const s2 = symbols[Math.floor(Math.random()*symbols.length)];
    const s3 = symbols[Math.floor(Math.random()*symbols.length)];
    document.getElementById('slots-display').innerText = `${s1} | ${s2} | ${s3}`;
}
