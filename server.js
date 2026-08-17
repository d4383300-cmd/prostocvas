const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static('public'));

let players = {};
let gameState = {
    status: 'WAITING',
    round: 1,
    turnIndex: 0,
    currentQuestion: null,
    timer: 10
};

const SEAT_POSITIONS = [
    { x: -2.2, z: -1 }, { x: 0, z: -1 }, { x: 2.2, z: -1 }, // Передний ряд
    { x: -2.2, z: 2.5 }, { x: 0, z: 2.5 }, { x: 2.2, z: 2.5 }  // Задний ряд
];

function generateProblem(round) {
    let a, b, op, ans;
    if (round === 1) {
        a = Math.floor(Math.random() * 8) + 1;
        b = Math.floor(Math.random() * 8) + 1;
        op = '+'; ans = a + b;
    } else if (round <= 3) {
        a = Math.floor(Math.random() * 15) + 5;
        b = Math.floor(Math.random() * 15) + 1;
        op = Math.random() > 0.5 ? '+' : '-';
        ans = op === '+' ? a + b : a - b;
    } else { // Сложные / "Балди" нерешаемые примеры
        a = Math.floor(Math.random() * 800) + 100;
        b = Math.floor(Math.random() * 800) + 100;
        op = 'x'; ans = 42; 
    }
    return { text: `${a} ${op} ${b} = ?`, answer: ans };
}

function broadcast(data) {
    const msg = JSON.stringify(data);
    wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
}

function startNewGame() {
    gameState.status = 'ENTER_ANIM';
    gameState.round = 1;
    gameState.turnIndex = 0;

    let pKeys = Object.keys(players);
    let seatIdx = 0;

    // Распределяем реальных игроков
    pKeys.forEach(id => {
        players[id].seat = seatIdx++;
        players[id].isNPC = false;
    });

    // Заполняем оставшиеся парты до 6 штук NPC
    for (let i = seatIdx; i < 6; i++) {
        let npcId = `npc_${i}`;
        players[npcId] = {
            id: npcId,
            seat: i,
            isNPC: true,
            name: `Бот #${i+1}`,
            headRotation: { x: 0, y: 0 }
        };
    }

    broadcast({ type: 'START_ENTER_ANIMATION', players, gameState });

    setTimeout(() => {
        gameState.status = 'GAME';
        nextTurn();
    }, 4500);
}

function nextTurn() {
    let pKeys = Object.keys(players);
    if (pKeys.length === 0) return;

    if (gameState.turnIndex >= pKeys.length) {
        gameState.turnIndex = 0;
        gameState.round++;
        if (gameState.round > 5) {
            gameState.status = 'RESULTS';
            broadcast({ type: 'SHOW_RESULTS', players });
            setTimeout(startNewGame, 7000);
            return;
        }
    }

    let activeId = pKeys[gameState.turnIndex];
    let activePlayer = players[activeId];
    gameState.currentQuestion = generateProblem(gameState.round);
    gameState.timer = 10;

    broadcast({
        type: 'NEW_TURN',
        activePlayerId: activeId,
        isNPC: activePlayer.isNPC,
        question: gameState.currentQuestion.text,
        round: gameState.round,
        seat: activePlayer.seat
    });

    // Автоматический ход для NPC
    if (activePlayer.isNPC) {
        setTimeout(() => {
            let npcAns = gameState.round <= 3 ? gameState.currentQuestion.answer : Math.floor(Math.random() * 999);
            broadcast({ type: 'ANSWER_SUBMITTED', id: activeId, text: npcAns });
            
            setTimeout(() => {
                gameState.turnIndex++;
                nextTurn();
            }, 2500);
        }, 3000 + Math.random() * 2000);
        return;
    }

    // Таймер для реальных игроков
    let timerInterval = setInterval(() => {
        gameState.timer--;
        broadcast({ type: 'TIMER_TICK', timer: gameState.timer });

        if (gameState.timer <= 0) {
            clearInterval(timerInterval);
            broadcast({ type: 'ANSWER_SUBMITTED', id: activeId, text: '???' });
            gameState.turnIndex++;
            setTimeout(nextTurn, 2500);
        }
    }, 1000);
}

wss.on('connection', (ws) => {
    const id = 'player_' + Math.random().toString(36).substr(2, 6);
    players[id] = { id, seat: -1, headRotation: { x: 0, y: 0 }, isNPC: false };

    ws.send(JSON.stringify({ type: 'INIT', id }));
    startNewGame(); // Перезапуск с анимацией захода при новом подключении

    ws.on('message', (msg) => {
        let data = JSON.parse(msg);

        if (data.type === 'ROTATE_HEAD') {
            if (players[id]) players[id].headRotation = data.rot;
            broadcast({ type: 'HEAD_MOVED', id, rot: data.rot });
        }

        if (data.type === 'SUBMIT_ANSWER') {
            broadcast({ type: 'ANSWER_SUBMITTED', id, text: data.answer });
            gameState.turnIndex++;
            setTimeout(nextTurn, 2500);
        }

        if (data.type === 'CHAT') {
            broadcast({ type: 'CHAT_MSG', id: id.substr(0, 5), text: data.text });
        }
    });

    ws.on('close', () => {
        delete players[id];
        // Удаляем бота-дублера если остался
        Object.keys(players).forEach(k => { if (players[k].isNPC) delete players[k]; });
        if (Object.keys(players).length > 0) startNewGame();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Baldi Server Online on port ${PORT}`));
