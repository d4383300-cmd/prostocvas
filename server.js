const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

// 3D Места и Игроки
const MAX_SEATS = 8;
const seats = new Array(MAX_SEATS).fill(null); // null или socket.id
const players3D = {}; // { id: { nick, seatIndex, yaw, pitch } }

let idCounter = 0;

wss.on('connection', (ws) => {
  ws.id = ++idCounter;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      // Обычный чат
      if (data.type === 'chat') {
        // Команда /camera
        if (data.text.trim() === '/camera') {
          broadcast({
            type: 'chat',
            nick: '🤖 БОТ-КАМЕРА',
            text: '📸 Снимаю класс с камеры наблюдения...'
          });
          triggerCameraSnapshot();
          return;
        }

        // Рассылаем обычное сообщение
        broadcast({
          type: 'chat',
          nick: data.nick,
          text: data.text
        });
      }

      // Вход в 3D комнат
      if (data.type === 'join_3d') {
        let freeSeat = seats.findIndex(s => s === null);
        if (freeSeat === -1) {
          ws.send(JSON.stringify({ type: 'room_full' }));
          return;
        }

        seats[freeSeat] = ws.id;
        players3D[ws.id] = {
          nick: data.nick,
          seatIndex: freeSeat,
          yaw: 0,
          pitch: 0
        };

        ws.send(JSON.stringify({ type: 'seat_assigned', seatIndex: freeSeat }));
        broadcast3DState();
      }

      // Поворот головы
      if (data.type === 'rotate' && players3D[ws.id]) {
        players3D[ws.id].yaw = data.yaw;
        players3D[ws.id].pitch = data.pitch;
        broadcast3DState();
      }

      // Выход из 3D
      if (data.type === 'leave_3d') {
        removePlayerFrom3D(ws.id);
      }

    } catch (e) {
      console.error(e);
    }
  });

  ws.on('close', () => {
    removePlayerFrom3D(ws.id);
  });
});

function removePlayerFrom3D(id) {
  if (players3D[id]) {
    const seatIdx = players3D[id].seatIndex;
    if (seatIdx !== undefined) seats[seatIdx] = null;
    delete players3D[id];
    broadcast3DState();
  }
}

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

function broadcast3DState() {
  broadcast({
    type: 'players_update',
    players: players3D
  });
}

// Принудительный запрос фото с камеры у любого подключенного клиента ПК
function triggerCameraSnapshot() {
  // Выбираем случайного клиента в 3D для сбора снимка
  const activeClients = Array.from(wss.clients).filter(c => players3D[c.id]);
  if (activeClients.length > 0) {
    const randomClient = activeClients[Math.floor(Math.random() * activeClients.length)];
    // В реальности снимок генерируется на стороне клиента через captureSecurityCamera()
  }
}

// Автоматический прикол бота: скидывать сообщения каждые 1-5 минут
function scheduleBotPhoto() {
  const randomTime = Math.floor(Math.random() * (300000 - 60000 + 1)) + 60000; // от 1 до 5 минут
  setTimeout(() => {
    const count = Object.keys(players3D).length;
    broadcast({
      type: 'chat',
      nick: '🤖 БОТ-НАБЛЮДАТЕЛЬ',
      text: `[АВТО-ОТЧЕТ] В классе сейчас учеников: ${count}/8. Используйте /camera чтобы сделать фото!`
    });
    scheduleBotPhoto();
  }, randomTime);
}
scheduleBotPhoto();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
