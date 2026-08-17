const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');
const { createCanvas } = require('canvas');
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

// Генерация снимка с "Камеры наблюдения №1"
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  
  // Создаем картинку 600x400
  const canvas = createCanvas(600, 400);
  const ctx = canvas.getContext('2d');

  // Фоны и Стены кинотеатра (Вид сверху-справа)
  ctx.fillStyle = '#110b11';
  ctx.fillRect(0, 0, 600, 400);

  // Экран кинотеатра
  ctx.fillStyle = '#4169e1';
  ctx.fillRect(150, 20, 300, 15);
  ctx.fillStyle = '#ffffff';
  ctx.font = '12px sans-serif';
  ctx.fillText('СВЕТЯЩИЙСЯ ЭКРАН ХУЮТУБ', 210, 32);

  // Отрисовка кресел и игроков
  const playerIds = Object.keys(players);
  playerIds.forEach((id, idx) => {
    const p = players[id];
    // Перевод 3D координат в 2D вид камеры
    const mapX = 300 + p.x * 40;
    const mapY = 200 + p.z * 30;

    // Человек (Голова и тело)
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.arc(mapX, mapY, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '10px sans-serif';
    ctx.fillText(`Зритель #${idx + 1}`, mapX - 20, mapY + 25);
  });

  // Эффект сетки камеры наблюдения
  ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(10, 10, 580, 380);
  ctx.fillStyle = '#00ff00';
  ctx.fillText('REC ● CAM-01 [КИНOATЕАТР]', 20, 30);

  const buffer = canvas.toBuffer('image/png');
  
  bot.sendPhoto(chatId, buffer, {
    caption: `🎥 **Камера наблюдения Хуютуб 3D**\n👥 Зрителей в зале: ${playerIds.length}`
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
