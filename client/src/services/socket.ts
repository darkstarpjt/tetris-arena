import { io, Socket } from 'socket.io-client';
import { API_BASE, getStoredToken } from './api';

export type DeviceType = 'mobile' | 'pc';

export function detectDeviceType(): DeviceType {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'pc';
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i.test(ua)) {
    return 'mobile';
  }
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  if (coarse && window.innerWidth <= 1024) {
    return 'mobile';
  }
  if (window.innerWidth <= 768) {
    return 'mobile';
  }
  return 'pc';
}

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_BASE || undefined, {
      autoConnect: true,
      transports: ['websocket', 'polling'],
      auth: { token: getStoredToken(), deviceType: detectDeviceType() },
    });
  }
  return socket;
}

export function refreshSocketAuth(deviceType: DeviceType = detectDeviceType()) {
  const token = getStoredToken();
  const s = getSocket();
  s.auth = { token, deviceType };
  if (s.connected) {
    s.emit('auth:refresh', { token, deviceType });
  } else {
    s.connect();
  }
}
