# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.1] - 2026-01-23

Update minimum version requirement to Catalina since that is the min version that Tuari 2.0 supports

## [0.5.0] - 2026-01-23

Release app through homebrew instead of via dmg to bypass issues with gatekeeper, automate release

## [0.2.0] - 2025-10-17



## [0.1.1] - 2025-10-15

- Add a screen if users do not have openscad available in their path

## [0.1.0] - 2025-10-15



## [Unreleased]

### Added
- Model selector in AI chat panel to switch between models mid-conversation
- Active tab indicator with accent color at bottom
- Welcome screen now replaces untitled tab instead of creating a new one
- Bottom toolbar badges showing configured status for API keys

### Changed
- Model selection is now the single source of truth for API routing
- Provider is determined from selected model name
- Settings dialog now focuses solely on API key management
- API key sections in settings always show status badges

### Fixed
- Model selector now correctly routes to the appropriate API provider
- Tab close button works correctly with drag-to-reorder functionality
- Thinking indicator shows properly between tool call rounds

