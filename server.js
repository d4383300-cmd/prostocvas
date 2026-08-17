const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const BOT_TOKEN = '8161722600:AAEef8zTPXRw7-fPgkHdkVX1pQqan7I5snY';
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

app.use(express.static(path.join(__dirname, 'public')));

let players = {};
let currentVideo = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

io.on('connection', (socket) => {
  players[socket.id] = {
    x: (Math.random() - 0.5) * 4,
    y: 0.8,
    z: (Math.random() - 0.5) * 2 + 2,
    ry: 0
  };

  socket.emit('init', { id: socket.id, players, currentVideo });
  socket.broadcast.emit('playerJoined', { id: socket.id, player: players[socket.id] });

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

// Генерация снимка с камеры слежения без сбоев сборки
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const playerIds = Object.keys(players);

  // Отрисовка игроков для SVG схемы камеры
  let playerDots = '';
  playerIds.forEach((id, idx) => {
    const p = players[id];
    const mapX = 300 + Math.floor(p.x * 35);
    const mapY = 220 + Math.floor(p.z * 25);

    playerDots += `
      <g>
        <circle cx="${mapX}" cy="${mapY}" r="10" fill="#ff3333" stroke="#ffffff" stroke-width="2"/>
        <text x="${mapX - 25}" y="${mapY + 24}" fill="#ffffff" font-size="12" font-family="sans-serif">Зритель #${idx + 1}</text>
      </g>
    `;
  });

  // SVG снимок от лица Камеры №1
  const svgImage = `
  <svg width="600" height="400" xmlns="http://www.w3.org/2000/svg">
    <rect width="600" height="400" fill="#0d0814"/>
    
    <!-- Стены и Экран -->
    <polygon points="50,50 550,50 500,120 100,120" fill="#1b1226" stroke="#332244" stroke-width="2"/>
    <rect x="150" y="60" width="300" height="45" fill="#4169e1" rx="4"/>
    <text x="210" y="87" fill="#ffffff" font-weight="bold" font-size="14" font-family="sans-serif">ЭКРАН КИНОТЕАТРА</text>

    <!-- Игроки в зале -->
    ${playerDots}

    <!-- Имитация интерфейса системы наблюдения -->
    <rect x="10" y="10" width="580" height="380" fill="none" stroke="#00ff00" stroke-width="1" stroke-dasharray="8 4"/>
    <circle cx="30" cy="30" r="6" fill="#ff0000"/>
    <text x="45" y="34" fill="#00ff00" font-family="monospace" font-size="14">REC [CAM-01: ВЕРХНИЙ ПРАВЫЙ УГОЛ]</text>
    <text x="450" y="34" fill="#00ff00" font-family="monospace" font-size="14">ONLINE: ${playerIds.length}</text>
  </svg>
  `;

  const imgBuffer = Buffer.from(svgImage);

  bot.sendPhoto(chatId, imgBuffer, {
    caption: `🎥 **Камера наблюдения "Хуютуб 3D"**\n👥 Активных зрителей в зале: **${playerIds.length}**`
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
