use axum::{
    extract::{DefaultBodyLimit, Multipart, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::PathBuf,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::sync::Mutex;
use tower_http::services::ServeDir;

const CATEGORIES: [&str; 8] = ["Worship", "Community", "Missions", "Media", "Tech", "Peace", "Modesty", "Health"];
const MAX_LABEL: usize = 80;
const MAX_CAP: usize = 140;

fn default_kind() -> String {
    "photo".into()
}

#[derive(Clone, Serialize, Deserialize)]
struct Photo {
    id: String,
    cat: String,
    label: String,
    cap: String,
    img: String,
    #[serde(default = "default_kind")]
    kind: String,
    uploaded_at: u64,
}

struct AppState {
    data_dir: PathBuf,
    token: String,
    // Serializes manifest read-modify-write cycles.
    lock: Mutex<()>,
}

type Shared = Arc<AppState>;

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn manifest_path(state: &AppState) -> PathBuf {
    state.data_dir.join("gallery.json")
}

fn read_manifest(state: &AppState) -> Vec<Photo> {
    fs::read_to_string(manifest_path(state))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_manifest(state: &AppState, photos: &[Photo]) -> std::io::Result<()> {
    let tmp = manifest_path(state).with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_vec_pretty(photos).unwrap())?;
    fs::rename(tmp, manifest_path(state))
}

const MAX_PHOTO_BYTES: usize = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES: usize = 500 * 1024 * 1024;

/// Returns (extension, kind) based on the file's magic bytes.
fn sniff_media(bytes: &[u8]) -> Option<(&'static str, &'static str)> {
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some(("jpg", "photo"))
    } else if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        Some(("png", "photo"))
    } else if bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some(("webp", "photo"))
    } else if bytes.len() > 12 && &bytes[4..8] == b"ftyp" {
        // ISO base media: MP4 family, or QuickTime (.mov) when the brand is "qt  "
        if &bytes[8..12] == b"qt  " {
            Some(("mov", "video"))
        } else {
            Some(("mp4", "video"))
        }
    } else if bytes.starts_with(&[0x1A, 0x45, 0xDF, 0xA3]) {
        Some(("webm", "video"))
    } else {
        None
    }
}

async fn get_gallery(State(state): State<Shared>) -> Json<Vec<Photo>> {
    let mut photos = read_manifest(&state);
    photos.sort_by(|a, b| b.uploaded_at.cmp(&a.uploaded_at));
    Json(photos)
}

async fn upload(
    State(state): State<Shared>,
    mut multipart: Multipart,
) -> Result<Json<Photo>, (StatusCode, String)> {
    let bad = |m: &str| (StatusCode::BAD_REQUEST, m.to_string());

    let mut token = String::new();
    let mut cat = String::new();
    let mut label = String::new();
    let mut cap = String::new();

    // Media is streamed to a temp file so large videos never sit in memory.
    let uploads_dir = state.data_dir.join("uploads");
    fs::create_dir_all(&uploads_dir).map_err(internal)?;
    let id = uuid::Uuid::new_v4().to_string();
    let tmp_path = uploads_dir.join(format!("{id}.tmp"));
    let mut head: Vec<u8> = Vec::new();
    let mut total: usize = 0;

    let cleanup = |p: &PathBuf| {
        let _ = fs::remove_file(p);
    };

    while let Some(mut field) = multipart
        .next_field()
        .await
        .map_err(|e| bad(&format!("malformed form: {e}")))?
    {
        match field.name().unwrap_or_default() {
            "token" => token = field.text().await.map_err(|_| bad("bad token field"))?,
            "cat" => cat = field.text().await.map_err(|_| bad("bad cat field"))?,
            "label" => label = field.text().await.map_err(|_| bad("bad label field"))?,
            "cap" => cap = field.text().await.map_err(|_| bad("bad cap field"))?,
            "photo" | "file" | "media" => {
                use tokio::io::AsyncWriteExt;
                let mut f = tokio::fs::File::create(&tmp_path).await.map_err(internal)?;
                while let Some(chunk) = field.chunk().await.map_err(|_| {
                    cleanup(&tmp_path);
                    bad("upload interrupted or too large")
                })? {
                    if head.len() < 16 {
                        head.extend_from_slice(&chunk[..chunk.len().min(16 - head.len())]);
                    }
                    total += chunk.len();
                    if total > MAX_VIDEO_BYTES {
                        cleanup(&tmp_path);
                        return Err(bad("file too large (max 500 MB)"));
                    }
                    f.write_all(&chunk).await.map_err(internal)?;
                }
                f.flush().await.map_err(internal)?;
            }
            _ => {}
        }
    }

    if token != state.token {
        cleanup(&tmp_path);
        return Err((StatusCode::UNAUTHORIZED, "invalid token".into()));
    }
    if !CATEGORIES.contains(&cat.as_str()) {
        cleanup(&tmp_path);
        return Err(bad("invalid category"));
    }
    let label = label.trim().to_string();
    let cap = cap.trim().to_string();
    if label.is_empty() || label.chars().count() > MAX_LABEL {
        cleanup(&tmp_path);
        return Err(bad("label is required (max 80 chars)"));
    }
    if cap.chars().count() > MAX_CAP {
        cleanup(&tmp_path);
        return Err(bad("caption too long (max 140 chars)"));
    }
    if total == 0 {
        cleanup(&tmp_path);
        return Err(bad("a photo or video file is required"));
    }
    let (ext, kind) = match sniff_media(&head) {
        Some(x) => x,
        None => {
            cleanup(&tmp_path);
            return Err(bad("file must be JPEG, PNG, WebP, MP4, MOV, or WebM"));
        }
    };
    if kind == "photo" && total > MAX_PHOTO_BYTES {
        cleanup(&tmp_path);
        return Err(bad("photo too large (max 20 MB)"));
    }

    let filename = format!("{id}.{ext}");
    fs::rename(&tmp_path, uploads_dir.join(&filename)).map_err(internal)?;

    let photo = Photo {
        id,
        cat,
        label,
        cap,
        img: format!("/data/uploads/{filename}"),
        kind: kind.to_string(),
        uploaded_at: now_secs(),
    };

    let _guard = state.lock.lock().await;
    let mut photos = read_manifest(&state);
    photos.push(photo.clone());
    write_manifest(&state, &photos).map_err(internal)?;

    Ok(Json(photo))
}

#[derive(Deserialize)]
struct DeleteReq {
    token: String,
    id: String,
}

async fn delete_photo(
    State(state): State<Shared>,
    Json(req): Json<DeleteReq>,
) -> Result<StatusCode, (StatusCode, String)> {
    if req.token != state.token {
        return Err((StatusCode::UNAUTHORIZED, "invalid token".into()));
    }
    let _guard = state.lock.lock().await;
    let mut photos = read_manifest(&state);
    let before = photos.len();
    let removed: Vec<Photo> = photos.iter().filter(|p| p.id == req.id).cloned().collect();
    photos.retain(|p| p.id != req.id);
    if photos.len() == before {
        return Err((StatusCode::NOT_FOUND, "no photo with that id".into()));
    }
    write_manifest(&state, &photos).map_err(internal)?;
    for p in removed {
        if let Some(name) = p.img.rsplit('/').next() {
            let _ = fs::remove_file(state.data_dir.join("uploads").join(name));
        }
    }
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
struct SubscribeReq {
    email: String,
}

async fn subscribe(
    State(state): State<Shared>,
    Json(req): Json<SubscribeReq>,
) -> Result<StatusCode, (StatusCode, String)> {
    let email = req.email.trim().to_lowercase();
    let valid = email.len() <= 254
        && email.split('@').count() == 2
        && email.split('@').all(|p| !p.is_empty())
        && email.rsplit('@').next().is_some_and(|d| d.contains('.'));
    if !valid {
        return Err((StatusCode::BAD_REQUEST, "invalid email".into()));
    }
    let _guard = state.lock.lock().await;
    let path = state.data_dir.join("subscribers.jsonl");
    let existing = fs::read_to_string(&path).unwrap_or_default();
    let already = existing.lines().any(|l| {
        serde_json::from_str::<serde_json::Value>(l)
            .ok()
            .and_then(|v| v.get("email").and_then(|e| e.as_str().map(String::from)))
            .is_some_and(|e| e == email)
    });
    if !already {
        let line = serde_json::json!({ "email": email, "subscribed_at": now_secs() });
        let mut content = existing;
        content.push_str(&line.to_string());
        content.push('\n');
        fs::write(&path, content).map_err(internal)?;
    }
    Ok(StatusCode::NO_CONTENT)
}

fn internal<E: std::fmt::Display>(e: E) -> (StatusCode, String) {
    (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
}

#[tokio::main]
async fn main() {
    let site_root = std::env::var("SITE_ROOT").unwrap_or_else(|_| ".".into());
    let data_dir = PathBuf::from(std::env::var("DATA_DIR").unwrap_or_else(|_| "./data".into()));
    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8080);
    let token = std::env::var("UKWELI_ADMIN_TOKEN").unwrap_or_else(|_| {
        let t = uuid::Uuid::new_v4().simple().to_string();
        println!("UKWELI_ADMIN_TOKEN not set — generated admin token for this run: {t}");
        t
    });

    fs::create_dir_all(data_dir.join("uploads")).expect("create data dir");

    let state: Shared = Arc::new(AppState { data_dir: data_dir.clone(), token, lock: Mutex::new(()) });

    let app = Router::new()
        .route("/api/gallery", get(get_gallery))
        .route("/api/upload", post(upload).layer(DefaultBodyLimit::max(520 * 1024 * 1024)))
        .route("/api/delete", post(delete_photo))
        .route("/api/subscribe", post(subscribe))
        .nest_service("/data/uploads", ServeDir::new(data_dir.join("uploads")))
        .fallback_service(ServeDir::new(site_root))
        .with_state(state);

    let addr = format!("0.0.0.0:{port}");
    println!("Ukweli server listening on http://localhost:{port}");
    let listener = tokio::net::TcpListener::bind(&addr).await.expect("bind");
    axum::serve(listener, app).await.expect("serve");
}
