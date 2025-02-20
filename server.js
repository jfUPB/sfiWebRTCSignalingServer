const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const port = process.env.PORT || 3000;

// Sirve los archivos estáticos de la carpeta "public"
app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('Nuevo cliente conectado:', socket.id);

    // Señalización: retransmitir la oferta a los demás
    socket.on('offer', (offer) => {
        console.log('Oferta recibida de', socket.id);
        socket.broadcast.emit('offer', offer);
    });

    // Señalización: retransmitir la respuesta
    socket.on('answer', (answer) => {
        console.log('Respuesta recibida de', socket.id);
        socket.broadcast.emit('answer', answer);
    });

    // Señalización: retransmitir candidatos ICE
    socket.on('candidate', (candidate) => {
        console.log('Candidato recibido de', socket.id);
        socket.broadcast.emit('candidate', candidate);
    });

    socket.on('disconnect', () => {
        console.log('Cliente desconectado:', socket.id);
    });
});

server.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});
