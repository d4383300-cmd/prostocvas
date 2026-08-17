const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static('public'));

// --- TELEGRAM BOT ---
const BOT_TOKEN = '8161722600:AAEef8zTPXRw7-fPgkHdkVX1pQqan7I5snY';
const CHAT_ID = '-1004486534339';
// Укажите HTTPS-ссылку на ваш сервер/хостинг (например, https://your-domain.com)
const WEB_APP_URL = 'https://your-domain.com';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Рассылка каждые 2 минуты (120 000 мс)
setInterval(() => {
    bot.sendMessage(CHAT_ID, "БЫСТРЕЕ ЗАХОДИМ МЫ СМОТРИМ ВИДЕО! В ТЕАТРЕ ВМЕСТЕ!", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🎬 Войти в кинотеатр", web_app: { url: WEB_APP_URL } }]
            ]
        }
    }).catch(err => console.error("Ошибка отправки Telegram сообщения:", err.message));
}, 120000);

// --- SOCKET.IO LOBBY & SYNCRONIZATION ---
let players = {};
let videoState = {
    url: '',
    currentTime: 0,
    isPlaying: false,
    lastUpdate: Date.now()
};

io.on('connection', (socket) => {
    console.log('Игрок подключился:', socket.id);

    // Подключение игрока
    socket.on('join', (data) => {
        players[socket.id] = {
            id: socket.id,
            nickname: data.nickname || 'Гость',
            x: (Math.random() - 0.5) * 4,
            y: 0,
            z: 2 + Math.random() * 2,
            rotY: 0,
            action: 'idle'
        };

        // Отправляем текущее состояние игроку
        socket.emit('init', { id: socket.id, players, videoState });
        // Оповещаем остальных
        socket.broadcast.emit('playerJoined', players[socket.id]);
    });

    // Движение игрока
    socket.on('move', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].z = data.z;
            players[socket.id].rotY = data.rotY;
            players[socket.id].action = data.action;
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    // Смена видео
    socket.on('changeVideo', (url) => {
        videoState = {
            url: url,
            currentTime: 0,
            isPlaying: true,
            lastUpdate: Date.now()
        };
        io.emit('videoStateUpdate', videoState);
    });

    // Синхронизация паузы / воспроизведения / перемотки
    socket.on('syncVideo', (state) => {
        videoState.currentTime = state.currentTime;
        videoState.isPlaying = state.isPlaying;
        videoState.lastUpdate = Date.now();
        socket.broadcast.emit('videoStateUpdate', videoState);
    });

    // Отключение игрока
    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('playerLeft', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
