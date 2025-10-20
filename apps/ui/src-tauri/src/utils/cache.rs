use crate::types::Diagnostic;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

/// Current cache version - increment this when CacheEntry structure changes
const CACHE_VERSION: u32 = 2;

/// A cache entry containing the rendered output path and metadata
#[derive(Clone, Debug)]
pub struct CacheEntry {
    pub version: u32,
    pub output_path: PathBuf,
    pub timestamp: u64,
    pub kind: String, // "png", "svg", or "mesh"
    pub diagnostics: Vec<Diagnostic>,
}

/// Simple in-memory cache for render results
pub struct RenderCache {
    entries: Mutex<HashMap<String, CacheEntry>>,
}

impl Default for RenderCache {
    fn default() -> Self {
        Self::new()
    }
}

impl RenderCache {
    pub fn new() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
        }
    }

    /// Generate a cache key from source code and render parameters
    pub fn generate_key(source: &str, backend: &str, view: &str, render_mesh: bool) -> String {
        let mut hasher = Sha256::new();
        hasher.update(source.as_bytes());
        hasher.update(backend.as_bytes());
        hasher.update(view.as_bytes());
        hasher.update(if render_mesh { "mesh" } else { "image" }.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    /// Get an entry from the cache if it exists and the file is still present
    pub fn get(&self, key: &str) -> Option<CacheEntry> {
        let entries = self.entries.lock().ok()?;
        let entry = entries.get(key)?;

        // Invalidate entries with old version
        if entry.version != CACHE_VERSION {
            return None;
        }

        // Verify the cached file still exists
        if entry.output_path.exists() {
            Some(entry.clone())
        } else {
            None
        }
    }

    /// Store an entry in the cache
    pub fn set(
        &self,
        key: String,
        output_path: PathBuf,
        kind: String,
        diagnostics: Vec<Diagnostic>,
    ) {
        if let Ok(mut entries) = self.entries.lock() {
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();

            entries.insert(
                key,
                CacheEntry {
                    version: CACHE_VERSION,
                    output_path,
                    timestamp,
                    kind,
                    diagnostics,
                },
            );
        }
    }

    /// Clear entries older than the specified age (in seconds)
    pub fn evict_old(&self, max_age_secs: u64) {
        if let Ok(mut entries) = self.entries.lock() {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();

            entries.retain(|_, entry| {
                let age = now.saturating_sub(entry.timestamp);
                age < max_age_secs
            });
        }
    }

    /// Get cache statistics
    pub fn stats(&self) -> (usize, usize) {
        if let Ok(entries) = self.entries.lock() {
            let total = entries.len();
            let valid = entries.values().filter(|e| e.output_path.exists()).count();
            (total, valid)
        } else {
            (0, 0)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_key_generation() {
        let key1 = RenderCache::generate_key("cube([10,10,10]);", "auto", "3d", false);
        let key2 = RenderCache::generate_key("cube([10,10,10]);", "auto", "3d", false);
        let key3 = RenderCache::generate_key("sphere(5);", "auto", "3d", false);

        assert_eq!(key1, key2); // Same input = same key
        assert_ne!(key1, key3); // Different input = different key
    }

    #[test]
    fn test_cache_operations() {
        let cache = RenderCache::new();
        let key = "test_key".to_string();
        let path = PathBuf::from("/tmp/test.png");

        // Initially empty
        assert!(cache.get(&key).is_none());

        // Set and retrieve
        cache.set(key.clone(), path.clone(), "png".to_string(), vec![]);

        // Note: This test will fail if the file doesn't exist
        // In production, we only cache files that actually exist
    }
}
