//! Phase 0.2 — test fixtures for the audio pipeline.
//!
//! These helpers let Rust tests drive `audio_capture_shared` (and the
//! platform capture modules, when Phase 5 gets to them) without a real
//! audio device:
//!
//!   - `FakePcmSource` builds synthetic f32 PCM buffers (silence, sine,
//!     or a fixed slice) so tests can exercise resampling, mixing, and
//!     WAV encoding against known inputs.
//!   - `write_pcm_file` writes the raw little-endian f32 bytes that
//!     `mix_to_wav` reads. Mirrors the on-disk format produced by
//!     `spawn_writer_thread` without needing a writer thread.
//!   - `TempAudioDir` is a scoped temp directory (from the `tempfile`
//!     crate) that auto-removes on drop and has a `.path_in()` helper
//!     for deterministic filenames.
//!   - `verify_wav_header` sanity-checks the RIFF/WAVE/fmt/data layout
//!     on the bytes `mix_to_wav` writes, so tests can assert without
//!     parsing through `hound`.
//!
//! Everything in this module is gated behind `#[cfg(test)]` via the
//! declaration in `lib.rs`, so it never lands in a release binary.

use std::f32::consts::PI;
use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};

pub use tempfile::TempDir;

/// Synthetic PCM source. Produces interleaved f32 samples — same
/// shape as what the real capture threads push into the writer
/// channels.
pub struct FakePcmSource;

impl FakePcmSource {
    /// `duration_secs * rate * channels` zero samples.
    pub fn silence(duration_secs: f32, rate: u32, channels: u16) -> Vec<f32> {
        let total = (duration_secs * rate as f32) as usize * channels as usize;
        vec![0.0; total]
    }

    /// A sine wave at the given frequency. Interleaved across channels
    /// (every channel gets the same sample per frame). Useful for
    /// asserting that resampling preserves signal energy without
    /// caring about phase alignment.
    pub fn sine(duration_secs: f32, rate: u32, channels: u16, frequency_hz: f32) -> Vec<f32> {
        let frames = (duration_secs * rate as f32) as usize;
        let mut out = Vec::with_capacity(frames * channels as usize);
        for i in 0..frames {
            let t = i as f32 / rate as f32;
            let sample = (2.0 * PI * frequency_hz * t).sin();
            for _ in 0..channels {
                out.push(sample);
            }
        }
        out
    }
}

/// Write an interleaved f32 PCM buffer to disk in the same little-
/// endian byte layout `spawn_writer_thread` produces, so `mix_to_wav`
/// and `read_pcm_since` can consume it verbatim.
pub fn write_pcm_file(path: &Path, samples: &[f32]) -> std::io::Result<()> {
    let mut f = File::create(path)?;
    let mut buf = Vec::with_capacity(samples.len() * 4);
    for s in samples {
        buf.extend_from_slice(&s.to_le_bytes());
    }
    f.write_all(&buf)?;
    Ok(())
}

/// Scoped temp dir with convenience helpers. Removes itself on drop,
/// so tests can do work in it without polluting `$TMPDIR` (and
/// without racing against the leak-sweep we fixed in v2.38.0).
pub struct TempAudioDir {
    inner: TempDir,
}

#[allow(dead_code)] // Phase 0 ships the fixture; Phase 1 tests use `path` + `assert_empty`.
impl TempAudioDir {
    pub fn new() -> std::io::Result<Self> {
        Ok(Self {
            inner: tempfile::Builder::new().prefix("notesync_test_").tempdir()?,
        })
    }

    /// Absolute path of a file inside this dir. Does not create it.
    pub fn path_in(&self, filename: &str) -> PathBuf {
        self.inner.path().join(filename)
    }

    pub fn path(&self) -> &Path {
        self.inner.path()
    }

    /// Assert the directory is empty (the audio pipeline cleaned up
    /// after itself). Returns the list of offending filenames on
    /// failure for a useful panic message.
    pub fn assert_empty(&self) {
        let leftovers: Vec<String> = std::fs::read_dir(self.inner.path())
            .expect("read_dir")
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        assert!(
            leftovers.is_empty(),
            "temp dir was supposed to be empty, found: {leftovers:?}"
        );
    }
}

/// Parse the first 44 bytes of a WAV and return the metadata Phase 0
/// tests care about: sample rate, channel count, bits-per-sample, and
/// the data-chunk length. Panics on malformed input so callers can
/// assert succinctly.
#[derive(Debug)]
pub struct WavHeader {
    pub sample_rate: u32,
    pub channels: u16,
    pub bits_per_sample: u16,
    pub data_bytes: u32,
}

pub fn verify_wav_header(bytes: &[u8]) -> WavHeader {
    assert!(bytes.len() >= 44, "wav under 44 bytes: {}", bytes.len());
    assert_eq!(&bytes[0..4], b"RIFF", "missing RIFF magic");
    assert_eq!(&bytes[8..12], b"WAVE", "missing WAVE magic");
    assert_eq!(&bytes[12..16], b"fmt ", "missing fmt chunk");

    let channels = u16::from_le_bytes([bytes[22], bytes[23]]);
    let sample_rate = u32::from_le_bytes([bytes[24], bytes[25], bytes[26], bytes[27]]);
    let bits_per_sample = u16::from_le_bytes([bytes[34], bytes[35]]);

    // The data chunk header follows fmt (chunk size field at 16..20
    // tells us how long fmt is; standard PCM = 16). We only support the
    // hound-default 44-byte layout since that's what `mix_to_wav` emits.
    assert_eq!(&bytes[36..40], b"data", "missing data chunk");
    let data_bytes = u32::from_le_bytes([bytes[40], bytes[41], bytes[42], bytes[43]]);

    WavHeader { sample_rate, channels, bits_per_sample, data_bytes }
}
