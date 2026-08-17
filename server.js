const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// --- TELEGRAM BOT ---
const BOT_TOKEN = '8161722600:AAEef8zTPXRw7-fPgkHdkVX1pQqan7I5snY';
const CHAT_ID = '-1004486534339';
const WEB_APP_URL = 'https://prostocvas.onrender.com/';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

function sendTelegramNotification() {
    bot.sendMessage(CHAT_ID, "🔥 БЫСТРЕЕ ЗАХОДИМ МЫ СМОТРИМ ВИДЕО! В ТЕАТРЕ ВМЕСТЕ!", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🎬 Войти в 3D Кинотеатр", url: WEB_APP_URL }]
            ]
        }
    }).catch(err => console.error("Ошибка Telegram:", err.message));
}

sendTelegramNotification();
setInterval(sendTelegramNotification, 120000);

// --- SOCKET.IO ---
let players = {};
let videoState = {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    startTime: Date.now()
};

io.on('connection', (socket) => {
    socket.on('join', (data) => {
        players[socket.id] = {
            id: socket.id,
            nickname: data.nickname || `Зритель #${Math.floor(1000 + Math.random() * 9000)}`,
            x: (Math.random() - 0.5) * 2,
            y: 0.6,
            z: 2 + Math.random(),
            rotY: 0
        };

        const currentTime = (Date.now() - videoState.startTime) / 1000;

        socket.emit('init', {
            id: socket.id,
            players,
            videoState: { ...videoState, currentTime }
        });

        socket.broadcast.emit('playerJoined', players[socket.id]);
    });

    socket.on('move', (data) => {
        if (players[socket.id]) {
            Object.assign(players[socket.id], data);
            socket.broadcast.emit('playerMoved', players[socket.id]);
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
        videoState = {
            url,
            startTime: Date.now()
        };
        io.emit('videoStateUpdate', { ...videoState, currentTime: 0 });
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('playerLeft', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
