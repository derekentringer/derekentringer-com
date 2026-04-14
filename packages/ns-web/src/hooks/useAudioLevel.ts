import { useRef, useEffect, useState } from "react";

/**
 * Extracts an audio level (0–1) from a MediaStream using Web Audio AnalyserNode.
 * Runs an animation-frame loop while `isRecording` is true and a stream is provided.
 */
export function useAudioLevel(
  stream: MediaStream | null,
  isRecording: boolean,
): number {
  const [level, setLevel] = useState(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number>(0);
  const dataRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(0));

  useEffect(() => {
    if (!stream || !isRecording) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      analyserRef.current = null;
      setLevel(0);
      return;
    }

    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.7;
    source.connect(analyser);
    analyserRef.current = analyser;
    dataRef.current = new Uint8Array(analyser.frequencyBinCount);

    function tick() {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(dataRef.current);

      const barCount = 16;
      const step = Math.floor(dataRef.current.length / barCount);
      let maxVal = 0;
      for (let i = 0; i < barCount; i++) {
        const val = dataRef.current[i * step] / 255;
        if (val > maxVal) maxVal = val;
      }
      setLevel(maxVal);

      animFrameRef.current = requestAnimationFrame(tick);
    }

    tick();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      audioCtx.close().catch(() => {});
    };
  }, [stream, isRecording]);

  return level;
}
