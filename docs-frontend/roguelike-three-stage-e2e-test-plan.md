# Roguelike Three-Stage E2E Test Plan

## Summary

This test validates whether Droi AI can start from a short Roguelike request, route to the correct base template, generate a playable demo, then modify the generated game through prompts without losing the base game type.

中文摘要：

本测试分三阶段验证 Droi AI 小游戏生成链路：

1. 基础链路：用户只输入一句 Roguelike / 肉鸽需求，系统必须识别游戏类型并命中 `roguelike_survival` 基础模板。
2. 美术风格：在已生成的肉鸽游戏基础上，通过提示词调用或等效使用 `animal_island_ui`，把视觉改成动森 / cozy animal-island 风格，但不能改变肉鸽玩法。
3. 玩法改造：继续保留 `roguelike_survival` 作为基础类型，把玩法扩展成“肉鸽 + 魔塔 + 动森美术风格”，验证系统能不能把魔塔机制作为附加玩法层，而不是错误切换模板。

这份测试不是只看 AI 回复是否好听，而是要检查生成页面、Version History、Preview、生成文件、导出的 ZIP 和 `workspace-patches.json` 等可验证证据。

The test has three stages:

1. Base Template Routing: one-sentence Roguelike request -> `roguelike_survival` template -> playable demo.
2. Art Skill Transformation: keep the generated Roguelike game, apply Animal-Island / cozy art direction through prompt and `animal_island_ui` when available.
3. Gameplay Hybrid Transformation: keep Roguelike as the base type, add Magic Tower / Tower of the Sorcerer style mechanics: grid exploration, keys, doors, stat combat, route planning.

Core product promise under test:

```text
one-sentence game need
-> AI understands game type
-> AI matches base template
-> AI generates playable demo
-> user modifies art style through prompt
-> user modifies gameplay structure through prompt
-> final playable mini-game remains exportable
```

## Test Environment

Frontend:

```text
D:\Claude code\.claude\games\Droi-AI-landing-temp
http://127.0.0.1:8080/
```

Recommended local URL:

```text
http://127.0.0.1:8080/index.html?fresh=roguelike-three-stage-e2e&tools=1&toolUrl=http://127.0.0.1:5173
```

Backend:

```text
Configured by droi-config.json
Expected API base: https://droi-ai-backend-dev-hugvbpaebq-de.a.run.app
```

Optional local tool provider for Advanced mode:

```text
D:\Codex\Basic game Components\Droi-Game-Tool\frontend
npm run dev
http://127.0.0.1:5173
```

## Current Implementation Readiness Audit

This section records what the current frontend code can already prove before running the test.

Observed in `script.js`:

```text
roguelike_survival: present
animal_island_ui: present in demo / art-skill state
magic_tower: not found
tower_of_sorcerer: not found
hybridModifiers: not found
hybrid_modifier: not found
generationRuleDecision: not found
```

Implication:

- Stage 1 is expected to be runnable only when the backend Templates registry has a published and `compileReady` `roguelike_survival` template.
- Stage 2 is expected to be partially runnable because `animal_island_ui` exists in the workspace/demo state, but the test must still verify whether a real generated Roguelike project can receive the style patch broadly.
- Stage 3 is intentionally a gap-revealing test. The current frontend does not expose explicit `magic_tower_elements`, `hybridModifiers`, or `generationRuleDecision` code paths yet. Passing Stage 3 requires either:
  - the backend already returns equivalent patch metadata that the frontend can record/export, or
  - the product adds a real hybrid modifier path for `roguelike_survival + magic_tower_elements`.

Do not treat Stage 3 as passed just because the chat reply mentions Magic Tower. It must produce an inspectable workspace patch, generated spec change, `workspace-patches.json`, or equivalent evidence while preserving `templateId = roguelike_survival`.

## Stage 1: Base Link Test - One-Sentence Roguelike Generation

### Goal

Verify that a short user prompt is correctly recognized as Roguelike / Roguelike Survival and routed to the `roguelike_survival` base template.

### User Prompt

Use this exact one-sentence prompt first:

```text
Generate a playable Roguelike survival game where a hero explores random rooms, fights waves of enemies, collects XP, chooses upgrades, and tries to defeat a final boss.
```

If the AI asks for additional information, answer in English:

```text
Game Type: Roguelike Survival
Art Style: Clean readable fantasy arcade
Setting: Random dungeon rooms connected by portals
Core Gameplay: room exploration, auto attack, enemy waves, XP pickups, upgrade choices, boss pressure
Player Goal: survive rooms, grow stronger, and defeat the final boss
Main Challenge: enemy swarms, limited health, upgrade planning, escalating rooms
Progression: XP levels, three-choice upgrades, stronger weapons, elite waves, final boss
Difficulty: Normal, beginner-friendly opening with gradual escalation
```

### Expected AI Decisions

The AI analysis / generation decision should include:

```json
{
  "templateDecision": {
    "templateId": "roguelike_survival"
  },
  "gameTemplateDecision": {
    "templateId": "roguelike_survival"
  },
  "capabilityDecision": {
    "supported": true
  }
}
```

`artSkillDecision` can be `null` in Stage 1.

### Playability Requirements

The generated demo must contain, at minimum:

- Player character.
- Enemies.
- Random rooms, random map sections, or random wave progression.
- Combat, collision, auto attack, or clear attack loop.
- Health / HP.
- XP, reward, upgrade, or level-up choice.
- Lose state.
- Win state, boss clear, or room clear progression.
- Restart flow.

### Evidence To Capture

Browser evidence:

- Screenshot of AI plan showing Roguelike Survival.
- Screenshot of generated page with playable preview.
- Screenshot after starting the game.

Project evidence:

- `generation-report.json` or equivalent Code panel file.
- `spec/game.json` or generated game spec.
- `assets/manifest.json`.

### Pass Criteria

Pass if all are true:

- `templateId` is `roguelike_survival`.
- The generated page reaches the post-generation workspace.
- The game can be started or previewed.
- The demo visibly behaves like a Roguelike survival game.
- The game does not route to `bullet_hell`, tower defense, platformer, island builder, or generic action.
- Save ZIP still works from the generated page.

### Fail Criteria

Fail if any are true:

- Template decision is not `roguelike_survival`.
- AI refuses or routes to manual queue without a clear backend reason.
- Generated result is only a static page, not playable.
- No health, enemies, rewards/upgrades, or restart loop exists.
- The page silently freezes or fails without visible error.

## Stage 2: Art Skill Test - Convert Generated Roguelike To Animal-Island Style

### Goal

Verify that a generated Roguelike can keep its gameplay while switching visual direction through prompt-driven art skill matching.

This stage should not change the base game type. It should only affect:

- Style tokens.
- UI shape language.
- Asset prompts.
- Runtime visual theme when supported.
- `assets/manifest.json` generation metadata or workspace patches.

### Edit Prompt

After Stage 1 reaches the generated workspace, select an art or visual target if available, then submit:

```text
Keep this as a Roguelike survival game, but transform the entire visual style into a cozy animal-island inspired look. Use warm cream, mint green, peach, soft leaf green, rounded toy-like silhouettes, handmade paper-cut shapes, pill-shaped UI, friendly critter enemies, flower pickups, acorn buttons, soft cloud puffs, and gentle village-island charm. Do not use dark cyberpunk, neon grids, sci-fi metal, photorealism, or copyrighted Animal Crossing characters or logos. Keep combat, rooms, XP, upgrades, enemies, boss pressure, health, failure, victory, and restart unchanged.
```

### Expected AI / Workspace Decisions

Expected if `animal_island_ui` is published and available:

```json
{
  "templateDecision": {
    "templateId": "roguelike_survival"
  },
  "artSkillDecision": {
    "skillId": "animal_island_ui"
  },
  "generationRuleDecision": {
    "allowedEditClass": "safe_edit"
  }
}
```

If `animal_island_ui` is not published:

- `artSkillDecision` may be `null`.
- The prompt should still produce Animal-Island style wording in `stylePatch`, `assetPrompts`, or `workspace-patches.json`.
- The base template must remain `roguelike_survival`.

### Visual Replacement Requirements

The change must be broad, not just a background color swap.

Expected visible / file-level changes:

- Player art prompt/style references become cozy, rounded, handmade, or leaf/nature themed.
- Enemies become friendly critters, island guardians, slimes, bugs, or rounded creatures.
- Pickups become flowers, fruit, acorns, blossoms, or cozy tokens.
- UI becomes pill-shaped, soft, pastel, rounded.
- Background becomes warm island / village / nature themed.
- Dark sci-fi/neon/cyber style is no longer the dominant language.

### Evidence To Capture

Browser evidence:

- Screenshot before visual edit.
- Screenshot after visual edit.
- Screenshot of edit conversation showing the art prompt and AI response.
- Screenshot of Version History showing `v2` or equivalent art replacement record.

Project evidence:

- `assets/manifest.json` contains Animal-Island terms in `generation.assetPrompts`, `stylePatch`, or equivalent fields.
- `workspace-patches.json` contains the art edit if saved after the change.
- `generation-report.json` keeps `templateId = roguelike_survival`.

### Pass Criteria

Pass if all are true:

- The base game remains Roguelike / `roguelike_survival`.
- Art skill is matched when available, or style patch clearly preserves Animal-Island terms when skill is unavailable.
- Visual language changes across player, enemies, pickups, background, and UI prompts or runtime theme.
- Gameplay loop from Stage 1 is not removed.
- Save ZIP includes the current workspace patch state.

### Fail Criteria

Fail if any are true:

- The edit changes the game into island builder, cozy farm sim, tower defense, bullet hell, or generic UI demo.
- Only one color or one background changes while all core assets remain old style.
- The AI uses copyrighted Animal Crossing characters, names, logos, or exact franchise assets.
- The game loses combat, XP/upgrades, rooms/waves, health, or restart.

## Stage 3: Gameplay Transformation Test - Roguelike + Magic Tower + Animal-Island Style

### Goal

Verify that the product can preserve the Roguelike base type while adding a Magic Tower / Tower of the Sorcerer style gameplay layer.

This is a hybrid modifier, not a template switch.

The expected result:

```text
baseTemplate = roguelike_survival
hybridModifier = magic_tower_elements / tower_of_sorcerer_elements
artStyle = animal_island_ui or Animal-Island style patch
```

### Edit Prompt

Submit this after Stage 2:

```text
Keep the base game type as Roguelike Survival, but redesign the gameplay into a Roguelike + Magic Tower hybrid. Preserve random runs, local growth, health, enemies, rewards, failure, victory, and restart. Add grid-based floor exploration, locked doors, colored keys, route planning, stat-based combat, visible enemy stats, treasure rooms, shop or altar choices, and floor-by-floor progression. The player should choose paths carefully: collect keys, decide whether to fight enemies, upgrade attack/defense/health, and reach a final floor guardian. Keep the cozy animal-island art direction from the previous edit: pastel paper-cut rooms, acorn keys, flower doors, friendly critter enemies, fruit treasures, pill-shaped UI, and warm village-island charm. Do not switch to a pure tower defense game, pure puzzle game, or pure farming game.
```

### Expected Rule Decision

Expected decision:

```json
{
  "templateDecision": {
    "templateId": "roguelike_survival"
  },
  "generationRuleDecision": {
    "allowedEditClass": "hybrid_modifier",
    "reason": "The request preserves Roguelike Survival as the base template and adds Magic Tower mechanics as a modifier."
  },
  "hybridModifiers": [
    {
      "id": "magic_tower_elements",
      "baseTemplateId": "roguelike_survival",
      "scope": "modifier"
    }
  ]
}
```

If the current implementation does not yet expose `magic_tower_elements`, acceptable v1 evidence is:

- A recorded workspace edit or patch describing the Magic Tower mechanics.
- `templateId` remains `roguelike_survival`.
- The UI clearly does not treat the request as a template switch.

### Gameplay Requirements

The final game should include as many of these as the current runtime supports:

Roguelike requirements:

- Randomized rooms, floors, layouts, enemy sets, or rewards.
- Local run growth.
- XP, upgrades, stats, items, or choice-based progression.
- Death / restart.
- Boss or final guardian.

Magic Tower requirements:

- Grid or tile-based navigation.
- Doors or gates.
- Keys or equivalent unlock resources.
- Visible player stats: HP, attack, defense, keys, floor.
- Visible enemy stats or predictable stat combat.
- Route planning: player can choose fight / avoid / unlock / collect order.
- Treasure, shop, altar, or stat-up rooms.
- Floor-by-floor progression.

Animal-Island requirements:

- Pastel paper-cut environment.
- Acorn keys / flower doors / fruit treasures or equivalent cozy replacements.
- Friendly critter enemies.
- Pill-shaped UI.
- Warm village-island style remains dominant.

### Evidence To Capture

Browser evidence:

- Screenshot of prompt submission.
- Screenshot of AI response confirming hybrid gameplay, not template switch.
- Screenshot of Version History showing a new gameplay change version, e.g. `v3`.
- Screenshot of final playable preview.

Project evidence:

- `workspace-patches.json` after Save ZIP.
- `spec/game.json` or generated spec showing Magic Tower mechanics where possible.
- `generation-report.json` still shows `roguelike_survival`.
- Any `hybridModifiers`, `generationRuleDecision`, or equivalent patch metadata.

### Pass Criteria

Pass if all are true:

- Base template remains `roguelike_survival`.
- The system does not switch to tower defense, platformer, bullet hell, or farm sim.
- Magic Tower mechanics are added as a modifier or recorded patch.
- Animal-Island style remains active.
- Final preview remains playable or at least the runtime clearly records patches for rerun/export.
- Save ZIP includes `workspace-patches.json` with art and gameplay edits.

### Fail Criteria

Fail if any are true:

- The base template changes away from Roguelike.
- The AI blocks the request as a full template switch even though the prompt says to preserve Roguelike.
- Magic Tower mechanics are ignored completely.
- Animal-Island style is lost.
- The generated game becomes only a design document or static file view.
- The page accepts the prompt silently but produces no history, no patch, and no feedback.

## Full Test Execution Checklist

### Before Running

- Start frontend server:

```powershell
cd "D:\Claude code\.claude\games\Droi-AI-landing-temp"
python -m http.server 8080
```

- Optional: start local Droi-Game-Tool:

```powershell
cd "D:\Codex\Basic game Components\Droi-Game-Tool\frontend"
npm run dev
```

- Open:

```text
http://127.0.0.1:8080/index.html?fresh=roguelike-three-stage-e2e&tools=1&toolUrl=http://127.0.0.1:5173
```

### Stage 1 Checklist

- Submit one-sentence Roguelike prompt.
- Confirm AI plan says Roguelike Survival.
- Confirm generated page appears.
- Start preview.
- Confirm player / enemies / health / XP or upgrades / restart.
- Save ZIP once and inspect exported project files if needed.

### Stage 2 Checklist

- In generated workspace, submit Animal-Island art edit prompt.
- Confirm Version History records art edit.
- Confirm Edit Conversation gives explicit feedback.
- Confirm art prompt/style terms appear in manifest or patches.
- Confirm gameplay still Roguelike.

### Stage 3 Checklist

- Submit Roguelike + Magic Tower hybrid prompt.
- Confirm the system treats it as hybrid modifier, not template switch.
- Confirm Version History records gameplay change.
- Confirm final preview or patches include keys / doors / grid / stat combat / route planning.
- Save ZIP and inspect `workspace-patches.json`.

## Manual Inspection Targets

Use the Code panel or exported ZIP to inspect:

```text
generation-report.json
spec/game.json
spec/generated-game-spec.json
spec/template-patch-plan.json
assets/manifest.json
workspace-patches.json
```

Look for these exact or equivalent terms:

```text
roguelike_survival
Roguelike Survival
animal_island_ui
cozy animal island
warm cream
mint green
paper-cut
pill-shaped UI
magic tower
grid
keys
doors
stat combat
route planning
floor progression
```

## Automation Notes

A future automated test can treat this as three assertions layers:

1. DOM layer:
   - `.generated-game-page` exists.
   - Version History contains `v1`, then later `v2` / `v3`.
   - `Preview / Play`, `Save ZIP`, and mode switch buttons exist.

2. Decision layer:
   - `templateDecision.templateId === "roguelike_survival"`.
   - `artSkillDecision.skillId === "animal_island_ui"` when skill is available.
   - `generationRuleDecision.allowedEditClass` is `safe_edit` for art and `hybrid_modifier` for Magic Tower.

3. Export layer:
   - Save ZIP emits project files.
   - ZIP includes `workspace-patches.json`.
   - Patches contain numeric/art/gameplay edits.

## Final Acceptance Criteria

The whole test passes only if the final playable or exportable state proves:

```text
Roguelike base template preserved
+ Animal-Island visual style applied broadly
+ Magic Tower mechanics added as a modifier
+ Generated page remains playable/editable/exportable
```

Do not mark the test passed based only on a pretty prompt or a successful chat reply. The evidence must come from the generated page, version history, preview behavior, generated files, or exported ZIP.
