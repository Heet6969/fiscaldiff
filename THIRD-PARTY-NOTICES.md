# Third-party notices

FiscalDiff's own code is MIT licensed — see [LICENSE](LICENSE), copyright 2026
Heet Shah. The dependencies below keep their own licenses, listed as reported by
`npm view <package> license` at the versions actually installed.

## Runtime dependencies

These ship in the built application.

| Package | Version | License |
|---|---|---|
| react | 19.3.1 | MIT |
| react-dom | 19.3.1 | MIT |
| decimal.js | 10.6.0 | MIT |
| papaparse | 5.7.0 | MIT |

## Development dependencies

These are used to build and test the application and are not shipped in it.

| Package | Version | License |
|---|---|---|
| typescript | 5.9.3 | Apache-2.0 |
| vite | 8.3.5 | MIT |
| @vitejs/plugin-react | 6.1.2 | MIT |
| vitest | 5.0.5 | MIT |
| fast-check | 4.10.2 | MIT |
| @playwright/test | 1.64.1 | Apache-2.0 |
| @axe-core/playwright | 4.14.0 | MPL-2.0 |
| @types/react | 19.3.0 | MIT |
| @types/react-dom | 19.3.0 | MIT |
| @types/papaparse | 5.5.2 | MIT |

Transitive dependencies carry their own licenses. Run `npm ls` for the full
installed tree.

## Notes

- `@axe-core/playwright` is MPL-2.0. It is a development-only accessibility
  testing tool, is not bundled into the application, and is not modified here.
- Node.js itself was installed from the official OpenJS distribution via
  `winget install --id OpenJS.NodeJS.LTS`.
