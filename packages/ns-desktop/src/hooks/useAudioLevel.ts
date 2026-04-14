import { useRef, useEffect, useState } from "react";

/**
 * Extracts an audio level (0–1) from a MediaStream using Web Audio AnalyserNode,
 * or falls back to a Rust-provided audioLevel prop (meeting mode, no stream).
 */
export function useAudioLevel(
  stream: MediaStream | null,
  isRecording: boolean,
  rustAudioLevel?: number,
): number {
  const [level, setLevel] = useState(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number>(0);
  const dataRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(0));
  const rustLevelRef = useRef(rustAudioLevel ?? 0);
  rustLevelRef.current = rustAudioLevel ?? 0;

  useEffect(() => {
    if (!isRecording) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      analyserRef.current = null;
      setLevel(0);
      return;
    }

    // Real stream available — use AnalyserNode
    if (stream) {
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
    }

    // No stream (meeting mode) — derive level from Rust audioLevel prop
    function tickFromRust() {
      const t = Date.now() / 1000;
      const scaled = Math.min((rustLevelRef.current ?? 0) * 4, 1);
      const barCount = 16;
      let maxVal = 0;
      for (let i = 0; i < barCount; i++) {
        const variation = 0.5 + 0.5 * Math.sin(t * 3 + i * 0.8);
        const val = scaled * variation;
        if (val > maxVal) maxVal = val;
      }
      setLevel(maxVal);
      animFrameRef.current = requestAnimationFrame(tickFromRust);
    }

    tickFromRust();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [stream, isRecording]);

  return level;
}
