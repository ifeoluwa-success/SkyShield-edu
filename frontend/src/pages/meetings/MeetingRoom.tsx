// src/pages/meetings/MeetingRoom.tsx
import '../../polyfills';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { JoinMeetingResponse } from '../../types/tutor';
import { joinMeeting, trackMeetingAttendance } from '../../services/tutorService';
import { useAuth } from '../../hooks/useAuth';
import SimplePeer from 'simple-peer';
import Toast from '../../components/Toast';
import '../../assets/css/MeetingRoom.css';

// ─── Types ────────────────────────────────────────────────────────────────────
interface SignalingMessage {
  type: string;
  user_id?: string;
  user_name?: string;
  from?: string;
  from_user?: string;
  target?: string;
  offer?: SimplePeer.SignalData;
  answer?: SimplePeer.SignalData;
  candidate?: SimplePeer.SignalData;
  signal?: SimplePeer.SignalData;
  message?: string;
  content?: string;
  sender_name?: string;
  videoEnabled?: boolean;
  audioEnabled?: boolean;
  sharing?: boolean;
  waiting_participants?: Array<{ id: string; name: string }>;
  participant_id?: string;
  [key: string]: unknown;
}

interface RemoteParticipant {
  userId: string;
  name: string;
  stream?: MediaStream;
  videoEnabled: boolean;
  audioEnabled: boolean;
  isScreenSharing?: boolean;
}

interface ChatMessage {
  id: string;
  sender: string;
  senderId: string;
  message: string;
  timestamp: Date;
  isLocal: boolean;
}

interface WaitingParticipant {
  id: string;
  name: string;
}

type PanelType = 'chat' | 'people' | 'waiting';

interface PeerWithPC extends SimplePeer {
  _pc: RTCPeerConnection;
}

// ─── RemoteVideo Component ───────────────────────────────────────────────────
interface RemoteVideoProps {
  participant: RemoteParticipant;
  small?: boolean;
}

const RemoteVideo: React.FC<RemoteVideoProps> = ({ participant, small = false }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && participant.stream) {
      videoRef.current.srcObject = participant.stream;
    }
  }, [participant.stream]);

  const initial = participant.name.charAt(0).toUpperCase();

  return (
    <div className={`video-tile remote-tile${small ? ' tile-small' : ''}`}>
      {participant.stream && participant.videoEnabled ? (
        <video ref={videoRef} autoPlay playsInline />
      ) : (
        <div className="video-placeholder">
          <div
            className="avatar-circle"
            style={small ? { width: 40, height: 40, fontSize: 16 } : undefined}
          >
            {initial}
          </div>
          {!small && <p className="avatar-name">{participant.name}</p>}
        </div>
      )}
      <div className="tile-overlay">
        <span className="tile-name">{participant.name}</span>
        <div className="tile-badges">
          {!participant.audioEnabled && (
            <span className="tile-badge muted" title="Muted">
              <MicOffIcon />
            </span>
          )}
          {!participant.videoEnabled && (
            <span className="tile-badge cam-off" title="Camera off">
              <CamOffIcon />
            </span>
          )}
          {participant.isScreenSharing && (
            <span className="tile-badge screen-share" title="Screen sharing">
              <ScreenShareIcon />
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Icons ────────────────────────────────────────────────────────────────────
const MicIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z" />
    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
  </svg>
);

const MicOffIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
    <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.34 3 3 3 .23 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
  </svg>
);

const CamIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
    <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
  </svg>
);

const CamOffIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
    <path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2z" />
  </svg>
);

const ScreenShareIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
    <path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zm-7-3.53v-2.19c-2.78.48-4.34 1.71-5.5 3.72.14-1.71.48-4.35 3.12-5.89V8.44l4 3.03-1.62 3z" />
  </svg>
);

const ChatIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
  </svg>
);

const PeopleIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
  </svg>
);

const WaitingIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z" />
  </svg>
);

const SendIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  </svg>
);

const CopyIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
    <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
  </svg>
);

// ─── Main MeetingRoom Component ──────────────────────────────────────────────
const MeetingRoom: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [meeting, setMeeting] = useState<JoinMeetingResponse['meeting'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [wsReady, setWsReady] = useState(false);
  const [inWaitingRoom, setInWaitingRoom] = useState(false);
  const [waitingParticipants, setWaitingParticipants] = useState<WaitingParticipant[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [requestingMedia, setRequestingMedia] = useState(false);
  const [isHost, setIsHost] = useState(false); // replace ref with state

  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);

  const [participants, setParticipants] = useState<Map<string, RemoteParticipant>>(new Map());
  const [activePanel, setActivePanel] = useState<PanelType | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);

  const [meetingTime, setMeetingTime] = useState(0);
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const peersRef = useRef<Map<string, SimplePeer>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const signalingRef = useRef<JoinMeetingResponse['signaling'] | null>(null);
  const participantRef = useRef<JoinMeetingResponse['participant'] | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenSharingRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const activePanelRef = useRef<PanelType | null>(null);

  const safeSend = useCallback((data: unknown) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket not open, message dropped:', data);
    }
  }, []);

  useEffect(() => {
    activePanelRef.current = activePanel;
  }, [activePanel]);

  // Timer
  useEffect(() => {
    if (!joined) return;
    const id = setInterval(() => setMeetingTime(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [joined]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // Request media only when needed (delayed for waiting trainees)
  const requestLocalMedia = useCallback(async () => {
    if (localStreamRef.current) return;
    setRequestingMedia(true);
    setMediaError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      setVideoEnabled(true);
      setAudioEnabled(true);
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    } catch (err) {
      console.error('Media devices error:', err);
      let errorMsg = 'Unable to access camera/microphone. ';
      if (err instanceof Error) {
        if (err.name === 'NotReadableError') errorMsg += 'Device is already in use by another application.';
        else if (err.name === 'NotAllowedError') errorMsg += 'Permission denied. Please allow camera and microphone.';
        else if (err.name === 'NotFoundError') errorMsg += 'No camera or microphone found.';
        else errorMsg += err.message;
      } else {
        errorMsg += 'Unknown error.';
      }
      setMediaError(errorMsg);
      setToast({ type: 'error', message: errorMsg });
    } finally {
      setRequestingMedia(false);
    }
  }, []);

  // Retry media request
  const retryMedia = useCallback(() => {
    void requestLocalMedia();
  }, [requestLocalMedia]);

  // Initialize meeting
  useEffect(() => {
    const init = async () => {
      try {
        const data = await joinMeeting(code ?? '', '');
        setMeeting(data.meeting);
        signalingRef.current = data.signaling;
        participantRef.current = data.participant;
        const hostFlag = data.meeting.host === data.participant.id;
        setIsHost(hostFlag);

        const isTrainee = data.participant.role === 'trainee';

        if (isTrainee && user?.id) {
          trackMeetingAttendance(user.id, data.meeting.id).catch(() => {});
        }

        if (data.meeting.waiting_room_enabled && !hostFlag && isTrainee) {
          setInWaitingRoom(true);
        } else {
          // For host or non-trainee, request media immediately
          await requestLocalMedia();
        }
      } catch (err) {
        console.error(err);
        setError('Unable to join the meeting. Please check the meeting code and try again.');
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, [code, requestLocalMedia, user?.id]);

  // When trainee is admitted, request media
  useEffect(() => {
    if (!inWaitingRoom && !isHost && !localStreamRef.current && !requestingMedia) {
      void requestLocalMedia();
    }
  }, [inWaitingRoom, isHost, requestLocalMedia, requestingMedia]);

  const buildPeer = useCallback(
    (userId: string, initiator: boolean, stream: MediaStream): SimplePeer => {
      const iceServers = signalingRef.current?.ice_servers ?? [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ];

      const peer = new SimplePeer({
        initiator,
        stream,
        trickle: true,
        config: { iceServers },
      });

      peer.on('signal', (data: SimplePeer.SignalData) => {
        if (data.type === 'offer') {
          safeSend({ type: 'offer', target: userId, offer: data });
        } else if (data.type === 'answer') {
          safeSend({ type: 'answer', target: userId, answer: data });
        } else if (data.candidate) {
          safeSend({ type: 'ice_candidate', target: userId, candidate: data });
        }
      });

      peer.on('stream', (remoteStream: MediaStream) => {
        setParticipants(prev => {
          const next = new Map(prev);
          const existing = next.get(userId) ?? {
            userId,
            name: userId.slice(0, 8),
            videoEnabled: true,
            audioEnabled: true,
          };
          next.set(userId, { ...existing, stream: remoteStream });
          return next;
        });
      });

      peer.on('error', (err: Error) => console.error(`Peer [${userId}] error:`, err.message));
      peer.on('close', () => {
        peersRef.current.delete(userId);
        setParticipants(prev => {
          const next = new Map(prev);
          next.delete(userId);
          return next;
        });
      });

      peersRef.current.set(userId, peer);
      return peer;
    },
    [safeSend],
  );

  const handleMessage = useCallback(
    (data: SignalingMessage) => {
      const senderId = data.from_user ?? data.from;

      switch (data.type) {
        case 'waiting_room_update':
          if (data.waiting_participants) {
            setWaitingParticipants(data.waiting_participants);
          }
          break;

        case 'admitted':
          setInWaitingRoom(false);
          safeSend({ type: 'get_participants' });
          break;

        case 'user_joined': {
          if (!data.user_id || data.user_id === participantRef.current?.id) break;
          setParticipants(prev => {
            if (prev.has(data.user_id!)) return prev;
            const next = new Map(prev);
            next.set(data.user_id!, {
              userId: data.user_id!,
              name: data.user_name ?? data.user_id!.slice(0, 8),
              videoEnabled: true,
              audioEnabled: true,
            });
            return next;
          });
          if (localStreamRef.current && !inWaitingRoom) {
            buildPeer(data.user_id, true, localStreamRef.current);
          }
          break;
        }

        case 'user_left': {
          if (!data.user_id) break;
          peersRef.current.get(data.user_id)?.destroy();
          peersRef.current.delete(data.user_id);
          setParticipants(prev => {
            const next = new Map(prev);
            next.delete(data.user_id!);
            return next;
          });
          break;
        }

        case 'offer': {
          if (!senderId || !data.offer || !localStreamRef.current || inWaitingRoom) break;
          peersRef.current.get(senderId)?.destroy();
          peersRef.current.delete(senderId);
          const peer = buildPeer(senderId, false, localStreamRef.current);
          peer.signal(data.offer);
          setParticipants(prev => {
            if (prev.has(senderId)) return prev;
            const next = new Map(prev);
            next.set(senderId, {
              userId: senderId,
              name: data.user_name ?? senderId.slice(0, 8),
              videoEnabled: true,
              audioEnabled: true,
            });
            return next;
          });
          break;
        }

        case 'answer': {
          if (!senderId || !data.answer) break;
          peersRef.current.get(senderId)?.signal(data.answer);
          break;
        }

        case 'ice_candidate': {
          if (!senderId || !data.candidate) break;
          peersRef.current.get(senderId)?.signal(data.candidate);
          break;
        }

        case 'chat': {
          const msg: ChatMessage = {
            id: `${Date.now()}-${Math.random()}`,
            sender: data.sender_name ?? 'Participant',
            senderId: senderId ?? '',
            message: String(data.content ?? data.message ?? ''),
            timestamp: new Date(),
            isLocal: false,
          };
          setChatMessages(prev => [...prev, msg]);
          if (activePanelRef.current !== 'chat') setUnreadCount(c => c + 1);
          break;
        }

        case 'media_state': {
          if (!data.user_id) break;
          setParticipants(prev => {
            const existing = prev.get(data.user_id!);
            if (!existing) return prev;
            const next = new Map(prev);
            next.set(data.user_id!, {
              ...existing,
              videoEnabled: data.videoEnabled !== undefined ? Boolean(data.videoEnabled) : existing.videoEnabled,
              audioEnabled: data.audioEnabled !== undefined ? Boolean(data.audioEnabled) : existing.audioEnabled,
            });
            return next;
          });
          break;
        }

        case 'screen_share': {
          if (!data.user_id) break;
          setParticipants(prev => {
            const existing = prev.get(data.user_id!);
            if (!existing) return prev;
            const next = new Map(prev);
            next.set(data.user_id!, { ...existing, isScreenSharing: data.sharing === true });
            return next;
          });
          break;
        }

        default:
          break;
      }
    },
    [buildPeer, inWaitingRoom, safeSend],
  );

  // WebSocket Connection
  useEffect(() => {
    if (!meeting || !signalingRef.current) return;

    const token = localStorage.getItem('access_token') ?? '';
    const rawWsUrl = signalingRef.current.websocket_url;
    const wsUrl = rawWsUrl.startsWith('ws://') || rawWsUrl.startsWith('wss://')
      ? rawWsUrl
      : (() => {
          const apiBase = import.meta.env.VITE_API_URL as string ?? 'http://localhost:8000/api';
          const origin = new URL(apiBase).origin;
          const scheme = origin.startsWith('https') ? 'wss' : 'ws';
          return `${origin.replace(/^https?/, scheme)}${rawWsUrl}`;
        })();
    const ws = new WebSocket(`${wsUrl}?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('✅ WebSocket connected');
      setWsReady(true);
      safeSend({
        type: 'join',
        meetingCode: meeting.meeting_code,
        participantId: participantRef.current?.id,
      });
      setJoined(true);
    };

    ws.onmessage = (ev: MessageEvent) => {
      try {
        handleMessage(JSON.parse(ev.data as string) as SignalingMessage);
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    ws.onerror = () => console.error('WebSocket error');
    ws.onclose = () => {
      setJoined(false);
      setWsReady(false);
    };

    return () => ws.close();
  }, [meeting, handleMessage, safeSend]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Media Controls
  const toggleAudio = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setAudioEnabled(track.enabled);
    safeSend({ type: 'media_state', audioEnabled: track.enabled });
  }, [safeSend]);

  const toggleVideo = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setVideoEnabled(track.enabled);
    safeSend({ type: 'media_state', videoEnabled: track.enabled });
  }, [safeSend]);

  const replaceVideoTrackInPeers = (newTrack: MediaStreamTrack) => {
    peersRef.current.forEach(peer => {
      try {
        const pc = (peer as unknown as PeerWithPC)._pc;
        const sender = pc?.getSenders().find(s => s.track?.kind === 'video');
        if (sender) void sender.replaceTrack(newTrack);
      } catch {
        // ignore
      }
    });
  };

  const stopScreenShare = useCallback(async () => {
    try {
      const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const newTrack = camStream.getVideoTracks()[0];
      const stream = localStreamRef.current;
      if (stream) {
        stream.getVideoTracks().forEach(t => {
          stream.removeTrack(t);
          t.stop();
        });
        stream.addTrack(newTrack);
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      }
      replaceVideoTrackInPeers(newTrack);
      safeSend({ type: 'screen_share', sharing: false });
    } catch {
      // ignore
    } finally {
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      screenSharingRef.current = false;
      setScreenSharing(false);
    }
  }, [safeSend]);

  const toggleScreenShare = useCallback(async () => {
    if (screenSharingRef.current) {
      await stopScreenShare();
      return;
    }
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      screenStreamRef.current = screenStream;
      const screenTrack = screenStream.getVideoTracks()[0];
      replaceVideoTrackInPeers(screenTrack);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = new MediaStream([
          screenTrack,
          ...(localStreamRef.current?.getAudioTracks() ?? []),
        ]);
      }
      safeSend({ type: 'screen_share', sharing: true });
      screenTrack.addEventListener('ended', () => {
        void stopScreenShare();
      });
      screenSharingRef.current = true;
      setScreenSharing(true);
    } catch {
      // ignore
    }
  }, [stopScreenShare, safeSend]);

  const sendChatMessage = useCallback(() => {
    const text = chatInput.trim();
    if (!text) return;
    safeSend({ type: 'chat', content: text });
    setChatMessages(prev => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        sender: 'You',
        senderId: participantRef.current?.id ?? 'local',
        message: text,
        timestamp: new Date(),
        isLocal: true,
      },
    ]);
    setChatInput('');
  }, [chatInput, safeSend]);

  const leaveMeeting = useCallback(() => {
    safeSend({ type: 'leave' });
    wsRef.current?.close();
    peersRef.current.forEach(p => p.destroy());
    peersRef.current.clear();
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    navigate(-1);
  }, [navigate, safeSend]);

  const admitParticipant = (participantId: string) => {
    safeSend({ type: 'admit', participant_id: participantId });
  };

  const openPanel = (panel: PanelType) => {
    if (panel === 'chat') setUnreadCount(0);
    setActivePanel(prev => (prev === panel ? null : panel));
  };

  const copyMeetingCode = () => {
    void navigator.clipboard
      .writeText(meeting?.meeting_code ?? code ?? '')
      .then(() => {
        setCodeCopied(true);
        setTimeout(() => setCodeCopied(false), 2000);
      });
  };

  const copyMeetingLink = () => {
    void navigator.clipboard.writeText(window.location.href).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  const totalCount = participants.size + 1;
  const remoteParticipants = Array.from(participants.values());

  const gridClass =
    totalCount === 1
      ? 'grid-solo'
      : totalCount === 2
        ? 'grid-duo'
        : totalCount <= 4
          ? 'grid-quad'
          : totalCount <= 6
            ? 'grid-hex'
            : 'grid-many';

  const controlsDisabled = !joined || !wsReady || !localStreamRef.current;

  if (loading) {
    return (
      <div className="mr-loading">
        <div className="mr-spinner" />
        <p>Connecting to meeting…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mr-error">
        <div className="mr-error-icon">⚠</div>
        <h2>Unable to Join</h2>
        <p>{error}</p>
        <button className="mr-back-btn" onClick={() => navigate(-1)}>
          Go Back
        </button>
      </div>
    );
  }

  // Waiting Room for Trainee
  if (inWaitingRoom && !isHost) {
    return (
      <div className="mr-waiting-room">
        <div className="waiting-room-card">
          <div className="waiting-icon">⏳</div>
          <h2>Waiting for host to admit you</h2>
          <p>The meeting host will let you in shortly.</p>
          <button className="mr-leave-btn" onClick={leaveMeeting}>
            Leave Meeting
          </button>
        </div>
      </div>
    );
  }

  // Media error overlay (if no stream after trying)
  if (!localStreamRef.current && !requestingMedia && !inWaitingRoom) {
    return (
      <div className="mr-error">
        <div className="mr-error-icon">🎥</div>
        <h2>Camera / Microphone Error</h2>
        <p>{mediaError || 'Unable to access camera or microphone.'}</p>
        <button className="mr-back-btn" onClick={retryMedia}>
          Retry
        </button>
        <button className="mr-back-btn" onClick={leaveMeeting} style={{ marginLeft: '1rem', background: '#ef4444' }}>
          Leave Meeting
        </button>
      </div>
    );
  }

  return (
    <div className="mr-root">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <header className="mr-topbar">
        <div className="mr-topbar-left">
          <div className="mr-logo">
            <span className="mr-logo-dot" />
            <span className="mr-logo-text">LiveRoom</span>
          </div>
          <div className="mr-meeting-meta">
            <span className="mr-meeting-name">{meeting?.title ?? 'Meeting'}</span>
            {joined && <span className="mr-timer">{formatTime(meetingTime)}</span>}
          </div>
        </div>

        <div className="mr-topbar-right">
          <button className="mr-copy-btn" onClick={copyMeetingLink} title="Copy join link">
            {linkCopied ? '✓ Copied' : '🔗 Copy link'}
          </button>
          <button
            className={`mr-code-badge${codeCopied ? ' mr-code-badge--copied' : ''}`}
            onClick={copyMeetingCode}
            title="Click to copy meeting code"
          >
            <span className="mr-code-label">Meeting code</span>
            <span className="mr-code-value">{meeting?.meeting_code ?? code}</span>
            <span className="mr-code-copy-icon">{codeCopied ? '✓' : <CopyIcon />}</span>
          </button>
          <div className={`mr-status ${joined ? 'mr-status--connected' : 'mr-status--waiting'}`}>
            <span className="mr-status-dot" />
            {!wsReady ? 'Connecting...' : joined ? 'Live' : 'Waiting'}
          </div>
        </div>
      </header>

      <div className="mr-body">
        {screenSharing ? (
          <div className={`mr-presenting-wrapper${activePanel ? ' mr-presenting-wrapper--panel' : ''}`}>
            <div className="mr-presenting-main">
              <div className="video-tile presenting-tile">
                <video ref={localVideoRef} autoPlay muted playsInline />
                <div className="tile-overlay" style={{ opacity: 1 }}>
                  <span className="tile-name">You · Presenting</span>
                </div>
                <button className="mr-stop-share-pill" onClick={() => void toggleScreenShare()}>
                  ✕ Stop sharing
                </button>
              </div>
            </div>
            <div className="mr-presenting-strip">
              <div className="video-tile tile-small self-strip-tile">
                <div className="video-placeholder">
                  <div className="avatar-circle" style={{ width: 40, height: 40, fontSize: 16 }}>
                    Y
                  </div>
                </div>
                <div className="tile-overlay" style={{ opacity: 1 }}>
                  <span className="tile-name">You</span>
                  {!audioEnabled && (
                    <span className="tile-badge muted">
                      <MicOffIcon />
                    </span>
                  )}
                </div>
              </div>
              {remoteParticipants.map(p => (
                <RemoteVideo key={p.userId} participant={p} small />
              ))}
              {remoteParticipants.length === 0 && (
                <p className="mr-strip-empty">Waiting for others…</p>
              )}
            </div>
          </div>
        ) : (
          <div className={`mr-grid ${gridClass}${activePanel ? ' mr-grid--panel-open' : ''}`}>
            <div className="video-tile local-tile">
              {videoEnabled && localStreamRef.current ? (
                <video ref={localVideoRef} autoPlay muted playsInline />
              ) : (
                <>
                  <video ref={localVideoRef} autoPlay muted playsInline className="sr-only" />
                  <div className="video-placeholder">
                    <div className="avatar-circle">Y</div>
                    <p className="avatar-name">You</p>
                  </div>
                </>
              )}
              <div className="tile-overlay">
                <span className="tile-name">
                  You{meeting?.host === participantRef.current?.id ? ' (Host)' : ''}
                </span>
                <div className="tile-badges">
                  {!audioEnabled && (
                    <span className="tile-badge muted">
                      <MicOffIcon />
                    </span>
                  )}
                  {!videoEnabled && (
                    <span className="tile-badge cam-off">
                      <CamOffIcon />
                    </span>
                  )}
                  {screenSharing && (
                    <span className="tile-badge screen-share">
                      <ScreenShareIcon />
                    </span>
                  )}
                </div>
              </div>
            </div>
            {remoteParticipants.map(p => (
              <RemoteVideo key={p.userId} participant={p} />
            ))}
          </div>
        )}

        {activePanel && (
          <aside className="mr-panel">
            <div className="mr-panel-tabs">
              <button
                className={`mr-panel-tab ${activePanel === 'chat' ? 'active' : ''}`}
                onClick={() => openPanel('chat')}
                disabled={!wsReady}
              >
                Chat
              </button>
              <button
                className={`mr-panel-tab ${activePanel === 'people' ? 'active' : ''}`}
                onClick={() => openPanel('people')}
                disabled={!wsReady}
              >
                People ({totalCount})
              </button>
              {isHost && waitingParticipants.length > 0 && (
                <button
                  className={`mr-panel-tab ${activePanel === 'waiting' ? 'active' : ''}`}
                  onClick={() => openPanel('waiting')}
                  disabled={!wsReady}
                >
                  Waiting ({waitingParticipants.length})
                </button>
              )}
              <button className="mr-panel-close" onClick={() => setActivePanel(null)}>
                <CloseIcon />
              </button>
            </div>

            {activePanel === 'chat' && (
              <div className="mr-chat">
                <div className="mr-chat-messages">
                  {chatMessages.length === 0 && (
                    <div className="mr-chat-empty">
                      <ChatIcon />
                      <p>
                        No messages yet.
                        <br /> Say hello! 👋
                      </p>
                    </div>
                  )}
                  {chatMessages.map(msg => (
                    <div
                      key={msg.id}
                      className={`mr-chat-msg ${msg.isLocal ? 'mr-chat-msg--local' : 'mr-chat-msg--remote'}`}
                    >
                      {!msg.isLocal && <span className="mr-chat-sender">{msg.sender}</span>}
                      <div className="mr-chat-bubble">{msg.message}</div>
                      <span className="mr-chat-ts">
                        {msg.timestamp.toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                <div className="mr-chat-input-row">
                  <input
                    type="text"
                    className="mr-chat-input"
                    placeholder="Send a message… (Enter to send)"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendChatMessage();
                      }
                    }}
                    disabled={!wsReady}
                  />
                  <button
                    className="mr-chat-send"
                    onClick={sendChatMessage}
                    disabled={!chatInput.trim() || !wsReady}
                  >
                    <SendIcon />
                  </button>
                </div>
              </div>
            )}

            {activePanel === 'people' && (
              <div className="mr-people">
                <p className="mr-people-count">
                  {totalCount} participant{totalCount !== 1 ? 's' : ''}
                </p>
                <div className="mr-person">
                  <div className="mr-person-avatar">Y</div>
                  <div className="mr-person-info">
                    <span className="mr-person-name">
                      You{meeting?.host === participantRef.current?.id ? ' (Host)' : ''}
                    </span>
                    <div className="mr-person-badges">
                      {!audioEnabled && <MicOffIcon />}
                      {!videoEnabled && <CamOffIcon />}
                      {screenSharing && <ScreenShareIcon />}
                    </div>
                  </div>
                </div>
                {remoteParticipants.map(p => (
                  <div key={p.userId} className="mr-person">
                    <div className="mr-person-avatar">{p.name.charAt(0).toUpperCase()}</div>
                    <div className="mr-person-info">
                      <span className="mr-person-name">{p.name}</span>
                      <div className="mr-person-badges">
                        {!p.audioEnabled && <MicOffIcon />}
                        {!p.videoEnabled && <CamOffIcon />}
                        {p.isScreenSharing && <ScreenShareIcon />}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activePanel === 'waiting' && isHost && (
              <div className="mr-waiting-list">
                <p className="waiting-title">Waiting for admission</p>
                {waitingParticipants.length === 0 ? (
                  <p className="waiting-empty">No one is waiting</p>
                ) : (
                  waitingParticipants.map(p => (
                    <div key={p.id} className="waiting-item">
                      <div className="waiting-item-avatar">{p.name.charAt(0).toUpperCase()}</div>
                      <span className="waiting-item-name">{p.name}</span>
                      <button onClick={() => admitParticipant(p.id)} className="admit-btn">
                        Admit
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </aside>
        )}
      </div>

      <footer className="mr-controls">
        <div className="mr-controls-left">
          <span className="mr-ctrl-time">{formatTime(meetingTime)}</span>
        </div>

        <div className="mr-controls-center">
          <button
            className={`mr-ctrl-btn ${!audioEnabled ? 'mr-ctrl-btn--off' : ''}`}
            onClick={toggleAudio}
            title={audioEnabled ? 'Mute' : 'Unmute'}
            disabled={controlsDisabled}
          >
            <span className="mr-ctrl-icon">{audioEnabled ? <MicIcon /> : <MicOffIcon />}</span>
            <span className="mr-ctrl-label">{audioEnabled ? 'Mute' : 'Unmute'}</span>
          </button>

          <button
            className={`mr-ctrl-btn ${!videoEnabled ? 'mr-ctrl-btn--off' : ''}`}
            onClick={toggleVideo}
            title={videoEnabled ? 'Camera off' : 'Camera on'}
            disabled={controlsDisabled}
          >
            <span className="mr-ctrl-icon">{videoEnabled ? <CamIcon /> : <CamOffIcon />}</span>
            <span className="mr-ctrl-label">{videoEnabled ? 'Camera' : 'No Camera'}</span>
          </button>

          <button
            className={`mr-ctrl-btn ${screenSharing ? 'mr-ctrl-btn--active' : ''}`}
            onClick={() => void toggleScreenShare()}
            title={screenSharing ? 'Stop sharing' : 'Share screen'}
            disabled={controlsDisabled}
          >
            <span className="mr-ctrl-icon">
              <ScreenShareIcon />
            </span>
            <span className="mr-ctrl-label">{screenSharing ? 'Stop Share' : 'Share'}</span>
          </button>

          <button
            className={`mr-ctrl-btn ${activePanel === 'chat' ? 'mr-ctrl-btn--active' : ''}`}
            onClick={() => openPanel('chat')}
            title="Chat"
            disabled={!wsReady}
          >
            <span className="mr-ctrl-icon">
              <ChatIcon />
              {unreadCount > 0 && activePanel !== 'chat' && (
                <span className="mr-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </span>
            <span className="mr-ctrl-label">Chat</span>
          </button>

          <button
            className={`mr-ctrl-btn ${activePanel === 'people' ? 'mr-ctrl-btn--active' : ''}`}
            onClick={() => openPanel('people')}
            title="Participants"
            disabled={!wsReady}
          >
            <span className="mr-ctrl-icon">
              <PeopleIcon />
            </span>
            <span className="mr-ctrl-label">People ({totalCount})</span>
          </button>

          {isHost && waitingParticipants.length > 0 && (
            <button
              className={`mr-ctrl-btn ${activePanel === 'waiting' ? 'mr-ctrl-btn--active' : ''}`}
              onClick={() => openPanel('waiting')}
              title="Manage waiting room"
              disabled={!wsReady}
            >
              <span className="mr-ctrl-icon">
                <WaitingIcon />
                <span className="mr-badge waiting-badge">{waitingParticipants.length}</span>
              </span>
              <span className="mr-ctrl-label">Waiting</span>
            </button>
          )}
        </div>

        <div className="mr-controls-right">
          <button className="mr-leave-btn" onClick={leaveMeeting}>
            Leave
          </button>
        </div>
      </footer>
    </div>
  );
};

export default MeetingRoom;