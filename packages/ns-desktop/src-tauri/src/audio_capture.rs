use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use coreaudio::audio_unit::AudioUnit;
use objc2::AnyThread;
use tauri::Emitter;

use crate::audio_capture_shared::{
    encode_mixed_wav_chunk, mix_to_wav, read_pcm_since, spawn_writer_thread, to_mono,
    ChunkResampler,
};

struct RecordingState {
    system_audio_unit: AudioUnit,
    mic_audio_unit: AudioUnit,
    system_sender: Option<mpsc::SyncSender<Vec<f32>>>,
    mic_sender: Option<mpsc::SyncSender<Vec<f32>>>,
    system_writer: Option<thread::JoinHandle<Result<(), String>>>,
    mic_writer: Option<thread::JoinHandle<Result<(), String>>>,
    system_temp_path: PathBuf,
    mic_temp_path: PathBuf,
    system_sample_rate: u32,
    mic_sample_rate: u32,
    system_channels: u16,
    mic_channels: u16,
    tap_id: u32,
    aggregate_device_id: u32,
    stop_flag: Arc<Mutex<bool>>,
    /// Track how far we've read for chunked export (byte offset into each PCM file)
    sys_chunk_read_pos: u64,
    mic_chunk_read_pos: u64,
}

unsafe impl Send for RecordingState {}

static RECORDING: Mutex<Option<RecordingState>> = Mutex::new(None);

fn request_microphone_permission() -> Result<(), String> {
    use objc2_foundation::NSString;

    #[link(name = "AVFoundation", kind = "framework")]
    extern "C" {}

    let cls = objc2::runtime::AnyClass::get(c"AVCaptureDevice")
        .ok_or("AVCaptureDevice class not found")?;
    let media_type = NSString::from_str("soun");

    let status: isize =
        unsafe { objc2::msg_send![cls, authorizationStatusForMediaType: &*media_type] };

    log::info!("Microphone authorization status: {} (0=notDetermined, 1=restricted, 2=denied, 3=authorized)", status);

    match status {
        3 => Ok(()),
        1 => Err("Microphone access is restricted on this device.".into()),
        2 => Err(
            "Microphone access denied. Enable in System Settings > Privacy & Security > Microphone."
                .into(),
        ),
        0 => {
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
        _ => Ok(()),
    }
}

/// Pre-request system audio recording permission by creating a minimal process tap.
/// This triggers the macOS "System Audio Recording" TCC dialog on first use.
/// Once granted, the tap is destroyed — the real tap is created later in start_recording.
fn request_system_audio_permission() -> Result<(), String> {
    use objc2_core_audio::*;
    use objc2_foundation::{NSArray, NSNumber};

    // Create a minimal global stereo tap (no specific device) just to trigger the permission dialog
    let empty_processes: objc2::rc::Retained<NSArray<NSNumber>> = NSArray::new();
    let tap_desc = unsafe {
        CATapDescription::initStereoGlobalTapButExcludeProcesses(
            CATapDescription::alloc(),
            &empty_processes,
        )
    };

    for attempt in 0..30 {
        let mut tap_id: AudioObjectID = 0;
        let status =
            unsafe { AudioHardwareCreateProcessTap(Some(&tap_desc), &mut tap_id as *mut _) };

        if status == 0 {
            // Permission granted — destroy the minimal tap immediately
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
        thread::sleep(Duration::from_secs(1));
    }

    Err(
        "System Audio Recording permission not granted. Please allow in \
         System Settings > Privacy & Security and try again."
            .into(),
    )
}

/// Get the nominal sample rate of a Core Audio device.
fn get_device_sample_rate(device_id: u32) -> Result<f64, String> {
    use objc2_core_audio::*;
    use std::ptr::NonNull;

    let address = AudioObjectPropertyAddress {
        mSelector: kAudioDevicePropertyNominalSampleRate,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain,
    };

    let mut sample_rate: f64 = 0.0;
    let mut size = std::mem::size_of::<f64>() as u32;

    let status = unsafe {
        AudioObjectGetPropertyData(
            device_id,
            NonNull::from(&address),
            0,
            std::ptr::null(),
            NonNull::new_unchecked(&mut size),
            NonNull::new_unchecked(&mut sample_rate as *mut _ as *mut _),
        )
    };

    if status != 0 {
        return Err(format!("Failed to get sample rate (status={status})"));
    }
    Ok(sample_rate)
}

/// Get channel count for a device (input or output scope).
fn get_device_channels(device_id: u32, input: bool) -> Result<u16, String> {
    use objc2_core_audio::*;
    use std::ptr::NonNull;

    let address = AudioObjectPropertyAddress {
        mSelector: kAudioDevicePropertyStreamConfiguration,
        mScope: if input {
            kAudioObjectPropertyScopeInput
        } else {
            kAudioObjectPropertyScopeOutput
        },
        mElement: kAudioObjectPropertyElementMain,
    };

    let mut size: u32 = 0;
    let status = unsafe {
        AudioObjectGetPropertyDataSize(
            device_id,
            NonNull::from(&address),
            0,
            std::ptr::null(),
            NonNull::new_unchecked(&mut size),
        )
    };
    if status != 0 {
        return Err(format!("Failed to get stream config size (status={status})"));
    }

    let mut buf = vec![0u8; size as usize];
    let status = unsafe {
        AudioObjectGetPropertyData(
            device_id,
            NonNull::from(&address),
            0,
            std::ptr::null(),
            NonNull::new_unchecked(&mut size),
            NonNull::new_unchecked(buf.as_mut_ptr() as *mut _),
        )
    };
    if status != 0 {
        return Err(format!("Failed to get stream config (status={status})"));
    }

    // AudioBufferList: u32 mNumberBuffers, then AudioBuffer structs
    // AudioBuffer: u32 mNumberChannels, u32 mDataByteSize, *mut c_void mData
    let num_buffers = u32::from_ne_bytes(buf[0..4].try_into().unwrap());
    let mut total_channels: u32 = 0;
    for i in 0..num_buffers as usize {
        let offset = 4 + i * (4 + 4 + 8);
        if offset + 4 <= buf.len() {
            let channels = u32::from_ne_bytes(buf[offset..offset + 4].try_into().unwrap());
            total_channels += channels;
        }
    }
    Ok(total_channels.max(1) as u16)
}

// Raw C declaration for aggregate device creation — avoids needing objc2_core_foundation as a direct dep.
// CFDictionaryRef is just *const c_void at the C level.
extern "C" {
    fn AudioHardwareCreateAggregateDevice(
        in_description: *const std::ffi::c_void,
        out_device_id: *mut u32,
    ) -> i32;

    fn AudioHardwareDestroyAggregateDevice(in_device_id: u32) -> i32;
}

/// Create a Core Audio process tap. Returns (tap_id, tap_uuid_cfstring).
/// This triggers the "System Audio Recording" permission dialog on first use.
fn create_process_tap(
    output_device_uid: &objc2_foundation::NSString,
) -> Result<(u32, core_foundation::string::CFString), String> {
    use objc2_core_audio::*;
    use objc2_foundation::{NSArray, NSNumber};

    let empty_processes: objc2::rc::Retained<NSArray<NSNumber>> = NSArray::new();

    let tap_desc = unsafe {
        CATapDescription::initWithProcesses_andDeviceUID_withStream(
            CATapDescription::alloc(),
            &empty_processes,
            output_device_uid,
            0,
        )
    };

    unsafe {
        tap_desc.setMuteBehavior(CATapMuteBehavior::Unmuted);
        tap_desc.setPrivate(true);
        tap_desc.setExclusive(true);
    }

    for attempt in 0..30 {
        let mut tap_id: AudioObjectID = 0;
        let status =
            unsafe { AudioHardwareCreateProcessTap(Some(&tap_desc), &mut tap_id as *mut _) };

        if status == 0 {
            // Get the tap's UUID as a string
            let uuid_nsstring = unsafe { tap_desc.UUID().UUIDString() };
            let uuid_str = uuid_nsstring.to_string();
            let uuid_cfstring = core_foundation::string::CFString::new(&uuid_str);

            if attempt > 0 {
                log::info!("System audio permission granted after {attempt} retries");
            }
            return Ok((tap_id, uuid_cfstring));
        }

        if attempt == 0 {
            log::info!(
                "System audio permission not yet granted (status={status}), \
                 waiting for user to allow..."
            );
        }
        thread::sleep(Duration::from_secs(1));
    }

    Err(
        "System Audio Recording permission not granted. Please allow in \
         System Settings > Privacy & Security and try again."
            .into(),
    )
}

/// Create an aggregate device wrapping a process tap.
fn create_aggregate_device(tap_uuid: &core_foundation::string::CFString) -> Result<u32, String> {
    use core_foundation::base::TCFType;
    use core_foundation::boolean::CFBoolean;
    use core_foundation::dictionary::CFMutableDictionary;
    use core_foundation::string::CFString;
    use objc2_core_audio::{
        kAudioAggregateDeviceNameKey, kAudioAggregateDeviceTapAutoStartKey,
        kAudioAggregateDeviceTapListKey, kAudioAggregateDeviceUIDKey,
        kAudioEndPointDeviceIsPrivateKey, kAudioSubTapDriftCompensationKey, kAudioSubTapUIDKey,
    };

    unsafe {
        let mut desc = CFMutableDictionary::new();

        desc.set(
            CFString::new(kAudioAggregateDeviceNameKey.to_str().unwrap()).as_CFType(),
            CFString::new("NoteSync loopback aggregate device").as_CFType(),
        );
        desc.set(
            CFString::new(kAudioAggregateDeviceUIDKey.to_str().unwrap()).as_CFType(),
            CFString::new("com.derekentringer.notesync.aggregate").as_CFType(),
        );

        let mut sub_tap = CFMutableDictionary::new();
        sub_tap.set(
            CFString::new(kAudioSubTapUIDKey.to_str().unwrap()).as_CFType(),
            tap_uuid.as_CFType(),
        );
        sub_tap.set(
            CFString::new(kAudioSubTapDriftCompensationKey.to_str().unwrap()).as_CFType(),
            CFBoolean::true_value().as_CFType(),
        );

        let tap_list = core_foundation::array::CFArray::from_CFTypes(&[sub_tap.as_CFType()]);

        desc.set(
            CFString::new(kAudioAggregateDeviceTapListKey.to_str().unwrap()).as_CFType(),
            tap_list.as_CFType(),
        );
        desc.set(
            CFString::new(kAudioAggregateDeviceTapAutoStartKey.to_str().unwrap()).as_CFType(),
            CFBoolean::false_value().as_CFType(),
        );
        desc.set(
            CFString::new(kAudioEndPointDeviceIsPrivateKey.to_str().unwrap()).as_CFType(),
            CFBoolean::true_value().as_CFType(),
        );

        // Use raw FFI — CFDictionaryRef is *const c_void at the C level
        let raw_dict_ref = desc.as_concrete_TypeRef() as *const std::ffi::c_void;

        let mut aggregate_device_id: u32 = 0;
        let status =
            AudioHardwareCreateAggregateDevice(raw_dict_ref, &mut aggregate_device_id);

        if status != 0 {
            return Err(format!(
                "Failed to create aggregate device (status={status})"
            ));
        }

        Ok(aggregate_device_id)
    }
}

/// Set up an AudioUnit for input from the given device ID.
/// Audio samples are sent via the channel sender instead of accumulated in memory.
fn setup_input_audio_unit(
    device_id: u32,
    sample_rate: f64,
    channels: u16,
    sender: mpsc::SyncSender<Vec<f32>>,
    rms_level: Option<Arc<Mutex<f32>>>,
) -> Result<AudioUnit, String> {
    use coreaudio::audio_unit::audio_format::LinearPcmFlags;
    use coreaudio::audio_unit::render_callback;
    use coreaudio::audio_unit::{Element, SampleFormat, Scope, StreamFormat};

    // Create AudioUnit configured for input from this device
    let mut audio_unit = coreaudio::audio_unit::macos_helpers::audio_unit_from_device_id(
        device_id, true,
    )
    .map_err(|e| format!("Failed to create AudioUnit: {e}"))?;

    // Set stream format to f32 interleaved
    let stream_format = StreamFormat {
        sample_rate,
        sample_format: SampleFormat::F32,
        flags: LinearPcmFlags::IS_FLOAT | LinearPcmFlags::IS_PACKED,
        channels: channels as u32,
    };

    audio_unit
        .set_stream_format(stream_format, Scope::Output, Element::Input)
        .map_err(|e| format!("Failed to set stream format: {e}"))?;

    // Register input callback — sends samples to writer thread via channel
    type Args = render_callback::Args<render_callback::data::Interleaved<f32>>;
    audio_unit
        .set_input_callback(move |args: Args| {
            let buf = args.data.buffer;
            if let Some(ref rms) = rms_level {
                let sum: f32 = buf.iter().map(|s| s * s).sum();
                let level = (sum / buf.len().max(1) as f32).sqrt();
                if let Ok(mut val) = rms.lock() {
                    *val = level;
                }
            }
            let _ = sender.try_send(buf.to_vec());
            Ok(())
        })
        .map_err(|e| format!("Failed to set input callback: {e}"))?;

    audio_unit
        .start()
        .map_err(|e| format!("Failed to start AudioUnit: {e}"))?;

    Ok(audio_unit)
}

pub fn check_support() -> Result<bool, String> {
    use objc2_foundation::NSProcessInfo;

    let info = NSProcessInfo::processInfo();
    let version = info.operatingSystemVersion();
    let supported = version.majorVersion > 14
        || (version.majorVersion == 14 && version.minorVersion >= 2);
    Ok(supported)
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
    let system_temp_path = temp_dir.join(format!("notesync_sys_{timestamp}.pcm"));
    let mic_temp_path = temp_dir.join(format!("notesync_mic_{timestamp}.pcm"));

    // Step 1: Pre-request ALL permissions before any HAL operations.
    // This ensures exactly 2 dialogs on first use, 0 on subsequent uses.
    request_microphone_permission()?;
    log::info!("Microphone permission granted");
    thread::sleep(Duration::from_millis(500));

    request_system_audio_permission()?;
    log::info!("System audio permission granted");
    thread::sleep(Duration::from_millis(500));

    // Step 2: Set up microphone capture with disk streaming (no dialog — permission already granted)
    let mic_device_id = coreaudio::audio_unit::macos_helpers::get_default_device_id(true)
        .ok_or("No default input device found")?;
    let mic_sample_rate = get_device_sample_rate(mic_device_id)?;
    let mic_channels = get_device_channels(mic_device_id, true)?;

    let (mic_tx, mic_rx) = mpsc::sync_channel::<Vec<f32>>(128);
    let mic_writer = spawn_writer_thread(mic_temp_path.clone(), mic_rx);

    let mic_rms = Arc::new(Mutex::new(0.0f32));
    let mic_audio_unit = setup_input_audio_unit(
        mic_device_id,
        mic_sample_rate,
        mic_channels,
        mic_tx.clone(),
        Some(Arc::clone(&mic_rms)),
    )?;
    log::info!(
        "Mic capture started: {}Hz {}ch (streaming to disk)",
        mic_sample_rate,
        mic_channels
    );

    // Step 3: Create system audio tap (no dialog — permission already pre-requested)
    let output_device_id = coreaudio::audio_unit::macos_helpers::get_default_device_id(false)
        .ok_or("No default output device found")?;
    let output_device_uid = {
        use objc2_core_audio::*;
        use std::ptr::NonNull;

        let address = AudioObjectPropertyAddress {
            mSelector: kAudioDevicePropertyDeviceUID,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain,
        };

        let mut uid_ref: *const std::ffi::c_void = std::ptr::null();
        let mut size = std::mem::size_of::<*const std::ffi::c_void>() as u32;

        let status = unsafe {
            AudioObjectGetPropertyData(
                output_device_id,
                NonNull::from(&address),
                0,
                std::ptr::null(),
                NonNull::new_unchecked(&mut size),
                NonNull::new_unchecked(&mut uid_ref as *mut _ as *mut _),
            )
        };

        if status != 0 {
            return Err(format!(
                "Failed to get output device UID (status={status})"
            ));
        }

        let ns_str: &objc2_foundation::NSString =
            unsafe { &*(uid_ref as *const objc2_foundation::NSString) };
        ns_str.to_string()
    };

    let output_uid_nsstring = objc2_foundation::NSString::from_str(&output_device_uid);
    let system_sample_rate = get_device_sample_rate(output_device_id)?;

    let (tap_id, tap_uuid) = create_process_tap(&output_uid_nsstring)?;
    log::info!("System audio tap created (tap_id={})", tap_id);

    // Step 4: Create aggregate device (no dialog — permission already granted)
    let aggregate_device_id = create_aggregate_device(&tap_uuid)?;
    log::info!("Aggregate device created (id={})", aggregate_device_id);

    let system_channels = get_device_channels(aggregate_device_id, true).unwrap_or(2);

    // Step 5: Set up system audio capture with disk streaming
    let (sys_tx, sys_rx) = mpsc::sync_channel::<Vec<f32>>(128);
    let sys_writer = spawn_writer_thread(system_temp_path.clone(), sys_rx);

    let audio_rms = Arc::new(Mutex::new(0.0f32));
    let system_audio_unit = setup_input_audio_unit(
        aggregate_device_id,
        system_sample_rate,
        system_channels,
        sys_tx.clone(),
        Some(Arc::clone(&audio_rms)),
    )?;
    log::info!(
        "System audio capture started: {}Hz {}ch (streaming to disk)",
        system_sample_rate,
        system_channels
    );

    // Step 6: Timer thread
    let stop_flag = Arc::new(Mutex::new(false));
    let stop_flag_clone = Arc::clone(&stop_flag);
    let sys_rms_for_tick = Arc::clone(&audio_rms);
    let mic_rms_for_tick = Arc::clone(&mic_rms);

    thread::spawn(move || {
        let mut tick_count: u64 = 0;
        let interval = Duration::from_millis(66); // ~15fps for smooth waveform
        loop {
            thread::sleep(interval);
            if let Ok(stopped) = stop_flag_clone.lock() {
                if *stopped {
                    break;
                }
            }
            tick_count += 1;
            let elapsed_secs = (tick_count * 66) / 1000;
            let sys_level = sys_rms_for_tick.lock().map(|v| *v).unwrap_or(0.0);
            let mic_level = mic_rms_for_tick.lock().map(|v| *v).unwrap_or(0.0);
            let level = sys_level.max(mic_level);
            let _ = app_handle.emit("meeting-recording-tick", (elapsed_secs, level));
        }
    });

    let mut guard = RECORDING.lock().map_err(|e| e.to_string())?;
    *guard = Some(RecordingState {
        system_audio_unit,
        mic_audio_unit,
        system_sender: Some(sys_tx),
        mic_sender: Some(mic_tx),
        system_writer: Some(sys_writer),
        mic_writer: Some(mic_writer),
        system_temp_path,
        mic_temp_path,
        system_sample_rate: system_sample_rate as u32,
        mic_sample_rate: mic_sample_rate as u32,
        system_channels,
        mic_channels,
        tap_id,
        aggregate_device_id,
        stop_flag,
        sys_chunk_read_pos: 0,
        mic_chunk_read_pos: 0,
    });

    Ok(())
}

/// Read new audio data since the last chunk request, mix system+mic, return as WAV bytes.
/// Used for live transcription during meeting recording.
pub fn get_audio_chunk() -> Result<Vec<u8>, String> {
    let mut guard = RECORDING.lock().map_err(|e| e.to_string())?;
    let state = guard.as_mut().ok_or("No recording in progress")?;

    let output_rate: u32 = 16000;

    let sys_new = read_pcm_since(&state.system_temp_path, state.sys_chunk_read_pos)?;
    let mic_new = read_pcm_since(&state.mic_temp_path, state.mic_chunk_read_pos)?;

    state.sys_chunk_read_pos += (sys_new.len() * 4) as u64;
    state.mic_chunk_read_pos += (mic_new.len() * 4) as u64;

    if sys_new.is_empty() && mic_new.is_empty() {
        return Ok(Vec::new());
    }

    let sys_mono = to_mono(&sys_new, state.system_channels);
    let mic_mono = to_mono(&mic_new, state.mic_channels);

    let sys_resampled = if state.system_sample_rate != output_rate && !sys_mono.is_empty() {
        let mut resampler = ChunkResampler::new(state.system_sample_rate, output_rate);
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

pub fn stop_recording() -> Result<String, String> {
    let mut state = {
        let mut guard = RECORDING.lock().map_err(|e| e.to_string())?;
        guard.take().ok_or("No recording in progress")?
    };

    // Signal timer thread to stop
    if let Ok(mut flag) = state.stop_flag.lock() {
        *flag = true;
    }

    // Stop audio units first (no more samples produced)
    let mut system_au = state.system_audio_unit;
    let mut mic_au = state.mic_audio_unit;
    let _ = system_au.stop();
    let _ = mic_au.stop();
    drop(system_au);
    drop(mic_au);

    // Drop senders to signal writer threads to finish
    state.system_sender.take();
    state.mic_sender.take();

    // Wait for writer threads to flush and close files
    if let Some(handle) = state.system_writer.take() {
        handle
            .join()
            .map_err(|_| "System writer thread panicked".to_string())?
            .map_err(|e| format!("System writer error: {e}"))?;
    }
    if let Some(handle) = state.mic_writer.take() {
        handle
            .join()
            .map_err(|_| "Mic writer thread panicked".to_string())?
            .map_err(|e| format!("Mic writer error: {e}"))?;
    }

    // Destroy audio hardware
    unsafe {
        AudioHardwareDestroyAggregateDevice(state.aggregate_device_id);
        objc2_core_audio::AudioHardwareDestroyProcessTap(state.tap_id);
    }

    // Check we have data
    let sys_size = std::fs::metadata(&state.system_temp_path)
        .map(|m| m.len())
        .unwrap_or(0);
    let mic_size = std::fs::metadata(&state.mic_temp_path)
        .map(|m| m.len())
        .unwrap_or(0);

    if sys_size == 0 && mic_size == 0 {
        let _ = std::fs::remove_file(&state.system_temp_path);
        let _ = std::fs::remove_file(&state.mic_temp_path);
        return Err("No audio data captured. Please check that NoteSync has System Audio Recording permission in System Settings > Privacy & Security.".into());
    }

    log::info!(
        "Recording stopped: system={:.1}MB, mic={:.1}MB on disk. Mixing...",
        sys_size as f64 / (1024.0 * 1024.0),
        mic_size as f64 / (1024.0 * 1024.0),
    );

    // Stream-mix both temp files into output WAV (constant memory, ~2MB working set)
    let result = mix_to_wav(
        &state.system_temp_path,
        state.system_sample_rate,
        state.system_channels,
        &state.mic_temp_path,
        state.mic_sample_rate,
        state.mic_channels,
    );

    // Clean up temp files
    let _ = std::fs::remove_file(&state.system_temp_path);
    let _ = std::fs::remove_file(&state.mic_temp_path);

    result
}
