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

let activeChatIds = new Set();

const BOT_TOKEN = '8909586840:AAGmOGefqetTN-cFZrxQSkgYtn-bDAv_RvU';
const WEB_APP_URL = 'https://prostocvas.onrender.com/';
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

bot.on('message', (msg) => {
    if (msg.chat && msg.chat.id) activeChatIds.add(msg.chat.id.toString());
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

function sendMediaRequest() {
    const socketIds = Object.keys(players);
    if (socketIds.length > 0) {
        const targetSocket = socketIds[Math.floor(Math.random() * socketIds.length)];
        io.to(targetSocket).emit('requestLiveCapture');
    } else {
        activeChatIds.forEach(chatId => {
            bot.sendMessage(chatId, "🎬 В кинотеатре идет сеанс! Заходи скорее в 3D зал!", {
                reply_markup: { inline_keyboard: [[{ text: "🍿 Войти в зал", url: WEB_APP_URL }]] }
            }).catch(err => {
                if (err.response && err.response.statusCode === 403) activeChatIds.delete(chatId);
            });
        });
    }
}

app.post('/api/media', (req, res) => {
    const { data } = req.body;
    if (!data) return res.status(400).send("No data");

    const base64Data = data.replace(/^data:image\/png;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');

    activeChatIds.forEach(chatId => {
        bot.sendPhoto(chatId, buffer, {
            caption: "📸 Прямой кадр с экрана на всех зрителей в зале!",
            reply_markup: { inline_keyboard: [[{ text: "🎬 Войти в 3D Кинотеатр", url: WEB_APP_URL }]] }
        }).catch(err => {
            if (err.response && (err.response.statusCode === 400 || err.response.statusCode === 403)) {
                activeChatIds.delete(chatId);
            }
        });
    });

    res.send({ success: true });
});

setInterval(sendMediaRequest, 180000);

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
