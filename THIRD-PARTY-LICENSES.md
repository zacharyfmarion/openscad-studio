# Third-Party Licenses

This document lists third-party software bundled with OpenSCAD Studio.

## OpenSCAD

- **Project**: [OpenSCAD](https://openscad.org/) — The Programmers Solid 3D CAD Modeller
- **License**: GPL-2.0 (with CGAL linking exception)
- **Source**: https://github.com/openscad/openscad
- **Bundled version**: Snapshot build from https://files.openscad.org/snapshots/
- **Usage**: The desktop app bundles the OpenSCAD binary and its dependencies for native rendering. The web app uses openscad-wasm (a WebAssembly build of the same codebase).

The full text of the GNU General Public License version 2 is included in the [LICENSE](LICENSE) file, which also applies to OpenSCAD Studio itself.

## Noto Fonts

- **Project**: [Noto Fonts](https://github.com/notofonts/noto-fonts)
- **License**: SIL Open Font License 1.1
- **Source**: https://github.com/notofonts/noto-fonts
- **Bundled files**:
  - `apps/ui/src/assets/openscad-fonts/NotoSans-Regular.ttf`
  - `apps/ui/src/assets/openscad-fonts/NotoSerif-Regular.ttf`
  - `apps/ui/src/assets/openscad-fonts/NotoSansMono-Regular.ttf`
  - `apps/ui/src/assets/openscad-fonts/LICENSE.txt`
- **Usage**: These fonts are bundled only for the web `openscad-wasm` runtime so OpenSCAD `text()` output can render reliably in the browser when a requested font family is missing from the WASM environment.

### Bundled OpenSCAD Dependencies

The OpenSCAD.app bundle includes the following third-party libraries:

| Library                                                                                                  | License            |
| -------------------------------------------------------------------------------------------------------- | ------------------ |
| Qt 6 (Core, Gui, Widgets, OpenGL, Svg, Network, Multimedia, Concurrent, PrintSupport, Core5Compat, DBus) | LGPL-3.0           |
| Boost (regex, program_options)                                                                           | BSL-1.0            |
| CGAL                                                                                                     | GPL-3.0 / LGPL-3.0 |
| Manifold                                                                                                 | Apache-2.0         |
| lib3mf                                                                                                   | BSD-2-Clause       |
| Cairo                                                                                                    | LGPL-2.1           |
| Freetype                                                                                                 | FTL / GPL-2.0      |
| Harfbuzz                                                                                                 | MIT                |
| Fontconfig                                                                                               | MIT                |
| GLib                                                                                                     | LGPL-2.1           |
| GMP / MPFR                                                                                               | LGPL-3.0           |
| OpenCSG                                                                                                  | GPL-2.0            |
| libzip                                                                                                   | BSD-3-Clause       |
| HIDAPI                                                                                                   | BSD-3-Clause       |
| Pixman                                                                                                   | MIT                |
| Graphite2                                                                                                | LGPL-2.1           |
| Clipper2                                                                                                 | BSL-1.0            |
| QScintilla                                                                                               | GPL-3.0            |
| oneTBB                                                                                                   | Apache-2.0         |
| PCRE2                                                                                                    | BSD-3-Clause       |

These libraries are distributed as part of the OpenSCAD.app bundle and are subject to their respective licenses. OpenSCAD Studio does not modify any of these libraries.
