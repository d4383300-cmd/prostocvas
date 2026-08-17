const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const SEAT_POSITIONS = [
    { x: -3.0, y: 0.6, z: 1.5 }, { x: -1.8, y: 0.6, z: 1.5 }, { x: -0.6, y: 0.6, z: 1.5 },
    { x: 0.6, y: 0.6, z: 1.5 },  { x: 1.8, y: 0.6, z: 1.5 },  { x: 3.0, y: 0.6, z: 1.5 },
    { x: -3.0, y: 1.2, z: 4.2 }, { x: -1.8, y: 1.2, z: 4.2 }, { x: -0.6, y: 1.2, z: 4.2 },
    { x: 0.6, y: 1.2, z: 4.2 },  { x: 1.8, y: 1.2, z: 4.2 },  { x: 3.0, y: 1.2, z: 4.2 }
];

let players = {};
let videoState = {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    startTime: Date.now()
};

const TARGET_CHAT_ID = '-1004349256495';
let activeChatIds = new Set([TARGET_CHAT_ID]);

const BOT_TOKEN = '8909586840:AAGmOGefqetTN-cFZrxQSkgYtn-bDAv_RvU';
const WEB_APP_URL = 'https://prostocvas.onrender.com/';
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Обработка команд бота
bot.on('message', (msg) => {
    if (!msg.chat || !msg.chat.id) return;
    const chatId = msg.chat.id.toString();
    activeChatIds.add(chatId);

    // Трансляция сообщений из целевой группы на экран стены
    if (chatId === TARGET_CHAT_ID && msg.text && !msg.text.startsWith('/')) {
        const author = msg.from.first_name || msg.from.username || "Аноним";
        io.emit('telegramWallMessage', { user: author, text: msg.text });
    }
});

// Команда /start с меню выбора ракурса
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "🍿 **Добро пожаловать в 3D Кинотеатр!**\nВыберите ракурс для фото с веб-камеры зала:", {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: "🎬 Общий вид зала", callback_data: "snap_front" }, { text: "🍿 Ряд игроков", callback_data: "snap_players" }],
                [{ text: "🎥 Вид с балкона", callback_data: "snap_top" }, { text: "👥 Вид сбоку", callback_data: "snap_side" }],
                [{ text: "🔍 Первый ряд (Крупный план)", callback_data: "snap_close" }],
                [{ text: "🌐 Открыть 3D Кинотеатр", url: WEB_APP_URL }]
            ]
        }
    });
});

// Обработка нажатий на кнопки ракурсов
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const angle = query.data.replace('snap_', '');

    const socketIds = Object.keys(players);
    if (socketIds.length > 0) {
        bot.answerCallbackQuery(query.id, { text: "Делаем снимок..." });
        const targetSocket = socketIds[Math.floor(Math.random() * socketIds.length)];
        io.to(targetSocket).emit('requestLiveCapture', { angle, requestedChatId: chatId });
    } else {
        bot.answerCallbackQuery(query.id, { text: "В зале сейчас никого нет!", show_alert: true });
    }
});

function getFreePlayerSeatIndex() {
    const takenSeats = new Set(Object.values(players).map(p => p.seatIndex));
    for (let i = 0; i < 6; i++) {
        if (!takenSeats.has(i)) return i;
    }
    for (let i = 6; i < 12; i++) {
        if (!takenSeats.has(i)) return i;
    }
    return Math.floor(Math.random() * 6);
}

// Прием скриншотов с клиента
app.post('/api/media', (req, res) => {
    const { data, targetChatId, isSelfie, nickname } = req.body;
    if (!data) return res.status(400).send("No data");

    const base64Data = data.replace(/^data:image\/png;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');

    const destChat = targetChatId || TARGET_CHAT_ID;
    const caption = isSelfie ? `📸 Селфи от зрителя **${nickname || 'Игрок'}**!` : "📸 Снимок из 3D Кинотеатра!";

    bot.sendPhoto(destChat, buffer, {
        caption,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: "🎬 Войти в 3D Кинотеатр", url: WEB_APP_URL }]] }
    }).catch(err => console.error("SendPhoto Error:", err.message));

    res.send({ success: true });
});

io.on('connection', (socket) => {
    socket.on('join', (data) => {
        const seatIndex = getFreePlayerSeatIndex();
        const pos = SEAT_POSITIONS[seatIndex];

        players[socket.id] = {
            id: socket.id,
            nickname: data.nickname || `Зритель #${seatIndex + 1}`,
            seatIndex,
            x: pos.x, y: pos.y, z: pos.z,
            rotY: 0
        };

        const currentTime = (Date.now() - videoState.startTime) / 1000;
        socket.emit('init', {
            id: socket.id,
            seatIndex,
            players,
            seatPositions: SEAT_POSITIONS,
            videoState: { ...videoState, currentTime }
        });

        socket.broadcast.emit('playerJoined', players[socket.id]);
    });

    socket.on('look', (data) => {
        if (players[socket.id]) {
            players[socket.id].rotY = data.rotY;
            socket.broadcast.emit('playerLooked', { id: socket.id, rotY: data.rotY });
        }
    });

    socket.on('chatMessage', (msg) => {
        if (players[socket.id]) {
            io.emit('chatMessage', {
                id: socket.id,
                nickname: players[socket.id].nickname,
                text: msg
            });
        }
    });

    socket.on('changeVideo', (url) => {
        videoState = { url, startTime: Date.now() };
        io.emit('videoStateUpdate', { ...videoState, currentTime: 0 });
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('playerLeft', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
