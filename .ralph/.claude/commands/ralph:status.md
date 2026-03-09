# /ralph:status - Check Ralph Status on VM

Visa Ralph's progress på VM utan att SSH:a manuellt.

## Usage

```
/ralph:status
/ralph:status --log      # Visa senaste log-rader
/ralph:status --full     # Visa allt
```

## Instructions

Läs VM-config och hämta status via SSH.

**STEG 1: LÄS VM CONFIG**

```bash
source ~/.ralph-vm
# Ger: VM_IP, VM_USER
```

**STEG 2: HÄMTA STATUS**

```bash
ssh $VM_USER@$VM_IP << 'EOF'
cd ~/projects/$(ls -t ~/projects | head -1)

echo "=== RALPH STATUS ==="
echo ""

# Progress
if [ -d "specs" ]; then
    total=$(ls -1 specs/*.md 2>/dev/null | grep -v "CR-" | wc -l | tr -d ' ')
    done=$(ls -1 .spec-checksums/*.md5 2>/dev/null | wc -l | tr -d ' ')
    echo "📊 Progress: $done/$total specs"
fi

# Current spec (from log)
if [ -f "ralph-deploy.log" ]; then
    current=$(grep -o "=== [^=]* ===" ralph-deploy.log | tail -1 | tr -d '=')
    echo "🔨 Current: $current"
fi

# Status
if pgrep -f "ralph.sh" > /dev/null; then
    echo "✅ Status: RUNNING"
else
    echo "⏹️ Status: STOPPED"
fi

# Last activity
if [ -f "ralph-deploy.log" ]; then
    echo ""
    echo "📝 Last 5 log lines:"
    tail -5 ralph-deploy.log
fi

# Errors
errors=$(grep -c "❌\|ERROR\|Failed" ralph-deploy.log 2>/dev/null || echo 0)
if [ "$errors" -gt 0 ]; then
    echo ""
    echo "⚠️ Errors found: $errors"
fi

# Show last error details if error log exists
if [ -f ".ralph/logs/errors.log" ]; then
    echo ""
    echo "🔴 Last error (from .ralph/logs/errors.log):"
    tail -30 .ralph/logs/errors.log
fi
EOF
```

**OUTPUT FORMAT:**

```
=== RALPH STATUS ===

📊 Progress: 15/25 specs
🔨 Current: 16-checkout-flow
✅ Status: RUNNING

📝 Last 5 log lines:
[log output]
```

**OM --log FLAGGA:**
Visa mer log:

```bash
ssh $VM_USER@$VM_IP "tail -50 ~/projects/*/ralph-deploy.log"
```
