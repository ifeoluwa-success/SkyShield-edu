import { useEffect, useRef, useState, useCallback } from 'react';
import type { IncidentEvent, MissionPhase, MissionState } from '../types/incident';
import { buildMissionWebSocketUrl } from '../utils/missionWsUrl';

export type MissionConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'syncing'
  | 'failed';

const BASE_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 30_000;
const MAX_RECONNECT_ATTEMPTS = 8;
const HEARTBEAT_STALE_MS = 35_000;
const INTENTIONAL_CLOSE_CODE = 1000;
const STALE_CLOSE_CODE = 4001;
const AUTH_FAILED_CLOSE_CODE = 4002;

interface UseMissionSocketOptions {
  runId: string;
  token: string;
  enabled?: boolean;
  onPhaseChange?: (phase: MissionPhase) => void;
  onEscalation?: (event: IncidentEvent) => void;
  onTimeout?: () => void;
  onMissionComplete?: (score: number, passed: boolean) => void;
  /** GET /state/ after open — must succeed (or WS `connection_confirmed`) to mark channel live */
  onResync?: () => Promise<MissionState | null>;
  /** Fresh access token before each connect attempt */
  resolveToken?: () => Promise<string | null>;
  /** Socket lost — unlock frozen submit UI */
  onDisconnect?: () => void;
  /** WS `hint` message after `request_hint` */
  onHint?: (data: { hint: string; hints_used: number; score_penalty?: number }) => void;
}

interface UseMissionSocketReturn {
  missionState: MissionState | null;
  isConnected: boolean;
  connectionStatus: MissionConnectionStatus;
  reconnectAttempt: number;
  lastEvent: IncidentEvent | null;
  timerWarning: boolean;
  sendMessage: (type: string, data: Record<string, unknown>) => void;
  disconnect: () => void;
  /** Manual recovery after `failed` */
  retryConnection: () => void;
}

type MissionHintPayload = { hint: string; hints_used: number; score_penalty?: number };

type MissionSocketMessage =
  | { type: 'connection_confirmed'; state: MissionState }
  | { type: 'state_snapshot'; data: MissionState }
  | { type: 'state_update'; data: MissionState }
  | { type: 'mission_event'; event: IncidentEvent }
  | { type: 'hint'; data: MissionHintPayload }
  | { type: 'timer_warning' }
  | { type: string; [key: string]: unknown };

function reconnectDelayMs(attempt: number): number {
  return Math.min(BASE_RECONNECT_MS * 2 ** attempt + Math.random() * 500, MAX_RECONNECT_MS);
}

function extractMissionState(msg: MissionSocketMessage): MissionState | null {
  if (msg.type === 'connection_confirmed' && msg.state && typeof msg.state === 'object' && 'run' in msg.state) {
    return msg.state as MissionState;
  }
  if (msg.type === 'state_snapshot' || msg.type === 'state_update') {
    if ('data' in msg && msg.data && typeof msg.data === 'object' && 'run' in msg.data) {
      return msg.data as MissionState;
    }
    const asRoot = msg as Record<string, unknown>;
    if (asRoot.run && typeof asRoot.run === 'object') {
      return msg as unknown as MissionState;
    }
  }
  return null;
}

export const useMissionSocket = (options: UseMissionSocketOptions): UseMissionSocketReturn => {
  const {
    runId,
    token,
    enabled = true,
    onEscalation,
    onMissionComplete,
    onPhaseChange,
    onTimeout,
    onResync,
    resolveToken,
    onDisconnect,
    onHint,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const connectRef = useRef<(() => void) | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const timerWarningTimeoutRef = useRef<number | null>(null);
  const heartbeatTimeoutRef = useRef<number | null>(null);
  const intentionalDisconnectRef = useRef(false);
  const suppressReconnectRef = useRef(false);
  const isConnectingRef = useRef(false);
  const connectionConfirmedRef = useRef(false);
  const connectGenerationRef = useRef(0);

  const onEscalationRef = useRef(onEscalation);
  const onMissionCompleteRef = useRef(onMissionComplete);
  const onPhaseChangeRef = useRef(onPhaseChange);
  const onTimeoutRef = useRef(onTimeout);
  const onResyncRef = useRef(onResync);
  const resolveTokenRef = useRef(resolveToken);
  const onDisconnectRef = useRef(onDisconnect);
  const onHintRef = useRef(onHint);

  const [missionState, setMissionState] = useState<MissionState | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<MissionConnectionStatus>('disconnected');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [lastEvent, setLastEvent] = useState<IncidentEvent | null>(null);
  const [timerWarning, setTimerWarning] = useState(false);

  const isConnected = connectionStatus === 'connected';

  useEffect(() => {
    onEscalationRef.current = onEscalation;
    onMissionCompleteRef.current = onMissionComplete;
    onPhaseChangeRef.current = onPhaseChange;
    onTimeoutRef.current = onTimeout;
    onResyncRef.current = onResync;
    resolveTokenRef.current = resolveToken;
    onDisconnectRef.current = onDisconnect;
    onHintRef.current = onHint;
  }, [onEscalation, onMissionComplete, onPhaseChange, onTimeout, onResync, resolveToken, onDisconnect, onHint]);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimeoutRef.current != null) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const clearTimerWarningTimer = useCallback(() => {
    if (timerWarningTimeoutRef.current != null) {
      window.clearTimeout(timerWarningTimeoutRef.current);
      timerWarningTimeoutRef.current = null;
    }
  }, []);

  const clearHeartbeatTimer = useCallback(() => {
    if (heartbeatTimeoutRef.current != null) {
      window.clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }
  }, []);

  const notifyDisconnect = useCallback(() => {
    connectionConfirmedRef.current = false;
    onDisconnectRef.current?.();
  }, []);

  const teardownSocket = useCallback(
    (code: number = STALE_CLOSE_CODE, opts?: { suppressReconnect?: boolean }) => {
      if (opts?.suppressReconnect) {
        suppressReconnectRef.current = true;
      }
      clearHeartbeatTimer();
      connectionConfirmedRef.current = false;
      const ws = wsRef.current;
      wsRef.current = null;
      if (!ws) return;
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(code);
        }
      } catch {
        /* ignore */
      }
    },
    [clearHeartbeatTimer],
  );

  const touchHeartbeat = useCallback(() => {
    clearHeartbeatTimer();
    if (intentionalDisconnectRef.current) return;
    heartbeatTimeoutRef.current = window.setTimeout(() => {
      if (!intentionalDisconnectRef.current) {
        teardownSocket(STALE_CLOSE_CODE);
      }
    }, HEARTBEAT_STALE_MS);
  }, [clearHeartbeatTimer, teardownSocket]);

  const markConnectionConfirmed = useCallback((state: MissionState | null) => {
    if (!state) return;
    setMissionState(state);
    connectionConfirmedRef.current = true;
    reconnectAttemptsRef.current = 0;
    setReconnectAttempt(0);
    isConnectingRef.current = false;
    clearReconnectTimer();
    setConnectionStatus('connected');
  }, [clearReconnectTimer]);

  const syncStateFromRest = useCallback(async (generation: number): Promise<boolean> => {
    try {
      const fresh = await onResyncRef.current?.();
      if (generation !== connectGenerationRef.current) return false;
      if (fresh && wsRef.current?.readyState === WebSocket.OPEN) {
        markConnectionConfirmed(fresh);
        return true;
      }
    } catch {
      /* REST resync failed */
    }
    return false;
  }, [markConnectionConfirmed]);

  const handleMissionEvent = useCallback((event: IncidentEvent) => {
    setLastEvent(event);

    const p = event.payload;
    if (p && typeof p === 'object' && !Array.isArray(p)) {
      const raw = p as Record<string, unknown>;
      const embedded = raw.current_state ?? raw.state ?? raw.mission_state;
      if (embedded && typeof embedded === 'object' && embedded !== null && 'run' in embedded) {
        setMissionState(embedded as MissionState);
      }
    }

    if (event.event_type === 'phase_changed') {
      const to = (event.payload?.to as MissionPhase | undefined) ?? undefined;
      if (to) {
        onPhaseChangeRef.current?.(to);
        setMissionState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            phase: to,
            run: { ...prev.run, phase: to },
          };
        });
      }
      if (to === 'review') {
        const score = typeof event.payload?.score === 'number' ? event.payload.score : 0;
        const passed = typeof event.payload?.passed === 'boolean' ? event.payload.passed : false;
        onMissionCompleteRef.current?.(score, passed);
      }
    } else if (event.event_type === 'escalation_triggered') {
      onEscalationRef.current?.(event);
    } else if (event.event_type === 'timeout_occurred') {
      onTimeoutRef.current?.();
    }
  }, []);

  const applyInboundState = useCallback(
    (msg: MissionSocketMessage, generation: number) => {
      const state = extractMissionState(msg);
      if (!state) return;

      if (msg.type === 'connection_confirmed') {
        if (generation === connectGenerationRef.current) {
          markConnectionConfirmed(state);
        }
        return;
      }

      if (connectionConfirmedRef.current) {
        setMissionState(state);
      }
    },
    [markConnectionConfirmed],
  );

  const scheduleReconnect = useCallback(() => {
    if (intentionalDisconnectRef.current || !enabled || !runId) return;

    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setConnectionStatus('failed');
      notifyDisconnect();
      return;
    }

    clearReconnectTimer();
    notifyDisconnect();
    setConnectionStatus('reconnecting');

    const attempt = reconnectAttemptsRef.current;
    const delay = reconnectDelayMs(attempt);
    reconnectAttemptsRef.current = attempt + 1;
    setReconnectAttempt(attempt + 1);

    reconnectTimeoutRef.current = window.setTimeout(() => {
      connectRef.current?.();
    }, delay);
  }, [clearReconnectTimer, enabled, runId, notifyDisconnect]);

  const disconnect = useCallback(() => {
    intentionalDisconnectRef.current = true;
    clearReconnectTimer();
    clearTimerWarningTimer();
    clearHeartbeatTimer();
    reconnectAttemptsRef.current = 0;
    setReconnectAttempt(0);
    isConnectingRef.current = false;
    connectionConfirmedRef.current = false;
    teardownSocket(INTENTIONAL_CLOSE_CODE, { suppressReconnect: true });
    setConnectionStatus('disconnected');
    notifyDisconnect();
  }, [
    clearHeartbeatTimer,
    clearReconnectTimer,
    clearTimerWarningTimer,
    teardownSocket,
    notifyDisconnect,
  ]);

  const connect = useCallback(() => {
    if (!enabled || !runId || intentionalDisconnectRef.current) return;
    if (isConnectingRef.current) return;

    clearReconnectTimer();
    teardownSocket(STALE_CLOSE_CODE, { suppressReconnect: true });
    isConnectingRef.current = true;
    connectionConfirmedRef.current = false;

    const generation = connectGenerationRef.current + 1;
    connectGenerationRef.current = generation;

    setConnectionStatus(prev =>
      prev === 'connected' || prev === 'syncing' ? 'reconnecting' : 'connecting',
    );

    void (async () => {
      let activeToken = token;
      try {
        const resolved = await resolveTokenRef.current?.();
        if (resolved) activeToken = resolved;
      } catch {
        /* fall back to prop token */
      }

      if (!activeToken || generation !== connectGenerationRef.current) {
        isConnectingRef.current = false;
        if (generation === connectGenerationRef.current) {
          scheduleReconnect();
        }
        return;
      }

      const wsUrl = buildMissionWebSocketUrl(runId, activeToken);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (generation !== connectGenerationRef.current) return;

        isConnectingRef.current = false;
        reconnectAttemptsRef.current = 0;
        setReconnectAttempt(0);
        clearReconnectTimer();
        touchHeartbeat();
        setConnectionStatus('syncing');

        try {
          ws.send(JSON.stringify({ type: 'get_state' }));
        } catch {
          /* ignore */
        }

        void syncStateFromRest(generation).then(ok => {
          if (ok || generation !== connectGenerationRef.current) return;
          if (!connectionConfirmedRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
            /* Wait for connection_confirmed or next inbound state; heartbeat will retry if stuck */
          }
        });
      };

      ws.onmessage = evt => {
        if (generation !== connectGenerationRef.current) return;
        touchHeartbeat();

        let msg: MissionSocketMessage | null = null;
        try {
          msg = JSON.parse(evt.data as string) as MissionSocketMessage;
        } catch {
          return;
        }

        if (msg.type === 'ping') {
          try {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'pong' }));
            }
          } catch {
            /* ignore */
          }
          return;
        }

        if (msg.type === 'pong_ack' || msg.type === 'heartbeat_ack') {
          return;
        }

        if (
          msg.type === 'connection_confirmed' ||
          msg.type === 'state_snapshot' ||
          msg.type === 'state_update'
        ) {
          applyInboundState(msg, generation);
          return;
        }

        if (msg.type === 'mission_event' && 'event' in msg) {
          handleMissionEvent(msg.event as IncidentEvent);
          return;
        }

        if (msg.type === 'hint' && 'data' in msg && msg.data && typeof msg.data === 'object') {
          const data = msg.data as MissionHintPayload;
          if (typeof data.hint === 'string') {
            onHintRef.current?.(data);
          }
          return;
        }

        if (msg.type === 'timer_warning') {
          setTimerWarning(true);
          clearTimerWarningTimer();
          timerWarningTimeoutRef.current = window.setTimeout(() => {
            setTimerWarning(false);
          }, 3000);
        }
      };

      ws.onerror = () => {
        notifyDisconnect();
      };

      ws.onclose = evt => {
        if (generation !== connectGenerationRef.current) return;

        isConnectingRef.current = false;
        clearHeartbeatTimer();
        connectionConfirmedRef.current = false;
        wsRef.current = null;
        notifyDisconnect();

        if (suppressReconnectRef.current) {
          suppressReconnectRef.current = false;
          return;
        }

        if (intentionalDisconnectRef.current || evt.code === INTENTIONAL_CLOSE_CODE) {
          setConnectionStatus('disconnected');
          return;
        }

        if (evt.code === AUTH_FAILED_CLOSE_CODE) {
          setConnectionStatus('failed');
          return;
        }

        scheduleReconnect();
      };
    })();
  }, [
    enabled,
    runId,
    token,
    clearReconnectTimer,
    clearHeartbeatTimer,
    clearTimerWarningTimer,
    teardownSocket,
    touchHeartbeat,
    scheduleReconnect,
    applyInboundState,
    handleMissionEvent,
    syncStateFromRest,
    notifyDisconnect,
  ]);

  const retryConnection = useCallback(() => {
    intentionalDisconnectRef.current = false;
    reconnectAttemptsRef.current = 0;
    setReconnectAttempt(0);
    clearReconnectTimer();
    setConnectionStatus('connecting');
    connectGenerationRef.current += 1;
    connect();
  }, [clearReconnectTimer, connect]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    if (!enabled || !runId || !token) {
      disconnect();
      return;
    }
    intentionalDisconnectRef.current = false;
    reconnectAttemptsRef.current = 0;
    setReconnectAttempt(0);
    connect();
    return () => disconnect();
  }, [enabled, runId, token, connect, disconnect]);

  const sendMessage = useCallback((type: string, data: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !connectionConfirmedRef.current) return;
    ws.send(JSON.stringify({ type, ...data }));
  }, []);

  return {
    missionState,
    isConnected,
    connectionStatus,
    reconnectAttempt,
    lastEvent,
    timerWarning,
    sendMessage,
    disconnect,
    retryConnection,
  };
};
