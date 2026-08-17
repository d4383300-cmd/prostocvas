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

// Четыре фиксированных рабочих стола с точной расстановкой (камера смотрит строго на монитор)
const DESKS = [
  { id: 0, x: -2.2, z: -2, rotY: 0 },
  { id: 1, x:  2.2, z: -2, rotY: 0 },
  { id: 2, x: -2.2, z:  2, rotY: Math.PI },
  { id: 3, x:  2.2, z:  2, rotY: Math.PI }
];

const players = {};
const names = ["Дима", "Саша", "Алексей", "Егор", "Миша", "Игорь", "Олег", "Влад"];
const skins = [
  { skinColor: 0xffdbac, hairColor: 0x221100, hasMustache: false, shirtColor: 0x2b3e50 },
  { skinColor: 0x8d5524, hairColor: 0x000000, hasMustache: true,  shirtColor: 0x8e44ad },
  { skinColor: 0xffdbac, hairColor: 0xd35400, hasMustache: true,  shirtColor: 0x27ae60 },
  { skinColor: 0xe0ac69, hairColor: 0x111111, hasMustache: false, shirtColor: 0xc0392b }
];

// Чат-история в памяти
const chatHistory = [
  { user: 'TG Bot', text: 'Добро пожаловать в офис!', time: '12:00' }
];

// Получение сообщений из Telegram
bot.on('message', (msg) => {
  if (String(msg.chat.id) === CHAT_ID || msg.chat.id == CHAT_ID) {
    const user = msg.from ? (msg.from.first_name || 'TG Пользователь') : 'TG Пользователь';
    const text = msg.text || '[Медиа]';
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const msgObj = { user, text, time };
    
    chatHistory.push(msgObj);
    if (chatHistory.length > 50) chatHistory.shift();
    
    io.emit('chatMessage', msgObj);
  }
});

io.on('connection', (socket) => {
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

  // Отправка данных при входе
  socket.emit('init', { 
    myId: socket.id, 
    players, 
    chatHistory 
  });

  socket.broadcast.emit('playerJoined', players[socket.id]);

  // Трансляция статуса печати
  socket.on('typingStatus', (isTyping) => {
    if (players[socket.id]) {
      players[socket.id].isTyping = isTyping;
      io.emit('playerTyping', { id: socket.id, isTyping });
    }
  });

  // Отправка сообщения в Telegram и всем игрокам
  socket.on('sendToTG', (data) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const msgObj = { user: data.name, text: data.text, time };
    
    chatHistory.push(msgObj);
    if (chatHistory.length > 50) chatHistory.shift();

    io.emit('chatMessage', msgObj);
    bot.sendMessage(CHAT_ID, `${data.name}: ${data.text}`);
  });

  // Отправка селфи
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
server.listen(PORT, () => console.log(`Идеальный 3D Офис запущен на порту ${PORT}`));
