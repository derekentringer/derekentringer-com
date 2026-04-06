import { useRef, useEffect } from "react";

interface AudioWaveformProps {
  stream: MediaStream | null;
  isRecording: boolean;
  width?: number;
  height?: number;
}

export function AudioWaveform({ stream, isRecording, width = 120, height = 24 }: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number>(0);
  const dataRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(0));

  useEffect(() => {
    if (!isRecording) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      analyserRef.current = null;
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, width, height);
      }
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

      function draw() {
        if (!analyserRef.current || !canvasRef.current) return;
        analyserRef.current.getByteFrequencyData(dataRef.current);

        const ctx = canvasRef.current.getContext("2d");
        if (!ctx) return;

        ctx.clearRect(0, 0, width, height);

        const barCount = 16;
        const barWidth = Math.floor(width / barCount) - 1;
        const gap = 1;
        const step = Math.floor(dataRef.current.length / barCount);

        for (let i = 0; i < barCount; i++) {
          const val = dataRef.current[i * step] / 255;
          const barHeight = Math.max(2, val * height);
          const x = i * (barWidth + gap);
          const y = (height - barHeight) / 2;

          ctx.fillStyle = `rgba(212, 225, 87, ${0.4 + val * 0.6})`;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, 1);
          ctx.fill();
        }

        animFrameRef.current = requestAnimationFrame(draw);
      }

      draw();

      return () => {
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        audioCtx.close().catch(() => {});
      };
    }

    // No stream (meeting mode) — show animated simulated waveform
    let startTime = Date.now();
    function drawSimulated() {
      if (!canvasRef.current) return;
      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, width, height);
      const t = (Date.now() - startTime) / 1000;

      const barCount = 16;
      const barWidth = Math.floor(width / barCount) - 1;
      const gap = 1;

      for (let i = 0; i < barCount; i++) {
        const val = 0.3 + 0.4 * Math.sin(t * 2 + i * 0.7) * Math.sin(t * 3.3 + i * 0.4);
        const barHeight = Math.max(2, Math.abs(val) * height);
        const x = i * (barWidth + gap);
        const y = (height - barHeight) / 2;

        ctx.fillStyle = `rgba(212, 225, 87, ${0.3 + Math.abs(val) * 0.5})`;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 1);
        ctx.fill();
      }

      animFrameRef.current = requestAnimationFrame(drawSimulated);
    }

    drawSimulated();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [stream, isRecording, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="shrink-0"
    />
  );
}
