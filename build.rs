fn main() {
    println!("cargo:rerun-if-changed=assets/icon.ico");
    println!("cargo:rerun-if-changed=assets/icon-64.rgba");
    println!("cargo:rerun-if-changed=assets/logo.svg");
    println!("cargo:rerun-if-env-changed=MDV_EXE_PATH");

    match std::env::var("MDV_EXE_PATH") {
        Ok(exe_path) if !exe_path.trim().is_empty() => {
            println!("cargo:rerun-if-changed={}", exe_path);
        }
        _ => {
            if let Ok(out_dir) = std::env::var("OUT_DIR") {
                let stub = std::path::Path::new(&out_dir).join("mdv-stub.bin");
                let _ = std::fs::write(&stub, b"");
                println!("cargo:rustc-env=MDV_EXE_PATH={}", stub.display());
            }
        }
    }

    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        #[cfg(windows)]
        {
            let mut res = winresource::WindowsResource::new();
            res.set_icon("assets/icon.ico");
            res.set("ProductName", "mdv");
            res.set("FileDescription", "mdv — Markdown & WSL Terminal Workspace");
            res.set("CompanyName", "Daniel Molina");
            res.set("LegalCopyright", "MIT © Daniel Molina");
            res.compile().expect("Failed to compile Windows icon resource");
        }
    }
}
