//! Windows meeting-mode audio capture using cpal / WASAPI.
//!
//! Mirrors the macOS `audio_capture` module: captures system audio (default
//! output loopback) and microphone in parallel, streams both to raw PCM temp
//! files via shared writer threads, and produces live 16 kHz mono WAV chunks
//! for Whisper transcription plus a final mixed WAV on stop.
//!
//! ## Architecture
//!
//! On start_recording we open two cpal streams on the shared WASAPI host:
//!   1. **Mic**: `host.default_input_device()` opened via `build_input_stream`
//!   2. **System (loopback)**: `host.default_output_device()` opened in
//!      loopback mode — cpal's Windows backend transparently flips an output
//!      device into a WASAPI loopback capture when you call
//!      `build_input_stream` on it. This is the same mechanism OBS, Discord,
//!      and other Windows screen-capture tools use.
//!
//! Both streams' data callbacks push `Vec<f32>` samples through sync channels
//! to dedicated writer threads from `audio_capture_shared`, which append the
//! samples to raw PCM temp files. `get_audio_chunk` reads the new bytes since
//! the last call, resamples to 16 kHz, mixes the two streams 50/50, and WAV
//! encodes an in-memory buffer for the live-transcription pipeline.
//!
//! A separate tick thread emits `meeting-recording-tick` events with
//! (elapsed_secs, mic_rms) every ~500 ms so the UI waveform and elapsed
//! display match the macOS behavior.
//!
//! ## Windows permission model
//!
//! Unlike macOS's TCC, there is no per-app audio prompt on Windows — access
//! is governed solely by **Settings → Privacy & security → Microphone**. If
//! "Let desktop apps access your microphone" is off, `build_input_stream`
//! returns an error we surface to the UI. System-audio loopback requires no
//! permission at all; anything the OS routes to the default output device is
//! capturable.

#![cfg(target_os = "windows")]

use crate::audio_capture_shared::{
    encode_mixed_wav_chunk, join_writer_and_cleanup, mix_to_wav, read_and_remove_file,
    read_pcm_since, rollback_writer_and_unlink, spawn_writer_thread, to_mono,
    ChunkResampler,
};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, Stream, StreamConfig};
use std::path::PathBuf;
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::Emitter;

/// Shared state for an active Windows meeting recording.
///
/// cpal's `Stream` type is not `Send` on Windows (the underlying WASAPI
/// handle is bound to the thread that created it), but in practice our
/// `start_recording` builds the streams, stores them here, and only ever
/// drops them from `stop_recording` — which is invoked from the same tauri
/// command handler thread. The runtime never moves the stream between
/// threads. We manually assert `Send` to satisfy the static `Mutex` storage.
struct RecordingState {
    mic_stream: Option<Stream>,
    sys_stream: Option<Stream>,
    mic_sender: Option<mpsc::SyncSender<Vec<f32>>>,
    sys_sender: Option<mpsc::SyncSender<Vec<f32>>>,
    mic_writer: Option<thread::JoinHandle<Result<(), String>>>,
    sys_writer: Option<thread::JoinHandle<Result<(), String>>>,
    mic_temp_path: PathBuf,
    sys_temp_path: PathBuf,
    mic_sample_rate: u32,
    sys_sample_rate: u32,
    mic_channels: u16,
    sys_channels: u16,
    stop_flag: Arc<Mutex<bool>>,
    tick_handle: Option<thread::JoinHandle<()>>,
    sys_chunk_read_pos: u64,
    mic_chunk_read_pos: u64,
}

unsafe impl Send for RecordingState {}

static RECORDING: Mutex<Option<RecordingState>> = Mutex::new(None);

/// Roll-back guard for `start_recording` on Windows. Tracks the
/// spawned writer threads and their PCM temp paths as setup
/// progresses. Any `?` between the first writer spawn and the final
/// `commit()` triggers the Drop impl, which closes senders, joins
/// the writer threads, and unlinks the PCM fragments — preventing
/// partial `notesync_*.pcm` files from accumulating in `%TEMP%`.
struct StartupGuard {
    mic_path: PathBuf,
    sys_path: PathBuf,
    mic_sender: Option<mpsc::SyncSender<Vec<f32>>>,
    mic_writer: Option<thread::JoinHandle<Result<(), String>>>,
    sys_sender: Option<mpsc::SyncSender<Vec<f32>>>,
    sys_writer: Option<thread::JoinHandle<Result<(), String>>>,
    defused: bool,
}

struct CommittedStartup {
    mic_sender: mpsc::SyncSender<Vec<f32>>,
    mic_writer: thread::JoinHandle<Result<(), String>>,
    sys_sender: mpsc::SyncSender<Vec<f32>>,
    sys_writer: thread::JoinHandle<Result<(), String>>,
}

impl StartupGuard {
    fn new(mic_path: PathBuf, sys_path: PathBuf) -> Self {
        Self {
            mic_path,
            sys_path,
            mic_sender: None,
            mic_writer: None,
            sys_sender: None,
            sys_writer: None,
            defused: false,
        }
    }

    fn set_mic_writer(
        &mut self,
        sender: mpsc::SyncSender<Vec<f32>>,
        writer: thread::JoinHandle<Result<(), String>>,
    ) {
        self.mic_sender = Some(sender);
        self.mic_writer = Some(writer);
    }

    fn set_sys_writer(
        &mut self,
        sender: mpsc::SyncSender<Vec<f32>>,
        writer: thread::JoinHandle<Result<(), String>>,
    ) {
        self.sys_sender = Some(sender);
        self.sys_writer = Some(writer);
    }

    fn commit(mut self) -> CommittedStartup {
        self.defused = true;
        CommittedStartup {
            mic_sender: self.mic_sender.take().expect("mic_sender not set"),
            mic_writer: self.mic_writer.take().expect("mic_writer not set"),
            sys_sender: self.sys_sender.take().expect("sys_sender not set"),
            sys_writer: self.sys_writer.take().expect("sys_writer not set"),
        }
    }
}

impl Drop for StartupGuard {
    fn drop(&mut self) {
        if self.defused {
            return;
        }

        rollback_writer_and_unlink(
            self.mic_sender.take(),
            self.mic_writer.take(),
            &self.mic_path,
        );
        rollback_writer_and_unlink(
            self.sys_sender.take(),
            self.sys_writer.take(),
            &self.sys_path,
        );

        log::warn!("Windows start_recording rolled back partially-allocated resources");
    }
}

pub fn check_support() -> Result<bool, String> {
    // cpal's WASAPI backend works on Windows 10+, which covers every version
    // Tauri itself supports. Return true unconditionally.
    Ok(true)
}

pub fn start_recording(app_handle: tauri::AppHandle) -> Result<(), String> {
    {
        let guard = RECORDING.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Err("Recording already in progress".into());
        }
    }

    let temp_dir = std::env::temp_dir();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let mic_temp_path = temp_dir.join(format!("notesync_mic_{timestamp}.pcm"));
    let sys_temp_path = temp_dir.join(format!("notesync_sys_{timestamp}.pcm"));

    // Rollback guard — any `?` below will trigger Drop which closes
    // senders, joins writer threads, and unlinks PCM fragments.
    let mut rollback = StartupGuard::new(mic_temp_path.clone(), sys_temp_path.clone());

    let host = cpal::default_host();

    // ── Mic stream ──────────────────────────────────────────────────
    let mic_device = host
        .default_input_device()
        .ok_or("No default input device found. Is a microphone connected?")?;
    let mic_name = mic_device
        .name()
        .unwrap_or_else(|_| "<unknown mic>".to_string());
    let mic_config = mic_device
        .default_input_config()
        .map_err(|e| format!("Failed to query mic config: {e}"))?;
    let mic_sample_format = mic_config.sample_format();
    let mic_stream_config: StreamConfig = mic_config.clone().into();
    let mic_sample_rate = mic_stream_config.sample_rate.0;
    let mic_channels = mic_stream_config.channels;

    log::info!(
        "Mic device '{mic_name}' @ {mic_sample_rate} Hz, {mic_channels} ch, format={mic_sample_format:?}"
    );

    let (mic_tx, mic_rx) = mpsc::sync_channel::<Vec<f32>>(128);
    let mic_writer = spawn_writer_thread(mic_temp_path.clone(), mic_rx);
    rollback.set_mic_writer(mic_tx.clone(), mic_writer);

    let mic_rms = Arc::new(Mutex::new(0.0f32));
    let mic_stream = build_input_stream(
        &mic_device,
        &mic_stream_config,
        mic_sample_format,
        mic_tx.clone(),
        Some(Arc::clone(&mic_rms)),
    )
    .map_err(|e| format!("Failed to open mic stream: {e}"))?;
    let sys_rms = Arc::new(Mutex::new(0.0f32));

    mic_stream
        .play()
        .map_err(|e| format!("Failed to start mic stream: {e}"))?;

    // ── System loopback stream ──────────────────────────────────────
    // On Windows, `build_input_stream` on an *output* device opens a WASAPI
    // loopback capture against that device's mix buffer.
    let sys_device = host
        .default_output_device()
        .ok_or("No default output device found. Cannot capture system audio.")?;
    let sys_name = sys_device
        .name()
        .unwrap_or_else(|_| "<unknown output>".to_string());
    let sys_config = sys_device
        .default_output_config()
        .map_err(|e| format!("Failed to query system output config: {e}"))?;
    let sys_sample_format = sys_config.sample_format();
    let sys_stream_config: StreamConfig = sys_config.clone().into();
    let sys_sample_rate = sys_stream_config.sample_rate.0;
    let sys_channels = sys_stream_config.channels;

    log::info!(
        "System loopback device '{sys_name}' @ {sys_sample_rate} Hz, {sys_channels} ch, format={sys_sample_format:?}"
    );

    let (sys_tx, sys_rx) = mpsc::sync_channel::<Vec<f32>>(128);
    let sys_writer = spawn_writer_thread(sys_temp_path.clone(), sys_rx);
    rollback.set_sys_writer(sys_tx.clone(), sys_writer);

    let sys_stream = build_input_stream(
        &sys_device,
        &sys_stream_config,
        sys_sample_format,
        sys_tx.clone(),
        Some(Arc::clone(&sys_rms)),
    )
    .map_err(|e| format!("Failed to open system loopback stream: {e}"))?;

    sys_stream
        .play()
        .map_err(|e| format!("Failed to start system loopback stream: {e}"))?;

    // ── Tick thread (UI elapsed + waveform) ─────────────────────────
    let stop_flag = Arc::new(Mutex::new(false));
    let tick_handle = spawn_tick_thread(
        app_handle,
        Arc::clone(&stop_flag),
        Arc::clone(&mic_rms),
        Arc::clone(&sys_rms),
    );

    // ── Store state ─────────────────────────────────────────────────
    let mut guard = RECORDING.lock().map_err(|e| e.to_string())?;
    // All setup succeeded — defuse the rollback and take ownership
    // of the senders + writer handles it was tracking.
    let committed = rollback.commit();
    *guard = Some(RecordingState {
        mic_stream: Some(mic_stream),
        sys_stream: Some(sys_stream),
        mic_sender: Some(committed.mic_sender),
        sys_sender: Some(committed.sys_sender),
        mic_writer: Some(committed.mic_writer),
        sys_writer: Some(committed.sys_writer),
        mic_temp_path,
        sys_temp_path,
        mic_sample_rate,
        sys_sample_rate,
        mic_channels,
        sys_channels,
        stop_flag,
        tick_handle: Some(tick_handle),
        sys_chunk_read_pos: 0,
        mic_chunk_read_pos: 0,
    });

    log::info!("Windows meeting recording started");
    Ok(())
}

pub fn get_audio_chunk() -> Result<Vec<u8>, String> {
    let mut guard = RECORDING.lock().map_err(|e| e.to_string())?;
    let state = guard.as_mut().ok_or("No recording in progress")?;

    let output_rate: u32 = 16000;

    let sys_new = read_pcm_since(&state.sys_temp_path, state.sys_chunk_read_pos)?;
    let mic_new = read_pcm_since(&state.mic_temp_path, state.mic_chunk_read_pos)?;

    state.sys_chunk_read_pos += (sys_new.len() * 4) as u64;
    state.mic_chunk_read_pos += (mic_new.len() * 4) as u64;

    if sys_new.is_empty() && mic_new.is_empty() {
        return Ok(Vec::new());
    }

    let sys_mono = to_mono(&sys_new, state.sys_channels);
    let mic_mono = to_mono(&mic_new, state.mic_channels);

    let sys_resampled = if state.sys_sample_rate != output_rate && !sys_mono.is_empty() {
        let mut resampler = ChunkResampler::new(state.sys_sample_rate, output_rate);
        resampler.process(&sys_mono)
    } else {
        sys_mono
    };

    let mic_resampled = if state.mic_sample_rate != output_rate && !mic_mono.is_empty() {
        let mut resampler = ChunkResampler::new(state.mic_sample_rate, output_rate);
        resampler.process(&mic_mono)
    } else {
        mic_mono
    };

    let wav_bytes = encode_mixed_wav_chunk(&sys_resampled, &mic_resampled, output_rate)?;
    if wav_bytes.is_empty() {
        return Ok(Vec::new());
    }

    log::info!(
        "Audio chunk: {:.1}s ({} samples at {}Hz)",
        sys_resampled.len().max(mic_resampled.len()) as f64 / output_rate as f64,
        sys_resampled.len().max(mic_resampled.len()),
        output_rate,
    );

    Ok(wav_bytes)
}

pub fn stop_recording() -> Result<Vec<u8>, String> {
    let mut state = {
        let mut guard = RECORDING.lock().map_err(|e| e.to_string())?;
        guard.take().ok_or("No recording in progress")?
    };

    // Signal tick thread to stop.
    if let Ok(mut flag) = state.stop_flag.lock() {
        *flag = true;
    }

    // Drop the cpal streams — this stops the audio callbacks cleanly.
    if let Some(s) = state.mic_stream.take() {
        drop(s);
    }
    if let Some(s) = state.sys_stream.take() {
        drop(s);
    }

    // Drop senders so the writer threads exit their `recv` loops.
    state.mic_sender.take();
    state.sys_sender.take();

    // Wait for writer threads to flush remaining samples to disk.
    // Join both before propagating any error so a panic in one
    // writer doesn't leave the other's PCM orphaned in %TEMP%.
    // `join_writer_and_cleanup` unlinks the corresponding PCM on
    // panic/writer error.
    let mic_result = state
        .mic_writer
        .take()
        .map(|h| join_writer_and_cleanup(h, &state.mic_temp_path, "Mic"));
    let sys_result = state
        .sys_writer
        .take()
        .map(|h| join_writer_and_cleanup(h, &state.sys_temp_path, "System"));
    if let Some(Err(e)) = mic_result {
        return Err(e);
    }
    if let Some(Err(e)) = sys_result {
        return Err(e);
    }

    // Wait for tick thread to exit (bounded — tick thread polls stop_flag).
    if let Some(h) = state.tick_handle.take() {
        let _ = h.join();
    }

    let sys_size = std::fs::metadata(&state.sys_temp_path)
        .map(|m| m.len())
        .unwrap_or(0);
    let mic_size = std::fs::metadata(&state.mic_temp_path)
        .map(|m| m.len())
        .unwrap_or(0);
    log::info!(
        "Stopping: sys PCM {:.2} MB, mic PCM {:.2} MB",
        sys_size as f64 / (1024.0 * 1024.0),
        mic_size as f64 / (1024.0 * 1024.0),
    );

    let wav_path = mix_to_wav(
        &state.sys_temp_path,
        state.sys_sample_rate,
        state.sys_channels,
        &state.mic_temp_path,
        state.mic_sample_rate,
        state.mic_channels,
    );

    // Clean up temp PCM files whether the mix succeeded or not.
    let _ = std::fs::remove_file(&state.sys_temp_path);
    let _ = std::fs::remove_file(&state.mic_temp_path);

    // Read the mixed WAV into memory and delete the file so nothing
    // lingers in `%TEMP%` after the TS side consumes the bytes.
    wav_path.and_then(|p| read_and_remove_file(&p))
}

// ── Helpers ────────────────────────────────────────────────────────

/// Build a cpal input stream that converts the device's native sample format
/// to `Vec<f32>` and pushes each callback's samples through the channel.
///
/// Also computes per-callback RMS into `rms_level` when provided (only the
/// mic stream needs this for the UI waveform on the ribbon bar).
fn build_input_stream(
    device: &cpal::Device,
    config: &StreamConfig,
    sample_format: SampleFormat,
    sender: mpsc::SyncSender<Vec<f32>>,
    rms_level: Option<Arc<Mutex<f32>>>,
) -> Result<Stream, cpal::BuildStreamError> {
    let err_cb = |err| log::warn!("cpal stream error: {err}");

    match sample_format {
        SampleFormat::F32 => {
            let rms = rms_level;
            device.build_input_stream(
                config,
                move |data: &[f32], _| {
                    if let Some(ref r) = rms {
                        let sum: f32 = data.iter().map(|s| s * s).sum();
                        let level = (sum / data.len().max(1) as f32).sqrt();
                        if let Ok(mut val) = r.lock() {
                            *val = level;
                        }
                    }
                    let _ = sender.try_send(data.to_vec());
                },
                err_cb,
                None,
            )
        }
        SampleFormat::I16 => {
            let rms = rms_level;
            device.build_input_stream(
                config,
                move |data: &[i16], _| {
                    let floats: Vec<f32> = data.iter().map(|s| *s as f32 / 32768.0).collect();
                    if let Some(ref r) = rms {
                        let sum: f32 = floats.iter().map(|s| s * s).sum();
                        let level = (sum / floats.len().max(1) as f32).sqrt();
                        if let Ok(mut val) = r.lock() {
                            *val = level;
                        }
                    }
                    let _ = sender.try_send(floats);
                },
                err_cb,
                None,
            )
        }
        SampleFormat::U16 => {
            let rms = rms_level;
            device.build_input_stream(
                config,
                move |data: &[u16], _| {
                    let floats: Vec<f32> = data
                        .iter()
                        .map(|s| (*s as f32 - 32768.0) / 32768.0)
                        .collect();
                    if let Some(ref r) = rms {
                        let sum: f32 = floats.iter().map(|s| s * s).sum();
                        let level = (sum / floats.len().max(1) as f32).sqrt();
                        if let Ok(mut val) = r.lock() {
                            *val = level;
                        }
                    }
                    let _ = sender.try_send(floats);
                },
                err_cb,
                None,
            )
        }
        other => Err(cpal::BuildStreamError::StreamConfigNotSupported)
            .map_err(|_| {
                log::error!("Unsupported sample format: {other:?}");
                cpal::BuildStreamError::StreamConfigNotSupported
            }),
    }
}

/// Emit `meeting-recording-tick` events at ~15 fps so the ribbon waveform
/// stays smooth and the elapsed counter keeps up. Matches the macOS tick
/// payload `(elapsed_secs: u64, level: f32)` where `level` is
/// `max(sys_rms, mic_rms)` — so a quiet user + loud meeting audio (or vice
/// versa) still drives the waveform.
fn spawn_tick_thread(
    app_handle: tauri::AppHandle,
    stop_flag: Arc<Mutex<bool>>,
    mic_rms: Arc<Mutex<f32>>,
    sys_rms: Arc<Mutex<f32>>,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let start = Instant::now();
        let interval = Duration::from_millis(66); // ~15 fps
        loop {
            thread::sleep(interval);
            if let Ok(flag) = stop_flag.lock() {
                if *flag {
                    break;
                }
            }
            let elapsed = start.elapsed().as_secs();
            let mic_level = mic_rms.lock().map(|v| *v).unwrap_or(0.0);
            let sys_level = sys_rms.lock().map(|v| *v).unwrap_or(0.0);
            let level = sys_level.max(mic_level);
            let _ = app_handle.emit("meeting-recording-tick", (elapsed, level));
        }
    })
}
