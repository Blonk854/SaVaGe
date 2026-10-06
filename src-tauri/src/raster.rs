use std::fs::{self, File};
use std::io::{BufReader, Read};
use std::path::Path;

use image::{DynamicImage, GenericImageView, ImageReader, Limits};

pub const MAX_RASTER_BYTES: u64 = 64 * 1024 * 1024;
pub const MAX_RASTER_DIMENSION: u32 = 16_384;
pub const MAX_RASTER_PIXELS: u64 = 40_000_000;
pub const MAX_DECODED_RGBA_BYTES: u64 = MAX_RASTER_PIXELS * 4;

#[derive(Debug)]
pub struct InspectedRaster {
    pub width: u32,
    pub height: u32,
    pub byte_size: u64,
}

pub struct DecodedRaster {
    pub image: DynamicImage,
    pub width: u32,
    pub height: u32,
    pub byte_size: u64,
}

#[derive(Debug, PartialEq, Eq)]
pub enum RasterError {
    Unavailable(String),
    TooLarge { size: u64, limit: u64 },
    Dimensions { width: u32, height: u32 },
    Memory { bytes: u64, limit: u64 },
    Decode(String),
}

impl std::fmt::Display for RasterError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unavailable(message) | Self::Decode(message) => write!(formatter, "{message}"),
            Self::TooLarge { size, limit } => {
                write!(formatter, "Image is {size} bytes; limit is {limit}")
            }
            Self::Dimensions { width, height } => write!(
                formatter,
                "Image dimensions {width}x{height} exceed the {MAX_RASTER_DIMENSION} per-side or {MAX_RASTER_PIXELS} pixel limit"
            ),
            Self::Memory { bytes, limit } => {
                write!(formatter, "Decoded image is {bytes} bytes; limit is {limit}")
            }
        }
    }
}

fn header_limits() -> Limits {
    // The header read may report sizes above the budget. Allocation happens only in decode.
    Limits::default()
}

fn decoder_limits() -> Limits {
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_RASTER_DIMENSION);
    limits.max_image_height = Some(MAX_RASTER_DIMENSION);
    limits.max_alloc = Some(MAX_DECODED_RGBA_BYTES);
    limits
}

pub fn ensure_raster_bounds(width: u32, height: u32) -> Result<(), RasterError> {
    if width > MAX_RASTER_DIMENSION || height > MAX_RASTER_DIMENSION {
        return Err(RasterError::Dimensions { width, height });
    }
    let pixels = u64::from(width).saturating_mul(u64::from(height));
    if pixels > MAX_RASTER_PIXELS {
        return Err(RasterError::Dimensions { width, height });
    }
    let bytes = pixels.saturating_mul(4);
    if bytes > MAX_DECODED_RGBA_BYTES {
        return Err(RasterError::Memory {
            bytes,
            limit: MAX_DECODED_RGBA_BYTES,
        });
    }
    Ok(())
}

fn open_reader(path: &Path) -> Result<ImageReader<BufReader<File>>, RasterError> {
    ImageReader::open(path)
        .map_err(|error| RasterError::Unavailable(format!("Failed to inspect image: {error}")))?
        .with_guessed_format()
        .map_err(|error| RasterError::Decode(format!("Failed to open image: {error}")))
}

const PNG_SIGNATURE: [u8; 8] = [0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1A, b'\n'];

fn png_ihdr_dimensions(path: &Path) -> Result<Option<(u32, u32)>, RasterError> {
    let mut file = File::open(path)
        .map_err(|error| RasterError::Unavailable(format!("Failed to inspect image: {error}")))?;
    let mut header = [0_u8; 24];
    match file.read(&mut header) {
        Ok(24) => {}
        Ok(_) => return Ok(None),
        Err(error) => {
            return Err(RasterError::Unavailable(format!(
                "Failed to inspect image: {error}"
            )))
        }
    }
    if header[..8] != PNG_SIGNATURE {
        return Ok(None);
    }
    let length = u32::from_be_bytes(header[8..12].try_into().expect("4 bytes"));
    if &header[12..16] != b"IHDR" || length < 8 {
        return Err(RasterError::Decode("PNG is missing an image header".into()));
    }
    let width = u32::from_be_bytes(header[16..20].try_into().expect("4 bytes"));
    let height = u32::from_be_bytes(header[20..24].try_into().expect("4 bytes"));
    Ok(Some((width, height)))
}

fn read_header_dimensions(path: &Path) -> Result<(u32, u32), RasterError> {
    let mut reader = open_reader(path)?;
    reader.limits(header_limits());
    reader.into_dimensions().map_err(|error| {
        let message = error.to_string();
        if message.contains("exceeds limit") {
            RasterError::Dimensions {
                width: MAX_RASTER_DIMENSION.saturating_add(1),
                height: MAX_RASTER_DIMENSION.saturating_add(1),
            }
        } else {
            RasterError::Decode(format!("Failed to open image: {message}"))
        }
    })
}

pub fn inspect(path: &Path) -> Result<InspectedRaster, RasterError> {
    let byte_size = fs::metadata(path)
        .map_err(|error| RasterError::Unavailable(format!("Failed to inspect image: {error}")))?
        .len();
    if byte_size > MAX_RASTER_BYTES {
        return Err(RasterError::TooLarge {
            size: byte_size,
            limit: MAX_RASTER_BYTES,
        });
    }
    let (width, height) = match png_ihdr_dimensions(path)? {
        Some(dimensions) => dimensions,
        None => read_header_dimensions(path)?,
    };
    ensure_raster_bounds(width, height)?;
    Ok(InspectedRaster {
        width,
        height,
        byte_size,
    })
}

pub fn decode_image(path: &Path) -> Result<DecodedRaster, RasterError> {
    let inspected = inspect(path)?;
    let mut reader = open_reader(path)?;
    reader.limits(decoder_limits());
    let image = reader
        .decode()
        .map_err(|error| RasterError::Decode(format!("Failed to open image: {error}")))?;
    let (width, height) = image.dimensions();
    if width != inspected.width || height != inspected.height {
        return Err(RasterError::Decode(
            "Decoded image dimensions did not match its header".into(),
        ));
    }
    ensure_raster_bounds(width, height)?;
    Ok(DecodedRaster {
        image,
        width,
        height,
        byte_size: inspected.byte_size,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        decode_image, ensure_raster_bounds, inspect, RasterError, MAX_DECODED_RGBA_BYTES,
        MAX_RASTER_BYTES, MAX_RASTER_DIMENSION, MAX_RASTER_PIXELS,
    };
    use std::fs::File;
    use std::io::Write;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_path(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "savage-raster-{label}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock")
                .as_nanos()
        ))
    }

    fn png_chunk(tag: &[u8; 4], data: &[u8]) -> Vec<u8> {
        let mut payload = Vec::with_capacity(4 + data.len());
        payload.extend_from_slice(tag);
        payload.extend_from_slice(data);
        let mut chunk = Vec::new();
        chunk.extend_from_slice(&(data.len() as u32).to_be_bytes());
        chunk.extend_from_slice(&payload);
        chunk.extend_from_slice(&crc32(&payload).to_be_bytes());
        chunk
    }

    fn crc32(data: &[u8]) -> u32 {
        let mut crc = 0xFFFF_FFFF_u32;
        for &byte in data {
            crc ^= u32::from(byte);
            for _ in 0..8 {
                let mask = (crc & 1).wrapping_neg();
                crc = (crc >> 1) ^ (0xEDB8_8320 & mask);
            }
        }
        !crc
    }

    fn png_header(width: u32, height: u32) -> Vec<u8> {
        let mut ihdr = Vec::with_capacity(13);
        ihdr.extend_from_slice(&width.to_be_bytes());
        ihdr.extend_from_slice(&height.to_be_bytes());
        ihdr.extend_from_slice(&[8, 2, 0, 0, 0]);
        let mut png = vec![0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1A, b'\n'];
        png.extend(png_chunk(b"IHDR", &ihdr));
        png
    }

    #[test]
    fn accepts_the_exact_dimension_and_pixel_budget() {
        assert!(ensure_raster_bounds(MAX_RASTER_DIMENSION, 1).is_ok());
        let side = (MAX_RASTER_PIXELS as f64).sqrt() as u32;
        assert!(ensure_raster_bounds(side, side).is_ok());
        assert_eq!(
            ensure_raster_bounds(MAX_RASTER_DIMENSION + 1, 1),
            Err(RasterError::Dimensions {
                width: MAX_RASTER_DIMENSION + 1,
                height: 1,
            })
        );
        assert!(matches!(
            ensure_raster_bounds(10_000, 4_001),
            Err(RasterError::Dimensions { .. })
        ));
        assert!(MAX_DECODED_RGBA_BYTES == MAX_RASTER_PIXELS * 4);
    }

    #[test]
    fn rejects_a_header_whose_pixels_exceed_the_decode_budget() {
        let path = temp_path("huge-header.png");
        {
            let mut file = File::create(&path).expect("create header fixture");
            file.write_all(&png_header(20_000, 20_000))
                .expect("write header fixture");
        }
        let error = inspect(&path).expect_err("huge header must be rejected");
        assert!(
            matches!(error, RasterError::Dimensions { .. }),
            "unexpected raster error: {error}"
        );
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn rejects_a_file_larger_than_the_input_budget_before_decode() {
        let path = temp_path("huge-file.png");
        let file = File::create(&path).expect("create sparse fixture");
        file.set_len(MAX_RASTER_BYTES + 1)
            .expect("extend sparse fixture");
        drop(file);
        let error = inspect(&path).expect_err("oversize file must be rejected");
        assert_eq!(
            error,
            RasterError::TooLarge {
                size: MAX_RASTER_BYTES + 1,
                limit: MAX_RASTER_BYTES,
            }
        );
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn decodes_a_supported_fixture_inside_the_budget() {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../testdata/logo_flat.png");
        if !path.exists() {
            return;
        }
        let decoded = decode_image(&path).expect("decode logo fixture");
        assert!(decoded.width > 0 && decoded.height > 0);
        assert!(decoded.byte_size > 0);
        assert_eq!(
            (decoded.image.width(), decoded.image.height()),
            (decoded.width, decoded.height)
        );
    }
}
