//! Every threshold the look checks and `beats` use, in frame px and
//! seconds, each with why it is that value.

/// Sample spacing: finer than any beat a viewer notices; a 30 s scene is
/// ~150 layouts.
pub(crate) const STEP: f64 = 0.2;
/// Effective opacity below which a node does not count as shown.
pub(crate) const VISIBLE: f64 = 0.05;
/// A node covering this share of the frame is a background, not content.
pub(crate) const BACKGROUND: f64 = 0.9;

/// How far past an edge counts as off-frame: anti-aliasing and a stroke's
/// half-width may poke out a pixel or two.
pub(crate) const OFF_FRAME_PX: f64 = 4.0;
/// Moving less than this between samples is standing still, so a node
/// sliding in or out through an edge is never off-frame.
pub(crate) const SETTLED_PX: f64 = 1.0;

/// Narration over a frame that does not change for longer than this is
/// dead air. 3Blue1Brown holds a frame over 3 s for 18-29% of a video and
/// its longest hold is 5-8 s (measured 2026-11-20); at 2.5 s builders added
/// pop-ins to keep it quiet, and the Canvas-scraping video drew 26 holds of
/// 2.6-4.5 s, none of which this flags.
pub(crate) const STILL: f64 = 8.0;
/// The first thing should be on screen by now.
pub(crate) const OPENING: f64 = 0.5;

/// Text or a Math set under this share of the frame's shorter side is too
/// small: 40 px at 1080p, which the ~600 px chat player shows at 12 px.
/// The three calibration videos (2026-11-20) set labels at 11-38 px in
/// every narrated scene; 48 px labels pass.
pub(crate) const SMALL_TEXT: f64 = 1.0 / 27.0;
/// ...when shown for longer than this, so a label in flight passes.
pub(crate) const SMALL_FOR: f64 = 1.0;
/// The inline chat player's width, to say how small it reads there.
pub(crate) const PLAYER_PX: f64 = 600.0;

/// Content whose bounding box is narrower than this share of the frame...
pub(crate) const SPARSE_WIDTH: f64 = 0.6;
/// ...or shorter than this share of it...
pub(crate) const SPARSE_HEIGHT: f64 = 0.5;
/// ...for longer than this leaves the frame empty. The two automata videos
/// (2026-10-17) fall under it in 8 and 11 scenes (one at a median 39% by
/// 57%); Canvas scraping's outline boxes keep 83% by 71% in every sample,
/// so its thinness is ink, which this does not measure. A large centred
/// picture at 73% by 70% passes.
pub(crate) const SPARSE_FOR: f64 = 3.0;

/// A Text centred in this top share of the frame...
pub(crate) const TITLE_BAND: f64 = 0.15;
/// ...shown for more than this share of the scene is a slide title: every
/// Canvas-scraping scene's heading and 14 of 16 in one automata video sit
/// at the top for the whole scene.
pub(crate) const TITLE_SHARE: f64 = 0.8;
/// The component whose whole job is a title: `sparse` and `scene_title`
/// skip its scenes.
pub(crate) const TITLE_CARD: &str = "TitleCard";

/// The end of a scene, where a leftover fragment shows.
pub(crate) const TAIL: f64 = 1.5;
/// A Math showing at most this many pieces...
pub(crate) const FRAGMENT_PIECES: usize = 2;
/// ...and under this share of them is a fragment of a rewrite.
pub(crate) const FRAGMENT_SHARE: f64 = 0.25;
/// A node smaller than this both ways...
pub(crate) const ORPHAN_PX: f64 = 6.0;
/// ...with nothing shown within this distance is a stray mark.
pub(crate) const ORPHAN_GAP: f64 = 40.0;

/// `beats`: a centre moving further than this is a move...
pub(crate) const MOVE_PX: f64 = 8.0;
/// ...and a width or height changing more than this is a resize.
pub(crate) const SIZE_PX: f64 = 8.0;
