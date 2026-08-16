const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.set('trust proxy', 1);

// 🛡️ Защита от DDoS и спама
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 100,
    message: "Слишком много запросов, подождите."
});
app.use(limiter);

// 📂 Раздаем файлы ПРЯМО из текущей папки (без папки public)
app.use(express.static(__dirname));

// 🏠 Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 📝 База данных в памяти
const messageHistory = [];
const usersByIp = {};
const usedNicks = new Set();
let onlineCount = 0;

const prefixes = ["Зайчик", "Цыпленок", "Бабка", "Мамка", "ДядяФедор", "Матроскин", "Шарик", "Печкин", "Колобок", "Ежик", "Лис", "Совенок", "Волк", "Тигренок"];
function generateUniqueNick(baseNick = null) {
    let name = baseNick || prefixes[Math.floor(Math.random() * prefixes.length)];
    if (!usedNicks.has(name)) {
        usedNicks.add(name);
        return name;
    }
    let counter = 777;
    while (usedNicks.has(`${name}${counter}`)) {
        counter++;
    }
    const finalNick = `${name}${counter}`;
    usedNicks.add(finalNick);
    return finalNick;
}

const BANNED_WORDS = ["блят", "хуй", "пизд", "ебат", "сука", "чмо", "гной", "http", "https", "t.me", ".com", ".ru", "в лс", "пиши в лс"];

io.on('connection', (socket) => {
    onlineCount++;
    const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;

    if (!usersByIp[clientIp]) {
        usersByIp[clientIp] = {
            ip: clientIp,
            nick: generateUniqueNick(),
            regDate: new Date().toLocaleDateString('ru-RU'),
            prefix: '',
            color: '#000000',
            activeDays: 0,
            todayMessages: 0,
            lastActiveDay: new Date().toDateString(),
            rewardEligible: false
        };
    }

    const user = usersByIp[clientIp];
    socket.emit('init_user', user);
    socket.emit('load_history', messageHistory.slice(-30));
    io.emit('online_update', onlineCount);

    socket.on('send_message', (text) => {
        if (!text || typeof text !== 'string') return;
        text = text.trim();
        if (text.length === 0 || text.length > 200) return;

        if (text.toLowerCase() === 'стата') {
            socket.emit('bot_message', { text: `📊 Сейчас на сайте пользователей: ${onlineCount}` });
            return;
        }
        if (text.toLowerCase() === 'правила') {
            socket.emit('bot_message', { 
                text: `📜 **Правила:**\n1. Призыв в ЛС запрещен!\n2. Ссылки запрещены!\n3. Мат запрещен!\n4. Спам запрещен!`,
                showRulesBtn: true
            });
            return;
        }
        if (text.toLowerCase() === 'сменить ник') {
            usedNicks.delete(user.nick);
            user.nick = generateUniqueNick();
            socket.emit('user_updated', user);
            socket.emit('bot_message', { text: `✅ Ваш новый никнейм: **${user.nick}**` });
            return;
        }

        const lowerText = text.toLowerCase();
        const isViolated = BANNED_WORDS.some(word => lowerText.includes(word));

        if (isViolated) {
            socket.emit('bot_message', { 
                text: `⚠️ **${user.nick}**, не нарушай правила!`, 
                showRulesBtn: true 
            });
            return;
        }

        const today = new Date().toDateString();
        if (user.lastActiveDay !== today) {
            if (user.todayMessages >= 50) user.activeDays++;
            else user.activeDays = 0;
            user.todayMessages = 0;
            user.lastActiveDay = today;
        }
        user.todayMessages++;
        if (user.activeDays >= 3 && !user.rewardEligible) {
            user.rewardEligible = true;
            socket.emit('bot_message', { text: `🎉 Вы проявили активность 3 дня! Вам доступна награда в Магазине!` });
        }

        const msgData = {
            id: Date.now(),
            sender: user.nick,
            prefix: user.prefix,
            color: user.color,
            text: text,
            time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
            isBot: false
        };

        messageHistory.push(msgData);
        if (messageHistory.length > 30) messageHistory.shift();

        io.emit('new_message', msgData);
    });

    socket.on('update_customization', ({ prefix, color }) => {
        if (!user.rewardEligible) return;
        if (prefix && prefix.length <= 8) user.prefix = prefix.trim();
        if (color) user.color = color;
        socket.emit('user_updated', user);
    });

    socket.on('disconnect', () => {
        onlineCount = Math.max(0, onlineCount - 1);
        io.emit('online_update', onlineCount);
    });
});

setInterval(() => {
    const botMsg = {
        id: Date.now(),
        sender: "Харест",
        isBot: true,
        text: 'Хочешь бесплатную мишку в Telegram? Заходи на канал <a href="https://t.me/xurestv" target="_blank" class="chat-link">@xurestv</a>',
        time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    };
    messageHistory.push(botMsg);
    if (messageHistory.length > 30) messageHistory.shift();
    io.emit('new_message', botMsg);
}, 90000);

app.get('/ping', (req, res) => res.send('pong'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
