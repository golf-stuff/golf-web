#!/bin/bash
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

claude plugin marketplace add obra/superpowers-marketplace
claude plugin install superpowers@superpowers-marketplace