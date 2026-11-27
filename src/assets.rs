use axum::{
    body::Body,
    http::{header, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};

pub static STYLES_CSS: &[u8] = include_bytes!("../assets/styles.css");
pub static APP_JS: &[u8] = include_bytes!("../assets/app.js");

pub static OVERLAYSCROLLBARS_CSS: &[u8] = include_bytes!("../assets/vendor/overlayscrollbars.min.css");
pub static OVERLAYSCROLLBARS_JS_GZ: &[u8] =
    include_bytes!("../assets/vendor/overlayscrollbars.browser.es6.min.js.gz");

pub static XTERM_CSS: &[u8] = include_bytes!("../assets/vendor/xterm.css");
pub static XTERM_JS_GZ: &[u8] = include_bytes!("../assets/vendor/xterm.js.gz");
pub static XTERM_FIT_JS: &[u8] = include_bytes!("../assets/vendor/addon-fit.js");

pub static MERMAID_JS_GZ: &[u8] = include_bytes!("../assets/vendor/mermaid.min.js.gz");
pub static HIGHLIGHT_JS_GZ: &[u8] = include_bytes!("../assets/vendor/highlight.min.js.gz");

pub static KATEX_CSS: &[u8] = include_bytes!("../assets/vendor/katex.min.css");
pub static KATEX_JS_GZ: &[u8] = include_bytes!("../assets/vendor/katex.min.js.gz");

pub fn get_katex_font(name: &str) -> Option<&'static [u8]> {
    match name {
        "KaTeX_AMS-Regular.woff2" => Some(include_bytes!("../assets/vendor/fonts/KaTeX_AMS-Regular.woff2")),
        "KaTeX_Caligraphic-Bold.woff2" => Some(include_bytes!("../assets/vendor/fonts/KaTeX_Caligraphic-Bold.woff2")),
        "KaTeX_Caligraphic-Regular.woff2" => Some(include_bytes!("../assets/vendor/fonts/KaTeX_Caligraphic-Regular.woff2")),
        "KaTeX_Fraktur-Bold.woff2" => Some(include_bytes!("../assets/vendor/fonts/KaTeX_Fraktur-Bold.woff2")),
        "KaTeX_Fraktur-Regular.woff2" => Some(include_bytes!("../assets/vendor/fonts/KaTeX_Fraktur-Regular.woff2")),
        "KaTeX_Main-Bold.woff2" => Some(include_bytes!("../assets/vendor/fonts/KaTeX_Main-Bold.woff2")),
        "KaTeX_Main-BoldItalic.woff2" => Some(include_bytes!("../assets/vendor/fonts/KaTeX_Main-BoldItalic.woff2")),
        "KaTeX_Main-Italic.woff2" => Some(include_bytes!("../assets/vendor/fonts/KaTeX_Main-Italic.woff2")),
        "KaTeX_Main-Regular.woff2" => Some(include_bytes!("../assets/vendor/fonts/KaTeX_Main-Regular.woff2")),
        "KaTeX_Math-BoldItalic.woff2" => Some(include_bytes!("../assets/vendor/fonts/KaTeX_Math-BoldItalic.woff2")),
        "KaTeX_Math-Italic.woff2" => Some(include_bytes!("../assets/vendor/fonts/KaTeX_Math-Italic.woff2")),
        "KaTeX_SansSerif-Bold.woff2" => Some(include_bytes!("../assets/vendor/fonts/KaTeX_SansSerif-Bold.woff2")),
        "KaTeX_SansSerif-Italic.woff2" => Some(include_bytes!("../assets/vendor/fonts/KaTeX_SansSerif-Italic.woff2")),
        "KaTeX_SansSerif-Regular.woff2" => Some(include_bytes!("../assets/vendor/fonts/KaTeX_SansSerif-Regular.woff2")),
        "KaTeX_Script-Regular.woff2" => Some(include_bytes!("../assets/vendor/fonts/KaTeX_Script-Regular.woff2")),
        "KaTeX_Size1-Regular.woff2" => Some(include_bytes!("../assets/vendor/fonts/KaTeX_Size1-Regular.woff2")),
        "KaTeX_Size2-Regular.woff2" => Some(include_bytes!("../assets/vendor/fonts/KaTeX_Size2-Regular.woff2")),
        "KaTeX_Size3-Regular.woff2" => Some(include_bytes!("../assets/vendor/fonts/KaTeX_Size3-Regular.woff2")),
        "KaTeX_Size4-Regular.woff2" => Some(include_bytes!("../assets/vendor/fonts/KaTeX_Size4-Regular.woff2")),
        "KaTeX_Typewriter-Regular.woff2" => Some(include_bytes!("../assets/vendor/fonts/KaTeX_Typewriter-Regular.woff2")),
        _ => None,
    }
}

pub fn serve_bytes(bytes: &'static [u8], content_type: &'static str, gzipped: bool) -> Response {
    let mut res = Response::new(Body::from(bytes));
    let headers = res.headers_mut();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    if gzipped {
        headers.insert(header::CONTENT_ENCODING, HeaderValue::from_static("gzip"));
    }
    res
}

pub fn serve_katex_asset(rel: &str) -> Response {
    if rel == "katex.min.css" {
        return serve_bytes(KATEX_CSS, "text/css; charset=utf-8", false);
    }
    if rel == "katex.min.js" {
        return serve_bytes(KATEX_JS_GZ, "application/javascript; charset=utf-8", true);
    }
    if let Some(font_name) = rel.strip_prefix("fonts/") {
        if let Some(font_bytes) = get_katex_font(font_name) {
            return serve_bytes(font_bytes, "font/woff2", false);
        }
        // Gracefully return 404 for legacy .woff/.ttf requests if any
    }
    (StatusCode::NOT_FOUND, "Not found").into_response()
}
