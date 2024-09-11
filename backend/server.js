const express = require('express');
const http = require('http');
const session = require('express-session');
const socketIO = require('socket.io');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

app.use(express.json());

// Middleware: Express session
app.use(session({
  secret: 'daffa123',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

// CORS configuration
app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST'],
  credentials: true
}));

// Store rooms and participants
let rooms = {};

// API to create a new room by the master (teacher)
app.post('/create-room', (req, res) => {
  const roomCode = uuidv4();
  rooms[roomCode] = { participants: [], master: req.sessionID };
  req.session.roomCode = roomCode;
  res.json({ roomCode, isMaster: true });
});

// API to join a room
app.post('/join-room', (req, res) => {
  const { roomCode, username } = req.body;
  if (!username || !roomCode) {
    return res.status(400).json({ message: 'Username and room code are required' });
  }

  if (rooms[roomCode]) {
    if (rooms[roomCode].participants.length < 10) {
      const isMaster = rooms[roomCode].master === req.sessionID;
      if (!isMaster) {
        rooms[roomCode].participants.push({ id: req.sessionID, username });
      }
      req.session.roomCode = roomCode;
      res.json({ success: true, isMaster });
    } else {
      res.status(403).json({ message: 'Room is full' });
    }
  } else {
    res.status(404).json({ message: 'Room not found' });
  }
});

// Socket.IO connection
io.on('connection', (socket) => {
  let roomCode = socket.handshake.query.roomCode;
  let username = socket.handshake.query.username;

  socket.join(roomCode);

  // Update participant count
  io.to(roomCode).emit('update-participants', rooms[roomCode]?.participants.length || 0);

  // Broadcast to room that a new user has joined
  io.to(roomCode).emit('message', `${username} has joined the room`);

  // Handle chat messages
  socket.on('chat', (msg) => {
    io.to(roomCode).emit('chat', { username, msg });
  });

  // Handle screen sharing events from the master
  socket.on('share-screen', (stream) => {
    socket.to(roomCode).emit('screen-shared', stream);
  });

  // Handle stop screen sharing
  socket.on('stop-screen-share', () => {
    socket.to(roomCode).emit('screen-share-stopped');
  });

  // Handle disconnects
  socket.on('disconnect', () => {
    if (rooms[roomCode]) {
      rooms[roomCode].participants = rooms[roomCode].participants.filter(p => p.id !== socket.id);
      io.to(roomCode).emit('update-participants', rooms[roomCode].participants.length);
      io.to(roomCode).emit('message', `${username} has left the room`);

      // Clean up empty rooms
      if (rooms[roomCode].participants.length === 0 && rooms[roomCode].master === socket.id) {
        delete rooms[roomCode];
      }
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});