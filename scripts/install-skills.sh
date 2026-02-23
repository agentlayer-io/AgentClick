#!/bin/bash
# install-skills.sh — Copy AgentClick skills to ~/.openclaw/skills/
# Run this once to register skills with your local OpenClaw instance.

SKILLS_SRC="$(cd "$(dirname "$0")/.." && pwd)/skills"
SKILLS_DST="$HOME/.openclaw/skills"

mkdir -p "$SKILLS_DST"

for skill in clawui-email clawui-approve clawui-code; do
  cp -r "$SKILLS_SRC/$skill" "$SKILLS_DST/"
  echo "Installed: $skill → $SKILLS_DST/$skill"
done

echo ""
echo "Done. Restart OpenClaw (or wait ~30s for auto-reload) to pick up the new skills."
echo "Verify with: openclaw skills list | grep clawui"
