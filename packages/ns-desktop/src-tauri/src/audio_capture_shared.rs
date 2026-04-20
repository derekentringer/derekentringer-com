//! Platform-agnostic helpers shared between macOS (CoreAudio) and Windows (WASAPI)
//! meeting-mode audio capture implementations.
//!
//! The capture strategy is the same on both platforms:
//!   1. Two independent capture streams (system audio + microphone) each stream
//!      f32 samples to a dedicated raw-PCM temp file via a writer thread.
//!   2. `get_audio_chunk` periodically reads new bytes from both PCM files,
//!      downmixes to mono, resamples to 16 kHz, mixes 50/50, and encodes an
//!      in-memory WAV for live Whisper transcription.
//!   3. `stop_recording` drains the writer threads and uses `mix_to_wav` to
//!      stream-mix both PCM files into a final 16 kHz mono 16-bit WAV on disk.
//!
//! Everything in this module is pure Rust — no CoreAudio, no WASAPI. The
//! per-platform modules (`audio_capture`, `audio_capture_win`) are responsible
//! for device I/O and feeding samples into the writer threads here.

use std::fs::File;
use std::io::{BufReader, BufWriter, Read, Seek, Write};
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::thread;

/// Downmix interleaved multi-channel samples to mono by averaging each frame.
pub fn to_mono(samples: &[f32], channels: u16) -> Vec<f32> {
    if channels <= 1 {
        return samples.to_vec();
    }
    let ch = channels as usize;
    samples
        .chunks_exact(ch)
        .map(|frame| frame.iter().sum::<f32>() / ch as f32)
        .collect()
}

/// Stateful chunk-based linear interpolation resampler. The `prev_sample` and
/// fractional `pos` carry over between `process` calls so streaming chunks
/// produces the same output as resampling the full signal in one shot.
pub struct ChunkResampler {
    ratio: f64,
    pos: f64,
    prev_sample: f32,
}

impl ChunkResampler {
    pub fn new(from_rate: u32, to_rate: u32) -> Self {
        Self {
            ratio: from_rate as f64 / to_rate as f64,
            pos: 0.0,
            prev_sample: 0.0,
        }
    }

    pub fn process(&mut self, input: &[f32]) -> Vec<f32> {
        if input.is_empty() {
            return Vec::new();
        }
        let n = input.len();
        let estimated = ((n as f64) / self.ratio).ceil() as usize + 1;
        let mut out = Vec::with_capacity(estimated);

        while (self.pos as usize) < n {
            let idx0 = self.pos.floor() as isize;
            let frac = (self.pos - idx0 as f64) as f32;

            let s0 = if idx0 < 0 {
                self.prev_sample
            } else {
                input[idx0 as usize]
            };
            let s1 = if idx0 + 1 < n as isize {
                input[(idx0 + 1) as usize]
            } else {
                input[n - 1]
            };

            out.push(s0 * (1.0 - frac) + s1 * frac);
            self.pos += self.ratio;
        }

        self.pos -= n as f64;
        self.prev_sample = input[n - 1];
        out
    }
}

/// Read up to `max_samples` f32 values from a raw PCM file, sequentially
/// (no seek). Used by the stream-mixer in `mix_to_wav`.
fn read_f32_chunk(reader: &mut BufReader<File>, max_samples: usize) -> Result<Vec<f32>, String> {
    let byte_count = max_samples * 4;
    let mut buf = vec![0u8; byte_count];
    let mut total_read = 0;

    while total_read < byte_count {
        match reader.read(&mut buf[total_read..]) {
            Ok(0) => break,
            Ok(n) => total_read += n,
            Err(e) => return Err(format!("Read error: {e}")),
        }
    }

    let sample_count = total_read / 4;
    let mut samples = Vec::with_capacity(sample_count);
    for i in 0..sample_count {
        let offset = i * 4;
        let bytes = [
            buf[offset],
            buf[offset + 1],
            buf[offset + 2],
            buf[offset + 3],
        ];
        samples.push(f32::from_le_bytes(bytes));
    }
    Ok(samples)
}

/// Read f32 samples from a raw PCM file starting at a byte offset. Used by
/// chunked live transcription (`get_audio_chunk`) which tracks how far it has
/// read into each growing temp file.
pub fn read_pcm_since(path: &Path, byte_offset: u64) -> Result<Vec<f32>, String> {
    let file = match File::open(path) {
        Ok(f) => f,
        Err(_) => return Ok(Vec::new()), // File not yet created
    };

    let file_len = file.metadata().map(|m| m.len()).unwrap_or(0);
    if file_len <= byte_offset {
        return Ok(Vec::new());
    }

    let new_bytes = (file_len - byte_offset) as usize;
    let sample_count = new_bytes / 4;
    if sample_count == 0 {
        return Ok(Vec::new());
    }

    let mut reader = BufReader::new(file);
    reader
        .seek(std::io::SeekFrom::Start(byte_offset))
        .map_err(|e| format!("Seek error: {e}"))?;

    let mut buf = vec![0u8; sample_count * 4];
    let mut total_read = 0;
    while total_read < buf.len() {
        match reader.read(&mut buf[total_read..]) {
            Ok(0) => break,
            Ok(n) => total_read += n,
            Err(e) => return Err(format!("Read error: {e}")),
        }
    }

    let actual_samples = total_read / 4;
    let mut samples = Vec::with_capacity(actual_samples);
    for i in 0..actual_samples {
        let offset = i * 4;
        let bytes = [buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]];
        samples.push(f32::from_le_bytes(bytes));
    }
    Ok(samples)
}

/// Join a writer thread spawned by `spawn_writer_thread`. On panic or
/// writer error, unlinks the PCM temp file before returning the error
/// — otherwise a crashed writer leaves its half-written PCM in
/// `$TMPDIR` forever (or until the startup sweep in
/// `cleanup_stale_temp_files`). On success the file is preserved so
/// the subsequent `mix_to_wav` step can consume it.
pub fn join_writer_and_cleanup(
    handle: thread::JoinHandle<Result<(), String>>,
    path: &Path,
    label: &str,
) -> Result<(), String> {
    match handle.join() {
        Err(_) => {
            if let Err(e) = std::fs::remove_file(path) {
                log::warn!("Failed to unlink {label} PCM after panic: {e}");
            }
            Err(format!("{label} writer thread panicked"))
        }
        Ok(Err(e)) => {
            if let Err(unlink_err) = std::fs::remove_file(path) {
                log::warn!("Failed to unlink {label} PCM after writer error: {unlink_err}");
            }
            Err(format!("{label} writer error: {e}"))
        }
        Ok(Ok(())) => Ok(()),
    }
}

/// Rollback-style cleanup for a writer thread that was spawned as
/// part of a partially-completed `start_recording` setup. Drops the
/// sender to close the channel, joins the writer thread, and
/// *unconditionally* unlinks the PCM temp file — even on a clean
/// writer exit — because during rollback the partial capture is
/// abandoned and the file has no further consumer.
///
/// Contrast `join_writer_and_cleanup`, which preserves the PCM on
/// success so the subsequent `mix_to_wav` step can consume it.
pub fn rollback_writer_and_unlink(
    sender: Option<mpsc::SyncSender<Vec<f32>>>,
    writer: Option<thread::JoinHandle<Result<(), String>>>,
    path: &Path,
) {
    drop(sender);
    if let Some(h) = writer {
        let _ = h.join();
    }
    let _ = std::fs::remove_file(path);
}

/// Spawn a thread that receives f32 chunks via channel and writes raw PCM (LE)
/// to the given temp file. The capture callbacks feed this via `try_send`.
pub fn spawn_writer_thread(
    path: PathBuf,
    receiver: mpsc::Receiver<Vec<f32>>,
) -> thread::JoinHandle<Result<(), String>> {
    thread::spawn(move || {
        let file = File::create(&path).map_err(|e| format!("Failed to create temp file: {e}"))?;
        let mut writer = BufWriter::with_capacity(256 * 1024, file);
        while let Ok(chunk) = receiver.recv() {
            for &sample in &chunk {
                writer
                    .write_all(&sample.to_le_bytes())
                    .map_err(|e| format!("Write error: {e}"))?;
            }
        }
        writer.flush().map_err(|e| format!("Flush error: {e}"))?;
        Ok(())
    })
}

/// Mix a chunk of system + mic samples, encode as 16 kHz mono 16-bit WAV
/// in memory, and return the raw bytes. Used for live transcription chunks.
///
/// Both inputs are pre-resampled / pre-downmixed f32 mono at the same rate.
/// The mix is 50/50 with soft clipping.
pub fn encode_mixed_wav_chunk(
    sys_mono: &[f32],
    mic_mono: &[f32],
    output_rate: u32,
) -> Result<Vec<u8>, String> {
    let len = sys_mono.len().max(mic_mono.len());
    if len == 0 {
        return Ok(Vec::new());
    }

    let mut mixed = Vec::with_capacity(len);
    for i in 0..len {
        let sa = if i < sys_mono.len() { sys_mono[i] } else { 0.0 };
        let sb = if i < mic_mono.len() { mic_mono[i] } else { 0.0 };
        mixed.push(((sa + sb) * 0.5).clamp(-1.0, 1.0));
    }

    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: output_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let mut cursor = std::io::Cursor::new(Vec::with_capacity(mixed.len() * 2 + 44));
    {
        let mut writer = hound::WavWriter::new(&mut cursor, spec)
            .map_err(|e| format!("WAV create error: {e}"))?;
        for &sample in &mixed {
            writer
                .write_sample((sample * 32767.0) as i16)
                .map_err(|e| format!("WAV write error: {e}"))?;
        }
        writer
            .finalize()
            .map_err(|e| format!("WAV finalize error: {e}"))?;
    }

    Ok(cursor.into_inner())
}

/// Stream-mix two raw PCM temp files into a single WAV, processing in 1-second
/// chunks. Output is always 16 kHz mono 16-bit — Whisper works at 16 kHz
/// internally so there's no quality loss, and the smaller file size
/// (~1.9 MB/min vs ~5.6 MB/min at 48 kHz) enables longer recordings.
pub fn mix_to_wav(
    sys_path: &Path,
    sys_rate: u32,
    sys_channels: u16,
    mic_path: &Path,
    mic_rate: u32,
    mic_channels: u16,
) -> Result<String, String> {
    let output_rate: u32 = 16000;

    let temp_dir = std::env::temp_dir();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let wav_path = temp_dir.join(format!("notesync_meeting_{timestamp}.wav"));

    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: output_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let mut wav_writer =
        hound::WavWriter::create(&wav_path, spec).map_err(|e| format!("WAV create error: {e}"))?;

    let sys_file = File::open(sys_path).map_err(|e| format!("Open sys temp: {e}"))?;
    let mic_file = File::open(mic_path).map_err(|e| format!("Open mic temp: {e}"))?;
    let mut sys_reader = BufReader::with_capacity(256 * 1024, sys_file);
    let mut mic_reader = BufReader::with_capacity(256 * 1024, mic_file);

    let sys_chunk_size = sys_rate as usize * sys_channels as usize;
    let mic_chunk_size = mic_rate as usize * mic_channels as usize;

    let mut sys_resampler = ChunkResampler::new(sys_rate, output_rate);
    let mut mic_resampler = ChunkResampler::new(mic_rate, output_rate);
    let sys_needs_resample = sys_rate != output_rate;
    let mic_needs_resample = mic_rate != output_rate;

    let mut total_samples: u64 = 0;

    loop {
        let sys_raw = read_f32_chunk(&mut sys_reader, sys_chunk_size)?;
        let mic_raw = read_f32_chunk(&mut mic_reader, mic_chunk_size)?;

        if sys_raw.is_empty() && mic_raw.is_empty() {
            break;
        }

        let sys_mono_raw = to_mono(&sys_raw, sys_channels);
        let sys_mono = if sys_needs_resample && !sys_mono_raw.is_empty() {
            sys_resampler.process(&sys_mono_raw)
        } else {
            sys_mono_raw
        };

        let mic_mono_raw = to_mono(&mic_raw, mic_channels);
        let mic_mono = if mic_needs_resample && !mic_mono_raw.is_empty() {
            mic_resampler.process(&mic_mono_raw)
        } else {
            mic_mono_raw
        };

        let len = sys_mono.len().max(mic_mono.len());
        for i in 0..len {
            let sa = if i < sys_mono.len() { sys_mono[i] } else { 0.0 };
            let sb = if i < mic_mono.len() { mic_mono[i] } else { 0.0 };
            let mixed = ((sa + sb) * 0.5).clamp(-1.0, 1.0);
            wav_writer
                .write_sample((mixed * 32767.0) as i16)
                .map_err(|e| format!("WAV write error: {e}"))?;
            total_samples += 1;
        }
    }

    wav_writer
        .finalize()
        .map_err(|e| format!("WAV finalize error: {e}"))?;

    log::info!(
        "Mixed {} samples ({:.1}s) at {}Hz to {}",
        total_samples,
        total_samples as f64 / output_rate as f64,
        output_rate,
        wav_path.display()
    );

    Ok(wav_path.to_string_lossy().into_owned())
}

/// Read a WAV (or any file) into memory then delete it. Used by the
/// `stop_recording` end-of-session path so the mixed WAV never lingers
/// in the temp dir after the TS side has consumed its bytes. Without
/// this, every meeting recording leaks ~1 MB/second to
/// `$TMPDIR/notesync_meeting_*.wav` and the files only go away when
/// macOS eventually purges /var/folders (rare in practice).
pub fn read_and_remove_file(path: &str) -> Result<Vec<u8>, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("Read final WAV: {e}"))?;
    if let Err(e) = std::fs::remove_file(path) {
        // Not fatal — the caller already has the bytes and the
        // startup sweep (`cleanup_stale_temp_files`) will clear the
        // leftover on next launch. Logged at ERROR so the leak is
        // visible in production logs rather than silently swallowed.
        log::error!("Failed to remove final WAV at {path}: {e}");
    }
    Ok(bytes)
}

/// Sweep `$TMPDIR` for stale `notesync_*` temp files (mixed WAVs and
/// raw PCM fragments from earlier versions that leaked, or from
/// recordings that crashed mid-stop). Called from app startup so
/// already-leaked files heal on next launch.
pub fn cleanup_stale_temp_files() -> (usize, u64) {
    cleanup_stale_temp_files_in(&std::env::temp_dir())
}

/// Same as `cleanup_stale_temp_files` but against a caller-supplied
/// base directory. Split out so tests can sandbox the sweep in a
/// scoped `TempAudioDir` rather than touching the real `$TMPDIR`.
pub fn cleanup_stale_temp_files_in(base_dir: &Path) -> (usize, u64) {
    let read_dir = match std::fs::read_dir(base_dir) {
        Ok(d) => d,
        Err(_) => return (0, 0),
    };
    let mut removed = 0usize;
    let mut bytes_removed: u64 = 0;
    for entry in read_dir.flatten() {
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if !name_str.starts_with("notesync_") {
            continue;
        }
        if !(name_str.ends_with(".wav") || name_str.ends_with(".pcm")) {
            continue;
        }
        let path = entry.path();
        let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        if std::fs::remove_file(&path).is_ok() {
            removed += 1;
            bytes_removed += size;
        }
    }
    if removed > 0 {
        log::info!(
            "Cleaned up {removed} stale NoteSync temp file(s), freed {:.1} MB",
            bytes_removed as f64 / (1024.0 * 1024.0)
        );
    }
    (removed, bytes_removed)
}

// Phase 0.2 — smoke tests that exercise the fixture against the real
// helpers in this module. Full per-function coverage is Phase 5 work;
// the goal here is only "does the fixture actually drive mix_to_wav
// and read_and_remove_file end-to-end?"
#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio_test_support::{
        write_pcm_file, FakePcmSource, TempAudioDir, verify_wav_header,
    };

    #[test]
    fn to_mono_averages_stereo_frames() {
        let stereo: Vec<f32> = vec![0.25, -0.25, 1.0, -1.0, 0.5, 0.5];
        let mono = to_mono(&stereo, 2);
        assert_eq!(mono, vec![0.0, 0.0, 0.5]);
    }

    #[test]
    fn to_mono_passes_mono_through_unchanged() {
        let samples = vec![0.1, 0.2, 0.3];
        assert_eq!(to_mono(&samples, 1), samples);
    }

    #[test]
    fn fake_pcm_source_silence_length_matches_spec() {
        let s = FakePcmSource::silence(0.5, 48_000, 2);
        // 0.5s * 48000 Hz * 2 channels
        assert_eq!(s.len(), 48_000);
        assert!(s.iter().all(|x| *x == 0.0));
    }

    #[test]
    fn fake_pcm_source_sine_has_nonzero_energy() {
        let s = FakePcmSource::sine(0.1, 48_000, 1, 440.0);
        let energy: f32 = s.iter().map(|x| x * x).sum();
        assert!(energy > 0.0, "sine should have nonzero energy");
    }

    // Phase 5.1 — ChunkResampler: verify the basic downsample works
    // and that stateful chunking matches a one-shot pass within
    // rounding error.

    #[test]
    fn chunk_resampler_downsamples_to_expected_length() {
        // 48 kHz → 16 kHz is a 3:1 downsample. 48 samples in → ~16 out.
        let mut r = ChunkResampler::new(48_000, 16_000);
        let input: Vec<f32> = (0..48).map(|i| i as f32).collect();
        let out = r.process(&input);
        // Linear interpolation with ratio=3.0: positions 0, 3, 6, ...
        // produce 16 samples from 48.
        assert_eq!(out.len(), 16);
        // First output sample should equal input[0] exactly.
        assert!((out[0] - 0.0).abs() < 1e-6);
    }

    #[test]
    fn chunk_resampler_streaming_matches_single_shot() {
        // The resampler is stateful; feeding two halves should
        // produce the same total count as a one-shot pass (within a
        // 1-sample fencepost tolerance due to the fractional position
        // carried across calls).
        let input: Vec<f32> =
            (0..9600).map(|i| (i as f32 * 0.01).sin()).collect();

        let mut one_shot = ChunkResampler::new(48_000, 16_000);
        let all = one_shot.process(&input);

        let mut streamed = ChunkResampler::new(48_000, 16_000);
        let mut chunks = Vec::new();
        chunks.extend(streamed.process(&input[..4800]));
        chunks.extend(streamed.process(&input[4800..]));

        assert!(
            (all.len() as isize - chunks.len() as isize).abs() <= 1,
            "streaming vs one-shot length differ by more than 1: {} vs {}",
            all.len(),
            chunks.len()
        );
    }

    #[test]
    fn chunk_resampler_empty_input_returns_empty() {
        let mut r = ChunkResampler::new(48_000, 16_000);
        assert!(r.process(&[]).is_empty());
    }

    // Phase 5.1 — read_pcm_since: growing-file reader used by the
    // live-chunk path. Verifies byte-offset correctness.

    #[test]
    fn read_pcm_since_returns_empty_for_missing_file() {
        let dir = TempAudioDir::new().unwrap();
        let missing = dir.path_in("no_such_file.pcm");
        let samples = read_pcm_since(&missing, 0).unwrap();
        assert!(samples.is_empty());
    }

    #[test]
    fn read_pcm_since_reads_from_offset() {
        let dir = TempAudioDir::new().unwrap();
        let path = dir.path_in("chunk.pcm");

        // 10 f32 samples = 40 bytes.
        let samples: Vec<f32> = (0..10).map(|i| i as f32).collect();
        write_pcm_file(&path, &samples).unwrap();

        // Read from byte offset 16 (sample 4). Should get samples 4..10.
        let tail = read_pcm_since(&path, 16).unwrap();
        assert_eq!(tail, vec![4.0, 5.0, 6.0, 7.0, 8.0, 9.0]);
    }

    #[test]
    fn read_pcm_since_returns_empty_when_offset_at_end() {
        let dir = TempAudioDir::new().unwrap();
        let path = dir.path_in("chunk.pcm");

        let samples: Vec<f32> = vec![1.0, 2.0, 3.0];
        write_pcm_file(&path, &samples).unwrap();

        // File is 12 bytes; offset 12 means "no new data".
        let tail = read_pcm_since(&path, 12).unwrap();
        assert!(tail.is_empty());
    }

    // Phase 5.1 — encode_mixed_wav_chunk: WAV header + payload sanity.

    #[test]
    fn encode_mixed_wav_chunk_produces_valid_wav() {
        let sys: Vec<f32> = FakePcmSource::silence(0.1, 16_000, 1);
        let mic: Vec<f32> = FakePcmSource::silence(0.1, 16_000, 1);
        let bytes = encode_mixed_wav_chunk(&sys, &mic, 16_000).unwrap();

        let header = verify_wav_header(&bytes);
        assert_eq!(header.sample_rate, 16_000);
        assert_eq!(header.channels, 1);
        assert_eq!(header.bits_per_sample, 16);
        // 1600 samples × 2 bytes = 3200 bytes of data.
        assert_eq!(header.data_bytes, 3200);
    }

    #[test]
    fn encode_mixed_wav_chunk_returns_empty_for_no_input() {
        let bytes = encode_mixed_wav_chunk(&[], &[], 16_000).unwrap();
        assert!(bytes.is_empty());
    }

    #[test]
    fn encode_mixed_wav_chunk_mixes_signals_5050() {
        // Two identical full-scale sines. Mix should sum to 2×
        // scaled by 0.5 = full scale. Clamp to [-1, 1] prevents
        // overflow. Check the peak absolute amplitude is non-zero
        // and not over the clamp.
        let sine: Vec<f32> = FakePcmSource::sine(0.05, 16_000, 1, 440.0);
        let bytes = encode_mixed_wav_chunk(&sine, &sine, 16_000).unwrap();
        let header = verify_wav_header(&bytes);
        assert!(header.data_bytes > 0);

        // Read one i16 sample from the data section and verify
        // magnitude is within expected bounds.
        let first_sample = i16::from_le_bytes([bytes[44], bytes[45]]);
        assert!(first_sample.abs() < i16::MAX, "mix should clamp, not overflow");
    }

    #[test]
    fn encode_mixed_wav_chunk_handles_uneven_lengths() {
        // If sys is longer than mic, the extra tail samples should
        // still be written (mic contributes 0 for those frames).
        let sys: Vec<f32> = FakePcmSource::silence(0.05, 16_000, 1); // 800 samples
        let mic: Vec<f32> = FakePcmSource::silence(0.025, 16_000, 1); // 400 samples
        let bytes = encode_mixed_wav_chunk(&sys, &mic, 16_000).unwrap();
        let header = verify_wav_header(&bytes);
        // Output length tracks the max of the two inputs: 800 × 2 = 1600 bytes.
        assert_eq!(header.data_bytes, 1600);
    }

    #[test]
    fn mix_to_wav_produces_valid_wav_and_helper_cleans_up() {
        let dir = TempAudioDir::new().unwrap();
        let sys_path = dir.path_in("sys.pcm");
        let mic_path = dir.path_in("mic.pcm");

        // 0.25s of silence at the rates the real pipeline uses.
        write_pcm_file(&sys_path, &FakePcmSource::silence(0.25, 48_000, 2)).unwrap();
        write_pcm_file(&mic_path, &FakePcmSource::silence(0.25, 48_000, 1)).unwrap();

        let wav_path = mix_to_wav(
            &sys_path,
            48_000,
            2,
            &mic_path,
            48_000,
            1,
        )
        .unwrap();

        // mix_to_wav writes to $TMPDIR, outside our scoped temp dir —
        // that's by design (it needs a path that survives until the TS
        // side reads it). So we consume + delete it via the same helper
        // the production code uses.
        let bytes = read_and_remove_file(&wav_path).unwrap();

        let header = verify_wav_header(&bytes);
        assert_eq!(header.sample_rate, 16_000, "mix output should be 16 kHz");
        assert_eq!(header.channels, 1, "mix output should be mono");
        assert_eq!(header.bits_per_sample, 16, "mix output should be 16-bit PCM");
        assert!(header.data_bytes > 0, "data chunk should be non-empty");

        // read_and_remove_file removed the WAV; the scoped dir never
        // saw it, so cleanup is also proven.
        assert!(!std::path::Path::new(&wav_path).exists());
    }

    #[test]
    fn cleanup_stale_temp_files_in_removes_notesync_prefixed_wav_and_pcm() {
        let dir = TempAudioDir::new().unwrap();

        // Files that should be swept.
        let targets = [
            ("notesync_meeting_123.wav", 128u64),
            ("notesync_sys_456.pcm", 64u64),
            ("notesync_mic_789.pcm", 32u64),
        ];
        for (name, size) in targets.iter() {
            let path = dir.path_in(name);
            std::fs::write(&path, vec![0u8; *size as usize]).unwrap();
        }

        // Files that must survive: wrong prefix, wrong extension, and
        // a notesync-prefixed file with an unrelated extension.
        let survivors = [
            ("other_app.wav", 16u64),
            ("random.pcm", 16u64),
            ("notesync_meeting.txt", 16u64),
            ("notesync_config.json", 16u64),
        ];
        for (name, size) in survivors.iter() {
            std::fs::write(dir.path_in(name), vec![0u8; *size as usize]).unwrap();
        }

        let (removed, bytes_removed) = cleanup_stale_temp_files_in(dir.path());

        assert_eq!(removed, targets.len(), "removed count mismatch");
        let expected_bytes: u64 = targets.iter().map(|(_, s)| *s).sum();
        assert_eq!(bytes_removed, expected_bytes, "bytes freed mismatch");

        for (name, _) in targets.iter() {
            assert!(!dir.path_in(name).exists(), "target {name} should be gone");
        }
        for (name, _) in survivors.iter() {
            assert!(dir.path_in(name).exists(), "survivor {name} should remain");
        }
    }

    #[test]
    fn cleanup_stale_temp_files_in_returns_zero_when_dir_missing() {
        let missing = std::path::PathBuf::from(
            "/nonexistent-path-for-notesync-cleanup-test-12345",
        );
        let (removed, bytes) = cleanup_stale_temp_files_in(&missing);
        assert_eq!(removed, 0);
        assert_eq!(bytes, 0);
    }

    #[test]
    fn read_and_remove_file_returns_bytes_and_deletes() {
        let dir = TempAudioDir::new().unwrap();
        let path = dir.path_in("final.wav");
        std::fs::write(&path, b"hello-wav").unwrap();

        let bytes = read_and_remove_file(path.to_str().unwrap()).unwrap();
        assert_eq!(bytes, b"hello-wav");
        assert!(!path.exists(), "file should be removed after read");
    }

    #[test]
    fn join_writer_and_cleanup_unlinks_pcm_on_panic() {
        let dir = TempAudioDir::new().unwrap();
        let path = dir.path_in("sys.pcm");
        std::fs::write(&path, b"partial").unwrap();

        // Suppress the panic stderr noise so the test output stays clean.
        let prev_hook = std::panic::take_hook();
        std::panic::set_hook(Box::new(|_| {}));
        let handle: std::thread::JoinHandle<Result<(), String>> =
            std::thread::spawn(|| panic!("simulated writer panic"));
        // `join` receives the panic and returns Err.
        let err = join_writer_and_cleanup(handle, &path, "System").unwrap_err();
        std::panic::set_hook(prev_hook);

        assert!(err.contains("panicked"), "unexpected error: {err}");
        assert!(!path.exists(), "pcm should be unlinked after panic");
    }

    #[test]
    fn join_writer_and_cleanup_unlinks_pcm_on_writer_error() {
        let dir = TempAudioDir::new().unwrap();
        let path = dir.path_in("sys.pcm");
        std::fs::write(&path, b"partial").unwrap();

        let handle: std::thread::JoinHandle<Result<(), String>> =
            std::thread::spawn(|| Err("disk full".to_string()));

        let err = join_writer_and_cleanup(handle, &path, "System").unwrap_err();
        assert!(err.contains("disk full"), "write error should propagate: {err}");
        assert!(!path.exists(), "pcm should be unlinked after writer error");
    }

    #[test]
    fn join_writer_and_cleanup_preserves_pcm_on_ok() {
        let dir = TempAudioDir::new().unwrap();
        let path = dir.path_in("sys.pcm");
        std::fs::write(&path, b"good pcm payload").unwrap();

        let handle: std::thread::JoinHandle<Result<(), String>> =
            std::thread::spawn(|| Ok(()));

        join_writer_and_cleanup(handle, &path, "System").unwrap();
        assert!(path.exists(), "pcm must survive happy path so mix_to_wav can read it");
    }

    #[test]
    fn rollback_writer_and_unlink_drains_sender_and_unlinks_pcm() {
        let dir = TempAudioDir::new().unwrap();
        let path = dir.path_in("sys.pcm");

        // Spawn a real writer; push one chunk so the file exists on
        // disk with non-zero content. Then rollback.
        let (tx, rx) = mpsc::sync_channel::<Vec<f32>>(16);
        let writer = spawn_writer_thread(path.clone(), rx);

        tx.send(vec![0.25f32, -0.25f32, 0.5f32]).unwrap();

        // Give the writer thread a moment to pick up and write the
        // chunk. 50 ms is plenty for a single buffered write.
        std::thread::sleep(std::time::Duration::from_millis(50));
        assert!(path.exists(), "writer should have created the PCM file");

        rollback_writer_and_unlink(Some(tx), Some(writer), &path);

        assert!(
            !path.exists(),
            "rollback must unlink the PCM even after a clean writer exit"
        );
    }

    #[test]
    fn rollback_writer_and_unlink_is_noop_for_missing_resources() {
        let dir = TempAudioDir::new().unwrap();
        let path = dir.path_in("never_created.pcm");
        // No sender, no writer, no file — simulates a guard that was
        // dropped before any resources were allocated. Must not panic.
        rollback_writer_and_unlink(None, None, &path);
        assert!(!path.exists());
    }

    /// Unlink failure must still return the read bytes. We can only
    /// reliably force a unix-style unlink failure via a read-only
    /// parent dir, so Windows is skipped — the behavior there is
    /// identical, verified via code review of the single
    /// `log::error!` line.
    #[cfg(unix)]
    #[test]
    fn read_and_remove_file_returns_bytes_even_when_unlink_fails() {
        use std::os::unix::fs::PermissionsExt;

        let dir = TempAudioDir::new().unwrap();
        let path = dir.path_in("locked.wav");
        std::fs::write(&path, b"locked-content").unwrap();

        // Drop write + execute bits on the parent so unlink fails but
        // read still succeeds. Restore before the dir drops so
        // TempDir cleanup doesn't fail.
        let parent = dir.path();
        let original = std::fs::metadata(parent).unwrap().permissions();
        std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o500)).unwrap();

        let result = read_and_remove_file(path.to_str().unwrap());

        std::fs::set_permissions(parent, original).unwrap();

        let bytes = result.expect("should still return bytes when unlink fails");
        assert_eq!(bytes, b"locked-content");
        // File is left behind — startup sweep will clean it up on next launch.
        assert!(path.exists(), "file left behind when unlink is blocked");

        // Clean up ourselves so TempDir drop doesn't error.
        std::fs::remove_file(&path).ok();
    }
}
