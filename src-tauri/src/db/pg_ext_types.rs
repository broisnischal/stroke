/*!
Wire decoders for the Postgres extension types the driver doesn't know.

sqlx decodes the core types; anything an extension adds arrives as raw bytes in
the binary protocol, and the generic "is it UTF-8?" fallback can't help because a
vector is packed floats and a geometry is packed doubles. Without these the cells
read `<VECTOR>` and `<GEOMETRY>` — the app can see there is data and then refuses
to show it, which is the least useful thing it could do with a pgvector table.

Everything here reads a byte slice and returns a string in the same shape the
extension's own text output uses, so a value can be read, copied, and pasted back
into psql unchanged.
*/

/// Cursor over a big/little-endian byte slice. Every read is bounds-checked:
/// these bytes come off the wire and a truncated value must not panic the app.
struct Cur<'a> {
    b: &'a [u8],
    at: usize,
    le: bool,
}

impl<'a> Cur<'a> {
    fn new(b: &'a [u8], le: bool) -> Self {
        Self { b, at: 0, le }
    }
    fn take(&mut self, n: usize) -> Option<&'a [u8]> {
        let end = self.at.checked_add(n)?;
        let out = self.b.get(self.at..end)?;
        self.at = end;
        Some(out)
    }
    fn u8(&mut self) -> Option<u8> {
        Some(self.take(1)?[0])
    }
    fn u16(&mut self) -> Option<u16> {
        let a: [u8; 2] = self.take(2)?.try_into().ok()?;
        Some(if self.le { u16::from_le_bytes(a) } else { u16::from_be_bytes(a) })
    }
    fn u32(&mut self) -> Option<u32> {
        let a: [u8; 4] = self.take(4)?.try_into().ok()?;
        Some(if self.le { u32::from_le_bytes(a) } else { u32::from_be_bytes(a) })
    }
    fn i32(&mut self) -> Option<i32> {
        Some(self.u32()? as i32)
    }
    fn f32(&mut self) -> Option<f32> {
        Some(f32::from_bits(self.u32()?))
    }
    fn f64(&mut self) -> Option<f64> {
        let a: [u8; 8] = self.take(8)?.try_into().ok()?;
        Some(if self.le { f64::from_le_bytes(a) } else { f64::from_be_bytes(a) })
    }
}

/// Shortest representation that round-trips an f32, which is what pgvector
/// stores and prints. Widening to f64 first is what turns the stored `0.001`
/// into `0.001000000047497451` — the f32 has to be formatted as an f32.
fn numf(v: f32) -> String {
    if v == v.trunc() && v.abs() < 1e15 {
        return format!("{}", v as i64);
    }
    let mut s = format!("{v}");
    if s.contains('e') || s.contains('E') {
        return s;
    }
    while s.contains('.') && (s.ends_with('0') || s.ends_with('.')) {
        s.pop();
    }
    s
}

/// Shortest representation that round-trips, the way both pgvector and PostGIS
/// print numbers — `1` not `1.0`, `0.5` not `0.50000000`.
fn num(v: f64) -> String {
    if v == v.trunc() && v.abs() < 1e15 {
        return format!("{}", v as i64);
    }
    let mut s = format!("{v}");
    if s.contains('e') || s.contains('E') {
        return s;
    }
    while s.contains('.') && (s.ends_with('0') || s.ends_with('.')) {
        s.pop();
    }
    s
}

// ── pgvector ──────────────────────────────────────────────────────────────────

/// `vector`: `uint16 dim, uint16 unused, dim × f32` → `[1,2,3]`.
pub fn vector_to_text(b: &[u8]) -> Option<String> {
    let mut c = Cur::new(b, false);
    let dim = c.u16()? as usize;
    let _unused = c.u16()?;
    let mut out = String::with_capacity(dim * 6 + 2);
    out.push('[');
    for i in 0..dim {
        if i > 0 {
            out.push(',');
        }
        out.push_str(&numf(c.f32()?));
    }
    out.push(']');
    Some(out)
}

/// `halfvec`: same header, IEEE-754 binary16 elements.
pub fn halfvec_to_text(b: &[u8]) -> Option<String> {
    let mut c = Cur::new(b, false);
    let dim = c.u16()? as usize;
    let _unused = c.u16()?;
    let mut out = String::with_capacity(dim * 6 + 2);
    out.push('[');
    for i in 0..dim {
        if i > 0 {
            out.push(',');
        }
        out.push_str(&numf(f16_to_f32(c.u16()?)));
    }
    out.push(']');
    Some(out)
}

/// `sparsevec`: `int32 dim, int32 nnz, int32 unused, nnz × int32 index (1-based),
/// nnz × f32` → `{1:1.5,3:2.5}/5`.
pub fn sparsevec_to_text(b: &[u8]) -> Option<String> {
    let mut c = Cur::new(b, false);
    let dim = c.i32()?;
    let nnz = c.i32()?;
    let _unused = c.i32()?;
    if nnz < 0 || dim < 0 {
        return None;
    }
    let nnz = nnz as usize;
    let mut idx = Vec::with_capacity(nnz);
    for _ in 0..nnz {
        idx.push(c.i32()?);
    }
    let mut out = String::from("{");
    for (n, i) in idx.iter().enumerate() {
        if n > 0 {
            out.push(',');
        }
        out.push_str(&format!("{i}:{}", numf(c.f32()?)));
    }
    out.push('}');
    out.push('/');
    out.push_str(&dim.to_string());
    Some(out)
}

/// No f16 in stable Rust; the conversion is short enough to spell out.
fn f16_to_f32(h: u16) -> f32 {
    let sign = ((h >> 15) & 1) as u32;
    let exp = ((h >> 10) & 0x1f) as u32;
    let frac = (h & 0x3ff) as u32;
    let bits = match exp {
        0 if frac == 0 => sign << 31,
        // Subnormal: normalise it into the f32 exponent range.
        0 => {
            let mut e = -1i32;
            let mut f = frac;
            while f & 0x400 == 0 {
                f <<= 1;
                e -= 1;
            }
            let exp32 = (127 - 15 + e + 1) as u32;
            (sign << 31) | (exp32 << 23) | ((f & 0x3ff) << 13)
        }
        0x1f => (sign << 31) | (0xff << 23) | (frac << 13), // inf / NaN
        _ => (sign << 31) | ((exp + 127 - 15) << 23) | (frac << 13),
    };
    f32::from_bits(bits)
}

// ── PostGIS ───────────────────────────────────────────────────────────────────

const WKB_Z: u32 = 0x8000_0000;
const WKB_M: u32 = 0x4000_0000;
const WKB_SRID: u32 = 0x2000_0000;

/// `geometry` / `geography`: EWKB → the EWKT that `ST_AsEWKT` would print,
/// e.g. `SRID=4326;POINT(1 2)`. None for anything this doesn't model (curves,
/// TINs), so the caller can fall back to a hex preview rather than lie.
pub fn ewkb_to_ewkt(b: &[u8]) -> Option<String> {
    let le = *b.first()? == 1;
    let mut c = Cur::new(b, le);
    c.u8()?; // byte order, already read
    let (body, srid) = geom(&mut c)?;
    Some(match srid {
        Some(s) => format!("SRID={s};{body}"),
        None => body,
    })
}

/// One geometry, including any nested ones. Returns its WKT and the SRID when
/// this is the outermost geometry that carries one.
fn geom(c: &mut Cur) -> Option<(String, Option<u32>)> {
    let flags = c.u32()?;
    let srid = if flags & WKB_SRID != 0 { Some(c.u32()?) } else { None };
    let has_z = flags & WKB_Z != 0;
    let has_m = flags & WKB_M != 0;
    let dims = 2 + usize::from(has_z) + usize::from(has_m);
    // ISO WKB encodes the dimension in the type number instead of flag bits.
    let base = flags & 0xff;
    let iso = (flags & !(WKB_Z | WKB_M | WKB_SRID)) / 1000;
    let (dims, has_z, has_m) = match iso {
        1 => (3, true, false),  // 1000-range: Z
        2 => (3, false, true),  // 2000-range: M
        3 => (4, true, true),   // 3000-range: ZM
        _ => (dims, has_z, has_m),
    };
    let suffix = match (has_z, has_m) {
        (true, true) => " ZM",
        (true, false) => " Z",
        (false, true) => " M",
        _ => "",
    };

    let name = match base {
        1 => "POINT",
        2 => "LINESTRING",
        3 => "POLYGON",
        4 => "MULTIPOINT",
        5 => "MULTILINESTRING",
        6 => "MULTIPOLYGON",
        7 => "GEOMETRYCOLLECTION",
        _ => return None, // curves, surfaces, TIN — not modelled here
    };

    let body = match base {
        1 => {
            let p = point(c, dims)?;
            // An all-NaN point is how PostGIS stores POINT EMPTY.
            if p.is_empty() { "EMPTY".to_string() } else { format!("({p})") }
        }
        2 => ring(c, dims)?,
        3 => {
            let n = c.u32()? as usize;
            if n == 0 {
                "EMPTY".to_string()
            } else {
                let mut parts = Vec::with_capacity(n);
                for _ in 0..n {
                    parts.push(ring(c, dims)?);
                }
                format!("({})", parts.join(","))
            }
        }
        4 | 5 | 6 | 7 => {
            let n = c.u32()? as usize;
            if n == 0 {
                "EMPTY".to_string()
            } else {
                let mut parts = Vec::with_capacity(n);
                for _ in 0..n {
                    // Each member carries its own byte order and type.
                    let member_le = c.u8()? == 1;
                    let mut inner = Cur { b: c.b, at: c.at, le: member_le };
                    let (txt, _) = geom(&mut inner)?;
                    c.at = inner.at;
                    // Members print bare inside their parent, except in a
                    // collection, which keeps each member's own type name.
                    parts.push(if base == 7 { txt } else { strip_name(&txt) });
                }
                format!("({})", parts.join(","))
            }
        }
        _ => return None,
    };

    Some((format!("{name}{suffix}{body}"), srid))
}

/// `POINT(1 2)` → `(1 2)`; a nested member drops the redundant type name.
fn strip_name(wkt: &str) -> String {
    match wkt.find('(') {
        Some(i) => wkt[i..].to_string(),
        None => wkt.to_string(), // EMPTY
    }
}

/// One coordinate tuple, space separated. Empty string for an all-NaN point.
fn point(c: &mut Cur, dims: usize) -> Option<String> {
    let mut vals = Vec::with_capacity(dims);
    for _ in 0..dims {
        vals.push(c.f64()?);
    }
    if vals.iter().all(|v| v.is_nan()) {
        return Some(String::new());
    }
    Some(vals.iter().map(|v| num(*v)).collect::<Vec<_>>().join(" "))
}

/// A run of coordinates: `(1 2,3 4)`, or `EMPTY`.
fn ring(c: &mut Cur, dims: usize) -> Option<String> {
    let n = c.u32()? as usize;
    if n == 0 {
        return Some("EMPTY".to_string());
    }
    let mut parts = Vec::with_capacity(n);
    for _ in 0..n {
        parts.push(point(c, dims)?);
    }
    Some(format!("({})", parts.join(",")))
}

// ── Core types sqlx leaves alone ──────────────────────────────────────────────

/// `bit` / `varbit`: `int32 len, ceil(len/8) bytes` → `101101`.
pub fn varbit_to_text(b: &[u8]) -> Option<String> {
    let mut c = Cur::new(b, false);
    let len = c.i32()?;
    if len < 0 {
        return None;
    }
    let len = len as usize;
    let bytes = c.take((len + 7) / 8)?;
    let mut out = String::with_capacity(len);
    for i in 0..len {
        let byte = bytes[i / 8];
        out.push(if byte >> (7 - (i % 8)) & 1 == 1 { '1' } else { '0' });
    }
    Some(out)
}

/// Last resort for bytes nothing else understood: the `\x…` form psql prints,
/// truncated, so a cell shows what it holds instead of a type name.
pub fn hex_preview(b: &[u8], max_bytes: usize) -> String {
    let shown = b.len().min(max_bytes);
    let mut out = String::with_capacity(shown * 2 + 16);
    out.push_str("\\x");
    for byte in &b[..shown] {
        out.push_str(&format!("{byte:02x}"));
    }
    if b.len() > shown {
        out.push_str(&format!("… ({} bytes)", b.len()));
    }
    out
}

/// Decode by type name, for the types the driver hands back raw.
/// Returns None when the name isn't one of ours or the bytes don't fit the format.
pub fn decode_ext_type(type_name: &str, bytes: &[u8]) -> Option<String> {
    match type_name.to_ascii_uppercase().as_str() {
        "VECTOR" => vector_to_text(bytes),
        "HALFVEC" => halfvec_to_text(bytes),
        "SPARSEVEC" => sparsevec_to_text(bytes),
        "GEOMETRY" | "GEOGRAPHY" => ewkb_to_ewkt(bytes),
        "BIT" | "VARBIT" | "BIT VARYING" => varbit_to_text(bytes),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// pgvector's own binary layout: dim, unused, then big-endian f32s.
    fn vec_bytes(vals: &[f32]) -> Vec<u8> {
        let mut b = Vec::new();
        b.extend_from_slice(&(vals.len() as u16).to_be_bytes());
        b.extend_from_slice(&0u16.to_be_bytes());
        for v in vals {
            b.extend_from_slice(&v.to_bits().to_be_bytes());
        }
        b
    }

    #[test]
    fn reads_a_vector_the_way_pgvector_prints_it() {
        assert_eq!(vector_to_text(&vec_bytes(&[1.0, 2.0, 3.0])).unwrap(), "[1,2,3]");
        assert_eq!(vector_to_text(&vec_bytes(&[0.5, -1.25])).unwrap(), "[0.5,-1.25]");
        assert_eq!(vector_to_text(&vec_bytes(&[])).unwrap(), "[]");
    }

    #[test]
    fn reads_an_embedding_sized_vector() {
        let vals: Vec<f32> = (0..1536).map(|i| i as f32 / 1000.0).collect();
        let text = vector_to_text(&vec_bytes(&vals)).unwrap();
        assert!(text.starts_with("[0,0.001,0.002,"));
        assert_eq!(text.matches(',').count(), 1535);
    }

    #[test]
    fn refuses_a_truncated_vector_instead_of_panicking() {
        let mut b = vec_bytes(&[1.0, 2.0, 3.0]);
        b.truncate(8); // header plus one and a half floats
        assert!(vector_to_text(&b).is_none());
        assert!(vector_to_text(&[]).is_none());
    }

    #[test]
    fn reads_half_precision_vectors() {
        // 1.0, -2.0, 0.5 as binary16.
        let mut b = Vec::new();
        b.extend_from_slice(&3u16.to_be_bytes());
        b.extend_from_slice(&0u16.to_be_bytes());
        for h in [0x3c00u16, 0xc000, 0x3800] {
            b.extend_from_slice(&h.to_be_bytes());
        }
        assert_eq!(halfvec_to_text(&b).unwrap(), "[1,-2,0.5]");
    }

    #[test]
    fn reads_a_sparse_vector() {
        let mut b = Vec::new();
        b.extend_from_slice(&5i32.to_be_bytes()); // dim
        b.extend_from_slice(&2i32.to_be_bytes()); // nnz
        b.extend_from_slice(&0i32.to_be_bytes()); // unused
        b.extend_from_slice(&1i32.to_be_bytes());
        b.extend_from_slice(&3i32.to_be_bytes());
        b.extend_from_slice(&1.5f32.to_bits().to_be_bytes());
        b.extend_from_slice(&2.5f32.to_bits().to_be_bytes());
        assert_eq!(sparsevec_to_text(&b).unwrap(), "{1:1.5,3:2.5}/5");
    }

    #[test]
    fn reads_a_point_with_its_srid() {
        // The EWKB PostGIS stores for SRID=4326;POINT(1 2), little-endian.
        let mut b = vec![1u8];
        b.extend_from_slice(&(1u32 | WKB_SRID).to_le_bytes());
        b.extend_from_slice(&4326u32.to_le_bytes());
        b.extend_from_slice(&1.0f64.to_le_bytes());
        b.extend_from_slice(&2.0f64.to_le_bytes());
        assert_eq!(ewkb_to_ewkt(&b).unwrap(), "SRID=4326;POINT(1 2)");
    }

    #[test]
    fn reads_a_point_without_an_srid_and_in_big_endian() {
        let mut b = vec![0u8];
        b.extend_from_slice(&1u32.to_be_bytes());
        b.extend_from_slice(&(-71.06f64).to_be_bytes());
        b.extend_from_slice(&42.36f64.to_be_bytes());
        assert_eq!(ewkb_to_ewkt(&b).unwrap(), "POINT(-71.06 42.36)");
    }

    #[test]
    fn reads_a_linestring_and_a_polygon() {
        let mut ls = vec![1u8];
        ls.extend_from_slice(&2u32.to_le_bytes());
        ls.extend_from_slice(&2u32.to_le_bytes());
        for (x, y) in [(0.0f64, 0.0f64), (1.0, 1.0)] {
            ls.extend_from_slice(&x.to_le_bytes());
            ls.extend_from_slice(&y.to_le_bytes());
        }
        assert_eq!(ewkb_to_ewkt(&ls).unwrap(), "LINESTRING(0 0,1 1)");

        let mut poly = vec![1u8];
        poly.extend_from_slice(&3u32.to_le_bytes());
        poly.extend_from_slice(&1u32.to_le_bytes()); // one ring
        poly.extend_from_slice(&4u32.to_le_bytes()); // four points
        for (x, y) in [(0.0f64, 0.0f64), (1.0, 0.0), (1.0, 1.0), (0.0, 0.0)] {
            poly.extend_from_slice(&x.to_le_bytes());
            poly.extend_from_slice(&y.to_le_bytes());
        }
        assert_eq!(ewkb_to_ewkt(&poly).unwrap(), "POLYGON((0 0,1 0,1 1,0 0))");
    }

    #[test]
    fn reads_a_multipoint_where_members_carry_their_own_header() {
        let mut b = vec![1u8];
        b.extend_from_slice(&4u32.to_le_bytes()); // MULTIPOINT
        b.extend_from_slice(&2u32.to_le_bytes()); // two members
        for (x, y) in [(1.0f64, 2.0f64), (3.0, 4.0)] {
            b.push(1); // member byte order
            b.extend_from_slice(&1u32.to_le_bytes()); // POINT
            b.extend_from_slice(&x.to_le_bytes());
            b.extend_from_slice(&y.to_le_bytes());
        }
        assert_eq!(ewkb_to_ewkt(&b).unwrap(), "MULTIPOINT((1 2),(3 4))");
    }

    #[test]
    fn reads_a_3d_point() {
        let mut b = vec![1u8];
        b.extend_from_slice(&(1u32 | WKB_Z).to_le_bytes());
        for v in [1.0f64, 2.0, 3.0] {
            b.extend_from_slice(&v.to_le_bytes());
        }
        assert_eq!(ewkb_to_ewkt(&b).unwrap(), "POINT Z(1 2 3)");
    }

    #[test]
    fn declines_a_geometry_it_does_not_model() {
        // CircularString (type 8) has no representation here.
        let mut b = vec![1u8];
        b.extend_from_slice(&8u32.to_le_bytes());
        assert!(ewkb_to_ewkt(&b).is_none());
    }

    #[test]
    fn reads_a_bit_string() {
        let mut b = Vec::new();
        b.extend_from_slice(&6i32.to_be_bytes());
        b.push(0b1011_0100);
        assert_eq!(varbit_to_text(&b).unwrap(), "101101");
    }

    #[test]
    fn previews_bytes_nothing_else_understood() {
        assert_eq!(hex_preview(&[0x01, 0xab, 0xff], 8), "\\x01abff");
        let long = vec![0xde; 40];
        let out = hex_preview(&long, 4);
        assert!(out.starts_with("\\xdededede"));
        assert!(out.ends_with("(40 bytes)"));
    }

    #[test]
    fn dispatches_on_the_type_name() {
        assert_eq!(decode_ext_type("VECTOR", &vec_bytes(&[1.0])).unwrap(), "[1]");
        assert_eq!(decode_ext_type("vector", &vec_bytes(&[1.0])).unwrap(), "[1]");
        assert!(decode_ext_type("TEXT", b"hello").is_none());
    }
}
