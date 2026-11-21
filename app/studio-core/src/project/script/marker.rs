//! Markers in script.md, which are not said. `[pause]` holds the picture
//! for the theme's `narration.pause` seconds, `[pause 1.5]` for that many.
//! `[breath]` tops the silence after the word before it up to
//! `DEFAULT_BREATH` seconds, `[breath 0.2]` to that many: a comma's or a
//! sentence's breath, which the picture does not wait on. A bracket opening
//! with either word that is neither form is malformed: it is dropped from
//! the spoken text too, and lint names it.

/// The longest pause a marker or a theme may ask for, in seconds.
pub const MAX_PAUSE: f64 = 5.0;
/// A bare `[breath]`, in seconds.
pub const DEFAULT_BREATH: f64 = 0.3;
/// The longest breath, in seconds; a longer silence is a `[pause]`.
pub const MAX_BREATH: f64 = 1.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Pause,
    Breath,
}

impl Kind {
    /// The kind a bracket's text opens with, in any case.
    fn of(inner: &str) -> Option<Kind> {
        let inner = inner.trim_start();
        let opens = |word: &str| {
            inner
                .get(..word.len())
                .is_some_and(|w| w.eq_ignore_ascii_case(word))
        };
        [Kind::Pause, Kind::Breath]
            .into_iter()
            .find(|k| opens(k.word()))
    }

    fn word(self) -> &'static str {
        match self {
            Kind::Pause => "pause",
            Kind::Breath => "breath",
        }
    }

    fn shape(self, written: &str) -> String {
        match self {
            Kind::Pause => format!(
                "`{written}` is not a pause; write `[pause]` for the theme's pause or `[pause 1.5]` for seconds"
            ),
            Kind::Breath => format!(
                "`{written}` is not a breath; write `[breath]` for {DEFAULT_BREATH} seconds or `[breath 0.2]` for seconds"
            ),
        }
    }

    fn range(self, written: &str) -> String {
        match self {
            Kind::Pause => {
                format!("`{written}`: a pause is more than 0 and at most {MAX_PAUSE} seconds")
            }
            Kind::Breath => format!(
                "`{written}`: a breath is more than 0 and at most {MAX_BREATH} second; a longer silence is a `[pause]`"
            ),
        }
    }

    fn max(self) -> f64 {
        match self {
            Kind::Pause => MAX_PAUSE,
            Kind::Breath => MAX_BREATH,
        }
    }
}

/// A `[pause …]` or `[breath …]` in one line of script.md.
#[derive(Clone, Debug, PartialEq)]
pub struct Marker {
    pub kind: Kind,
    /// Byte range in the line, brackets included.
    pub start: usize,
    pub end: usize,
    /// Its seconds (`None`: the theme's pause, or `DEFAULT_BREATH`), or why
    /// it is malformed.
    pub seconds: Result<Option<f64>, String>,
}

/// Every marker in `line`, in order. A `[` whose text starts with `pause`
/// or `breath` is one, up to the next `]` or the line's end.
pub fn markers(line: &str) -> Vec<Marker> {
    let mut out = Vec::new();
    let mut from = 0;
    while let Some(open) = line[from..].find('[').map(|i| from + i) {
        let inner_from = open + 1;
        let Some(kind) = Kind::of(&line[inner_from..]) else {
            from = inner_from;
            continue;
        };
        let close = line[inner_from..].find(']').map(|i| inner_from + i);
        let end = close.map_or(line.len(), |c| c + 1);
        let written = &line[open..end];
        let seconds = match close {
            None => Err(format!("`{written}` has no closing `]`")),
            Some(c) => seconds(kind, &line[inner_from..c], written),
        };
        out.push(Marker {
            kind,
            start: open,
            end,
            seconds,
        });
        from = end;
    }
    out
}

/// What `pause`, `pause <seconds>`, `breath` or `breath <seconds>` asks for.
fn seconds(kind: Kind, inner: &str, written: &str) -> Result<Option<f64>, String> {
    let shape = || kind.shape(written);
    let mut words = inner.split_whitespace();
    if !words
        .next()
        .is_some_and(|w| w.eq_ignore_ascii_case(kind.word()))
    {
        return Err(shape());
    }
    let Some(n) = words.next() else {
        return Ok(None);
    };
    let decimal = n.chars().all(|c| c.is_ascii_digit() || c == '.')
        && n.chars().filter(|&c| c == '.').count() <= 1
        && n.chars().any(|c| c.is_ascii_digit());
    let value: f64 = match (decimal, words.next()) {
        (true, None) => n.parse().map_err(|_| shape())?,
        _ => return Err(shape()),
    };
    if !(value > 0.0 && value <= kind.max()) {
        return Err(kind.range(written));
    }
    Ok(Some(value))
}

/// `seconds` as a marker of `kind` writes it: `[pause 1]`, `[breath 0.25]`.
pub(crate) fn written(kind: Kind, seconds: f64) -> String {
    format!("[{} {seconds}]", kind.word())
}
