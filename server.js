const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static('public'));

const players = {};

io.on('connection', (socket) => {
    // Генерируем случайный вид персонажа
    players[socket.id] = {
        id: socket.id,
        x: 0, y: 1, z: 0,
        rotation: 0,
        color: '#' + Math.floor(Math.random()*16777215).toString(16),
        shirtColor: '#' + Math.floor(Math.random()*16777215).toString(16)
    };

    // Отправляем новому игроку текущих игроков и его ID
    socket.emit('currentPlayers', { players, selfId: socket.id });
    socket.broadcast.emit('newPlayer', players[socket.id]);

    // Синхронизация движения
    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].z = data.z;
            players[socket.id].rotation = data.rotation;
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    // Синхронизация YouTube
    socket.on('changeVideo', (videoId) => {
        io.emit('updateVideo', videoId);
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
