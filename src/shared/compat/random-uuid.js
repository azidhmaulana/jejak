// HTTP LAN origins may expose getRandomValues without randomUUID.
export function installRandomUUID(crypto = globalThis.crypto) {
  if (!crypto || typeof crypto.randomUUID === 'function') return;
  if (typeof crypto.getRandomValues !== 'function') return;
  crypto.randomUUID = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join('-');
  };
}
installRandomUUID();
