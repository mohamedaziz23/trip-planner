import { isIP } from 'node:net';
import type { Request } from 'express';

function normalize(ip: string) {
  if (ip === '::1') return '127.0.0.1';
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

/**
 * IP address of the client, as resolved by Express from X-Forwarded-For
 * according to TRUST_PROXY (see app.ts). The Next.js proxy forwards headers
 * without adding its own X-Forwarded-For entry, so in production a reverse
 * proxy (nginx, hosting platform) in front of Next must set it; locally the
 * value is 127.0.0.1. A value that is not a valid IP falls back to the socket.
 * Informational only: no security decision is based on it.
 */
export function clientIp(req: Request): string {
  const resolved = req.ip && isIP(normalize(req.ip)) ? req.ip : req.socket.remoteAddress;
  return resolved ? normalize(resolved) : 'unknown';
}

/** Short "Browser on OS" label from the User-Agent header. */
export function deviceLabel(req: Request): string {
  const ua = req.get('user-agent') ?? '';
  const browser =
    /Edg\//.test(ua) ? 'Edge' :
    /OPR\//.test(ua) ? 'Opera' :
    /Chrome\//.test(ua) ? 'Chrome' :
    /Firefox\//.test(ua) ? 'Firefox' :
    /Safari\//.test(ua) ? 'Safari' :
    /curl|Postman|PostmanRuntime/i.test(ua) ? 'API client' : 'Unknown browser';
  const os =
    /Windows/.test(ua) ? 'Windows' :
    /Android/.test(ua) ? 'Android' :
    /iPhone|iPad|iPod/.test(ua) ? 'iOS' :
    /Mac OS X/.test(ua) ? 'macOS' :
    /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}
