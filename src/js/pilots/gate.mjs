export function isPilotState(state) { return !!state?.isPilot; }
export function requirePilot(state, action = 'This wallet action') {
  if (!isPilotState(state)) throw new Error(`${action} is for Decent Pilots. Ask to join in the DecentAgency Discord.`);
  return true;
}
