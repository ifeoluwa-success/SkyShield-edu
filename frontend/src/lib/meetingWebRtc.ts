/** Normalize user ids so "5" and 5 always match in maps and comparisons. */
export function normalizeUserId(id: string | number | undefined | null): string {
  if (id === undefined || id === null || id === '') return '';
  return String(id);
}

/** Deterministic initiator: lower user id offers, higher id answers (avoids glare). */
export function shouldInitiateCall(
  localUserId: string | number | undefined | null,
  remoteUserId: string | number | undefined | null,
): boolean {
  const local = normalizeUserId(localUserId);
  const remote = normalizeUserId(remoteUserId);
  if (!local || !remote) return false;
  return local.localeCompare(remote) < 0;
}

export function peerConnectionIsBroken(pc: RTCPeerConnection | undefined): boolean {
  if (!pc) return true;
  return (
    pc.connectionState === 'failed' ||
    pc.connectionState === 'closed' ||
    pc.iceConnectionState === 'failed' ||
    pc.iceConnectionState === 'closed'
  );
}

export function streamHasLiveVideo(stream: MediaStream | undefined): boolean {
  if (!stream) return false;
  return stream.getVideoTracks().some(t => t.enabled && t.readyState === 'live');
}

export function streamHasLiveAudio(stream: MediaStream | undefined): boolean {
  if (!stream) return false;
  return stream.getAudioTracks().some(t => t.enabled && t.readyState === 'live');
}
