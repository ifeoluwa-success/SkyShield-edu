/** Deterministic initiator: lower user id offers, higher id answers (avoids glare). */
export function shouldInitiateCall(localUserId: string, remoteUserId: string): boolean {
  return localUserId.localeCompare(remoteUserId) < 0;
}

export function streamHasLiveVideo(stream: MediaStream | undefined): boolean {
  if (!stream) return false;
  return stream.getVideoTracks().some(t => t.enabled && t.readyState === 'live');
}

export function streamHasLiveAudio(stream: MediaStream | undefined): boolean {
  if (!stream) return false;
  return stream.getAudioTracks().some(t => t.enabled && t.readyState === 'live');
}
