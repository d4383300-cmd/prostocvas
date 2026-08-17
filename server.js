const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const BOT_TOKEN = '8161722600:AAEef8zTPXRw7-fPgkHdkVX1pQqan7I5snY';
const CHAT_ID = '-1004486534339';
const PORT = process.env.PORT || 3000;

const ADMIN_USERNAMES = ['nubix_3', 'cqody', 'leymik', 'justsqueezeme'];

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

app.use(express.static(path.join(__dirname, 'public')));

// Инициализация локальной базы данных SQLite
const db = new sqlite3.Database('./database.db', (err) => {
  if (err) console.error('Ошибка подключении к SQLite:', err.message);
  else console.log('База данных SQLite успешно подключена.');
});

// Таблицы пользователей и предметов
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    tg_id TEXT PRIMARY KEY,
    username TEXT,
    balance INTEGER DEFAULT 0,
    is_admin INTEGER DEFAULT 0,
    verified INTEGER DEFAULT 0,
    nickname_color TEXT DEFAULT 'default'
  )`);
});

// Генерация ников
const NICK_PREFIXES = ['Ржавый', 'Солнечный', 'Позитивный', 'Хмурый', 'Бывалый', 'Мутный', 'Бешеный', 'Лысый', 'Фокусник', 'Дерзкий'];
const NICK_NAMES = ['Толян', 'Вася', 'Жека', 'Илья', 'Серый', 'Миха', 'Батон', 'Пузо', 'Санёк', 'Димон', 'Вован'];

function generateClassicNickname() {
  const p = NICK_PREFIXES[Math.floor(Math.random() * NICK_PREFIXES.length)];
  const n = NICK_NAMES[Math.floor(Math.random() * NICK_NAMES.length)];
  return `${p} ${n}`;
}

const authCodes = new Map(); // code -> ws
const recentMessages = [];
const MAX_RECENT_MESSAGES = 5;

const ipMutes = new Map();
const userRateLimits = new Map();
const activeCallUsers = new Set();

function getClientIp(req, ws) {
  return ws._socket.remoteAddress || '127.0.0.1';
}

function checkRateLimit(ip, actionType = 'msg') {
  const now = Date.now();
  let limit = userRateLimits.get(ip) || {
    msgCount: 0, msgReset: now,
    callCount: 0, callReset: now,
    blockedUntil: 0
  };

  if (now < limit.blockedUntil) {
    const leftSec = Math.ceil((limit.blockedUntil - now) / 1000);
    return { ok: false, reason: `Действия заблокированы из-за спама. Подождите ${leftSec} сек.` };
  }

  if (actionType === 'msg') {
    if (now - limit.msgReset > 4000) {
      limit.msgCount = 0;
      limit.msgReset = now;
    }
    limit.msgCount++;
    if (limit.msgCount > 4) {
      limit.blockedUntil = now + 10000;
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
    if (limit.callCount > 2) {
      limit.blockedUntil = now + 10000;
      userRateLimits.set(ip, limit);
      return { ok: false, reason: 'Частое переподключение к звонку! Блокировка на 10 секунд.' };
    }
  }

  userRateLimits.set(ip, limit);
  return { ok: true };
}

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

function generateSiteId(ip) {
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    hash = (hash << 5) - hash + ip.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash % 9000) + 1000;
}

// Telegram Бот
bot.on('message', async (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID && msg.chat.type !== 'private') return;

  if (msg.chat.type === 'private' && msg.text && msg.text.startsWith('/start')) {
    const parts = msg.text.split(' ');
    if (parts.length > 1) {
      const code = parts[1];
      const sessionWs = authCodes.get(code);
      if (sessionWs) {
        const tgId = msg.from.id.toString();
        const tgUsername = (msg.from.username || msg.from.first_name || '').toLowerCase();
        const isAdmin = ADMIN_USERNAMES.includes(tgUsername) ? 1 : 0;

        db.get('SELECT * FROM users WHERE tg_id = ?', [tgId], (err, row) => {
          if (!row) {
            db.run('INSERT INTO users (tg_id, username, is_admin) VALUES (?, ?, ?)', [tgId, msg.from.first_name, isAdmin], function() {
              loadAndAuthUser(tgId, sessionWs);
            });
          } else {
            db.run('UPDATE users SET is_admin = ? WHERE tg_id = ?', [isAdmin, tgId], function() {
              loadAndAuthUser(tgId, sessionWs);
            });
          }
        });

        bot.sendMessage(msg.chat.id, `✅ Аккаунт привязан к сайту "Прослушка"!`);
        authCodes.delete(code);
        return;
      }
    }

    const tgId = msg.from.id.toString();
    db.get('SELECT * FROM users WHERE tg_id = ?', [tgId], (err, user) => {
      const balance = user ? user.balance : 0;
      bot.sendMessage(msg.chat.id, `📋 **Профиль Прослушка**\n\nНик: ${msg.from.first_name}\nБаланс: ${balance} Травы`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '🎰 Играть в Казино', callback_data: 'play_casino' }]]
        }
      });
    });
    return;
  }

  if (msg.chat.id.toString() === CHAT_ID) {
    const authorName = msg.from.first_name || msg.from.username || 'Аноним';
    let textContent = msg.text || msg.caption || '';
    let mediaUrl = null, mediaType = null;

    if (msg.photo) {
      mediaUrl = await bot.getFileLink(msg.photo[msg.photo.length - 1].file_id);
      mediaType = 'photo';
    } else if (msg.voice) {
      mediaUrl = await bot.getFileLink(msg.voice.file_id);
      mediaType = 'voice';
    }

    const payload = {
      type: 'CHAT_MESSAGE',
      sender: authorName,
      siteId: 'TG',
      isTelegram: true,
      isBot: msg.from.is_bot,
      text: textContent,
      mediaUrl, mediaType,
      timestamp: Date.now()
    };

    saveMessageToHistory(payload);
    broadcast(payload);
  }
});

function loadAndAuthUser(tgId, ws) {
  db.get('SELECT * FROM users WHERE tg_id = ?', [tgId], (err, user) => {
    if (user) {
      ws.userData.tgAccount = user;
      ws.send(JSON.stringify({ type: 'AUTH_SUCCESS', user }));
    }
  });
}

bot.on('callback_query', (query) => {
  if (query.data === 'play_casino') {
    const tgId = query.from.id.toString();
    db.get('SELECT * FROM users WHERE tg_id = ?', [tgId], (err, user) => {
      if (!user || user.balance < 50) {
        bot.answerCallbackQuery(query.id, { text: 'Недостаточно травы! Нужно минимум 50.', show_alert: true });
        return;
      }
      const win = Math.random() > 0.5;
      const newBalance = win ? user.balance + 50 : user.balance - 50;

      db.run('UPDATE users SET balance = ? WHERE tg_id = ?', [newBalance, tgId], () => {
        bot.sendMessage(query.message.chat.id, win ? `🎉 Победа! +50 Травы. Баланс: ${newBalance}` : `🪦 Проигрыш! -50 Травы. Баланс: ${newBalance}`);
      });
      bot.answerCallbackQuery(query.id);
    });
  }
});

// WebSocket
wss.on('connection', (ws, req) => {
  const clientIp = getClientIp(req, ws);
  const siteId = generateSiteId(clientIp);

  ws.userData = {
    ip: clientIp,
    siteId: siteId,
    username: generateClassicNickname(),
    tgAccount: null
  };

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

      const muteUntil = ipMutes.get(ws.userData.ip) || 0;
      if (Date.now() < muteUntil && ['SEND_MESSAGE'].includes(data.type)) {
        const remainingSec = Math.ceil((muteUntil - Date.now()) / 1000);
        ws.send(JSON.stringify({ type: 'MUTE_ERROR', message: `У вас мут. Осталось ${remainingSec} сек.` }));
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

          const userAcc = ws.userData.tgAccount;
          const isAdmin = userAcc && userAcc.is_admin === 1;

          if (text.toLowerCase().startsWith('мут ') && isAdmin) {
            const parts = text.split(' ');
            if (parts.length >= 3) {
              const mins = parseInt(parts[1]);
              const targetId = parseInt(parts[2]);
              let foundIp = null;
              wss.clients.forEach(c => {
                if (c.userData && c.userData.siteId === targetId) foundIp = c.userData.ip;
              });

              if (foundIp) {
                ipMutes.set(foundIp, Date.now() + mins * 60 * 1000);
                broadcast({ type: 'SYSTEM_NOTIFY', text: `🔇 Администратор замутил ID:${targetId} на ${mins} мин.` });
                return;
              } else {
                ws.send(JSON.stringify({ type: 'ERROR', message: 'Пользователь не найден!' }));
                return;
              }
            }
          }

          if (text.toLowerCase().startsWith('размут ') && isAdmin) {
            const parts = text.split(' ');
            if (parts.length >= 2) {
              const targetId = parseInt(parts[1]);
              wss.clients.forEach(c => {
                if (c.userData && c.userData.siteId === targetId) ipMutes.delete(c.userData.ip);
              });
              broadcast({ type: 'SYSTEM_NOTIFY', text: `🔊 Размут пользователя ID:${targetId}` });
              return;
            }
          }

          // ШАНС ВЫПАДЕНИЯ ТРАВЫ = 7%
          let rewardText = '';
          if (Math.random() <= 0.07) {
            const reward = Math.floor(Math.random() * 12) + 1;
            if (userAcc) {
              userAcc.balance += reward;
              db.run('UPDATE users SET balance = ? WHERE tg_id = ?', [userAcc.balance, userAcc.tg_id]);
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
            badge: userAcc?.verified === 1,
            color: userAcc?.nickname_color || 'default',
            timestamp: Date.now()
          };

          saveMessageToHistory(payload);
          broadcast(payload);

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
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Сначала привяжите Telegram!' }));
            return;
          }

          const { item, cost } = data;
          if (userAcc.balance < cost) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Недостаточно Травы!' }));
            return;
          }

          userAcc.balance -= cost;
          if (item === 'verified') userAcc.verified = 1;
          if (['rainbow', 'black_glow', 'white_glow'].includes(item)) userAcc.nickname_color = item;

          db.run('UPDATE users SET balance = ?, verified = ?, nickname_color = ? WHERE tg_id = ?', 
            [userAcc.balance, userAcc.verified, userAcc.nickname_color, userAcc.tg_id], () => {
              ws.send(JSON.stringify({ type: 'BUY_SUCCESS', user: userAcc }));
            });
          break;
        }

        case 'PLAY_CASINO': {
          const userAcc = ws.userData.tgAccount;
          if (!userAcc) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Привяжите Telegram аккаунт!' }));
            return;
          }

          const { bet, mode } = data;
          if (bet < 1 || userAcc.balance < bet) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Некорректная ставка!' }));
            return;
          }

          const roll = Math.floor(Math.random() * 100) + 1;
          let win = (mode === 'more' && roll > 50) || (mode === 'less' && roll < 50);

          userAcc.balance = win ? userAcc.balance + bet : userAcc.balance - bet;
          db.run('UPDATE users SET balance = ? WHERE tg_id = ?', [userAcc.balance, userAcc.tg_id], () => {
            ws.send(JSON.stringify({ type: 'CASINO_RESULT', roll, win, newBalance: userAcc.balance }));
          });
          break;
        }

        case 'JOIN_CALL': {
          const rate = checkRateLimit(ws.userData.ip, 'call');
          if (!rate.ok) {
            ws.send(JSON.stringify({ type: 'ERROR', message: rate.reason }));
            return;
          }
          if (!activeCallUsers.has(ws.userData.siteId)) {
            if (activeCallUsers.size === 0) {
              bot.sendMessage(CHAT_ID, `📞 На сайте началась трансляция в общем звонке!`);
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
  console.log(`Сервер Прослушка запущен на порту ${PORT}`);
});
