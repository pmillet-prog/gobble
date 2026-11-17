import { BlockList, isIP } from 'node:net';

export function normalizeConnectionIp(value) {
  let ip = typeof value === 'string' ? value.trim() : '';
  if (ip.toLowerCase().startsWith('::ffff:') && isIP(ip.slice(7)) === 4) ip = ip.slice(7);
  if (!isIP(ip)) return '';
  try { return isIP(ip) === 6 ? new URL(`http://[${ip}]/`).hostname.slice(1, -1) : ip; }
  catch { return ''; }
}

// Do not inherit Express's global `trust proxy: true`. Only explicitly trusted
// hops may provide a forwarded address; walk the chain from the server outward.
export function createConnectionIpResolver(trusted = process.env.GOBBLE_CONNECTION_TRUSTED_PROXIES ?? '127.0.0.1,::1') {
  const proxies = new BlockList();
  for (const entry of String(trusted).split(',').map(value => value.trim()).filter(Boolean)) {
    const [raw, prefix, extra] = entry.split('/');
    const ip = normalizeConnectionIp(raw), version = isIP(ip);
    if (!version || extra !== undefined || (prefix !== undefined && !/^\d+$/.test(prefix))) throw new Error('invalid_connection_trusted_proxy');
    if (prefix === undefined) proxies.addAddress(ip, version === 6 ? 'ipv6' : 'ipv4');
    else proxies.addSubnet(ip, Number(prefix), version === 6 ? 'ipv6' : 'ipv4');
  }
  return request => {
    const peer = normalizeConnectionIp(request?.socket?.remoteAddress);
    const fallback = { ip: peer, ipSource: 'peer' };
    if (!peer || !proxies.check(peer, isIP(peer) === 6 ? 'ipv6' : 'ipv4')) return fallback;
    const header = request?.headers?.['x-forwarded-for'];
    if (typeof header !== 'string' || header.length > 2048) return fallback;
    const chain = header.split(',').map(normalizeConnectionIp);
    if (!chain.length || chain.length > 32 || chain.some(ip => !ip)) return fallback;
    let ip = peer;
    for (let index = chain.length - 1; index >= 0; index--) {
      if (!proxies.check(ip, isIP(ip) === 6 ? 'ipv6' : 'ipv4')) break;
      ip = chain[index];
    }
    return { ip, ipSource: 'forwarded' };
  };
}
