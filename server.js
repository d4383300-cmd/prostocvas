const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
const MAX_SEATS = 6;
const SEAT_POSITIONS_X = [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5];

let players = {};
let videoState = {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    startTime: Date.now(),
    isStreamMode: false
};

// Хранилище всех ID чатов, куда добавлен бот
let activeChatIds = new Set(['-1004486534339']);

// --- TELEGRAM BOT ---
const BOT_TOKEN = '8161722600:AAEef8zTPXRw7-fPgkHdkVX1pQqan7I5snY';
const WEB_APP_URL = 'https://prostocvas.onrender.com/';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Запоминаем новые чаты и группы, где есть бот
bot.on('message', (msg) => {
    if (msg.chat && msg.chat.id) {
        activeChatIds.add(msg.chat.id.toString());
    }
});

// Запрос скриншота у клиента
function sendTelegramNotification() {
    const socketIds = Object.keys(players);
    if (socketIds.length > 0) {
        io.to(socketIds[0]).emit('requestScreenshot');
    } else {
        // Если никого нет — слать текстовый анонс во все чаты
        activeChatIds.forEach(chatId => {
            bot.sendMessage(chatId, "🔥 БЫСТРЕЕ ЗАХОДИМ МЫ СМОТРИМ ВИДЕО! В ТЕАТРЕ ВМЕСТЕ!", {
                reply_markup: {
                    inline_keyboard: [[{ text: "🎬 Войти в 3D Кинотеатр", url: WEB_APP_URL }]]
                }
            }).catch(err => console.error(`Ошибка Telegram (${chatId}):`, err.message));
        });
    }
}

// Прием скриншота и рассылка ВО ВСЕ ЧАТЫ
app.post('/api/screenshot', (req, res) => {
    const { image } = req.body;
    if (!image) return res.status(400).send("No image");

    const base64Data = image.replace(/^data:image\/png;base64,/, "");
    const imgBuffer = Buffer.from(base64Data, 'base64');

    activeChatIds.forEach(chatId => {
        bot.sendPhoto(chatId, imgBuffer, {
            caption: "🔥 БЫСТРЕЕ ЗАХОДИМ МЫ СМОТРИМ ВИДЕО! В ТЕАТРЕ ВМЕСТЕ!",
            reply_markup: {
                inline_keyboard: [[{ text: "🎬 Войти в 3D Кинотеатр", url: WEB_APP_URL }]]
            }
        }).catch(err => console.error(`Ошибка рассылки в ${chatId}:`, err.message));
    });

    res.send({ success: true });
});

sendTelegramNotification();
setInterval(sendTelegramNotification, 120000);

// --- SOCKET.IO ЛОГИКА ---
function getFreeSeatIndex() {
    const occupiedSeats = new Set(Object.values(players).map(p => p.seatIndex));
    for (let i = 0; i < MAX_SEATS; i++) {
        if (!occupiedSeats.has(i)) return i;
    }
    return -1;
}

io.on('connection', (socket) => {

    socket.on('join', (data) => {
        const seatIndex = getFreeSeatIndex();

        if (seatIndex === -1) {
            socket.emit('fullRoom', 'К сожалению, в зале нет свободных мест (максимум 6 зрителей)!');
            return;
        }

        players[socket.id] = {
            id: socket.id,
            nickname: data.nickname || `Зритель #${seatIndex + 1}`,
            seatIndex: seatIndex,
            x: SEAT_POSITIONS_X[seatIndex],
            y: 0.6,
            z: 2.0,
            rotY: 0
        };

        const currentTime = (Date.now() - videoState.startTime) / 1000;

        socket.emit('init', {
            id: socket.id,
            seatIndex,
            players,
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

    socket.on('changeVideo', (input) => {
        const trimmed = input.trim().toLowerCase();
        
        if (trimmed === 'стрим' || trimmed === 'stream') {
            videoState = {
                url: 'https://www.youtube.com/watch?v=g-OQh_7fEWE',
                startTime: Date.now(),
                isStreamMode: true
            };
        } else {
            videoState = {
                url: input,
                startTime: Date.now(),
                isStreamMode: false
            };
        }
        
        io.emit('videoStateUpdate', { ...videoState, currentTime: 0 });
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('playerLeft', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
