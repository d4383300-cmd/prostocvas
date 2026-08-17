const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const BOT_TOKEN = '8909586840:AAGmOGefqetTN-cFZrxQSkgYtn-bDAv_RvU';
const CHAT_ID = '-1004349256495';

app.use(express.static('public'));

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Список свободных столов в офисе (координаты X, Z и поворот)
const DESKS = [
  { id: 0, x: -2, z: -2, rot: 0 },
  { id: 1, x: 2, z: -2, rot: 0 },
  { id: 2, x: -2, z: 2, rot: Math.PI },
  { id: 3, x: 2, z: 2, rot: Math.PI }
];

const players = {};
const names = ["Дима", "Саша", "Алексей", "Егор", "Миша", "Игорь", "Олег", "Влад"];
const skins = [
  { skinColor: 0xffdbac, hairColor: 0x221100, hasMustache: false, shirtColor: 0x336699 },
  { skinColor: 0x8d5524, hairColor: 0x000000, hasMustache: true, shirtColor: 0x993333 },
  { skinColor: 0xffdbac, hairColor: 0xaa5500, hasMustache: true, shirtColor: 0x339933 },
  { skinColor: 0xe0ac69, hairColor: 0x111111, hasMustache: false, shirtColor: 0x666666 }
];

// Трансляция из ТГ
bot.on('message', (msg) => {
  if (String(msg.chat.id) === CHAT_ID || msg.chat.id == CHAT_ID) {
    const user = msg.from.first_name || 'Анон';
    const text = msg.text || '[Медиа]';
    io.emit('chatMessage', { user, text });
  }
});

io.on('connection', (socket) => {
  // Назначаем стол и внешний вид
  const usedDesks = Object.values(players).map(p => p.deskId);
  const freeDesk = DESKS.find(d => !usedDesks.includes(d.id)) || DESKS[0];
  
  players[socket.id] = {
    id: socket.id,
    name: names[Math.floor(Math.random() * names.length)],
    deskId: freeDesk.id,
    desk: freeDesk,
    appearance: skins[Math.floor(Math.random() * skins.length)],
    isTyping: false
  };

  // Отправляем текущему игроку его данные и список остальных
  socket.emit('init', { myId: socket.id, players });
  // Сообщаем остальным о новом коллеге
  socket.broadcast.emit('playerJoined', players[socket.id]);

  // Статус печати
  socket.on('typingStatus', (isTyping) => {
    if (players[socket.id]) {
      players[socket.id].isTyping = isTyping;
      io.emit('playerTyping', { id: socket.id, isTyping });
    }
  });

  // Отправка в ТГ
  socket.on('sendToTG', (data) => {
    bot.sendMessage(CHAT_ID, `${data.name}: ${data.text}`);
  });

  // Селфи
  socket.on('sendSelfie', (data) => {
    const base64Data = data.image.replace(/^data:image\/png;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');
    bot.sendPhoto(CHAT_ID, buffer, { caption: `📸 ${data.name} сделал(а) селфи в офисе!` });
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Офис запущен на порту ${PORT}`));
