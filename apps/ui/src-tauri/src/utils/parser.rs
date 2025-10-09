use crate::types::{Diagnostic, DiagnosticSeverity};
use regex::Regex;
use once_cell::sync::Lazy;

static ERROR_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)^(ERROR|WARNING|ECHO):\s*(.*)").unwrap()
});

static LINE_NUMBER_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"line\s+(\d+)").unwrap()
});

/// Parse OpenSCAD stderr output into structured diagnostics
pub fn parse_openscad_stderr(stderr: &str) -> Vec<Diagnostic> {
    let mut diagnostics = Vec::new();

    for line in stderr.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        if let Some(caps) = ERROR_REGEX.captures(line) {
            let severity_str = caps.get(1).unwrap().as_str().to_ascii_lowercase();
            let message = caps.get(2).map_or("", |m| m.as_str());

            let severity = match severity_str.as_str() {
                "error" => DiagnosticSeverity::Error,
                "warning" => DiagnosticSeverity::Warning,
                "echo" => DiagnosticSeverity::Info,
                _ => continue,
            };

            // Try to extract line number
            let line_number = LINE_NUMBER_REGEX
                .captures(message)
                .and_then(|c| c.get(1))
                .and_then(|m| m.as_str().parse::<i32>().ok());

            diagnostics.push(Diagnostic {
                severity,
                line: line_number,
                col: None,
                message: line.to_string(),
            });
        }
    }

    diagnostics
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_error_with_line() {
        let stderr = "ERROR: Parser error: syntax error in file, line 12";
        let diagnostics = parse_openscad_stderr(stderr);

        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].line, Some(12));
        assert!(matches!(diagnostics[0].severity, DiagnosticSeverity::Error));
    }

    #[test]
    fn test_parse_warning() {
        let stderr = "WARNING: Ignoring unknown module 'foo', line 5";
        let diagnostics = parse_openscad_stderr(stderr);

        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].line, Some(5));
        assert!(matches!(diagnostics[0].severity, DiagnosticSeverity::Warning));
    }

    #[test]
    fn test_parse_multiple() {
        let stderr = "WARNING: First warning, line 1\nERROR: Fatal error, line 10\n";
        let diagnostics = parse_openscad_stderr(stderr);

        assert_eq!(diagnostics.len(), 2);
    }
}
