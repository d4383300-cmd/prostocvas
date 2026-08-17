const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const BOT_TOKEN = '8161722600:AAEef8zTPXRw7-fPgkHdkVX1pQqan7I5snY';
const TARGET_CHAT_ID = '-1004486534339';
const DOMAIN = 'https://prostocvas.onrender.com';

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '10mb' }));
app.set('trust proxy', true);

// База данных в памяти
const users = {}; 
const duels = {}; 

// Страница авторизации IP
app.get('/auth', (req, res) => {
    const { userId } = req.query;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (userId) {
        if (!users[userId]) users[userId] = { games: 0, wins: 0, losses: 0 };
        users[userId].ip = clientIp;
        return res.send(`
            <body style="background:#0a0a0a;color:#fff;font-family:sans-serif;text-align:center;padding-top:50px;">
                <h1 style="color:#ff2222;">[ ХАРЕСТ ]</h1>
                <h2>ВАШ IP УСПЕШНО ПРИВЯЗАН!</h2>
                <p>IP: ${clientIp}</p>
                <p>Теперь вы можете закрыть эту страницу и вернуться в Telegram.</p>
            </body>
        `);
    }
    res.status(400).send('Ошибка авторизации.');
});

// Роут привязки IP
app.get('/api/check-access', (req, res) => {
    const { duelId } = req.query;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const duel = duels[duelId];

    if (!duel) return res.json({ allowed: false, reason: 'Дуэль не найдена или завершена.' });

    const p1 = users[duel.p1];
    const p2 = users[duel.p2];

    const isP1 = p1 && p1.ip === clientIp;
    const isP2 = p2 && p2.ip === clientIp;

    if (isP1 || isP2) {
        const role = isP1 ? 'p1' : 'p2';
        const userId = isP1 ? duel.p1 : duel.p2;
        return res.json({ allowed: true, role, userId, username: users[userId].username });
    }

    return res.json({ allowed: false, reason: 'Простите, вы не участвуете в игре.' });
});

// Меню бота в ЛС
bot.onText(/\/start/, (msg) => {
    const userId = msg.from.id;
    if (!users[userId]) {
        users[userId] = { ip: null, games: 0, wins: 0, losses: 0, username: msg.from.username || msg.from.first_name };
    } else {
        users[userId].username = msg.from.username || msg.from.first_name;
    }

    const opts = {
        reply_markup: {
            keyboard: [
                [{ text: '👤 Профиль' }, { text: '📖 Инструкция' }],
                [{ text: '🔓 Отвязать IP' }]
            ],
            resize_keyboard: true
        }
    };
    bot.sendMessage(msg.chat.id, `⚙️ **Проект «Харест»**\n\nДобро пожаловать в русскую рулетку. Используйте кнопку ниже, чтобы узнать правила или проверить свой профиль.`, { parse_mode: 'Markdown', ...opts });
});

bot.on('message', (msg) => {
    const userId = msg.from.id;
    if (!users[userId]) {
        users[userId] = { ip: null, games: 0, wins: 0, losses: 0, username: msg.from.username || msg.from.first_name };
    }

    if (msg.text === '👤 Профиль') {
        const u = users[userId];
        bot.sendMessage(msg.chat.id, `📊 **ВАШ ПРОФИЛЬ:**\n\n• Юзернейм: @${u.username}\n• Всего игр: ${u.games}\n• Побед: ${u.wins}\n• Поражений: ${u.losses}\n• Статус IP: ${u.ip ? '🟢 Привязан' : '🔴 Не привязан'}`, { parse_mode: 'Markdown' });
    } 
    else if (msg.text === '🔓 Отвязать IP') {
        users[userId].ip = null;
        bot.sendMessage(msg.chat.id, '✅ **Ваш IP сброшен.** При вызове на следующую дуэль потребуется повторить авторизацию.');
    }
    else if (msg.text === '📖 Инструкция') {
        const rules = `💀 **ПРАВИЛА ИГРЫ «ХАРЕСТ» (BUCKSHOT ROULETTE):**\n\n` +
            `1. **Вызов на дуэль:** В общем чате напишите \`.дуэль @username\`.\n` +
            `2. **Авторизация:** У обоих участников должен быть привязан IP (бот выдаст ссылку при необходимости).\n` +
            `3. **Принятие:** У оппонента есть 2 минуты на нажатие кнопки «Принять».\n` +
            `4. **Игровой процесс:**\n` +
            `   • Игра состоит из 3 раундов. У каждого по 3 жизней (HP).\n` +
            `   • В начале раунда показывается количество боевых и холостых патронов.\n` +
            `   • В свой ход вы делаете выбор: **«В себя»** или **«В него»**.\n` +
            `   • Если вы стреляете **в себя** холостым — ход остается у вас!\n` +
            `   • Если вы стреляете боевым — теряется 1 HP.\n` +
            `5. **Финал:** Итог выстрела и кадр поражения отправляются напрямую в главный чат!`;
        bot.sendMessage(msg.chat.id, rules, { parse_mode: 'Markdown' });
    }
});

// Команда .дуэль
bot.onText(/^\.дуэль (.+)/, (msg, match) => {
    const challengerId = msg.from.id;
    const targetInput = match[1].replace('@', '').trim();

    if (!users[challengerId]) {
        users[challengerId] = { ip: null, games: 0, wins: 0, losses: 0, username: msg.from.username || msg.from.first_name };
    }

    let targetId = Object.keys(users).find(id => users[id].username && users[id].username.toLowerCase() === targetInput.toLowerCase() || id === targetInput);

    if (!targetId) {
        return bot.sendMessage(msg.chat.id, `❌ Пользователь @${targetInput} не найден. Ему нужно хотя бы один раз написать /start боту в ЛС.`);
    }

    // Проверка привязки IP
    const needAuth = [];
    if (!users[challengerId].ip) needAuth.push({ id: challengerId, name: users[challengerId].username });
    if (!users[targetId].ip) needAuth.push({ id: targetId, name: users[targetId].username });

    if (needAuth.length > 0) {
        let text = `⚠️ **ВНИМАНИЕ УЧАСТНИКАМ!**\nДля проведения дуэли необходимо привязать IP:\n\n`;
        needAuth.forEach(u => {
            text += `👉 @${u.name}: [ПРИВЯЗАТЬ АККАУНТ](${DOMAIN}/auth?userId=${u.id})\n`;
        });
        text += `\n Перейдите по ссылке выше, а затем повторите команду дуэли.`;
        return bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
    }

    const duelId = `duel_${Date.now()}`;
    duels[duelId] = {
        p1: challengerId,
        p2: targetId,
        accepted: false,
        status: 'pending'
    };

    const opts = {
        reply_markup: {
            inline_keyboard: [[
                { text: '⚔️ Принять', callback_data: `accept_${duelId}` },
                { text: '❌ Отклонить', callback_data: `decline_${duelId}` }
            ]]
        }
    };

    bot.sendMessage(msg.chat.id, `🔥 **ЖДУ ПРИНЯТИЕ СОГЛАШЕНИЯ НА ДУЭЛЬ**\nОппонент: @${users[targetId].username}\nИнициатор: @${users[challengerId].username}`, opts);

    setTimeout(() => {
        if (duels[duelId] && !duels[duelId].accepted) {
            delete duels[duelId];
            bot.sendMessage(msg.chat.id, `⏳ Время ожидания истекло. Ссылка на дуэль для @${users[targetId].username} больше не действительна.`);
        }
    }, 120000);
});

// Кнопки принятия/отклонения
bot.on('callback_query', (query) => {
    const userId = query.from.id;
    const [action, duelId] = query.data.split('_');
    const duel = duels[duelId];

    if (!duel) return bot.answerCallbackQuery(query.id, { text: 'Ссылка уже не действительна.', show_alert: true });
    if (userId.toString() !== duel.p2.toString()) {
        return bot.answerCallbackQuery(query.id, { text: 'Кнопка активна только для вызванного игрока!', show_alert: true });
    }

    if (action === 'accept') {
        duel.accepted = true;
        duel.status = 'active';
        const gameUrl = `${DOMAIN}/game.html?duel=${duelId}`;
        bot.sendMessage(query.message.chat.id, `✅ **ДУЭЛЬ ПРИНЯТА!**\n\nВот ваша ссылка на дуэль:\n🔗 ${gameUrl}\n\n Жду вас в течении 2-х минут!`, { parse_mode: 'Markdown' });
    } else {
        delete duels[duelId];
        bot.sendMessage(query.message.chat.id, `❌ @${users[userId].username} отклонил вызов на дуэль.`);
    }
});

// Публикация результатов в целевой чат
app.post('/api/finish-game', (req, res) => {
    const { winnerId, loserId, imageBase64 } = req.body;

    if (users[winnerId]) { users[winnerId].wins++; users[winnerId].games++; }
    if (users[loserId]) { users[loserId].losses++; users[loserId].games++; }

    const winnerName = users[winnerId] ? `@${users[winnerId].username}` : 'Победитель';
    const loserName = users[loserId] ? `@${users[loserId].username}` : 'Проигравший';

    const caption = `💀 **ДУЭЛЬ ЗАВЕРШЕНА!**\n\n👑 Победитель: ${winnerName}\n⚰️ Труп: ${loserName}\n\nПроект «Харест»`;

    if (imageBase64) {
        const buffer = Buffer.from(imageBase64.replace(/^data:image\/png;base64,/, ""), 'base64');
        bot.sendPhoto(TARGET_CHAT_ID, buffer, { caption, parse_mode: 'Markdown' })
            .catch(err => console.error(err));
    } else {
        bot.sendMessage(TARGET_CHAT_ID, caption, { parse_mode: 'Markdown' });
    }

    res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server started on port ${PORT}`));
