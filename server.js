const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
const MAX_SEATS = 6;
const SEAT_POSITIONS_X = [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5];

let players = {};
let videoState = {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    startTime: Date.now(),
    isStreamMode: false
};

function getFreeSeatIndex() {
    const occupiedSeats = new Set(Object.values(players).map(p => p.seatIndex));
    for (let i = 0; i < MAX_SEATS; i++) {
        if (!occupiedSeats.has(i)) return i;
    }
    return -1;
}

io.on('connection', (socket) => {

    socket.on('join', (data) => {
        const seatIndex = getFreeSeatIndex();

        if (seatIndex === -1) {
            socket.emit('fullRoom', 'К сожалению, в зале нет свободных мест (максимум 6 зрителей)!');
            return;
        }

        players[socket.id] = {
            id: socket.id,
            nickname: data.nickname || `Зритель #${seatIndex + 1}`,
            seatIndex: seatIndex,
            x: SEAT_POSITIONS_X[seatIndex],
            y: 0.6,
            z: 2.0,
            rotY: 0
        };

        const currentTime = (Date.now() - videoState.startTime) / 1000;

        socket.emit('init', {
            id: socket.id,
            seatIndex,
            players,
            videoState: { ...videoState, currentTime }
        });

        socket.broadcast.emit('playerJoined', players[socket.id]);
    });

    socket.on('look', (data) => {
        if (players[socket.id]) {
            players[socket.id].rotY = data.rotY;
            socket.broadcast.emit('playerLooked', { id: socket.id, rotY: data.rotY });
        }
    });

    socket.on('chatMessage', (msg) => {
        if (players[socket.id]) {
            io.emit('chatMessage', {
                id: socket.id,
                nickname: players[socket.id].nickname,
                text: msg
            });
        }
    });

    socket.on('changeVideo', (input) => {
        const trimmed = input.trim().toLowerCase();
        
        if (trimmed === 'стрим' || trimmed === 'stream') {
            videoState = {
                url: 'https://www.youtube.com/watch?v=g-OQh_7fEWE',
                startTime: Date.now(),
                isStreamMode: true
            };
        } else {
            videoState = {
                url: input,
                startTime: Date.now(),
                isStreamMode: false
            };
        }
        
        io.emit('videoStateUpdate', { ...videoState, currentTime: 0 });
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('playerLeft', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
