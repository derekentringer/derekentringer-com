# 07 — Import & Export

**Status:** Planned
**Phase:** 5 — Workflow Integration
**Priority:** Low

## Summary

Import markdown files as notes and export notes as markdown files. Support single-file and batch operations.

## Commands

### Export
```bash
ns notes export "Project Plan"                         # Markdown to stdout
ns notes export "Project Plan" -o plan.md              # To file
ns notes export "Project Plan" --format json           # Full JSON export
ns notes export --folder Work -o work/                 # Export folder to directory
ns notes export --folder Work -o work.zip              # Export folder as zip
ns notes export --all -o backup.zip                    # Full backup
```

### Import
```bash
ns notes import document.md                            # Import single file
ns notes import document.md --folder Work              # Place in folder
ns notes import document.md --tags imported,doc        # Add tags
ns notes import ./notes/ --folder "Imported"           # Import directory of .md files
ns notes import ./notes/ --recursive                   # Include subdirectories
```

**Import behavior:**
- Title derived from first `# heading` or filename
- Existing notes with same title are NOT overwritten (creates new)
- Reports: `Imported 15 notes (3 skipped — already exist)`

## Tasks

- [ ] Add `export` subcommand — single note, folder, all
- [ ] Add `import` subcommand — single file, directory, recursive
- [ ] Zip support for batch export
- [ ] Title extraction from markdown headings
- [ ] Progress reporting for batch operations
- [ ] `--dry-run` flag for import preview
