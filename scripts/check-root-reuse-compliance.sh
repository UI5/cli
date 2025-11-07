#!/bin/bash

# SPDX-FileCopyrightText: 2025 SAP SE or an SAP affiliate company and UI5 CLI contributors
# SPDX-License-Identifier: Apache-2.0

# Script to check REUSE compliance for root files only (excluding packages folder)
#
# WHY THIS SCRIPT IS NEEDED:
# Standard 'reuse lint' from the root folder scans the entire repository including packages/*,
# but we have a scan for each package separately and here we want to check only the root-level files.

echo "🔍 Checking REUSE compliance for root workspace files (excluding packages)..."

CHECKED_FILES=0
FAILED_FILES=0

# Function to check a single file
check_file() {
    if pipx run reuse lint-file "$1" 2>&1; then
        return 0
    else
        FAILED_FILES=$((FAILED_FILES + 1))
        return 1
    fi
}

# Get all root files (excluding packages directory)
FILES=$(find . -maxdepth 1 -type f ! -name '.*' && \
        find .editorconfig .gitattributes .gitignore .licensee.json .npmrc 2>/dev/null && \
        find docs examples resources rfcs scripts site .github .husky .vscode LICENSES -type f 2>/dev/null)

# Check each file
for file in $FILES; do
    check_file "$file"
    CHECKED_FILES=$((CHECKED_FILES + 1))
done

# Summary
echo ""
echo "📊 Summary:"
echo "   Total files checked: $CHECKED_FILES"
echo "   Failed files: $FAILED_FILES"
echo "   Success rate: $(( (CHECKED_FILES - FAILED_FILES) * 100 / CHECKED_FILES ))%"

if [ $FAILED_FILES -eq 0 ]; then
    echo "🎉 All root workspace files are REUSE compliant!"
    exit 0
else
    echo "❌ $FAILED_FILES files failed REUSE compliance"
    exit 1
fi