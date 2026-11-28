//! Writes a document byte-for-byte as `serializeWhiteboardDocument` does:
//! `JSON.stringify(doc) + "\n"`. serde_json's compact formatter already
//! matches the punctuation, escaping and (with `preserve_order`) key order;
//! numbers are the difference, so they go through JavaScript's
//! `Number.prototype.toString` rules (`1.0` → `1`, `1e21` → `1e+21`, `-0` → `0`).

use serde::Serialize;
use serde_json::ser::Formatter;
use serde_json::Value;
use std::io::{self, Write};

pub fn serialize(document: &Value) -> Result<String, String> {
    let mut out = Vec::new();
    let mut serializer = serde_json::Serializer::with_formatter(&mut out, JsFormatter);
    document
        .serialize(&mut serializer)
        .map_err(|e| e.to_string())?;
    out.push(b'\n');
    String::from_utf8(out).map_err(|e| e.to_string())
}

/// A number as JavaScript prints it (ECMA-262 Number::toString, radix 10).
pub fn js_number(value: f64) -> String {
    if value == 0.0 {
        return "0".into();
    }
    if value < 0.0 {
        return format!("-{}", js_number(-value));
    }
    // Rust's `{:e}` is the shortest round-trip form, the same digits JS picks.
    let scientific = format!("{value:e}");
    let (mantissa, exponent) = scientific.split_once('e').unwrap_or((&scientific, "0"));
    let digits: String = mantissa.chars().filter(|c| *c != '.').collect();
    let k = digits.len() as i32;
    let n = exponent.parse::<i32>().unwrap_or(0) + 1;
    if k <= n && n <= 21 {
        format!("{digits}{}", "0".repeat((n - k) as usize))
    } else if 0 < n && n <= 21 {
        format!("{}.{}", &digits[..n as usize], &digits[n as usize..])
    } else if -6 < n && n <= 0 {
        format!("0.{}{digits}", "0".repeat((-n) as usize))
    } else {
        let sign = if n - 1 < 0 { '-' } else { '+' };
        let tail = if k == 1 {
            String::new()
        } else {
            format!(".{}", &digits[1..])
        };
        format!("{}{tail}e{sign}{}", &digits[..1], (n - 1).abs())
    }
}

struct JsFormatter;

impl Formatter for JsFormatter {
    fn write_i64<W: ?Sized + Write>(&mut self, writer: &mut W, value: i64) -> io::Result<()> {
        writer.write_all(js_number(value as f64).as_bytes())
    }

    fn write_u64<W: ?Sized + Write>(&mut self, writer: &mut W, value: u64) -> io::Result<()> {
        writer.write_all(js_number(value as f64).as_bytes())
    }

    fn write_f64<W: ?Sized + Write>(&mut self, writer: &mut W, value: f64) -> io::Result<()> {
        writer.write_all(js_number(value).as_bytes())
    }
}
