# Decisions

- Engine: Three.js + TypeScript + Vite (not Unreal/Godot). The game must run on Netlify in the browser, and agents can build and test web code entirely in the cloud container (headless WebGL 2 works there). Unreal's binary assets and size make autonomous agent work impractical.
- Art: polished stylized-realistic from consistent CC0 assets instead of photoreal. It is achievable without custom art, and through red/green lenses shape and lighting matter more than hue.
- Weak-eye rendering: a compositor that changes only the weak-eye color channel under a mask. The strong eye literally receives the same pixels as if the object weren't there.
