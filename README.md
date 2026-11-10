# Red-Green Open World

A short, polished, non-violent 3D open-world browser game for kids (8–13), played with red-green
glasses. Collectibles and secrets are visible only to the weaker eye.

- **Play:** https://red-green-open-world.netlify.app (after the first deploy)
- **Spec:** [CLAUDE.md](CLAUDE.md) · [Game design](docs/GAME_DESIGN.md) · [Build plan](docs/BUILD_PLAN.md)
- **Status:** [docs/PROGRESS.md](docs/PROGRESS.md) · **Continue the build in a new session:** [docs/HANDOFF.md](docs/HANDOFF.md)
- **Asset credits:** [ASSETS.md](ASSETS.md)

Stack: Three.js, TypeScript, Vite, Rapier physics, deployed as a static site on Netlify.

```bash
npm install
npm run dev      # local dev server
npm run verify   # typecheck, lint, tests, build, smoke test
```
