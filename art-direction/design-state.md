# Paper Dice Duel — implemented design state

Adopted direction: A, layered paper-cut shadow theatre; red-robed caster, torn paper skeleton, warm stage, origami D4 and paper-slip timing controls. Reference: art-direction/reference.png. Gameplay reference: the user supplied QQ20261023-182411.mp4. The user's confirmed implementation plan defines all first-version numbers.

Implemented: three battles (skeleton, moss ape, black-paper shade); continuous timing input; GOOD / PERFECT then D4 hit resolution; natural-four criticals; guards, healing, speed changes, combo, XP and track-based upgrades; summon lifespan and body growth; enemy intent and dangerous skulls; win/loss, intermission, pause/restart, portrait and visibility pause, local preferences and best score.

Architecture: deterministic event-producing engine in src/engine.ts, Canvas drawing and actual sprite poses in src/renderer.ts, generated local WebP assets in public/assets, Web Audio event-driven synthesis, accessible DOM controls and responsive input in src/main.ts. Runtime requires no online API. Source and static runtime are delivered separately; no public deployment.

Verification: 19 rule tests, production build, real Playwright desktop and touch input runs, audio signal/lifecycle and load-retry checks. Independent first-slice and final visual reviews completed and findings repaired. Evidence and remaining physical-device / subjective-audio limitations are documented in 验收记录.md. Browser harness exposes read-only snapshots only.
