import { io } from 'socket.io-client';

// Use environment variable for the socket server URL if provided, otherwise default to current host
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined;

const socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 15000,
  transports: ['websocket', 'polling'],
});

export default socket;
