use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use screencapturekit::cm::CMSampleBuffer;
use screencapturekit::prelude::*;
use screencapturekit::stream::configuration::audio::{AudioChannelCount, AudioSampleRate};
use screencapturekit::stream::output_type::SCStreamOutputType;

use tauri::Emitter;

const SAMPLE_RATE: u32 = 16_000;
const CHANNELS: u16 = 1;

struct RecordingState {
    stream: SCStream,
    samples: Arc<Mutex<Vec<f32>>>,
    /// Flag to signal the timer thread to stop
    stop_flag: Arc<Mutex<bool>>,
}

// Safety: SCStream uses Objective-C objects that are thread-safe.
// The stream is only started/stopped from the main thread via Tauri commands,
// and the Mutex provides interior synchronization.
unsafe impl Send for RecordingState {}

static RECORDING: Mutex<Option<RecordingState>> = Mutex::new(None);

/// Check if the current macOS version supports meeting recording (macOS 15.0+).
pub fn check_support() -> Result<bool, String> {
    use objc2_foundation::NSProcessInfo;

    let info = NSProcessInfo::processInfo();
    let version = info.operatingSystemVersion();
    Ok(version.majorVersion >= 15)
}

/// Start a meeting recording that captures system audio + microphone.
pub fn start_recording(app_handle: tauri::AppHandle) -> Result<(), String> {
    // Ensure no recording is already in progress
    {
        let guard = RECORDING.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Err("Recording already in progress".into());
        }
    }

    // Get the primary display for the content filter
    let content = SCShareableContent::get().map_err(|e| format!("Failed to get shareable content: {e}"))?;
    let displays = content.displays();
    let display = displays.first().ok_or("No display found")?;

    // Create filter: capture entire display (we only want audio, video is minimized)
    let filter = SCContentFilter::create()
        .with_display(display)
        .with_excluding_windows(&[])
        .build();

    // Configure stream: audio-only capture with microphone mixing
    let config = SCStreamConfiguration::new()
        .with_captures_audio(true)
        .with_captures_microphone(true)
        .with_excludes_current_process_audio(false)
        .with_sample_rate(AudioSampleRate::Rate16000)
        .with_channel_count(AudioChannelCount::Mono)
        // Minimize video capture (required by ScreenCaptureKit but we don't need it)
        .with_width(2)
        .with_height(2);

    let samples: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let samples_clone = Arc::clone(&samples);

    // Create stream and add audio handler
    let mut stream = SCStream::new(&filter, &config);

    stream.add_output_handler(
        move |sample: CMSampleBuffer, of_type: SCStreamOutputType| {
            if of_type != SCStreamOutputType::Audio {
                return;
            }
            if let Some(audio_buffer_list) = sample.audio_buffer_list() {
                for buf in &audio_buffer_list {
                    let data = buf.data();
                    // ScreenCaptureKit delivers audio as 32-bit float PCM
                    let float_samples: &[f32] = unsafe {
                        std::slice::from_raw_parts(
                            data.as_ptr().cast::<f32>(),
                            data.len() / std::mem::size_of::<f32>(),
                        )
                    };
                    if let Ok(mut guard) = samples_clone.lock() {
                        guard.extend_from_slice(float_samples);
                    }
                }
            }
        },
        SCStreamOutputType::Audio,
    );

    stream
        .start_capture()
        .map_err(|e| format!("Failed to start capture: {e}"))?;

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
        stream,
        samples,
        stop_flag,
    });

    Ok(())
}

/// Stop the meeting recording and return the path to the WAV file.
pub fn stop_recording() -> Result<String, String> {
    let state = {
        let mut guard = RECORDING.lock().map_err(|e| e.to_string())?;
        guard.take().ok_or("No recording in progress")?
    };

    // Signal timer thread to stop
    if let Ok(mut flag) = state.stop_flag.lock() {
        *flag = true;
    }

    // Stop the capture stream
    state
        .stream
        .stop_capture()
        .map_err(|e| format!("Failed to stop capture: {e}"))?;

    // Collect all samples
    let samples = state
        .samples
        .lock()
        .map_err(|e| e.to_string())?
        .clone();

    if samples.is_empty() {
        return Err("No audio data captured".into());
    }

    // Write WAV file to temp directory
    let temp_dir = std::env::temp_dir();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let wav_path = temp_dir.join(format!("notesync_meeting_{timestamp}.wav"));

    let spec = hound::WavSpec {
        channels: CHANNELS,
        sample_rate: SAMPLE_RATE,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let mut writer = hound::WavWriter::create(&wav_path, spec)
        .map_err(|e| format!("Failed to create WAV file: {e}"))?;

    for &sample in &samples {
        // Clamp f32 to [-1.0, 1.0] and convert to i16
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
