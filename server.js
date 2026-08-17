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

// Трансляция сообщений из Telegram в 3D офис
bot.on('message', (msg) => {
  if (String(msg.chat.id) === CHAT_ID || msg.chat.id == CHAT_ID) {
    const text = `${msg.from.first_name || 'Анон'}: ${msg.text || '[Медиа]'}`;
    io.emit('chatMessage', text);
  }
});

// Работа с веб-сокетами игроков
io.on('connection', (socket) => {
  // Отправка сообщения из веб-игры в Telegram
  socket.on('sendToTG', (data) => {
    bot.sendMessage(CHAT_ID, `${data.name}: ${data.text}`);
  });

  // Отправка селфи в Telegram
  socket.on('sendSelfie', (data) => {
    const base64Data = data.image.replace(/^data:image\/png;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');
    
    bot.sendPhoto(CHAT_ID, buffer, { caption: `${data.name} сделал(а) селфи!` });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
