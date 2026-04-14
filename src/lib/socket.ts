import { io } from 'socket.io-client';

// Use environment variable for the socket server URL if provided, otherwise default to current host
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined;

const socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  /** Reintentos más rápidos al principio: microcortes de red suelen recuperarse en <2s. */
  reconnectionDelay: 400,
  reconnectionDelayMax: 12000,
  randomizationFactor: 0.45,
  timeout: 20000,
  transports: ['websocket', 'polling'],
});

export default socket;
