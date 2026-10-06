/// Allowlisted packaged-window states. Keep in sync with
/// `src/shared/release/visualFixtureName.ts`.
const VISUAL_FIXTURES: &[&str] = &[
    "converter-empty",
    "converter-loaded",
    "converter-tracing",
    "converter-completed",
    "converter-stale",
    "converter-error",
    "editor-empty",
    "editor-populated",
    "menu-file",
    "dialog-unsaved",
    "dialog-conflict",
];

/// Initialization script for `SAVAGE_VISUAL`. Unknown values inject nothing,
/// so a normal launch does not enter a fixture.
pub fn visual_initialization_script() -> Option<String> {
    let raw = std::env::var("SAVAGE_VISUAL").ok()?;
    visual_initialization_script_for(&raw)
}

pub fn visual_initialization_script_for(raw: &str) -> Option<String> {
    let name = raw.trim();
    if !VISUAL_FIXTURES.contains(&name) {
        return None;
    }
    let encoded = serde_json::to_string(name).ok()?;
    Some(format!(
        "Object.defineProperty(globalThis,\"__SAVAGE_VISUAL__\",{{value:{encoded},writable:false,configurable:false}});if(document.documentElement)document.documentElement.dataset.savageVisual=\"pending\";"
    ))
}

#[cfg(test)]
mod tests {
    use super::visual_initialization_script_for;

    #[test]
    fn injects_only_allowlisted_names() {
        let script = visual_initialization_script_for(" converter-loaded ").expect("known fixture");
        assert!(script.contains("\"converter-loaded\""));
        assert!(script.contains("__SAVAGE_VISUAL__"));
        assert!(visual_initialization_script_for("converter-loaded;alert(1)").is_none());
        assert!(visual_initialization_script_for("").is_none());
        assert!(visual_initialization_script_for("menu-file").is_some());
    }
}
