const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static('public'));

let players = {};
let gameState = {
    status: 'WAITING', // WAITING, ENTER_ANIM, GAME, RESULTS
    round: 1,
    turnIndex: 0,
    currentQuestion: null,
    timer: 10
};

const TOTAL_SEATS = 6;
// Фиксированные позиции 3х3 (3 спереди, 3 сзади)
const SEAT_POSITIONS = [
    { x: -2, z: 2 }, { x: 0, z: 2 }, { x: 2, z: 2 }, // Передний ряд
    { x: -2, z: 5 }, { x: 0, z: 5 }, { x: 2, z: 5 }  // Задний ряд
];

function generateMathProblem(round) {
    let a, b, op, ans;
    if (round === 1) {
        a = Math.floor(Math.random() * 10);
        b = Math.floor(Math.random() * 10);
        op = '+'; ans = a + b;
    } else if (round <= 3) {
        a = Math.floor(Math.random() * 20);
        b = Math.floor(Math.random() * 20);
        op = Math.random() > 0.5 ? '+' : '-';
        ans = op === '+' ? a + b : a - b;
    } else { // Сложные / нерешаемые примеры (Baldi style)
        a = Math.floor(Math.random() * 900) + 100;
        b = Math.floor(Math.random() * 900) + 100;
        op = '*'; ans = a * b + Math.floor(Math.random() * 50); // Невозможный пример
    }
    return { text: `${a} ${op} ${b} = ?`, answer: ans };
}

function broadcast(data) {
    const msg = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client.readyState === 1) client.send(msg);
    });
}

function startNewGame() {
    gameState.status = 'ENTER_ANIM';
    gameState.round = 1;
    gameState.turnIndex = 0;
    
    // Заполнение свободное мест NPC
    let seatIdx = 0;
    Object.keys(players).forEach(id => {
        players[id].seat = seatIdx++;
        players[id].score = 0;
    });

    broadcast({ type: 'START_ENTER_ANIMATION', players, gameState });

    setTimeout(() => {
        gameState.status = 'GAME';
        nextTurn();
    }, 5000); // 5 сек на анимацию входа
}

function nextTurn() {
    const playerIds = Object.keys(players);
    if (playerIds.length === 0) return;

    if (gameState.turnIndex >= playerIds.length) {
        gameState.turnIndex = 0;
        gameState.round++;
        if (gameState.round > 5) {
            gameState.status = 'RESULTS';
            broadcast({ type: 'SHOW_RESULTS', players });
            setTimeout(startNewGame, 8000);
            return;
        }
    }

    const currentId = playerIds[gameState.turnIndex];
    gameState.currentQuestion = generateMathProblem(gameState.round);
    gameState.timer = 10;

    broadcast({
        type: 'NEW_TURN',
        activePlayerId: currentId,
        question: gameState.currentQuestion.text,
        round: gameState.round
    });

    let countdown = setInterval(() => {
        gameState.timer--;
        broadcast({ type: 'TIMER_TICK', timer: gameState.timer });

        if (gameState.timer <= 0) {
            clearInterval(countdown);
            // Пропуск хода / Ошибка
            broadcast({ type: 'ANSWER_RESULT', id: currentId, correct: false, text: "X_X" });
            gameState.turnIndex++;
            setTimeout(nextTurn, 2000);
        }
    }, 1000);
}

wss.on('connection', (ws) => {
    const id = 'player_' + Math.random().toString(36).substr(2, 9);
    const isNPC = false;

    players[id] = { id, seat: -1, headRotation: { x: 0, y: 0 }, isNPC };

    ws.send(JSON.stringify({ type: 'INIT', id }));

    // Всегда перезапускаем игру с анимацией входа при подключении нового игрока
    startNewGame();

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        if (data.type === 'ROTATE_HEAD') {
            if (players[id]) players[id].headRotation = data.rot;
            broadcast({ type: 'PLAYER_HEAD_MOVED', id, rot: data.rot });
        }

        if (data.type === 'SUBMIT_ANSWER') {
            const isCorrect = parseInt(data.answer) === gameState.currentQuestion.answer;
            if (isCorrect) players[id].score += 100;
            
            broadcast({ type: 'ANSWER_RESULT', id, correct: isCorrect, text: data.answer });
            gameState.turnIndex++;
            setTimeout(nextTurn, 2500);
        }

        if (data.type === 'CHAT_MESSAGE') {
            broadcast({ type: 'CHAT_BROADCAST', id: data.name || id, text: data.text });
        }
    });

    ws.on('close', () => {
        delete players[id];
        if (Object.keys(players).length > 0) startNewGame();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
