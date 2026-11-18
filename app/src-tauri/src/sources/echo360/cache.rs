//! The app's Echo360 sessions, one per Canvas course, kept between commands
//! (`lectures::commands`) and the scrape's lecture sync.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use super::{Lecture, Session};
use crate::runtime::clock::now_secs;
use crate::sources::echo360;

#[derive(Clone)]
pub struct Echo360Cache(pub Arc<Mutex<HashMap<i64, CachedSession>>>);

pub struct CachedSession {
    session: Session,
    saved_unix: u64,
}

/// Cached so each request does not re-run the LTI launch through Canvas.
const SESSION_TTL_SECS: u64 = 11 * 3600;

pub fn get_or_auth(cache: &Echo360Cache, course_id: i64) -> Result<Session, String> {
    {
        let g = cache.0.lock().unwrap();
        if let Some(c) = g.get(&course_id) {
            if now_secs() - c.saved_unix < SESSION_TTL_SECS {
                elog!("[oculus] echo360: reusing cached session for course {course_id}");
                return Ok(c.session.clone_fields());
            }
        }
    }
    let session = echo360::connect(
        &crate::sources::canvas::Canvas::open(&crate::library::paths::data_dir()),
        course_id,
    )?;
    cache.0.lock().unwrap().insert(
        course_id,
        CachedSession {
            session: session.clone_fields(),
            saved_unix: now_secs(),
        },
    );
    Ok(session)
}

/// A course's lectures, through its cached session; none when the course has
/// no Echo360 tool.
pub async fn sync_lectures(
    cache: &Echo360Cache,
    canvas_course_id: i64,
) -> Result<Vec<Lecture>, String> {
    let cache = cache.clone();
    crate::runtime::blocking::run(move || {
        let session = match get_or_auth(&cache, canvas_course_id) {
            Err(e) if e == echo360::NO_TOOL => return Ok(Vec::new()),
            other => other?,
        };
        echo360::syllabus(
            &session,
            echo360::lead_in_secs(&crate::library::paths::data_dir()),
        )
    })
    .await
}
