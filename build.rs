fn main() {
    println!("cargo:rerun-if-changed=assets/icon.ico");
    println!("cargo:rerun-if-changed=assets/icon-64.rgba");
    println!("cargo:rerun-if-changed=assets/logo.svg");

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
