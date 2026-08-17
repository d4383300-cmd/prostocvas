const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Токен Telegram
const BOT_TOKEN = '8161722600:AAEef8zTPXRw7-fPgkHdkVX1pQqan7I5snY';
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

app.use(express.static(path.join(__dirname, 'public')));

// Состояние 3D-комнаты
let players = {};
let currentVideo = "https://www.w3schools.com/html/mov_bbb.mp4"; // Рандомное видео по умолчанию

// Плейлист автоподбора Хуютуб
const playlist = [
  "https://www.w3schools.com/html/mov_bbb.mp4",
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"
];

io.on('connection', (socket) => {
  // Спавн игрока в кресле
  players[socket.id] = {
    x: (Math.random() - 0.5) * 4,
    y: 0.5,
    z: (Math.random() - 0.5) * 2 + 2,
    ry: 0,
    rx: 0,
    isWalking: false
  };

  // Отправляем текущее состояние
  socket.emit('init', { id: socket.id, players, currentVideo });
  socket.broadcast.emit('playerJoined', { id: socket.id, player: players[socket.id] });

  // Обновление позиции и поворота головы
  socket.on('move', (data) => {
    if (players[socket.id]) {
      Object.assign(players[socket.id], data);
      socket.broadcast.emit('playerMoved', { id: socket.id, ...data });
    }
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

// Telegram-бот камер слежения
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const count = Object.keys(players).length;
  
  // Отправка текстового статуса наблюдения камер
  bot.sendMessage(
    chatId, 
    `🎥 **Камера наблюдения №1 (Верхний правый угол)**\n\n` +
    `📊 Активных зрителей в зале: ${count}\n` +
    `🎬 Сейчас на экране: ${currentVideo}\n\n` +
    `*Система фиксации фиксирует взгляд и перемещения зрителей.*`
  );
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
