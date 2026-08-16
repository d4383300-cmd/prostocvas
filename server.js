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

// 🛡️ Защита от DDoS на уровне HTTP
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

// 🤖 НАСТРОЙКА TELEGRAM БОТА
const TG_TOKEN = '8161722600:AAEef8zTPXRw7-fPgkHdkVX1pQqan7I5snY';
const TG_CHAT_ID = '-1004349256495';

const tgBot = new TelegramBot(TG_TOKEN, { polling: true });

// Игнорируем старые ошибки подключения Telegram, чтобы сервер не падал
tgBot.on('polling_error', (error) => console.log('TG Polling Notice:', error.code));

// 📝 База данных в памяти
const messageHistory = []; // Сохраняем первые 30 сообщений
const usersByIp = {};
const usedNicks = new Set();
let onlineCount = 0;

// Структура для отслеживания спама: IP -> Массив временных меток сообщений
const userSpamTracker = {};

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

// 📥 СООБЩЕНИЯ ИЗ TELEGRAM -> НА САЙТ
tgBot.on('message', (msg) => {
    // Проверяем, что сообщение пришло именно из нужного чата
    if (String(msg.chat.id) !== TG_CHAT_ID) return;
    if (!msg.text) return; // Игнорируем стикеры/картинки без текста

    const senderName = msg.from.first_name || msg.from.username || "TG_User";
    
    const tgMsgData = {
        id: Date.now(),
        sender: senderName,
        prefix: 'TG',
        color: '#0078D7',
        text: msg.text,
        time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        isTelegram: true
    };

    // Сохраняем в истории (не более 30)
    messageHistory.push(tgMsgData);
    if (messageHistory.length > 30) messageHistory.shift();

    // Транслируем всем на сайт
    io.emit('new_message', tgMsgData);
});

// 🌐 SOCKET.IO ЛОГИКА (САЙТ)
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
    
    // Отправляем исторрию БЕЗ автоматического дублирования рекламы при перезагрузке
    socket.emit('load_history', messageHistory.slice(-30));
    io.emit('online_update', onlineCount);

    socket.on('send_message', (text) => {
        if (!text || typeof text !== 'string') return;
        text = text.trim();
        if (text.length === 0 || text.length > 200) return;

        const now = Date.now();
        if (!userSpamTracker[clientIp]) {
            userSpamTracker[clientIp] = [];
        }

        // Очищаем историю сообщений старше 4 секунд
        userSpamTracker[clientIp] = userSpamTracker[clientIp].filter(timestamp => now - timestamp < 4000);

        // 🛑 ПРОВЕРКА НА СПАМ (Максимум 3 сообщения за 4 секунды)
        if (userSpamTracker[clientIp].length >= 3) {
            socket.emit('bot_message', { 
                text: `⚠️ **${user.nick}**, это спам! Разрешено не более 3 сообщений за 4 секунды.`,
                showRulesBtn: true 
            });
            return;
        }

        userSpamTracker[clientIp].push(now);

        // --- Команды ---
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

        // --- Модерация Харестом ---
        const lowerText = text.toLowerCase();
        const isViolated = BANNED_WORDS.some(word => lowerText.includes(word));

        if (isViolated) {
            socket.emit('bot_message', { 
                text: `⚠️ **${user.nick}**, не нарушай правила!`, 
                showRulesBtn: true 
            });
            return;
        }

        // Подсчет активности
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

        // 📤 ОТПРАВКА СООБЩЕНИЯ С САЙТА В TELEGRAM ЧАТ
        const tgFormatText = `${user.prefix ? '[' + user.prefix + '] ' : ''}${user.nick}: ${text}`;
        tgBot.sendMessage(TG_CHAT_ID, tgFormatText).catch(() => {});

        // Рассылка по сайту
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

// 🤖 Рекламный Бот "Харест" отправляет сообщение строго 1 раз в 1.30 минуты (без спама при рестарте)
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
