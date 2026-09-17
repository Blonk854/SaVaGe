use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileFingerprint {
    pub size: u64,
    pub modified_ms: u64,
}

pub fn fingerprint(path: &Path) -> Result<FileFingerprint, String> {
    let metadata = fs::metadata(path)
        .map_err(|error| format!("Failed to inspect {}: {error}", path.display()))?;
    let modified_ms = metadata
        .modified()
        .map_err(|error| format!("Failed to inspect {}: {error}", path.display()))?
        .duration_since(UNIX_EPOCH)
        .map_err(|_| format!("{} has an invalid modification time", path.display()))?
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX);
    Ok(FileFingerprint {
        size: metadata.len(),
        modified_ms,
    })
}
