import { useEffect, useRef, useCallback } from 'react';
import Config from '../config';

/**
 * useGateStateSocket — connects to /app/ws and calls callbacks
 * whenever the server broadcasts GATE_STATE or OTA_STATUS events.
 *
 * @param {function} onGateState  - callback({ deviceId, isOpen })
 * @param {function} [onOTAStatus] - callback({ deviceId, status, message })
 */
export default function useGateStateSocket(onGateState, onOTAStatus) {
  const wsRef = useRef(null);
  const gateRef = useRef(onGateState);
  const otaRef = useRef(onOTAStatus);
  gateRef.current = onGateState;
  otaRef.current = onOTAStatus;

  const connect = useCallback(() => {
    const wsUrl = Config.SERVER_URL.replace(/^http/, 'ws') + '/app/ws';
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[app/ws] Connected');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'GATE_STATE' && gateRef.current) {
          gateRef.current({ deviceId: msg.deviceId, isOpen: msg.isOpen });
        }
        if (msg.type === 'OTA_STATUS' && otaRef.current) {
          otaRef.current({
            deviceId: msg.deviceId,
            status: msg.status,
            message: msg.message,
          });
        }
      } catch (err) {
        console.warn('[app/ws] Parse error:', err);
      }
    };

    ws.onclose = () => {
      console.log('[app/ws] Disconnected — reconnecting in 5s');
      setTimeout(() => {
        if (wsRef.current === ws) {
          connect();
        }
      }, 5000);
    };

    ws.onerror = (err) => {
      console.warn('[app/ws] Error:', err.message);
      ws.close();
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) ws.close();
    };
  }, [connect]);
}
