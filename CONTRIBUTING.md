# Contributing to OpenSCAD Studio

Thank you for your interest in contributing to OpenSCAD Studio! This document provides guidelines and instructions for contributing.

## 🚀 Getting Started

### Prerequisites

**Development Tools:**

- Node.js 18+ and pnpm
- Rust toolchain via [rustup](https://rustup.rs/) (only needed for desktop development)
- OpenSCAD binary (desktop only): `bash apps/ui/src-tauri/scripts/download-openscad.sh`
- Git

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/zacharyfmarion/openscad-studio.git
cd openscad-studio

# Install dependencies
pnpm install

# First-time desktop setup: download OpenSCAD binary
bash apps/ui/src-tauri/scripts/download-openscad.sh

# Run web version in development mode
pnpm web:dev

# Run desktop version in development mode (requires Rust)
pnpm tauri:dev
```

## 📝 Development Workflow

### Branch Strategy

- `main` - Production-ready code
- `feature/your-feature-name` - Feature branches
- `fix/issue-number-description` - Bug fix branches

### Making Changes

1. **Create a new branch** from `main`:

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following our code style guidelines

3. **Test your changes**:

   ```bash
   # Type check
   pnpm type-check

   # Lint
   pnpm lint

   # Check formatting
   pnpm format:check

   # Build the web app
   pnpm web:build

   # Run the web app locally
   pnpm web:dev

   # Run the desktop app locally (requires Rust)
   pnpm tauri:dev

   # Run the UI test suite when your change touches app behavior
   cd apps/ui && pnpm test
   ```

4. **Commit your changes** using conventional commits:

   ```bash
   git commit -m "feat: add new feature"
   ```

5. **Push and create a pull request**:
   ```bash
   git push origin feature/your-feature-name
   ```

## 🎨 Code Style

### TypeScript/React

- Use functional components with hooks (no class components)
- Prefer `const` over `let`
- Use TypeScript strict mode
- Use async/await over raw promises
- Extract complex logic into custom hooks

**Example:**

```typescript
// Good
export function MyComponent({ value }: { value: string }) {
  const [state, setState] = useState('');

  const handleClick = useCallback(() => {
    setState(value);
  }, [value]);

  return <button onClick={handleClick}>{state}</button>;
}

// Avoid
class MyComponent extends React.Component { ... }
```

### Rust (Desktop Only)

- Follow `rustfmt` defaults
- Use `Result<T, E>` for error handling
- Document public APIs with doc comments
- Prefer `async` functions for I/O operations

## 📋 Commit Message Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

- ✨ `feat:` New feature
- 🐛 `fix:` Bug fix
- 📝 `docs:` Documentation changes
- ♻️ `refactor:` Code restructuring without feature changes
- ✅ `test:` Adding or updating tests
- 🎨 `style:` Code style changes (formatting, etc.)
- ⚡ `perf:` Performance improvements
- 🔧 `chore:` Build process or tooling changes

**Examples:**

```bash
feat: add 2D SVG preview mode
fix: resolve Monaco editor line number sync issue
docs: update README with installation instructions
refactor: extract render caching logic to separate module
```

## 🧪 Testing Guidelines

The project uses a mix of automated and manual testing. When contributing:

1. **Run the relevant automated checks**:
   - `pnpm type-check`
   - `pnpm lint`
   - `pnpm format:check`
   - `pnpm web:build`
   - `cd apps/ui && pnpm test` for UI logic and component behavior
   - `npx playwright test` when your change affects end-to-end flows or desktop/web integration

2. **Test your changes manually** with the checklist:
   - [ ] Feature works as expected
   - [ ] No console errors
   - [ ] No TypeScript errors
   - [ ] Works on your target platform/browser (desktop currently macOS; web in the target browser)

3. **Test edge cases**:
   - [ ] Empty files
   - [ ] Large files (>1000 lines)
   - [ ] OpenSCAD errors
   - [ ] Invalid user input

4. **When adding automated tests**:
   - Place unit tests next to source files
   - Place integration tests in `tests/` directory
   - Use descriptive test names

## 📁 Project Structure

```
openscad-studio/
├── apps/
│   ├── ui/                      # Shared React frontend + Tauri desktop backend
│   │   ├── src/                 # React components, hooks, platform bridge, services
│   │   └── src-tauri/           # Rust backend code (desktop only)
│   └── web/                     # Web app entry point (Vite)
├── packages/
│   └── shared/                  # Shared TypeScript types
├── CLAUDE.md                    # AI assistant guide
└── engineering-roadmap.md        # Development roadmap
```

## 🐛 Reporting Bugs

When reporting bugs, please include:

1. **Description**: Clear description of the issue
2. **Steps to reproduce**: Numbered steps to reproduce the behavior
3. **Expected behavior**: What you expected to happen
4. **Actual behavior**: What actually happened
5. **Environment**:
   - OS: (macOS 14.0, Windows 11, Ubuntu 22.04, etc.)
   - App surface: web app or desktop app (desktop is currently macOS-focused)
   - Browser (for web) or desktop app version (from About dialog)
   - App version: (from About dialog)
6. **Screenshots/logs**: If applicable

## 💡 Suggesting Features

Feature requests are welcome! Please:

1. Check existing issues to avoid duplicates
2. Clearly describe the feature and its use case
3. Explain why this feature would be useful
4. Consider implementation complexity
5. Be open to discussion and iteration

## 🔍 Code Review Process

All submissions require review. When reviewing:

- **Be respectful and constructive**
- **Focus on the code, not the person**
- **Explain reasoning** for suggested changes
- **Approve when ready** or request changes with clear guidance

## 📚 Resources

- **Documentation**: [CLAUDE.md](CLAUDE.md) - Comprehensive codebase guide
- **Architecture**: [AGENTS.md](AGENTS.md) - AI agent system design
- **Development**: [DEVELOPMENT.md](DEVELOPMENT.md) - Local setup and share-feature workflows
- **Roadmap**: [engineering-roadmap.md](engineering-roadmap.md) - Development phases
- **OpenSCAD Docs**: https://openscad.org/documentation.html
- **Tauri Docs**: https://tauri.app/
- **React Docs**: https://react.dev/

## 🤝 Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inclusive environment for all contributors.

### Our Standards

- **Be respectful** of differing viewpoints and experiences
- **Be collaborative** and help others learn
- **Be patient** with newcomers and mistakes
- **Give constructive feedback** with kindness
- **Accept constructive criticism** gracefully

### Unacceptable Behavior

- Harassment, trolling, or discriminatory language
- Personal attacks or insults
- Spam or off-topic content
- Publishing others' private information

### Enforcement

Violations may result in temporary or permanent ban from the project. Report violations to the project maintainers.

## ⚖️ License

By contributing, you agree that your contributions will be licensed under the GNU General Public License v2.0 (GPL-2.0).

## 🎉 Recognition

Contributors will be recognized in:

- GitHub contributors page
- Release notes (for significant contributions)
- Future CONTRIBUTORS.md file

---

**Questions?** Open an issue or discussion on GitHub!

**Thank you for contributing to OpenSCAD Studio! 🙏**
