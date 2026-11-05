import test from 'node:test';
import assert from 'node:assert/strict';
import { arenaWebSocketUrl, createArenaState, GROUP_CAP } from '../src/js/arena/state.mjs';

test('arena state machine permits lobby and settlement transitions only in order', () => {
  const state = createArenaState();
  state.transition('connecting'); state.transition('lobby', { roundId: '4' }); state.transition('playing'); state.transition('results'); state.transition('claiming'); state.transition('results');
  assert.equal(state.get().roundId, '4'); assert.throws(() => state.transition('playing'), /Invalid arena transition/);
});
test('arena cap and group overflow provide new-group guidance', () => {
  const arena = createArenaState(), result = arena.acceptPlayers(Array.from({ length: 6 }, (_, index) => index));
  assert.equal(result.players.length, GROUP_CAP); assert.equal(result.overflow, 1); assert.match(result.message, /new group/);
  assert.equal(arenaWebSocketUrl('https://referee.example/'), 'wss://referee.example/arena');
  assert.equal(arenaWebSocketUrl(''), null);
});
