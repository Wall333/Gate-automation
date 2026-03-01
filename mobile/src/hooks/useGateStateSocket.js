import { useEffect, useRef, useCallback } from 'react';
import Config from '../config';

/**
 * useGateStateSocket — connects to /app/ws and calls onGateState
 * whenever the server broadcasts a GATE_STATE event.
 *
 * @param {function} onGateState - callback({ deviceId, isOpen })
 */
export default function useGateStateSocket(onGateState) {
  const wsRef = useRef(null);
  const cbRef = useRef(onGateState);
  cbRef.current = onGateState;

  const connect = useCallback(() => {
    const wsUrl = Config.SERVER_URL.replace(/^http/, 'ws') + '/app/ws';
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[app/ws] Connected');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'GATE_STATE' && cbRef.current) {
          cbRef.current({ deviceId: msg.deviceId, isOpen: msg.isOpen });
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
