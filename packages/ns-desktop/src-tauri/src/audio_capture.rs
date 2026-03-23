use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use coreaudio::audio_unit::AudioUnit;
use objc2::AnyThread;
use tauri::Emitter;

struct RecordingState {
    system_audio_unit: AudioUnit,
    mic_audio_unit: AudioUnit,
    system_samples: Arc<Mutex<Vec<f32>>>,
    mic_samples: Arc<Mutex<Vec<f32>>>,
    system_sample_rate: u32,
    mic_sample_rate: u32,
    system_channels: u16,
    mic_channels: u16,
    tap_id: u32,
    aggregate_device_id: u32,
    stop_flag: Arc<Mutex<bool>>,
}

unsafe impl Send for RecordingState {}

static RECORDING: Mutex<Option<RecordingState>> = Mutex::new(None);

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

fn request_microphone_permission() -> Result<(), String> {
    use objc2_foundation::NSString;

    #[link(name = "AVFoundation", kind = "framework")]
    extern "C" {}

    let cls = objc2::runtime::AnyClass::get(c"AVCaptureDevice")
        .ok_or("AVCaptureDevice class not found")?;
    let media_type = NSString::from_str("soun");

    let status: isize =
        unsafe { objc2::msg_send![cls, authorizationStatusForMediaType: &*media_type] };

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
        kAudioAggregateDeviceNameKey, kAudioAggregateDeviceUIDKey,
        kAudioAggregateDeviceTapListKey, kAudioAggregateDeviceTapAutoStartKey,
        kAudioEndPointDeviceIsPrivateKey, kAudioSubTapUIDKey,
        kAudioSubTapDriftCompensationKey,
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
fn setup_input_audio_unit(
    device_id: u32,
    sample_rate: f64,
    channels: u16,
    samples: Arc<Mutex<Vec<f32>>>,
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

    // Register input callback to collect samples
    type Args = render_callback::Args<render_callback::data::Interleaved<f32>>;
    audio_unit
        .set_input_callback(move |args: Args| {
            if let Ok(mut guard) = samples.lock() {
                guard.extend_from_slice(args.data.buffer);
            }
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

    // Step 1: Request microphone permission (triggers 1 dialog on first use)
    request_microphone_permission()?;
    log::info!("Microphone permission granted");
    thread::sleep(Duration::from_millis(500));

    // Step 2: Set up microphone capture (no dialog — permission already granted)
    let mic_device_id = coreaudio::audio_unit::macos_helpers::get_default_device_id(true)
        .ok_or("No default input device found")?;
    let mic_sample_rate = get_device_sample_rate(mic_device_id)?;
    let mic_channels = get_device_channels(mic_device_id, true)?;

    let mic_samples: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let mic_audio_unit = setup_input_audio_unit(
        mic_device_id,
        mic_sample_rate,
        mic_channels,
        Arc::clone(&mic_samples),
    )?;
    log::info!("Mic capture started: {}Hz {}ch", mic_sample_rate, mic_channels);

    // Step 3: Create system audio tap (triggers 1 dialog on first use)
    let output_device_id = coreaudio::audio_unit::macos_helpers::get_default_device_id(false)
        .ok_or("No default output device found")?;
    let output_device_uid = {
        // Get NSString UID for CATapDescription
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
            return Err(format!("Failed to get output device UID (status={status})"));
        }

        // CFString is toll-free bridged to NSString
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

    // Step 5: Set up system audio capture on aggregate device
    let system_samples: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let system_audio_unit = setup_input_audio_unit(
        aggregate_device_id,
        system_sample_rate,
        system_channels,
        Arc::clone(&system_samples),
    )?;
    log::info!(
        "System audio capture started: {}Hz {}ch",
        system_sample_rate,
        system_channels
    );

    // Step 6: Timer thread
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

    let mut guard = RECORDING.lock().map_err(|e| e.to_string())?;
    *guard = Some(RecordingState {
        system_audio_unit,
        mic_audio_unit,
        system_samples,
        mic_samples,
        system_sample_rate: system_sample_rate as u32,
        mic_sample_rate: mic_sample_rate as u32,
        system_channels,
        mic_channels,
        tap_id,
        aggregate_device_id,
        stop_flag,
    });

    Ok(())
}

pub fn stop_recording() -> Result<String, String> {
    let state = {
        let mut guard = RECORDING.lock().map_err(|e| e.to_string())?;
        guard.take().ok_or("No recording in progress")?
    };

    if let Ok(mut flag) = state.stop_flag.lock() {
        *flag = true;
    }

    let mut system_au = state.system_audio_unit;
    let mut mic_au = state.mic_audio_unit;
    let _ = system_au.stop();
    let _ = mic_au.stop();
    drop(system_au);
    drop(mic_au);

    unsafe {
        AudioHardwareDestroyAggregateDevice(state.aggregate_device_id);
        objc2_core_audio::AudioHardwareDestroyProcessTap(state.tap_id);
    }

    let system_raw = state.system_samples.lock().map_err(|e| e.to_string())?.clone();
    let mic_raw = state.mic_samples.lock().map_err(|e| e.to_string())?.clone();

    if system_raw.is_empty() && mic_raw.is_empty() {
        return Err("No audio data captured. Please check that NoteSync has System Audio Recording permission in System Settings > Privacy & Security.".into());
    }

    let system_mono = to_mono(&system_raw, state.system_channels);
    let mic_mono = to_mono(&mic_raw, state.mic_channels);
    let mic_resampled = resample(&mic_mono, state.mic_sample_rate, state.system_sample_rate);
    let mixed = mix(&system_mono, &mic_resampled);

    log::info!(
        "Recording stopped: system={} samples, mic={} samples, mixed={} samples at {}Hz",
        system_mono.len(),
        mic_resampled.len(),
        mixed.len(),
        state.system_sample_rate
    );

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
