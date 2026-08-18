const tg = window.Telegram.WebApp;
tg.expand();

let currentUser = null;
const userId = tg.initDataUnsafe?.user?.id || new URLSearchParams(window.location.search).get('tgWebAppStartParam');

// Старт
window.onload = async () => {
    if (!userId) {
        document.getElementById('splash-screen').style.display = 'none';
        document.getElementById('auth-block').style.display = 'block';
        return;
    }

    // Загружаем данные пользователя
    const res = await fetch('/api/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
    });

    if (!res.ok) {
        document.getElementById('splash-screen').style.display = 'none';
        document.getElementById('auth-block').style.display = 'block';
        return;
    }

    currentUser = await res.json();

    // Экран приветствия (4 секунды)
    document.getElementById('splash-text').innerText = `Привет, ${currentUser.first_name || currentUser.username}`;
    setTimeout(() => {
        document.getElementById('splash-screen').style.display = 'none';
        document.getElementById('main-app').style.display = 'block';
        updateUI();
        initChat();
    }, 4000);
};

function updateUI() {
    document.getElementById('user-balance').innerText = currentUser.balance.toFixed(2);
    document.getElementById('prof-id').innerText = currentUser.id;
    if (currentUser.isAdmin) {
        document.getElementById('admin-panel').style.display = 'block';
    }
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.getElementById('game-modal').style.display = 'none';
    document.getElementById(`tab-${tabName}`).style.display = 'block';
}

// Управление играми
function openGame(gameType) {
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    const modal = document.getElementById('game-modal');
    const controls = document.getElementById('game-controls');
    modal.style.display = 'block';

    if (gameType === 'dice') {
        document.getElementById('game-title').innerText = '🎲 DICE (Больше/Меньше 50)';
        controls.innerHTML = `
            <button class="ios-btn" onclick="play('dice', 'less')">Меньше 50 (Шанс 50%)</button>
            <button class="ios-btn" onclick="play('dice', 'more')">Больше 50 (Шанс 50%)</button>
        `;
    } else if (gameType === 'football') {
        document.getElementById('game-title').innerText = '⚽ Футбол';
        controls.innerHTML = `
            <div style="font-size: 40px; margin: 10px;">🥅</div>
            <button class="ios-btn" onclick="play('football', 'score')">Забьет</button>
            <button class="ios-btn" onclick="play('football', 'miss')">Не забьет</button>
        `;
    } else {
        document.getElementById('game-title').innerText = gameType.toUpperCase();
        controls.innerHTML = `<button class="ios-btn" onclick="play('${gameType}', 'default')">Крутить / Ставка</button>`;
    }
}

function closeGame() {
    switchTab('games');
}

async function play(game, choice) {
    const bet = document.getElementById('bet-amount').value;
    const res = await fetch('/api/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, bet, game, choice })
    });

    const data = await res.json();
    if (data.error) return alert(data.error);

    currentUser.balance = data.newBalance;
    updateUI();
    alert(data.win ? '🎉 Победа!' : '😢 Проигрыш!');
}

// Чат
async function initChat() {
    loadChat();
    setInterval(loadChat, 3000);
}

async function loadChat() {
    const res = await fetch('/api/chat');
    const msgs = await res.json();
    const box = document.getElementById('chat-box');
    box.innerHTML = msgs.map(m => `<div><b>${m.username}:</b> ${m.message}</div>`).join('');
    box.scrollTop = box.scrollHeight;
}

async function sendChatMessage() {
    const input = document.getElementById('chat-msg');
    if (!input.value) return;

    const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, username: currentUser.username, message: input.value })
    });

    if (!res.ok) {
        const err = await res.json();
        alert(err.error);
    } else {
        input.value = '';
        loadChat();
    }
}

// Оплата Звездами Telegram
async function depositStars() {
    const amount = prompt('Введите сумму пополнения в рублях (1 звезда = 1 рубль):', '100');
    if (!amount) return;

    const res = await fetch('/api/create-stars-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, amount })
    });
    const data = await res.json();
    if (data.invoiceUrl) {
        tg.openInvoice(data.invoiceUrl);
    }
}

// Админ-функции
async function adminAddBalance() {
    const targetQuery = document.getElementById('admin-target').value;
    const amount = document.getElementById('admin-amount').value;

    const res = await fetch('/api/admin/add-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: currentUser.id, targetQuery, amount })
    });

    const data = await res.json();
    alert(data.message || data.error);
}
