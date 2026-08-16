const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const TG_TOKEN = '8161722600:AAEef8zTPXRw7-fPgkHdkVX1pQqan7I5snY';
const ADMIN_TG_ID = 7505593850;
const connectedChatIds = new Set(['-1004349256495']);

const tgBot = new TelegramBot(TG_TOKEN, { polling: true });

const usersByIp = {};
const gamePlayers = {};

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

// 🤖 ОБРАБОТКА МЕДИАФАЙЛОВ ИЗ TELEGRAM
tgBot.on('message', (msg) => {
    const sourceChatId = String(msg.chat.id);
    if (!connectedChatIds.has(sourceChatId)) return;

    let contentText = msg.text || '';
    if (msg.photo) contentText = `[photo] ${msg.caption || ''}`;
    if (msg.voice) contentText = `[voice] ${msg.caption || ''}`;
    if (msg.video) contentText = `[video] ${msg.caption || ''}`;

    if (!contentText) return;

    const senderName = msg.from.first_name || msg.from.username || "TG_User";
    const cleanText = filterBadWords(contentText);

    const msgData = {
        id: msg.message_id,
        sender: senderName,
        text: cleanText,
        timestamp: Date.now(),
        verified: true
    };

    io.emit('new_message', msgData);
});

// 🌐 SOCKET.IO
io.on('connection', (socket) => {
    const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;

    if (!usersByIp[clientIp]) {
        usersByIp[clientIp] = {
            ip: clientIp,
            nick: `User${Math.floor(Math.random()*899+100)}`,
            regDate: new Date().toLocaleDateString('ru-RU'),
            verified: false
        };
    }

    const user = usersByIp[clientIp];
    user.socketId = socket.id;

    socket.emit('init_user', user);

    // Смена ника до 6 символов
    socket.on('change_nick', (newNick) => {
        if (typeof newNick === 'string' && newNick.length <= 6 && newNick.trim().length > 0) {
            user.nick = newNick.trim();
            socket.emit('user_updated', user);
        }
    });

    // Отправка сообщений с ответом (Reply)
    socket.on('send_message', (data) => {
        if (!data || !data.text) return;
        const cleanText = filterBadWords(data.text);

        const msgData = {
            id: Date.now(),
            sender: user.nick,
            text: cleanText,
            timestamp: Date.now(),
            replyTo: data.replyTo || null,
            verified: user.verified
        };

        // Отправка в Telegram с привязкой Ответа
        const replyText = data.replyTo ? `(Ответ для ${data.replyTo.sender})\n` : '';
        const tgMessage = `${replyText}${user.nick}: ${cleanText}`;

        connectedChatIds.forEach(chatId => {
            tgBot.sendMessage(chatId, tgMessage).catch(() => {});
        });

        io.emit('new_message', msgData);
    });

    // 2D Игра Движение
    socket.on('player_move', (moveData) => {
        gamePlayers[socket.id] = {
            x: moveData.x,
            y: moveData.y,
            smoking: moveData.smoking,
            nick: user.nick
        };
        io.emit('game_state', { players: gamePlayers });
    });

    socket.on('disconnect', () => {
        delete gamePlayers[socket.id];
    });
});

// 🤖 Реклама бота каждые 5 минут (300 000 мс)
setInterval(() => {
    const botMsg = {
        id: Date.now(),
        sender: "Харест",
        isBot: true,
        text: 'Хочешь бесплатную мишку в Telegram? Заходи на канал @xurestv',
        timestamp: Date.now()
    };
    io.emit('new_message', botMsg);
}, 300000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
