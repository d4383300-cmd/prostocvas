const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');

const BOT_TOKEN = '8161722600:AAEef8zTPXRw7-fPgkHdkVX1pQqan7I5snY';
const CHAT_ID = '-1004486534339'; // Новый ID чата
const PORT = process.env.PORT || 3000;

// Список администраторов Telegram (в нижнем регистре без @)
const ADMIN_USERNAMES = ['nubix_3', 'cqody', 'leymik', 'justsqueezeme'];

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

app.use(express.static(path.join(__dirname, 'public')));

// Генератор классических/смешных ников
const NICK_PREFIXES = ['Ржавый', 'Солнечный', 'Позитивный', 'Хмурый', 'Бывалый', 'Мутный', 'Бешеный', 'Лысый', 'Фокусник', 'Дерзкий'];
const NICK_NAMES = ['Толян', 'Вася', 'Жека', 'Илья', 'Серый', 'Миха', 'Батон', 'Пузо', 'Санёк', 'Димон', 'Вован'];

function generateClassicNickname() {
  const p = NICK_PREFIXES[Math.floor(Math.random() * NICK_PREFIXES.length)];
  const n = NICK_NAMES[Math.floor(Math.random() * NICK_NAMES.length)];
  return `${p} ${n}`;
}

// Хранилища данных
const registeredUsers = new Map(); // tgId -> { tgId, username, balance, items, isAdmin }
const authCodes = new Map();       // code -> ws
const recentMessages = [];
const MAX_RECENT_MESSAGES = 5;

// Муты: ip -> timestamp (до какого времени мут)
const ipMutes = new Map();

// Анти-спам и анти-ддос
const userRateLimits = new Map(); // ip -> { msgCount, msgReset, callCount, callReset, blockedUntil }

function getClientIp(req, ws) {
  return ws._socket.remoteAddress || '127.0.0.1';
}

function checkRateLimit(ip, actionType = 'msg') {
  const now = Date.now();
  let limit = userRateLimits.get(ip) || {
    msgCount: 0,
    msgReset: now,
    callCount: 0,
    callReset: now,
    blockedUntil: 0
  };

  if (now < limit.blockedUntil) {
    const leftSec = Math.ceil((limit.blockedUntil - now) / 1000);
    return { ok: false, reason: `Вы временно отключены от действий за спам. Подождите ${leftSec} сек.` };
  }

  if (actionType === 'msg') {
    if (now - limit.msgReset > 4000) {
      limit.msgCount = 0;
      limit.msgReset = now;
    }
    limit.msgCount++;
    if (limit.msgCount > 4) {
      limit.blockedUntil = now + 10000; // 10 сек бан
      userRateLimits.set(ip, limit);
      return { ok: false, reason: 'Слишком частые сообщения! Вы отключены на 10 секунд.' };
    }
  }

  if (actionType === 'call') {
    if (now - limit.callReset > 10000) {
      limit.callCount = 0;
      limit.callReset = now;
    }
    limit.callCount++;
    if (limit.callCount > 2) { // Не более 2 входов/выходов за 10 сек
      limit.blockedUntil = now + 10000;
      userRateLimits.set(ip, limit);
      return { ok: false, reason: 'Частое переподключение к звонку! Блокировка на 10 секунд.' };
    }
  }

  userRateLimits.set(ip, limit);
  return { ok: true };
}

// Звонки: храним участников
const activeCallUsers = new Set();

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

// Генерация цифрового ID из IP
function generateSiteId(ip) {
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    hash = (hash << 5) - hash + ip.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash % 9000) + 1000;
}

// --- Telegram Bot ---
bot.on('message', async (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID && msg.chat.type !== 'private') return;

  // Авторизация /start <code>
  if (msg.chat.type === 'private' && msg.text && msg.text.startsWith('/start')) {
    const parts = msg.text.split(' ');
    if (parts.length > 1) {
      const code = parts[1];
      const sessionWs = authCodes.get(code);
      if (sessionWs) {
        const tgUsername = (msg.from.username || '').toLowerCase();
        const isAdmin = ADMIN_USERNAMES.includes(tgUsername);

        let user = registeredUsers.get(msg.from.id);
        if (!user) {
          user = {
            tgId: msg.from.id,
            username: msg.from.username || msg.from.first_name,
            balance: 0,
            isAdmin: isAdmin,
            items: { verified: false, nicknameColor: 'default' }
          };
          registeredUsers.set(msg.from.id, user);
        } else {
          user.isAdmin = isAdmin;
        }

        sessionWs.userData.tgAccount = user;
        sessionWs.send(JSON.stringify({ type: 'AUTH_SUCCESS', user }));
        bot.sendMessage(msg.chat.id, `✅ Успешно привязано! Ваш баланс: ${user.balance} Травы.${user.isAdmin ? ' 👑 ВЫ АДМИНИСТРАТОР.' : ''}`);
        authCodes.delete(code);
        return;
      }
    }

    let user = registeredUsers.get(msg.from.id);
    const balance = user ? user.balance : 0;
    bot.sendMessage(msg.chat.id, `📋 **Профиль Прослушка**\n\nНик: ${msg.from.first_name}\nБаланс: ${balance} Травы\nАдмин: ${user?.isAdmin ? 'Да' : 'Нет'}`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '🎰 Играть в Казино', callback_data: 'play_casino' }]]
      }
    });
    return;
  }

  // Трансляция сообщений из TG в Чат на сайте
  if (msg.chat.id.toString() === CHAT_ID) {
    const isBot = msg.from.is_bot;
    const authorName = msg.from.first_name || msg.from.username || 'Аноним';

    let textContent = msg.text || msg.caption || '';
    let mediaUrl = null;
    let mediaType = null;

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
      siteId: 'TG',
      isTelegram: true,
      isBot: isBot,
      text: textContent,
      mediaUrl,
      mediaType,
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
    if (win) {
      user.balance += 50;
      bot.sendMessage(query.message.chat.id, `🎉 Победа! +50 Травы. Баланс: ${user.balance}`);
    } else {
      user.balance -= 50;
      bot.sendMessage(query.message.chat.id, `🪦 Проигрыш! -50 Травы. Баланс: ${user.balance}`);
    }
    bot.answerCallbackQuery(query.id);
  }
});

// --- WebSocket Соединения ---
wss.on('connection', (ws, req) => {
  const clientIp = getClientIp(req, ws);
  const siteId = generateSiteId(clientIp);

  ws.userData = {
    ip: clientIp,
    siteId: siteId,
    username: generateClassicNickname(),
    tgAccount: null
  };

  // Отправка истории
  ws.send(JSON.stringify({
    type: 'INIT_DATA',
    history: recentMessages,
    siteId: siteId,
    username: ws.userData.username,
    callCount: activeCallUsers.size
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      // Проверка на мут по IP
      const muteUntil = ipMutes.get(ws.userData.ip) || 0;
      if (Date.now() < muteUntil && ['SEND_MESSAGE'].includes(data.type)) {
        const remainingSec = Math.ceil((muteUntil - Date.now()) / 1000);
        ws.send(JSON.stringify({
          type: 'MUTE_ERROR',
          message: `Вам выдан мут. Разблокировка через ${remainingSec} сек.`
        }));
        return;
      }

      switch (data.type) {
        case 'SEND_MESSAGE': {
          const rate = checkRateLimit(ws.userData.ip, 'msg');
          if (!rate.ok) {
            ws.send(JSON.stringify({ type: 'ERROR', message: rate.reason }));
            return;
          }

          let text = (data.text || '').trim();
          if (!text || text.length > 300) return;

          // Проверка на Команды Админа (мут / размут)
          const userAcc = ws.userData.tgAccount;
          const isAdmin = userAcc && userAcc.isAdmin;

          if (text.toLowerCase().startsWith('мут ') && isAdmin) {
            // Формат: мут (минуты) (айди)
            const parts = text.split(' ');
            if (parts.length >= 3) {
              const mins = parseInt(parts[1]);
              const targetId = parseInt(parts[2]);

              if (!isNaN(mins) && !isNaN(targetId)) {
                // Поиск IP по siteId среди подключенных
                let foundIp = null;
                wss.clients.forEach(c => {
                  if (c.userData && c.userData.siteId === targetId) {
                    foundIp = c.userData.ip;
                  }
                });

                if (foundIp) {
                  const banTime = Date.now() + mins * 60 * 1000;
                  ipMutes.set(foundIp, banTime);
                  broadcast({
                    type: 'SYSTEM_NOTIFY',
                    text: `🔇 Администратор выдал мут пользователю ID:${targetId} на ${mins} мин.`
                  });
                  return;
                } else {
                  ws.send(JSON.stringify({ type: 'ERROR', message: 'Пользователь с таким ID не найден на сайте!' }));
                  return;
                }
              }
            }
          }

          if (text.toLowerCase().startsWith('размут ') && isAdmin) {
            const parts = text.split(' ');
            if (parts.length >= 2) {
              const targetId = parseInt(parts[1]);
              let foundIp = null;
              wss.clients.forEach(c => {
                if (c.userData && c.userData.siteId === targetId) {
                  foundIp = c.userData.ip;
                }
              });

              if (foundIp) {
                ipMutes.delete(foundIp);
                broadcast({
                  type: 'SYSTEM_NOTIFY',
                  text: `🔊 Администратор размутил пользователя ID:${targetId}`
                });
                return;
              }
            }
          }

          // Начисление травы (шанс 2%, от 1 до 12)
          let rewardText = '';
          if (Math.random() <= 0.02) {
            const reward = Math.floor(Math.random() * 12) + 1;
            if (userAcc) {
              userAcc.balance += reward;
            }
            rewardText = `\n🎁 ${ws.userData.username} получил ${reward} Травы за активность!`;
          }

          const payload = {
            type: 'CHAT_MESSAGE',
            sender: ws.userData.username,
            siteId: ws.userData.siteId,
            isTelegram: false,
            isBot: false,
            text: text,
            badge: userAcc?.items?.verified || false,
            color: userAcc?.items?.nicknameColor || 'default',
            timestamp: Date.now()
          };

          saveMessageToHistory(payload);
          broadcast(payload);

          // Передача в Telegram чат
          bot.sendMessage(CHAT_ID, `${ws.userData.username} : ${text}${rewardText}`);

          if (rewardText) {
            broadcast({ type: 'SYSTEM_NOTIFY', text: `🌾 ${ws.userData.username} получил Траву за активность!` });
          }
          break;
        }

        case 'GENERATE_AUTH_CODE': {
          const code = Math.random().toString(36).substring(2, 8);
          authCodes.set(code, ws);
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
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Привяжите Telegram аккаунт для игры!' }));
            return;
          }

          const { bet, mode } = data;
          if (bet < 1 || userAcc.balance < bet) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Некорректная ставка!' }));
            return;
          }

          const roll = Math.floor(Math.random() * 100) + 1;
          let win = (mode === 'more' && roll > 50) || (mode === 'less' && roll < 50);

          if (win) userAcc.balance += bet;
          else userAcc.balance -= bet;

          ws.send(JSON.stringify({ type: 'CASINO_RESULT', roll, win, newBalance: userAcc.balance }));
          break;
        }

        // --- Управление Общим Звонком ---
        case 'JOIN_CALL': {
          const rate = checkRateLimit(ws.userData.ip, 'call');
          if (!rate.ok) {
            ws.send(JSON.stringify({ type: 'ERROR', message: rate.reason }));
            return;
          }

          if (!activeCallUsers.has(ws.userData.siteId)) {
            if (activeCallUsers.size === 0) {
              bot.sendMessage(CHAT_ID, `📞 На сайте "Прослушка" начался общий звонок! Присоединяйтесь!`);
            }
            activeCallUsers.add(ws.userData.siteId);
          }

          broadcast({ type: 'CALL_COUNT_UPDATE', count: activeCallUsers.size });
          break;
        }

        case 'LEAVE_CALL': {
          activeCallUsers.delete(ws.userData.siteId);
          broadcast({ type: 'CALL_COUNT_UPDATE', count: activeCallUsers.size });
          break;
        }

        case 'WEBRTC_OFFER':
        case 'WEBRTC_ANSWER':
        case 'WEBRTC_ICE': {
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

  ws.on('close', () => {
    if (activeCallUsers.has(ws.userData.siteId)) {
      activeCallUsers.delete(ws.userData.siteId);
      broadcast({ type: 'CALL_COUNT_UPDATE', count: activeCallUsers.size });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Запущен сервер на порту ${PORT}`);
});
