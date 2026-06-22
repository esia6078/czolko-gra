const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const lobbies = {};

io.on('connection', (socket) => {

  socket.on('createLobby', ({ nickname }) => {
    const code = Math.random().toString(36).substring(2, 7).toUpperCase();
    lobbies[code] = {
      admin: socket.id,
      players: [{ id: socket.id, nickname, word: null }],
      phase: 'waiting',
      wordAssignIndex: 0
    };
    socket.join(code);
    socket.lobbyCode = code;
    socket.nickname = nickname;
    socket.emit('lobbyCreated', { code });
    io.to(code).emit('updatePlayers', lobbies[code].players);
  });

  socket.on('joinLobby', ({ code, nickname }) => {
    const lobby = lobbies[code];
    if (!lobby) return socket.emit('error', 'Nie ma takiego lobby!');
    if (lobby.phase !== 'waiting') return socket.emit('error', 'Gra już trwa!');
    lobby.players.push({ id: socket.id, nickname, word: null });
    socket.join(code);
    socket.lobbyCode = code;
    socket.nickname = nickname;
    socket.emit('joinedLobby', { code });
    io.to(code).emit('updatePlayers', lobby.players);
  });

  socket.on('startAssigning', () => {
    const code = socket.lobbyCode;
    const lobby = lobbies[code];
    if (!lobby || lobby.admin !== socket.id) return;
    if (lobby.players.length < 2) return socket.emit('error', 'Potrzeba minimum 2 graczy!');
    lobby.phase = 'assigning';
    lobby.wordAssignIndex = 0;
    // losowy gracz przypisuje hasło adminowi
    lobby.adminAssigner = lobby.players.filter(p => p.id !== lobby.admin)[Math.floor(Math.random() * (lobby.players.length - 1))].id;
    startNextAssignment(code);
  });

  socket.on('assignWord', ({ word }) => {
    const code = socket.lobbyCode;
    const lobby = lobbies[code];
    if (!lobby || lobby.phase !== 'assigning') return;
    const target = lobby.players[lobby.wordAssignIndex];
    target.word = word;
    lobby.wordAssignIndex++;

    // pokaż hasło wszystkim na 3 sekundy (oprócz osoby której dotyczy)
    io.to(code).emit('showWord', {
      targetId: target.id,
      targetNickname: target.nickname,
      word: word
    });

    setTimeout(() => {
      if (lobby.wordAssignIndex >= lobby.players.length) {
        lobby.phase = 'playing';
        io.to(code).emit('gameStarted', lobby.players);
      } else {
        startNextAssignment(code);
      }
    }, 3000);
  });

  socket.on('disconnect', () => {
    const code = socket.lobbyCode;
    if (!code || !lobbies[code]) return;
    lobbies[code].players = lobbies[code].players.filter(p => p.id !== socket.id);
    if (lobbies[code].players.length === 0) {
      delete lobbies[code];
    } else {
      io.to(code).emit('updatePlayers', lobbies[code].players);
    }
  });
});

function startNextAssignment(code) {
  const lobby = lobbies[code];
  const target = lobby.players[lobby.wordAssignIndex];
  // kto wpisuje hasło?
  let assignerId;
  if (target.id === lobby.admin) {
    assignerId = lobby.adminAssigner;
  } else {
    assignerId = lobby.admin;
  }
  io.to(code).emit('assignTurn', {
    targetId: target.id,
    targetNickname: target.nickname,
    assignerId: assignerId
  });
}

server.listen(3000, () => console.log('Serwer działa na porcie 3000'));