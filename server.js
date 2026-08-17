const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('public'));

const players = {};

io.on('connection', (socket) => {
    players[socket.id] = {
        id: socket.id,
        x: 0, y: 1.7, z: 0,
        rotationY: 0,
        skinColor: '#' + Math.floor(Math.random()*16777215).toString(16),
        shirtColor: '#' + Math.floor(Math.random()*16777215).toString(16)
    };

    socket.emit('currentPlayers', { players, selfId: socket.id });
    socket.broadcast.emit('newPlayer', players[socket.id]);

    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            Object.assign(players[socket.id], data);
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    socket.on('syncTvVideo', (url) => {
        io.emit('updateTvVideo', url);
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
