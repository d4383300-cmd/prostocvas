const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.set('trust proxy', 1);

// 🛡️ Защита от DDoS
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 120,
    message: "Слишком много запросов."
});
app.use(limiter);

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 🤖 TELEGRAM BOT
const TG_TOKEN = '8161722600:AAEef8zTPXRw7-fPgkHdkVX1pQqan7I5snY';
const ADMIN_TG_ID = 7505593850; // Твой ID Админа

// Динамический список подключенных чатов (по умолчанию твоя группа)
const connectedChatIds = new Set(['-1004349256495']);

const tgBot = new TelegramBot(TG_TOKEN, { polling: true });
tgBot.on('polling_error', (error) => console.log('TG Notice:', error.code));

// 📝 БАЗА ДАННЫХ В ПАМЯТИ
const messageHistory = [];
const usersByIp = {};
const usedNicks = new Set();
let onlineCount = 0;
const userSpamTracker = {};

// 🔤 ГЕНЕРАТОР НИКНЕЙМОВ
const adj = ["Веселый", "Озорной", "Быстрый", "Хитрый", "Добрый", "Смелый", "Тихий", "Спящий", "Умный", "Сладкий", "Морской", "Лесной", "Крутой", "Пушистый", "Черный", "Белый", "Рыжий", "Золотой", "Солнечный", "Снежный", "Звездный", "Лунный", "Огненный", "Ледяной"];
const nouns = ["Зайчик", "Цыпленок", "Бабка", "Мамка", "ДядяФедор", "Матроскин", "Шарик", "Печкин", "Колобок", "Ежик", "Лис", "Совенок", "Волк", "Тигренок", "Медведь", "Кот", "Барсук", "Хомяк", "Пингвин", "Дракон", "Дед", "Внук", "Пончик", "Суслик"];

function generateUniqueNick() {
    let name = `${adj[Math.floor(Math.random() * adj.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}`;
    if (!usedNicks.has(name)) {
        usedNicks.add(name);
        return name;
    }
    let counter = Math.floor(Math.random() * 9000) + 1000;
    while (usedNicks.has(`${name}${counter}`)) {
        counter++;
    }
    const finalNick = `${name}${counter}`;
    usedNicks.add(finalNick);
    return finalNick;
}

// 🤬 ЦЕНЗУРА МАТОВ
const BANNED_WORDS = ["блят", "хуй", "пизд", "ебат", "сука", "чмо", "гной"];
function filterBadWords(text) {
    let result = text;
    BANNED_WORDS.forEach(word => {
        const regex = new RegExp(word, 'gi');
        result = result.replace(regex, '####');
    });
    return result;
}

// 📲 ПРИВЯЗКА TELEGRAM И ПРОВЕРКА НА АДМИНА
tgBot.onText(/\/start (.+)/, (msg, match) => {
    const tgUserId = msg.from.id;
    const userIpEncoded = match[1];
    const clientIp = Buffer.from(userIpEncoded, 'base64').toString('ascii');

    if (usersByIp[clientIp]) {
        usersByIp[clientIp].verified = true;
        usersByIp[clientIp].tgId = tgUserId;

        // 👑 ПРОВЕРКА НА ГЛАВНОГО АДМИНА
        if (Number(tgUserId) === ADMIN_TG_ID) {
            usersByIp[clientIp].isAdmin = true;
            tgBot.sendMessage(msg.chat.id, "👑 Добро пожаловать, Главный Админ! Вам открыт доступ к админ-панели на сайте.");
        } else {
            tgBot.sendMessage(msg.chat.id, "✅ Вы успешно привязали свой аккаунт к Простоквашино! Теперь у вас есть галочка ✔️.");
        }

        if (usersByIp[clientIp].socketId) {
            io.to(usersByIp[clientIp].socketId).emit('user_updated', usersByIp[clientIp]);
            io.to(usersByIp[clientIp].socketId).emit('bot_message', { 
                text: usersByIp[clientIp].isAdmin 
                    ? "👑 Вы авторизованы как Администратор! Панель управления открыта в Профиле." 
                    : "🎉 Ваш аккаунт успешно верифицирован! Вам выдана галочка ✔️" 
            });
        }
    }
});

tgBot.onText(/\/start$/, (msg) => {
    tgBot.sendMessage(msg.chat.id, "Привет! Перейдите в Профиль на сайте и нажмите кнопку 'Привязать Telegram' для верификации.");
});

// 📥 ЧТЕНИЕ СООБЩЕНИЙ ИЗ ВСЕХ ПОДКЛЮЧЕННЫХ ЧАТОВ TELEGRAM -> САЙТ
tgBot.on('message', (msg) => {
    const chatIdStr = String(msg.chat.id);
    if (!connectedChatIds.has(chatIdStr)) return;
    if (!msg.text || msg.text.startsWith('/start')) return;

    const senderName = msg.from.first_name || msg.from.username || "TG_User";
    const censoredText = filterBadWords(msg.text);

    const tgMsgData = {
        id: Date.now(),
        sender: senderName,
        prefix: 'TG',
        color: '#0078D7',
        text: censoredText,
        time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        isTelegram: true,
        verified: true
    };

    messageHistory.push(tgMsgData);
    if (messageHistory.length > 30) messageHistory.shift();

    io.emit('new_message', tgMsgData);
});

// 🌐 SOCKET.IO (САЙТ)
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
            rewardEligible: false,
            verified: false,
            isAdmin: false
        };
    }

    const user = usersByIp[clientIp];
    user.socketId = socket.id;

    const encodedIp = Buffer.from(clientIp).toString('base64');
    const botUsername = "xurestbot_bot";
    user.tgLink = `https://t.me/${botUsername}?start=${encodedIp}`;

    socket.emit('init_user', user);
    socket.emit('load_history', messageHistory.slice(-30));
    io.emit('online_update', onlineCount);

    // 👑 АДМИН-ФУНКЦИЯ: Добавление нового чата
    socket.on('admin_add_chat', (newChatId) => {
        if (!user.isAdmin) return;
        if (!newChatId || typeof newChatId !== 'string') return;
        
        const cleanChatId = newChatId.trim();
        connectedChatIds.add(cleanChatId);

        socket.emit('bot_message', { 
            text: `✅ **Чат ${cleanChatId} успешно добавлен!** Убедитесь, что бот @${botUsername} добавлен в этот чат и назначен администратором.` 
        });
    });

    socket.on('send_message', (text) => {
        if (!text || typeof text !== 'string') return;
        text = text.trim();
        if (text.length === 0 || text.length > 200) return;

        const now = Date.now();
        if (!userSpamTracker[clientIp]) userSpamTracker[clientIp] = [];
        userSpamTracker[clientIp] = userSpamTracker[clientIp].filter(t => now - t < 4000);

        if (userSpamTracker[clientIp].length >= 3) {
            socket.emit('bot_message', { 
                text: `⚠️ **${user.nick}**, это спам! Разрешено не более 3 сообщений за 4 секунды.`,
                showRulesBtn: true 
            });
            return;
        }
        userSpamTracker[clientIp].push(now);

        if (text.toLowerCase() === 'стата') {
            socket.emit('bot_message', { text: `📊 Сейчас на сайте пользователей: ${onlineCount}` });
            return;
        }
        if (text.toLowerCase() === 'правила') {
            socket.emit('bot_message', { 
                text: `📜 **Правила:**\n1. Призыв в ЛС запрещен!\n2. Ссылки запрещены!\n3. Спам запрещен!`,
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

        const cleanText = filterBadWords(text);

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
            text: cleanText,
            time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
            isBot: false,
            verified: user.verified
        };

        messageHistory.push(msgData);
        if (messageHistory.length > 30) messageHistory.shift();

        // Отправка во все подключенные чаты
        const badge = user.verified ? ' ✔️' : '';
        const tgFormatText = `${user.prefix ? '[' + user.prefix + '] ' : ''}${user.nick}${badge}: ${cleanText}`;
        
        connectedChatIds.forEach(chatId => {
            tgBot.sendMessage(chatId, tgFormatText).catch(() => {});
        });

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
