const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const BOT_TOKEN = '8161722600:AAEef8zTPXRw7-fPgkHdkVX1pQqan7I5snY';
const TARGET_CHAT_ID = '-1004486534339';

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// База данных в памяти (для прод-среды рекомендуется SQLite/MongoDB)
const users = {}; // userId: { ip, games, wins, losses, username }
const duels = {}; // duelId: { player1, player2, status, state }

app.use(express.static(path.join(__dirname, 'public')));
app.set('trust proxy', true);

// Регистрация IP через ЛС
app.get('/auth', (req, res) => {
    const { userId } = req.query;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    if (userId && users[userId]) {
        users[userId].ip = clientIp;
        return res.send('<h1>Аккаунт и IP успешно привязаны! Можете вернуться в Telegram.</h1>');
    }
    res.status(400).send('Ошибка авторизации.');
});

// Telegram Bot Logic
bot.onText(/\/start/, (msg) => {
    const userId = msg.from.id;
    if (!users[userId]) {
        users[userId] = { ip: null, games: 0, wins: 0, losses: 0, username: msg.from.username || msg.from.first_name };
    }
    
    const opts = {
        reply_markup: {
            keyboard: [
                [{ text: '👤 Профиль' }, { text: '🔓 Отвязать IP' }]
            ],
            resize_keyboard: true
        }
    };
    bot.sendMessage(msg.chat.id, 'Добро пожаловать в проект **Харест**!', opts);
});

bot.on('message', (msg) => {
    const userId = msg.from.id;
    if (!users[userId]) {
        users[userId] = { ip: null, games: 0, wins: 0, losses: 0, username: msg.from.username || msg.from.first_name };
    }

    if (msg.text === '👤 Профиль') {
        const u = users[userId];
        bot.sendMessage(msg.chat.id, `📊 **Ваш профиль:**\n\nИгр: ${u.games}\nПобед: ${u.wins}\nПоражений: ${u.losses}\nIP: ${u.ip ? 'Привязан' : 'Не привязан'}`);
    } else if (msg.text === '🔓 Отвязать IP') {
        users[userId].ip = null;
        bot.sendMessage(msg.chat.id, '✅ Ваш IP успешно сброшен. При новой игре потребуется повторная привязка.');
    }
});

// Команда .дуэль
bot.onText(/^\.дуэль (.+)/, (msg, match) => {
    const challengerId = msg.from.id;
    const targetInput = match[1].replace('@', '').trim();

    if (!users[challengerId] || !users[challengerId].ip) {
        const authUrl = `https://${msg.headers?.host || 'your-render-app.onrender.com'}/auth?userId=${challengerId}`;
        return bot.sendMessage(challengerId, `⚠️ Для участия в дуэлях привяжите IP по ссылке: ${authUrl}`);
    }

    // Поиск оппонента в памяти
    let targetId = Object.keys(users).find(id => users[id].username === targetInput || id === targetInput);

    if (!targetId) {
        return bot.sendMessage(msg.chat.id, 'Пользователь не найден или еще не запускал бота.');
    }

    if (!users[targetId].ip) {
        return bot.sendMessage(msg.chat.id, `@${users[targetId].username} еще не привязал IP! Бот выслал инструкцию в ЛС.`);
    }

    const duelId = `duel_${Date.now()}`;
    duels[duelId] = {
        p1: challengerId,
        p2: targetId,
        accepted: false,
        active: true
    };

    const opts = {
        reply_markup: {
            inline_keyboard: [[
                { text: 'Принять', callback_data: `accept_${duelId}` },
                { text: 'Отклонить', callback_data: `decline_${duelId}` }
            ]]
        }
    };

    bot.sendMessage(msg.chat.id, `ЖДУ ПРИНЯТИЕ СОГЛАШЕНИЯ НА ДУЭЛЬ @${users[targetId].username || targetId}`, opts);

    // Тайм-аут 2 минуты
    setTimeout(() => {
        if (duels[duelId] && !duels[duelId].accepted) {
            delete duels[duelId];
            bot.sendMessage(msg.chat.id, `⌛ Ссылка на дуэль для @${users[targetId].username} больше не действительна.`);
        }
    }, 120000);
});

// Обработка кнопок Принять/Отклонить
bot.on('callback_query', (query) => {
    const userId = query.from.id;
    const [action, duelId] = query.data.split('_');
    const duel = duels[duelId];

    if (!duel) {
        return bot.answerCallbackQuery(query.id, { text: 'Приглашение устарело.', show_alert: true });
    }

    if (userId.toString() !== duel.p2.toString()) {
        return bot.answerCallbackQuery(query.id, { text: 'Эта кнопка не для вас!', show_alert: true });
    }

    if (action === 'accept') {
        duel.accepted = true;
        const gameLink = `https://${query.message.chat.host || 'your-app.onrender.com'}/game.html?duel=${duelId}`;
        bot.sendMessage(query.message.chat.id, `Вот ваша ссылка на дуэль: ${gameLink} \nЖду вас в течении 2-х минут.`);
    } else {
        delete duels[duelId];
        bot.sendMessage(query.message.chat.id, 'Дуэль была отклонена.');
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
