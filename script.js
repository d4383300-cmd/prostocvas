const socket = io();

let currentUser = null;

// 🔊 Генератор приятных Web Audio звуков (без скачивания файлов)
function playSound(type) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (type === 'appear') {
            osc.frequency.setValueAtTime(300, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.3);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            osc.start();
            osc.stop(ctx.currentTime + 0.3);
        } else if (type === 'fall') {
            osc.frequency.setValueAtTime(600, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.4);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
            osc.start();
            osc.stop(ctx.currentTime + 0.4);
        }
    } catch(e) {}
}

// ⏱️ Анимация при старте (5 секунд)
window.addEventListener('load', () => {
    playSound('appear');
    setTimeout(() => playSound('fall'), 3000); // Звук падения через 3 сек

    setTimeout(() => {
        document.getElementById('intro-screen').classList.add('hidden');
        document.body.style.backgroundColor = '#a1c4fd';
        const app = document.getElementById('app');
        app.classList.remove('hidden');
        setTimeout(() => app.classList.add('visible'), 50);
    }, 5000);
});

// 🔄 Вкладки Vista
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.vista-nav .vista-btn').forEach(el => el.classList.remove('active'));
    
    document.getElementById(`tab-${tabName}`).classList.add('active');
    event.target.classList.add('active');
}

// 💬 Чат и Socket.IO
socket.on('init_user', (user) => {
    currentUser = user;
    document.getElementById('prof-nick').innerText = user.nick;
    document.getElementById('prof-date').innerText = user.regDate;
    if (user.rewardEligible) {
        document.getElementById('reward-section').classList.remove('hidden');
    }
});

socket.on('user_updated', (user) => {
    currentUser = user;
    document.getElementById('prof-nick').innerText = user.nick;
});

// Загрузка сообщений из сервера + локальное сохранение
socket.on('load_history', (history) => {
    const box = document.getElementById('chat-box');
    box.innerHTML = '';
    
    // Читаем из localStorage сохраненные локально
    const localSaved = JSON.parse(localStorage.getItem('local_chat') || '[]');
    const combined = [...history, ...localSaved];
    
    // Фильтр уникальных
    const uniqueMsgs = Array.from(new Map(combined.map(m => [m.id, m])).values());
    uniqueMsgs.forEach(renderMessage);
    saveLocally(uniqueMsgs);
});

socket.on('new_message', (msg) => {
    renderMessage(msg);
    saveLocally([msg]);
});

socket.on('bot_message', (data) => {
    const box = document.getElementById('chat-box');
    const div = document.createElement('div');
    div.className = 'chat-msg bot';
    let content = `<span class="bot-badge">BOT</span><b>Харест:</b> ${data.text}`;
    if (data.showRulesBtn) {
        content += `<br><button class="vista-btn btn-inline" onclick="switchTab('rules')">Правила</button>`;
    }
    div.innerHTML = content;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
});

function renderMessage(msg) {
    const box = document.getElementById('chat-box');
    const div = document.createElement('div');
    div.className = `chat-msg ${msg.isBot ? 'bot' : ''}`;
    
    const prefixStr = msg.prefix ? `<span style="color:${msg.color}">[${msg.prefix}]</span> ` : '';
    const nameStr = `<b style="color:${msg.color}">${msg.sender}</b>`;
    const botBadge = msg.isBot ? `<span class="bot-badge">BOT</span>` : '';

    div.innerHTML = `<small style="color:#666">[${msg.time}]</small> ${botBadge}${prefixStr}${nameStr}: ${msg.text}`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

function saveLocally(newMsgs) {
    const existing = JSON.parse(localStorage.getItem('local_chat') || '[]');
    const combined = [...existing, ...newMsgs];
    const unique = Array.from(new Map(combined.map(m => [m.id, m])).values());
    // Оставляем последние 100 сообщений локально
    localStorage.setItem('local_chat', JSON.stringify(unique.slice(-100)));
}

function sendMessage() {
    const input = document.getElementById('msg-input');
    if (input.value.trim()) {
        socket.emit('send_message', input.value);
        input.value = '';
    }
}

document.getElementById('msg-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function saveCustomization() {
    const prefix = document.getElementById('pref-input').value;
    const color = document.getElementById('color-input').value;
    socket.emit('update_customization', { prefix, color });
    alert('Настройки сохранены!');
}