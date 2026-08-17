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

// 4 фиксированных стола по кругу
const DESKS = [
  { id: 0, x: -2.0, z: -2.0, rotY: 0 },
  { id: 1, x:  2.0, z: -2.0, rotY: 0 },
  { id: 2, x: -2.0, z:  2.0, rotY: Math.PI },
  { id: 3, x:  2.0, z:  2.0, rotY: Math.PI }
];

const players = {};
const names = ["Дима", "Саша", "Алексей", "Егор", "Миша", "Игорь", "Олег", "Влад"];
const skins = [
  { skinColor: 0xffdbac, hairColor: 0x221100, hasMustache: false, shirtColor: 0x1f2937 },
  { skinColor: 0x8d5524, hairColor: 0x000000, hasMustache: true,  shirtColor: 0x7c3aed },
  { skinColor: 0xffdbac, hairColor: 0xd97706, hasMustache: true,  shirtColor: 0x059669 },
  { skinColor: 0xe0ac69, hairColor: 0x111111, hasMustache: false, shirtColor: 0xd97706 }
];

const chatHistory = [
  { user: 'TG Bot', text: 'Добро пожаловать в офис!', time: '12:00' }
];

// Получение сообщений из Telegram
bot.on('message', (msg) => {
  if (String(msg.chat.id) === CHAT_ID || msg.chat.id == CHAT_ID) {
    const user = msg.from ? (msg.from.first_name || 'TG Юзер') : 'TG Юзер';
    const text = msg.text || '[Медиа]';
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const msgObj = { user, text, time };
    
    chatHistory.push(msgObj);
    if (chatHistory.length > 40) chatHistory.shift();
    
    io.emit('chatMessage', msgObj);
  }
});

io.on('connection', (socket) => {
  const usedDesks = Object.values(players).map(p => p.deskId);
  const freeDesk = DESKS.find(d => !usedDesks.includes(d.id));

  // Если все 4 места заняты
  if (!freeDesk) {
    socket.emit('officeFull', 'В офисе нет свободных мест! Попробуйте позже.');
    socket.disconnect();
    return;
  }
  
  players[socket.id] = {
    id: socket.id,
    name: names[Math.floor(Math.random() * names.length)],
    deskId: freeDesk.id,
    desk: freeDesk,
    appearance: skins[Math.floor(Math.random() * skins.length)],
    isTyping: false
  };

  socket.emit('init', { myId: socket.id, players, chatHistory });
  socket.broadcast.emit('playerJoined', players[socket.id]);

  socket.on('typingStatus', (isTyping) => {
    if (players[socket.id]) {
      players[socket.id].isTyping = isTyping;
      io.emit('playerTyping', { id: socket.id, isTyping });
    }
  });

  socket.on('sendToTG', (data) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const msgObj = { user: data.name, text: data.text, time };
    
    chatHistory.push(msgObj);
    if (chatHistory.length > 40) chatHistory.shift();

    io.emit('chatMessage', msgObj);
    bot.sendMessage(CHAT_ID, `${data.name}: ${data.text}`);
  });

  socket.on('sendSelfie', (data) => {
    const base64Data = data.image.replace(/^data:image\/png;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');
    bot.sendPhoto(CHAT_ID, buffer, { caption: `📸 ${data.name} сделал(а) селфи за рабочим местом!` });
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`HQ 3D Office Server is running on port ${PORT}`));
