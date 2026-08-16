const socket = io();
let currentUser = null;

// 🔊 Безопасный звук
function playSound(type) {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        if (ctx.state === 'suspended') return;

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

// ⏱️ Гарантированный запуск заставки и переход в меню
function startApp() {
    playSound('appear');
    setTimeout(() => playSound('fall'), 3000);

    setTimeout(() => {
        const intro = document.getElementById('intro-screen');
        const app = document.getElementById('app');

        if (intro) {
            intro.style.display = 'none';
        }
        if (app) {
            app.classList.remove('hidden');
            app.classList.add('visible');
            app.style.display = 'flex'; // Принудительный показ
        }
        document.body.style.backgroundColor = '#a1c4fd';
    }, 5000);
}

// Запускаем сразу, если DOM уже готов, либо по событию
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
} else {
    startApp();
}

// 🔄 Переключение вкладок
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.vista-nav .vista-btn').forEach(el => el.classList.remove('active'));
    
    const targetTab = document.getElementById(`tab-${tabName}`);
    if (targetTab) targetTab.classList.add('active');
    
    if (window.event && window.event.target) {
        window.event.target.classList.add('active');
    }
}

// 💬 Socket.IO логика
socket.on('init_user', (user) => {
    currentUser = user;
    const nickEl = document.getElementById('prof-nick');
    const dateEl = document.getElementById('prof-date');
    if (nickEl) nickEl.innerText = user.nick;
    if (dateEl) dateEl.innerText = user.regDate;
    
    if (user.rewardEligible) {
        const rewardSec = document.getElementById('reward-section');
        if (rewardSec) rewardSec.classList.remove('hidden');
    }
});

socket.on('user_updated', (user) => {
    currentUser = user;
    const nickEl = document.getElementById('prof-nick');
    if (nickEl) nickEl.innerText = user.nick;
});

socket.on('load_history', (history) => {
    const box = document.getElementById('chat-box');
    if (!box) return;
    box.innerHTML = '';
    
    const localSaved = JSON.parse(localStorage.getItem('local_chat') || '[]');
    const combined = [...history, ...localSaved];
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
    if (!box) return;
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
    if (!box) return;
    const div = document.createElement('div');
    div.className = `chat-msg ${msg.isBot ? 'bot' : ''}`;
    
    const prefixStr = msg.prefix ? `<span style="color:${msg.color}">[${msg.prefix}]</span> ` : '';
    const nameStr = `<b style="color:${msg.color}">${msg.sender}</b>`;
    
    let badge = '';
    if (msg.isBot) {
        badge = `<span class="bot-badge">BOT</span>`;
    } else if (msg.isTelegram) {
        badge = `<span class="tg-badge">Telegram</span>`;
    }

    div.innerHTML = `<small style="color:#666">[${msg.time}]</small> ${badge}${prefixStr}${nameStr}: ${msg.text}`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

function saveLocally(newMsgs) {
    const existing = JSON.parse(localStorage.getItem('local_chat') || '[]');
    const combined = [...existing, ...newMsgs];
    const unique = Array.from(new Map(combined.map(m => [m.id, m])).values());
    localStorage.setItem('local_chat', JSON.stringify(unique.slice(-100)));
}

function sendMessage() {
    const input = document.getElementById('msg-input');
    if (input && input.value.trim()) {
        socket.emit('send_message', input.value);
        input.value = '';
    }
}

document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && document.activeElement.id === 'msg-input') {
        sendMessage();
    }
});

function saveCustomization() {
    const prefix = document.getElementById('pref-input').value;
    const color = document.getElementById('color-input').value;
    socket.emit('update_customization', { prefix, color });
    alert('Настройки сохранены!');
}
