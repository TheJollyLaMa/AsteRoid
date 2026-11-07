import { pilotController } from '../pilots/whitelist.mjs';
import { flightLog } from '../pilots/flight-log.mjs';

export async function prepareWalletLaunch({ wallet, pilots, tickets, difficulty }) {
  const snapshot = wallet?.snapshot();
  if (!snapshot?.connected) throw new Error('Connect your wallet first.');
  const pilot = await pilots.refresh(snapshot);
  if (!pilot.isPilot) throw new Error('Wallet connected, but it is not on the Decent Pilots list. You can play the free 10-level voyage; ask in Discord for reward access.');
  if (difficulty === 'cadet') return pilot;
  const ticket = await tickets.ensureTicket();
  if (!ticket) throw new Error('The referee flight ticket is not ready. Retry before launching for awards, or choose a practice voyage.');
  const current = wallet.snapshot();
  if (!current.connected || current.address?.toLowerCase() !== pilot.address?.toLowerCase()) {
    throw new Error('Wallet changed while preparing this flight. Please retry.');
  }
  return pilot;
}

export function mountLaunchReminder() {
  const dialog = document.getElementById('wallet-launch');
  const connect = dialog.querySelector('[data-wallet-launch-connect]');
  const guest = dialog.querySelector('[data-wallet-launch-guest]');
  const status = dialog.querySelector('[data-wallet-launch-status]');
  const canvas = document.getElementById('gameCanvas');
  let pending = null, generation = 0, busy = false;
  const wallet = () => window.DecentHead?.getWallet?.();
  const close = () => {
    generation++;
    pending = null;
    dialog.close();
    canvas?.focus({ preventScroll: true });
  };
  const launch = () => {
    const action = pending;
    close();
    action?.();
    window.asteroidDraw?.();
  };
  const prepare = async () => {
    if (busy || !pending) return;
    const request = generation;
    busy = true;
    connect.disabled = guest.disabled = true;
    status.textContent = 'Connect in your wallet, then we will check Pilot access and prepare your flight.';
    try {
      const session = wallet();
      if (!session) throw new Error('Wallet tools are still loading. Please retry.');
      if (!session.snapshot().connected) {
        const header = document.querySelector('decent-header')?.shadowRoot;
        const selected = Number(header?.querySelector('wallet-connect')?.shadowRoot?.querySelector('select')?.value || 0);
        await session.connect(session.available()[selected]?.provider);
      }
      if (request !== generation) return;
      status.textContent = 'Wallet connected. Checking Pilot access and referee ticket...';
      await prepareWalletLaunch({
        wallet: session, pilots: pilotController, tickets: flightLog.tickets,
        difficulty: window.asteroidGame.selectedDifficulty
      });
      if (request === generation) launch();
    } catch (error) {
      if (request === generation) {
        status.textContent = error.shortMessage || error.message;
        connect.textContent = 'Retry wallet & flight check';
        guest.textContent = 'Play a practice voyage';
      }
    } finally {
      busy = false;
      connect.disabled = guest.disabled = false;
    }
  };
  connect.addEventListener('click', () => void prepare());
  guest.addEventListener('click', () => {
    window.asteroidGame.setPilot({ address: wallet()?.snapshot().address || null, isPilot: false });
    launch();
  });
  dialog.querySelector('[data-wallet-launch-cancel]').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  window.addEventListener('voyager:launch-request', event => {
    event.preventDefault();
    if (pending) return;
    pending = event.detail.launch;
    generation++;
    status.textContent = '';
    connect.textContent = 'Connect wallet & play';
    guest.textContent = 'Play without wallet';
    dialog.showModal();
    if (wallet()?.snapshot().connected) void prepare();
  });
}

if (typeof document !== 'undefined') mountLaunchReminder();
