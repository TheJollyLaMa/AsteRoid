import { arenaWebSocketUrl } from './state.mjs';
export function createArenaClient({ refereeUrl, WebSocketImpl = globalThis.WebSocket, onMessage = () => {}, onState = () => {} } = {}) {
  let socket = null;
  const send = payload => { if (!socket || socket.readyState !== 1) throw new Error('Arena relay is not connected'); socket.send(JSON.stringify(payload)); };
  return {
    connect() {
      const url = arenaWebSocketUrl(refereeUrl);
      if (!url || !WebSocketImpl) throw new Error('Online arena is unavailable: referee server is not configured');
      socket = new WebSocketImpl(url);
      socket.addEventListener('open', () => onState('connected'));
      socket.addEventListener('close', () => onState('disconnected'));
      socket.addEventListener('error', () => onState('error'));
      socket.addEventListener('message', event => { try { onMessage(JSON.parse(event.data)); } catch { onState('invalid-message'); } });
      return socket;
    },
    send, close() { socket?.close(); socket = null; },
    get connected() { return socket?.readyState === 1; },
  };
}
