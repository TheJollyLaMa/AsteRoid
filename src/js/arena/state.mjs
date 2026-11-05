export const GROUP_CAP = 5;
export const ENTRY_USDC = '10';
const transitions = {
  idle: ['local', 'connecting'], local: ['idle'], connecting: ['lobby', 'error', 'idle'], lobby: ['playing', 'error', 'idle'], playing: ['results', 'error', 'idle'], results: ['claiming', 'refunding', 'idle', 'error'], claiming: ['results', 'error'], refunding: ['results', 'error'], error: ['idle', 'connecting'],
};
export function createArenaState() {
  let value = { phase: 'idle', mode: null, network: null, roundId: null, players: [], message: '' };
  return {
    get: () => ({ ...value, players: [...value.players] }),
    transition(phase, patch = {}) {
      if (!transitions[value.phase]?.includes(phase)) throw new Error(`Invalid arena transition: ${value.phase} → ${phase}`);
      value = { ...value, ...patch, phase };
      if (value.players.length > GROUP_CAP) throw new Error('Arena groups are limited to five ships');
      return this.get();
    },
    acceptPlayers(players) {
      if (!Array.isArray(players)) throw new Error('Arena players must be a list');
      value.players = players.slice(0, GROUP_CAP);
      return { players: value.players, overflow: Math.max(0, players.length - GROUP_CAP), message: players.length > GROUP_CAP ? 'Group full → start a new group for the extra players.' : '' };
    },
  };
}

export function arenaWebSocketUrl(refereeUrl) {
  if (!refereeUrl) return null;
  return `${refereeUrl.replace(/^http/i, 'ws').replace(/\/$/, '')}/arena`;
}
