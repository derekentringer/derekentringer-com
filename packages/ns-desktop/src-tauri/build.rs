fn main() {
  // screencapturekit crate uses Swift interop — the binary needs rpath entries
  // pointing to the Swift runtime libraries so libswiftCore.dylib can be found
  #[cfg(target_os = "macos")]
  {
    println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
    println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path/../Frameworks");
  }

  tauri_build::build()
}
