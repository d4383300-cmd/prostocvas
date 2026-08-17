const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');

const BOT_TOKEN = '8161722600:AAEef8zTPXRw7-fPgkHdkVX1pQqan7I5snY';
const CHAT_ID = '-1004349256495';
const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

app.use(express.static(path.join(__dirname, 'public')));

// База данных в памяти (для продакшена использовать SQLite / PostgreSQL)
const users = new Map(); // socket -> userData
const registeredUsers = new Map(); // tgId -> { balance, verified, items, username }
const authCodes = new Map(); // code -> socketId / session

const recentMessages = [];
const MAX_RECENT_MESSAGES = 5;

// Анти-спам защита
const userRateLimits = new Map(); // ip/socket -> { count, lastReset, blockedUntil }

function checkRateLimit(ws) {
  const now = Date.now();
  let limitData = userRateLimits.get(ws) || { count: 0, lastReset: now, blockedUntil: 0 };

  if (now < limitData.blockedUntil) {
    return { ok: false, reason: 'Вы временно отключены от сервера на 10 сек из-за спама.' };
  }

  if (now - limitData.lastReset > 4000) {
    limitData.count = 0;
    limitData.lastReset = now;
  }

  limitData.count++;

  if (limitData.count > 4) {
    limitData.blockedUntil = now + 10000; // бан 10 сек
    userRateLimits.set(ws, limitData);
    return { ok: false, reason: 'Превышен лимит сообщений (макс. 4 сообщения в 4 секунды). Блокировка на 10 секунд.' };
  }

  userRateLimits.set(ws, limitData);
  return { ok: true };
}

// Рассылка всем клиентам сайта
function broadcast(data) {
  const json = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  });
}

function saveMessageToHistory(msg) {
  recentMessages.push(msg);
  if (recentMessages.length > MAX_RECENT_MESSAGES) {
    recentMessages.shift();
  }
}

// --- Telegram Bot Logic ---
bot.on('message', async (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID && msg.chat.type !== 'private') return;

  // Обработка личных сообщений для авторизации /start code
  if (msg.chat.type === 'private' && msg.text && msg.text.startsWith('/start')) {
    const parts = msg.text.split(' ');
    if (parts.length > 1) {
      const code = parts[1];
      const session = authCodes.get(code);
      if (session) {
        let user = registeredUsers.get(msg.from.id);
        if (!user) {
          user = {
            tgId: msg.from.id,
            username: msg.from.username || msg.from.first_name,
            balance: 0,
            items: { verified: false, nicknameColor: 'default' }
          };
          registeredUsers.set(msg.from.id, user);
        }
        session.ws.userData.tgAccount = user;
        session.ws.send(JSON.stringify({ type: 'AUTH_SUCCESS', user }));
        bot.sendMessage(msg.chat.id, `✅ Аккаунт успешно привязан к сайту "Прослушка"! Ваш баланс: ${user.balance} Травы.`);
        authCodes.delete(code);
        return;
      }
    }
    
    // Команды бота в лс
    let user = registeredUsers.get(msg.from.id);
    const balance = user ? user.balance : 0;
    bot.sendMessage(msg.chat.id, `📱 **Профиль "Прослушка"**\n\nНик: ${msg.from.first_name}\nБаланс Травы: ${balance}`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎰 Играть в Казино', callback_data: 'play_casino' }]
        ]
      }
    });
    return;
  }

  // Трансляция сообщений из группы TG на Сайт
  if (msg.chat.id.toString() === CHAT_ID) {
    const isBot = msg.from.is_bot;
    const authorName = msg.from.first_name || msg.from.username || 'Аноним';
    
    let textContent = msg.text || msg.caption || '';
    let mediaUrl = null;
    let mediaType = null;

    // Обработка медиа без сохранения на диск (получаем direct stream/URL)
    if (msg.photo) {
      const fileId = msg.photo[msg.photo.length - 1].file_id;
      mediaUrl = await bot.getFileLink(fileId);
      mediaType = 'photo';
    } else if (msg.voice) {
      const fileId = msg.voice.file_id;
      mediaUrl = await bot.getFileLink(fileId);
      mediaType = 'voice';
    }

    const payload = {
      type: 'CHAT_MESSAGE',
      sender: authorName,
      isTelegram: true,
      isBot: isBot,
      text: textContent,
      mediaUrl: mediaUrl,
      mediaType: mediaType,
      timestamp: Date.now()
    };

    saveMessageToHistory(payload);
    broadcast(payload);
  }
});

bot.on('callback_query', (query) => {
  if (query.data === 'play_casino') {
    let user = registeredUsers.get(query.from.id);
    if (!user || user.balance < 50) {
      bot.answerCallbackQuery(query.id, { text: 'Недостаточно травы! Нужно минимум 50.', show_alert: true });
      return;
    }
    const win = Math.random() > 0.5;
    const amount = 50;
    if (win) {
      user.balance += amount;
      bot.sendMessage(query.message.chat.id, `🎉 Вы выиграли! +${amount} Травы. Ваш баланс: ${user.balance}`);
    } else {
      user.balance -= amount;
      bot.sendMessage(query.message.chat.id, `🪦 Вы проиграли ${amount} Травы. Ваш баланс: ${user.balance}`);
    }
    bot.answerCallbackQuery(query.id);
  }
});

// --- WebSocket connection handling ---
wss.on('connection', (ws) => {
  ws.userData = {
    username: 'Гость_' + Math.floor(1000 + Math.random() * 9000),
    tgAccount: null
  };

  // Отправляем последние 5 сообщений
  ws.send(JSON.stringify({ type: 'INIT_HISTORY', history: recentMessages }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      // Проверка анти-спама
      const rateCheck = checkRateLimit(ws);
      if (!rateCheck.ok) {
        ws.send(JSON.stringify({ type: 'ERROR', message: rateCheck.reason }));
        if (rateCheck.reason.includes('отключены')) {
          ws.close();
        }
        return;
      }

      switch (data.type) {
        case 'SEND_MESSAGE': {
          let text = (data.text || '').trim();
          if (!text || text.length > 300) return; // Лимит символов

          const userAcc = ws.userData.tgAccount;
          const nickname = ws.userData.username;

          // Шанс 2% получить траву от 1 до 12
          let rewardText = '';
          if (Math.random() <= 0.02) {
            const reward = Math.floor(Math.random() * 12) + 1;
            if (userAcc) {
              userAcc.balance += reward;
            }
            rewardText = `\n🎁 Пользователь ${nickname} получил ${reward} Травы за активность!`;
          }

          const payload = {
            type: 'CHAT_MESSAGE',
            sender: nickname,
            isTelegram: false,
            isBot: false,
            text: text,
            badge: userAcc?.items?.verified || false,
            color: userAcc?.items?.nicknameColor || 'default',
            timestamp: Date.now()
          };

          saveMessageToHistory(payload);
          broadcast(payload);

          // Отправка в TG
          bot.sendMessage(CHAT_ID, `${nickname} : ${text}${rewardText}`);

          if (rewardText) {
            broadcast({
              type: 'SYSTEM_NOTIFY',
              text: `🎉 ${nickname} получил траву за активность!`
            });
          }
          break;
        }

        case 'GENERATE_AUTH_CODE': {
          const code = Math.random().toString(36).substring(2, 8);
          authCodes.set(code, { ws });
          ws.send(JSON.stringify({ type: 'AUTH_CODE', code }));
          break;
        }

        case 'BUY_ITEM': {
          const userAcc = ws.userData.tgAccount;
          if (!userAcc) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Сначала привяжите Telegram аккаунт!' }));
            return;
          }

          const { item, cost } = data;
          if (userAcc.balance < cost) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Недостаточно Травы!' }));
            return;
          }

          userAcc.balance -= cost;
          if (item === 'verified') userAcc.items.verified = true;
          if (['rainbow', 'black_glow', 'white_glow'].includes(item)) {
            userAcc.items.nicknameColor = item;
          }

          ws.send(JSON.stringify({ type: 'BUY_SUCCESS', user: userAcc }));
          break;
        }

        case 'PLAY_CASINO': {
          const userAcc = ws.userData.tgAccount;
          if (!userAcc) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Привяжите Telegram аккаунт для игры в казино!' }));
            return;
          }

          const { bet, mode } = data; // mode: 'more' (>50) or 'less' (<50)
          if (bet < 1 || userAcc.balance < bet) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Некорректная ставка!' }));
            return;
          }

          const roll = Math.floor(Math.random() * 100) + 1; // 1-100
          let win = false;
          if (mode === 'more' && roll > 50) win = true;
          if (mode === 'less' && roll < 50) win = true;

          if (win) {
            userAcc.balance += bet;
          } else {
            userAcc.balance -= bet;
          }

          ws.send(JSON.stringify({
            type: 'CASINO_RESULT',
            roll,
            win,
            newBalance: userAcc.balance
          }));
          break;
        }

        // WebRTC Сигналинг для Общего Звонка
        case 'START_CALL': {
          bot.sendMessage(CHAT_ID, `📞 На сайте "Прослушка" начался общий звонок! Присоединяйтесь!`);
          broadcast({ type: 'CALL_STARTED', sender: ws.userData.username });
          break;
        }

        case 'WEBRTC_OFFER':
        case 'WEBRTC_ANSWER':
        case 'WEBRTC_ICE': {
          // Трансляция сигналинга другим пирам
          wss.clients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(data));
            }
          });
          break;
        }
      }
    } catch (e) {
      console.error(e);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});