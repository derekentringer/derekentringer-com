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
        // Not fatal — we already have the bytes. Log so the leak
        // doesn't silently return.
        log::warn!("Failed to remove final WAV at {path}: {e}");
    }
    Ok(bytes)
}

/// Sweep `$TMPDIR` for stale `notesync_*` temp files (mixed WAVs and
/// raw PCM fragments from earlier versions that leaked, or from
/// recordings that crashed mid-stop). Called from app startup so
/// already-leaked files heal on next launch.
pub fn cleanup_stale_temp_files() -> (usize, u64) {
    let temp_dir = std::env::temp_dir();
    let read_dir = match std::fs::read_dir(&temp_dir) {
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
