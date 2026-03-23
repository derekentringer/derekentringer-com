use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use objc2::AnyThread;
use tauri::Emitter;

struct RecordingState {
    system_stream: cpal::Stream,
    mic_stream: cpal::Stream,
    system_samples: Arc<Mutex<Vec<f32>>>,
    mic_samples: Arc<Mutex<Vec<f32>>>,
    system_sample_rate: u32,
    mic_sample_rate: u32,
    system_channels: u16,
    mic_channels: u16,
    /// Flag to signal the timer thread to stop
    stop_flag: Arc<Mutex<bool>>,
}

// Safety: cpal::Stream uses Core Audio objects that are thread-safe.
// The streams are only started/stopped from the main thread via Tauri commands,
// and the Mutex provides interior synchronization for sample buffers.
unsafe impl Send for RecordingState {}

static RECORDING: Mutex<Option<RecordingState>> = Mutex::new(None);

/// Convert interleaved multi-channel samples to mono by averaging across channels.
fn to_mono(samples: &[f32], channels: u16) -> Vec<f32> {
    if channels <= 1 {
        return samples.to_vec();
    }
    let ch = channels as usize;
    samples
        .chunks_exact(ch)
        .map(|frame| frame.iter().sum::<f32>() / ch as f32)
        .collect()
}

/// Resample audio using linear interpolation.
fn resample(samples: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    if from_rate == to_rate || samples.is_empty() {
        return samples.to_vec();
    }
    let ratio = from_rate as f64 / to_rate as f64;
    let out_len = ((samples.len() as f64) / ratio).ceil() as usize;
    let mut out = Vec::with_capacity(out_len);
    for i in 0..out_len {
        let src_idx = i as f64 * ratio;
        let idx0 = src_idx.floor() as usize;
        let idx1 = (idx0 + 1).min(samples.len() - 1);
        let frac = (src_idx - idx0 as f64) as f32;
        out.push(samples[idx0] * (1.0 - frac) + samples[idx1] * frac);
    }
    out
}

/// Mix two buffers by averaging. Pads the shorter buffer with zeros.
fn mix(a: &[f32], b: &[f32]) -> Vec<f32> {
    let len = a.len().max(b.len());
    let mut out = Vec::with_capacity(len);
    for i in 0..len {
        let sa = if i < a.len() { a[i] } else { 0.0 };
        let sb = if i < b.len() { b[i] } else { 0.0 };
        out.push((sa + sb) * 0.5);
    }
    out
}

/// Request microphone permission upfront via AVCaptureDevice so macOS shows
/// a single permission dialog instead of one per cpal audio operation.
fn request_microphone_permission() -> Result<(), String> {
    use objc2_foundation::NSString;

    // Ensure AVFoundation framework is linked so AVCaptureDevice is available
    #[link(name = "AVFoundation", kind = "framework")]
    extern "C" {}

    let cls = objc2::runtime::AnyClass::get(c"AVCaptureDevice")
        .ok_or("AVCaptureDevice class not found")?;
    // AVMediaTypeAudio = "soun" (FourCC)
    let media_type = NSString::from_str("soun");

    // AVAuthorizationStatus: 0=notDetermined, 1=restricted, 2=denied, 3=authorized
    let status: isize =
        unsafe { objc2::msg_send![cls, authorizationStatusForMediaType: &*media_type] };

    match status {
        3 => Ok(()), // Already authorized
        1 => Err("Microphone access is restricted on this device.".into()),
        2 => Err(
            "Microphone access denied. Enable in System Settings > Privacy & Security > Microphone."
                .into(),
        ),
        0 => {
            // Not yet determined — request access and block until the user responds
            let (tx, rx) = std::sync::mpsc::channel();
            let block = block2::RcBlock::new(move |granted: objc2::runtime::Bool| {
                let _ = tx.send(granted.as_bool());
            });
            unsafe {
                let _: () = objc2::msg_send![
                    cls,
                    requestAccessForMediaType: &*media_type,
                    completionHandler: &*block
                ];
            }
            let granted = rx
                .recv()
                .map_err(|e| format!("Permission request failed: {e}"))?;
            if granted {
                Ok(())
            } else {
                Err("Microphone permission was denied.".into())
            }
        }
        _ => Ok(()), // Unknown status — try to proceed
    }
}

/// Request system audio recording permission by creating a minimal Core Audio Tap.
/// The first tap creation triggers macOS's "System Audio Recording" dialog.
/// We retry in a loop until the user grants permission.
fn request_system_audio_permission() -> Result<(), String> {
    use objc2_core_audio::{
        AudioHardwareCreateProcessTap, AudioHardwareDestroyProcessTap, CATapDescription,
    };
    use objc2_foundation::{NSArray, NSNumber};

    let empty_processes: objc2::rc::Retained<NSArray<NSNumber>> = NSArray::new();

    let tap_desc = unsafe {
        CATapDescription::initStereoGlobalTapButExcludeProcesses(
            CATapDescription::alloc(),
            &empty_processes,
        )
    };

    // Try creating a process tap — this triggers the System Audio Recording dialog
    // on first use. The API returns immediately; if permission hasn't been granted yet,
    // it returns a non-zero OSStatus. We retry until the user grants permission.
    for attempt in 0..30 {
        let mut tap_id: objc2_core_audio::AudioObjectID = 0;
        let status =
            unsafe { AudioHardwareCreateProcessTap(Some(&tap_desc), &mut tap_id as *mut _) };

        if status == 0 {
            // Permission granted — clean up the tap and proceed
            unsafe {
                AudioHardwareDestroyProcessTap(tap_id);
            }
            if attempt > 0 {
                log::info!("System audio permission granted after {attempt} retries");
            }
            return Ok(());
        }

        if attempt == 0 {
            log::info!(
                "System audio permission not yet granted (status={status}), \
                 waiting for user to allow..."
            );
        }
        std::thread::sleep(Duration::from_secs(1));
    }

    Err(
        "System Audio Recording permission not granted. Please allow in \
         System Settings > Privacy & Security and try again."
            .into(),
    )
}

/// Check if the current macOS version supports meeting recording (macOS 14.2+).
/// Core Audio Taps require macOS 14.2 or later.
pub fn check_support() -> Result<bool, String> {
    use objc2_foundation::NSProcessInfo;

    let info = NSProcessInfo::processInfo();
    let version = info.operatingSystemVersion();
    let supported = version.majorVersion > 14
        || (version.majorVersion == 14 && version.minorVersion >= 2);
    Ok(supported)
}

/// Start a meeting recording that captures system audio + microphone.
///
/// Uses cpal's Core Audio Tap loopback to capture system audio output,
/// and a standard input stream for the microphone. Both streams collect
/// f32 PCM samples into separate buffers for mixing at stop time.
pub fn start_recording(app_handle: tauri::AppHandle) -> Result<(), String> {
    // Ensure no recording is already in progress
    {
        let guard = RECORDING.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Err("Recording already in progress".into());
        }
    }

    // Request both permissions upfront so macOS shows exactly one dialog per
    // permission type. Without this, each cpal internal operation independently
    // triggers the dialog, resulting in many stacked prompts.
    request_microphone_permission()?;
    request_system_audio_permission()?;

    let host = cpal::default_host();

    // Microphone — build first since mic permission is already confirmed
    let input_device = host
        .default_input_device()
        .ok_or("No default input device found")?;
    let mic_config = input_device
        .default_input_config()
        .map_err(|e| format!("Failed to get input device config: {e}"))?;
    let mic_sample_rate = mic_config.sample_rate();
    let mic_channels = mic_config.channels();

    let mic_samples: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let mic_samples_clone = Arc::clone(&mic_samples);

    let mic_stream = input_device
        .build_input_stream(
            &mic_config.into(),
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                if let Ok(mut guard) = mic_samples_clone.lock() {
                    guard.extend_from_slice(data);
                }
            },
            |err| {
                log::error!("Microphone stream error: {err}");
            },
            None,
        )
        .map_err(|e| format!("Failed to build microphone stream: {e}"))?;

    // System audio (loopback) — permission already confirmed via tap pre-request
    let output_device = host
        .default_output_device()
        .ok_or("No default output device found")?;
    let system_config = output_device
        .default_output_config()
        .map_err(|e| format!("Failed to get output device config: {e}"))?;
    let system_sample_rate = system_config.sample_rate();
    let system_channels = system_config.channels();

    let system_samples: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let system_samples_clone = Arc::clone(&system_samples);

    let system_stream = output_device
        .build_input_stream(
            &system_config.into(),
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                if let Ok(mut guard) = system_samples_clone.lock() {
                    guard.extend_from_slice(data);
                }
            },
            |err| {
                log::error!("System audio stream error: {err}");
            },
            None,
        )
        .map_err(|e| format!("Failed to build system audio stream: {e}"))?;

    // Start both streams
    mic_stream
        .play()
        .map_err(|e| format!("Failed to start microphone stream: {e}"))?;
    system_stream
        .play()
        .map_err(|e| format!("Failed to start system audio stream: {e}"))?;

    log::info!("Meeting recording started (Core Audio Tap via cpal)");
    log::info!(
        "System audio: {}Hz {}ch, Microphone: {}Hz {}ch",
        system_sample_rate,
        system_channels,
        mic_sample_rate,
        mic_channels
    );

    // Spawn a timer thread that emits ticks to the frontend every second
    let stop_flag = Arc::new(Mutex::new(false));
    let stop_flag_clone = Arc::clone(&stop_flag);

    thread::spawn(move || {
        let mut elapsed_secs: u64 = 0;
        loop {
            thread::sleep(Duration::from_secs(1));
            if let Ok(stopped) = stop_flag_clone.lock() {
                if *stopped {
                    break;
                }
            }
            elapsed_secs += 1;
            let _ = app_handle.emit("meeting-recording-tick", elapsed_secs);
        }
    });

    // Store recording state
    let mut guard = RECORDING.lock().map_err(|e| e.to_string())?;
    *guard = Some(RecordingState {
        system_stream,
        mic_stream,
        system_samples,
        mic_samples,
        system_sample_rate,
        mic_sample_rate,
        system_channels,
        mic_channels,
        stop_flag,
    });

    Ok(())
}

/// Stop the meeting recording and return the path to the WAV file.
///
/// Drops both cpal streams, converts to mono, resamples mic to match system
/// audio sample rate if needed, mixes both buffers, and writes a WAV file.
pub fn stop_recording() -> Result<String, String> {
    let state = {
        let mut guard = RECORDING.lock().map_err(|e| e.to_string())?;
        guard.take().ok_or("No recording in progress")?
    };

    // Signal timer thread to stop
    if let Ok(mut flag) = state.stop_flag.lock() {
        *flag = true;
    }

    // Drop streams to stop capture
    drop(state.system_stream);
    drop(state.mic_stream);

    // Collect samples from both buffers
    let system_raw = state
        .system_samples
        .lock()
        .map_err(|e| e.to_string())?
        .clone();
    let mic_raw = state
        .mic_samples
        .lock()
        .map_err(|e| e.to_string())?
        .clone();

    if system_raw.is_empty() && mic_raw.is_empty() {
        return Err("No audio data captured. Please check that NoteSync has System Audio Recording permission in System Settings > Privacy & Security.".into());
    }

    // Convert both to mono
    let system_mono = to_mono(&system_raw, state.system_channels);
    let mic_mono = to_mono(&mic_raw, state.mic_channels);

    // Resample mic to match system audio sample rate if they differ
    let mic_resampled = resample(&mic_mono, state.mic_sample_rate, state.system_sample_rate);

    // Mix both buffers
    let mixed = mix(&system_mono, &mic_resampled);

    log::info!(
        "Recording stopped: system={} samples, mic={} samples, mixed={} samples at {}Hz",
        system_mono.len(),
        mic_resampled.len(),
        mixed.len(),
        state.system_sample_rate
    );

    // Write WAV file to temp directory
    let temp_dir = std::env::temp_dir();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let wav_path = temp_dir.join(format!("notesync_meeting_{timestamp}.wav"));

    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: state.system_sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let mut writer = hound::WavWriter::create(&wav_path, spec)
        .map_err(|e| format!("Failed to create WAV file: {e}"))?;

    for &sample in &mixed {
        let clamped = sample.clamp(-1.0, 1.0);
        let value = (clamped * 32767.0) as i16;
        writer
            .write_sample(value)
            .map_err(|e| format!("Failed to write sample: {e}"))?;
    }

    writer
        .finalize()
        .map_err(|e| format!("Failed to finalize WAV: {e}"))?;

    Ok(wav_path.to_string_lossy().into_owned())
}
