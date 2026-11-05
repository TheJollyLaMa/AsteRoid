// Normalises game events for presentation. Older game builds emitted pickups
// as `{ type: 'power' }` (the pickup kind overwrote the event name); newer
// builds emit `{ type: 'pickup', pickupType: 'power' }`.
const PICKUP_TYPES = ['spread', 'rapid', 'plasma', 'power', 'shield'];

function normalizeEvent(event) {
    if (!event || typeof event !== 'object') return { type: 'unknown' };
    if (PICKUP_TYPES.includes(event.type)) return { ...event, type: 'pickup', pickupType: event.type };
    if (event.type === 'pickup') {
        const kind = event.pickupType || event.pickup || event.kind;
        return { ...event, pickupType: PICKUP_TYPES.includes(kind) ? kind : 'power' };
    }
    return event;
}

module.exports = { PICKUP_TYPES, normalizeEvent };
