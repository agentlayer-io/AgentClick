#!/bin/bash
# install-skills.sh — Copy AgentClick skills to ~/.openclaw/skills/
# Run this once to register skills with your local OpenClaw instance.

SKILLS_SRC="$(cd "$(dirname "$0")/.." && pwd)/skills"
SKILLS_DST1="$HOME/.openclaw/skills"
SKILLS_DST2="$HOME/.openclaw/workspace/skills"

mkdir -p "$SKILLS_DST1" "$SKILLS_DST2"

for skill in clawui-email clawui-approve clawui-code; do
  cp -r "$SKILLS_SRC/$skill" "$SKILLS_DST1/"
  cp -r "$SKILLS_SRC/$skill" "$SKILLS_DST2/"
  echo "Installed: $skill"
done

echo ""
echo "Installed to both:"
echo "  $SKILLS_DST1"
echo "  $SKILLS_DST2"
echo ""
echo "Restart OpenClaw (or wait ~30s for auto-reload) to pick up the new skills."
