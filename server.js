const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

io.on("connection", (socket) => {
  console.log("Usuario conectado:", socket.id);

  socket.on("join-room", (room) => {
    socket.join(room);
  });

  socket.on("voice-signal", (data) => {
    socket.to(data.room).emit("voice-signal", data);
  });

  socket.on("location-update", (data) => {
    socket.to(data.room).emit("location-update", data);
  });

  socket.on("disconnect", () => {
    console.log("Usuario desconectado");
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Servidor corriendo en puerto", PORT);
});