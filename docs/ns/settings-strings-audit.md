# NoteSync Settings Strings Audit

## Purpose

Review every user-facing string used in the Settings screens and the screens reachable from Settings, across all three platforms (web, desktop, mobile). Flag inconsistencies, fix "Claude" references that should say "AI Assistant," and tighten copy where it has drifted between platforms.

## How to use this file

For each entry:

- **Current strings** are quoted verbatim from each platform with file + approximate line.
- ✅ marks an entry where all three platforms (where the setting exists) match — no action unless you want to reword.
- ⚠️ marks divergence between platforms or copy that mentions "Claude."
- **PROPOSED** slots are empty — fill them in with the wording you want shipped. Leaving a PROPOSED blank means "leave as-is."

When done, save the file and hand it back to me. I'll apply the changes across all three platforms in one pass, including test updates.

---

## ⚠️ Priority — "Claude" references in user-facing copy

The only user-facing Claude references are in the **Auto-Approve Destructive Actions** description (one per platform). Everywhere else "Claude" appears it is in a code comment or a test fixture title — those are not surfaced to users.

### Auto-Approve Destructive Actions — group description

- **Web** (`packages/ns-web/src/pages/SettingsPage.tsx:755`):  
  "When off, Claude must wait for your confirmation before each of these. Enable sparingly."
- **Desktop** (`packages/ns-desktop/src/pages/SettingsPage.tsx:919`):  
  "When off, Claude must wait for your confirmation before each of these. Enable sparingly."
- **Mobile** (`packages/ns-mobile/src/screens/SettingsScreen.tsx:881`):  
  "When off, Claude waits for your confirmation. Enable sparingly."

⚠️ Mentions "Claude" + mobile copy is also slightly shorter than web/desktop.

**PROPOSED**: When disabled the AI Assistant waits for your confirmation.

---

## Section: Appearance

### Theme — row label
- **Web** (SettingsPage.tsx:572): "Theme"
- **Desktop** (SettingsPage.tsx:431): "Theme"
- **Mobile** (SettingsScreen.tsx:497): "Theme"

✅ Identical.

**PROPOSED**:

### Theme — description
- **Web**: (none)
- **Desktop**: (none)
- **Mobile** (SettingsScreen.tsx:499): "\"System\" follows your device's light/dark setting."

⚠️ Mobile-only description. Consider whether web/desktop should match.

**PROPOSED**: Match on web and desktop as a tooltip

### Theme — option labels
- All platforms: "Dark", "Light", "System", "Teams"

✅ Identical.

**PROPOSED**: "System", "Dark", "Light", "Grey"

### Accent Color — row label
- **Web** (SettingsPage.tsx:580): "Accent Color"
- **Desktop** (SettingsPage.tsx:439): "Accent Color"
- **Mobile** (SettingsScreen.tsx:553): "Accent Color"

✅ Identical.

**PROPOSED**:

### Accent Color — description (mobile only)
- **Mobile** (SettingsScreen.tsx:554-557):
  - When Teams theme active: "Overridden while the Teams theme is active."
  - Otherwise: "Used for the primary action color across the app."

⚠️ Mobile-only description; web/desktop have no helper copy.

**PROPOSED (Teams active)**: Used for the primary action color across the app. (Match the description string from mobile to use on web and desktop tooltip.)

**PROPOSED (default)**: Used for the primary action color across the app. (If the new Grey theme is enabled we should select the Accent Color that matches that theme. That color will probably need to be added to the Accent Color list across all platforms. Users should stil be able to update the accent color.)

### Editor Font Size — row label
- **Web** (SettingsPage.tsx:624): "Editor Font Size"
- **Desktop** (SettingsPage.tsx:483): "Editor Font Size"
- **Mobile** (SettingsScreen.tsx:597): "Editor Font Size"

✅ Identical.

**PROPOSED**:

### Editor Font Size — description (mobile only)
- **Mobile** (SettingsScreen.tsx:598-599): "Body-text size inside the note editor."

⚠️ Mobile-only.

**PROPOSED**: Match the description string from mobile to use on web and desktop tooltip.

---

## Section: Editor (web + desktop only)

### Default View Mode — row label
- **Web** (SettingsPage.tsx:644): "Default View Mode"
- **Desktop** (SettingsPage.tsx:504): "Default View Mode"

✅ Identical.

**PROPOSED**: Default Editor View Mode

### Default View Mode — option labels
- **Web**: "Editor", "Live", "Split", "Preview"
- **Desktop**: "Editor", "Split", "Preview" (no "Live")

⚠️ Web has 4 options, desktop has 3. Capability difference, not just copy.

**PROPOSED (web)**: "Editor", "Live", "Split", "Preview"

**PROPOSED (desktop)**: "Editor", "Live", "Split", "Preview"

### Auto-Save Delay — row label
- **Web** (SettingsPage.tsx:652): "Note Auto-Save Delay"
- **Desktop** (SettingsPage.tsx:511): "Note Auto-Save Delay"

✅ Identical.

**PROPOSED**:

### Tab Size — row label
- **Web** (SettingsPage.tsx:664): "Tab Size"
- **Desktop** (SettingsPage.tsx:524): "Tab Size"

✅ Identical.

**PROPOSED**:

### Tab Size — option labels
- Both: "2 spaces", "4 spaces"

✅ Identical.

**PROPOSED**:

### Line Numbers — toggle label + info
- **Web** (SettingsPage.tsx:673): label "Line Numbers", info "Show line numbers in the editor."
- **Desktop** (SettingsPage.tsx:533-537): same

✅ Identical.

**PROPOSED**:

### Word Wrap — toggle label + info
- **Web** (SettingsPage.tsx:674): label "Word Wrap", info "Wrap long lines instead of horizontal scrolling."
- **Desktop** (SettingsPage.tsx:539-543): same

✅ Identical.

**PROPOSED**:

### Cursor Blink — toggle label + info
- **Web** (SettingsPage.tsx:675): label "Cursor Blink", info "Animate the cursor with a blinking effect."
- **Desktop** (SettingsPage.tsx:545-549): same

✅ Identical.

**PROPOSED**:

### Cursor Style — row label
- **Web** (SettingsPage.tsx:679): "Cursor Style"
- **Desktop** (SettingsPage.tsx:554): "Cursor Style"

✅ Identical.

**PROPOSED**:

### Cursor Style — option labels
- Both: "Line", "Block", "Underline"

✅ Identical.

**PROPOSED**:

---

## Section: Dashboard (mobile only)

### Show Quick Actions — toggle label + info
- **Mobile** (SettingsScreen.tsx:699-703):
  - label: "Show Quick Actions"
  - info: "Render the New Note + recording shortcuts row at the top of the Dashboard."

**PROPOSED label**:

**PROPOSED info**: Render the New Note and recording shortcuts row at the top of the Dashboard.

### Speed-Dial FAB — toggle label + info
- **Mobile** (SettingsScreen.tsx:705-709):
  - label: "Speed-Dial FAB"
  - info: "Tap the \"+\" button to expand New Note plus the four recording modes. Off keeps a single \"+\" FAB that creates a note."

**PROPOSED label**:

**PROPOSED info**:

---

## Section: AI Assistant

### AI Features — master toggle
- **Web** (SettingsPage.tsx:694-699): label "Enable AI Features", info "Master toggle for all AI features. When off, all AI features are disabled."
- **Desktop** (SettingsPage.tsx:864-869): same as web
- **Mobile** (SettingsScreen.tsx:826-830): label "AI Features", info "Master gate for all AI calls. Off disables the AI tab entirely."

⚠️ Label differs ("Enable AI Features" vs "AI Features") and info copy differs.

**PROPOSED label**: AI Features

**PROPOSED info**: Master toggle for all AI features across the app.

### Inline Completions — toggle label + info
- **Web** (SettingsPage.tsx:704): label "Inline Completions", info "AI suggests text as you type. Press Tab to accept, Escape to dismiss."
- **Desktop** (SettingsPage.tsx:874): same
- **Mobile**: not present

✅ Identical (web + desktop).

**PROPOSED**: "AI Assistant Inline Completions", info "AI Assistant suggests text as you type. Press Tab to accept, Escape to dismiss."

### Completion Style — option labels + info
- **Web/Desktop** (lines 129-133):
  - "Continue Writing" — "Predicts and continues your natural writing style."
  - "Markdown Assist" — "Suggests markdown formatting like headings, lists, and code blocks."
  - "Brief" — "Short, concise completions — a few words at a time."

✅ Identical (web + desktop).

**PROPOSED**:
  - "Continue Writing" — "AI Assistant predicts and continues your natural writing style."
  - "Markdown Assist" — "AI Assistant suggests markdown formatting like headings, lists, and code blocks."
  - "Brief" — "AI Assistant suggests short, concise completions — a few words at a time."

### Completion Delay — row label (web only)
- **Web** (SettingsPage.tsx:717-722): "Completion delay"
- **Desktop**: not exposed
- **Mobile**: not exposed

⚠️ Web-only. Should desktop also expose this? Yes

**PROPOSED**: Completion Delay

### Continue Writing — toggle label + info
- **Web** (SettingsPage.tsx:726): label "Continue Writing", info "Press Cmd/Ctrl+Shift+Space to generate a full paragraph or suggest document structure."
- **Desktop** (SettingsPage.tsx:886): same

✅ Identical.

**PROPOSED**:

### Select-and-Rewrite — toggle label + info
- **Web** (SettingsPage.tsx:727): label "Select-and-Rewrite", info "Select text and right-click (or Cmd+Shift+R) to rewrite it with AI."
- **Desktop** (SettingsPage.tsx:887): same

✅ Identical.

**PROPOSED**:

### Summarize — toggle label + info
- **Web** (SettingsPage.tsx:732): label "Summarize", info "Generate a short AI summary of your note, shown below the title."
- **Desktop** (SettingsPage.tsx:892): same as web
- **Mobile** (SettingsScreen.tsx:837-843): label "Summarize", info "Action-menu command that turns the open note into a TL;DR."

⚠️ Mobile info copy is platform-specific (mentions action menu); web/desktop describe placement differently.

**PROPOSED label**: Summarize

**PROPOSED info**: Generate a short AI summary of your note.

### Tag Suggestions — toggle label + info
- **Web** (SettingsPage.tsx:733): label "Auto-Tag Suggestions", info "AI analyzes your note content and suggests relevant tags."
- **Desktop** (SettingsPage.tsx:893): same as web
- **Mobile** (SettingsScreen.tsx:844-850): label "Tag Suggestions", info "Suggests tags for the open note based on its content."

⚠️ Label differs ("Auto-Tag Suggestions" vs "Tag Suggestions") + info copy differs.

**PROPOSED label**: Auto-Tag Suggestions

**PROPOSED info**: Generate tags that are relevant to your note.

### Semantic Search — toggle label + info
- **Web** (SettingsPage.tsx:739): label "Semantic Search", info "Search by meaning, not just keywords. Uses AI embeddings to find related notes."
- **Desktop** (SettingsPage.tsx:899): same
- **Mobile**: not present

✅ Identical (web + desktop).

**PROPOSED**:

### Semantic Search — index status (dynamic)
- **Web** (SettingsPage.tsx:741-744):
  - "{n} embedded, {m} pending"  *(when m > 0)*
  - "{n} notes embedded"  *(when m = 0)*
- **Desktop** (SettingsPage.tsx:900-905):
  - "Indexing notes... ({n} indexed, {m} pending)"  *(when m > 0)*
  - "{n} of {total} notes indexed"  *(when m = 0)*

⚠️ Same data, different phrasing.

**PROPOSED (in progress)**: "Indexing notes... ({n} indexed, {m} pending)"  *(when m > 0)*

**PROPOSED (complete)**: "{n} of {total} notes indexed"  *(when m = 0)*

### AI Assistant Chat — toggle label + info
- **Web** (SettingsPage.tsx:748): label "AI Assistant Chat", info "Ask natural language questions about your notes. Requires semantic search to be enabled."
- **Desktop** (SettingsPage.tsx:910): same as web
- **Mobile** (SettingsScreen.tsx:858-863): label "AI Assistant Chat", info "Q&A panel + slash commands."

⚠️ Mobile info is much shorter and doesn't mention the semantic search dependency.

**PROPOSED label**: AI Assistant Chat

**PROPOSED info**: Ask natural language questions about your notes. Requires semantic search to be enabled.

### Auto-Approve Destructive Actions — sub-card heading
- **Web** (SettingsPage.tsx:754): "Auto-Approve Destructive Actions"
- **Desktop** (SettingsPage.tsx:918): "Auto-Approve Destructive Actions"
- **Mobile** (SettingsScreen.tsx:873): "Auto-Approve Destructive Actions"

✅ Identical.

**PROPOSED**:

### Auto-Approve Destructive Actions — group description
*See Priority section above. Mentions "Claude."*

### Move Notes to Trash — auto-approve toggle
- **Web** (SettingsPage.tsx:756): label "Move Notes to Trash", info "Auto-approve `delete_note` calls. Notes go to Trash and can be restored until the trash auto-delete timer purges them."
- **Desktop** (SettingsPage.tsx:920): same as web
- **Mobile** (SettingsScreen.tsx:786): label "Move Notes to Trash", info "Auto-approve `delete_note`. Notes go to Trash and can be restored until the trash auto-delete timer purges them."

⚠️ Web/Desktop say "calls" after the function name; mobile drops it. Otherwise identical.

**PROPOSED label**: Move Notes to Trash

**PROPOSED info**: Auto-approve `delete_note` calls. Notes go to Trash and can be restored until the trash auto-delete timer purges them.

### Delete Folders — auto-approve toggle
- **Web** (SettingsPage.tsx:757): label "Delete Folders", info "Auto-approve `delete_folder`. Notes inside become Unfiled; the notes themselves aren't deleted."
- **Desktop** (SettingsPage.tsx:921): same as web
- **Mobile** (SettingsScreen.tsx:791): label "Delete Folders", info "Auto-approve `delete_folder`. Notes inside become Unfiled."

⚠️ Mobile info abbreviated.

**PROPOSED label**: Delete Folders

**PROPOSED info**: Auto-approve `delete_folder` calls. Notes inside become Unfiled.

### Rewrite Note Content — auto-approve toggle
- **Web** (SettingsPage.tsx:758): label "Rewrite Note Content", info "Auto-approve `update_note_content`. Previous version stays in version history."
- **Desktop** (SettingsPage.tsx:922): same
- **Mobile** (SettingsScreen.tsx:796): same

✅ Identical.

**PROPOSED label**: Rewrite Note Content

**PROPOSED info**: Auto-approve `update_note_content` calls. Previous version stays in version history.

### Rename Notes — auto-approve toggle
- **Web** (SettingsPage.tsx:759): label "Rename Notes", info "Auto-approve `rename_note`. Updates the note title only; content, folder, tags, and id are unchanged."
- **Desktop** (SettingsPage.tsx:923): same as web
- **Mobile** (SettingsScreen.tsx:801): label "Rename Notes", info "Auto-approve `rename_note`. Title only; content / folder / tags / id are unchanged."

⚠️ Mobile info more terse.

**PROPOSED label**: Rename Notes

**PROPOSED info**: Auto-approve `rename_note` calls. Updates the note title only; content, folder, tags, etc are unchanged.

### Rename Folders — auto-approve toggle
- **Web** (SettingsPage.tsx:760): label "Rename Folders", info "Auto-approve `rename_folder`."
- **Desktop** (SettingsPage.tsx:924): same
- **Mobile** (SettingsScreen.tsx:806): same

✅ Identical.

**PROPOSED label**: Rename Folders

**PROPOSED info**: Auto-approve `rename_folder` calls.

### Rename Tags — auto-approve toggle
- **Web** (SettingsPage.tsx:761): label "Rename Tags", info "Auto-approve `rename_tag`. Affects every note using that tag."
- **Desktop** (SettingsPage.tsx:925): same
- **Mobile** (SettingsScreen.tsx:811): same

✅ Identical.

**PROPOSED label**: Rename Tags

**PROPOSED info**: Auto-approve `rename_tag` calls. Affects every note using that tag.

### Audio Notes — toggle label + info
- **Web** (SettingsPage.tsx:768): label "Audio Notes", info "Record audio and transcribe it into a note using AI."
- **Desktop** (SettingsPage.tsx:932): same as web
- **Mobile** (SettingsScreen.tsx:900-906): label "Audio Notes", info "Dashboard recording shortcuts (Meeting / Lecture / Memo / Verbatim) plus the AI tab's recording pipeline."

⚠️ Mobile info is significantly more detailed/different from web/desktop.

**PROPOSED label**: Audio Notes

**PROPOSED info**: Record audio and transcribe it into a note using the AI Assistant.

### Recording Source — option labels (desktop only)
- **Desktop** (lines 134-137):
  - "Meeting mode" — "Captures system audio (meeting participants) + microphone (your voice). Requires macOS screen recording permission."
  - "Microphone only" — "Records from your microphone. Standard recording mode."

**PROPOSED labels**:

**PROPOSED info**:

### Wi-Fi Only Image Uploads — toggle (mobile only)
- **Mobile** (SettingsScreen.tsx:914-920):
  - label: "Wi-Fi Only Image Uploads"
  - info: "On: pictures attached to notes wait for Wi-Fi before uploading. Off: uploads happen over cellular too."

**PROPOSED label**: Wi-Fi Only Image Uploads

**PROPOSED info**: Images attached to notes wait for Wi-Fi before uploading.

---

## Section: Sync (mobile only)

### Status — row label
- **Mobile** (SettingsScreen.tsx:174): "Status"

**PROPOSED**:

### Status — values
- **Mobile** (SettingsScreen.tsx:192-198): "Up to date", "Syncing...", "Offline", "Error"

**PROPOSED**:

### Last synced — row label
- **Mobile** (SettingsScreen.tsx:203): "Last synced"

**PROPOSED**:

### Last synced — formatted values (mobile)
- **Mobile** (SettingsScreen.tsx:124-135): "Never", "Just now", "{n}m ago", "{n}h ago", `date.toLocaleDateString()`

**PROPOSED**:

### Pending changes — row label
- **Mobile** (SettingsScreen.tsx:207-210): "Pending changes" + dynamic count

**PROPOSED**:

### Sync Now — button
- **Mobile** (SettingsScreen.tsx:225): "Sync Now"

**PROPOSED**:

### Sync Issues — button (when rejections present)
- **Mobile** (SettingsScreen.tsx:245): "Sync Issues"

**PROPOSED**:

---

## Section: Offline Cache (web only)

### Cached Notes — row label + info
- **Web** (SettingsPage.tsx:777): label "Cached Notes", info "Notes stored locally in IndexedDB for offline access."

**PROPOSED label**: Cached Notes Count

**PROPOSED info**: Notes stored locally for offline access.

### Max Cached Notes — row label + info
- **Web** (SettingsPage.tsx:782): label "Max Cached Notes", info "Maximum number of notes to keep in the local cache. Oldest notes are evicted when this limit is exceeded."

**PROPOSED label**:

**PROPOSED info**:

### Max Cached Notes — option labels
- **Web** (lines 156-161): "50", "100", "200", "500"

**PROPOSED**:

### Last Synced — row label + info
- **Web** (SettingsPage.tsx:794): label "Last Synced", info "When your offline edits were last synced with the server."

**PROPOSED label**:

**PROPOSED info**:

### Last Synced — formatted values (web)
- **Web** (SettingsPage.tsx:500-510): "Never", "Just now", "1 minute ago", "{n} minutes ago", "1 hour ago", "{n} hours ago"

⚠️ Differs from mobile's compact "{n}m ago" / "{n}h ago" format.

**PROPOSED**: (Use the more compact mobile format here)

### Clear Cache — button + confirmation
- **Web** (SettingsPage.tsx:802-812):
  - prompt: "Clear all cached data?"
  - cancel button: "Cancel"
  - confirm button: "Clearing..." / "Confirm"
  - row button: "Clear Cache"

**PROPOSED**:

---

## Section: Version History (web + desktop only)

### Capture Interval — row label + info
- **Web** (SettingsPage.tsx:840): label "Capture Interval", info "How often a version snapshot is saved when you edit a note. Set to 'Every save' to capture a version on every save."
- **Desktop** (SettingsPage.tsx:587): same

✅ Identical.

**PROPOSED**:

### Capture Interval — option labels
- Both (lines 163-169): "Every save", "5 minutes", "15 minutes (default)", "30 minutes", "60 minutes"

✅ Identical.

**PROPOSED**:

---

## Section: Trash (web + desktop) / Data link (mobile)

### Auto-Delete After — row label + info
- **Web** (SettingsPage.tsx:822): label "Auto-Delete After", info "Trashed notes are permanently deleted after this period. Set to 'Never' to keep trashed notes indefinitely."
- **Desktop** (SettingsPage.tsx:568): same

✅ Identical.

**PROPOSED**:

### Auto-Delete After — option labels
- Both (lines 171-178): "7 days", "14 days", "30 days (default)", "60 days", "90 days", "Never"

✅ Identical.

**PROPOSED**:

### Trash — navigation row (mobile)
- **Mobile** (SettingsScreen.tsx:275): "Trash"

**PROPOSED**:

---

## Section: My Account

### Email — row label
- **Web** (SettingsPage.tsx:859): "Email"
- **Desktop** (SettingsPage.tsx:607): "Email"
- **Mobile** (SettingsScreen.tsx:309): "Email"

✅ Identical.

**PROPOSED**:

### Password — row label
- **Web** (SettingsPage.tsx:867): "Password"
- **Desktop** (SettingsPage.tsx:615): "Password"
- **Mobile** (SettingsScreen.tsx:329): "Change Password"

⚠️ Mobile uses verb form ("Change Password"), web/desktop use noun ("Password").

**PROPOSED**:

### Change Password — button
- **Web** (SettingsPage.tsx:872): "Change"
- **Desktop** (SettingsPage.tsx:620): "Change"
- **Mobile**: row is the button

⚠️ Web/Desktop have a separate "Change" button next to "Password" row; mobile makes the entire row tappable.

**PROPOSED**:

### Reset All Settings — row label + info
- **Web** (SettingsPage.tsx:878): label "Reset All Settings", info "Resets all appearance, editor, and AI settings back to their defaults. Your notes, account, and data are not affected."
- **Desktop** (SettingsPage.tsx:626): same as web
- **Mobile** (SettingsScreen.tsx:349): label "Reset All Settings", no inline info

⚠️ Mobile lacks the inline description.

**PROPOSED label**:

**PROPOSED info**:

### Reset All Settings — button + confirmation
- **Web** (SettingsPage.tsx:889-903): "Confirm Reset", "Cancel", "Reset to Defaults"
- **Desktop** (SettingsPage.tsx:637-651): same
- **Mobile** (SettingsScreen.tsx:87-88) AppDialog:
  - title: "Reset All Settings"
  - message: "This resets every appearance, editor, dashboard, and AI preference back to defaults. Your notes, account, and sync state are not affected."
  - buttons: (need to verify)

⚠️ Mobile dialog mentions "dashboard" + "sync state"; web/desktop description is shorter.

**PROPOSED button label**:

**PROPOSED dialog title**:

**PROPOSED dialog message**:

### Sign Out of Your Account — row label
- **Web** (SettingsPage.tsx:910): "Sign Out of Your Account"
- **Desktop** (SettingsPage.tsx:658): "Sign Out of Your Account"
- **Mobile** (SettingsScreen.tsx:362): "Sign Out of Your Account"

✅ Identical.

**PROPOSED**:

### Sign Out — button
- **Web** (SettingsPage.tsx:931): "Sign Out"
- **Desktop** (SettingsPage.tsx:679): "Sign Out"
- **Mobile** (SettingsScreen.tsx:370): row button is "Sign Out of Your Account"

⚠️ Web/Desktop button just says "Sign Out"; mobile button is the same as the row label.

**PROPOSED**:

### Sign Out — confirmation
- **Web** (SettingsPage.tsx:917-923): "Confirm Sign Out", "Cancel"
- **Desktop** (SettingsPage.tsx:665-): same
- **Mobile** (SettingsScreen.tsx:59) Alert:
  - title: "Sign Out of Your Account"
  - message: "Are you sure?"

⚠️ Mobile has a much more terse confirmation message.

**PROPOSED title**:

**PROPOSED message**:

**PROPOSED confirm button**:

**PROPOSED cancel button**:

---

## Section: Security

### Two-Factor Authentication — row label
- **Web** (SettingsPage.tsx:1025): "Two-Factor Authentication"
- **Desktop** (SettingsPage.tsx:773): "Two-Factor Authentication"
- **Mobile** (SettingsScreen.tsx:391): "Two-Factor Authentication"

✅ Identical.

**PROPOSED**:

### 2FA — Enabled badge
- **Web** (SettingsPage.tsx:1026): "Enabled"
- **Desktop** (SettingsPage.tsx:774): "Enabled"
- **Mobile** (SettingsScreen.tsx:405): "Enabled"

✅ Identical.

**PROPOSED**:

### 2FA — Idle state body copy (mobile only)
- **Mobile** (SettingsScreen.tsx:500-502):
  - When enabled: "Two-factor authentication is currently active. You'll need a 6-digit code from your authenticator app each time you sign in."
  - When disabled: "Adds a 6-digit code from an authenticator app to your sign-in. We recommend Google Authenticator, 1Password, or Authy."

⚠️ Mobile-only. Web/desktop don't have an equivalent narrative — could be worth mirroring.

**PROPOSED (enabled)**: (same as mobile for web and desktop)

**PROPOSED (disabled)**: (same as mobile for web and desktop)

### 2FA — Enable button
- **Web** (SettingsPage.tsx:1103): "Enable 2FA" / "Loading..."
- **Desktop** (SettingsPage.tsx:851): same
- **Mobile** (SettingsScreen.tsx:546): same

✅ Identical.

**PROPOSED**:

### 2FA — Disable Two-Factor Authentication row label
- **Web** (SettingsPage.tsx:1074): "Disable Two-Factor Authentication"
- **Desktop** (SettingsPage.tsx:822): "Disable Two-Factor Authentication"

✅ Identical.

**PROPOSED**:

### 2FA — Disable button
- **Web** (SettingsPage.tsx:1079): "Disable 2FA"
- **Desktop** (SettingsPage.tsx:827): "Disable 2FA"
- **Mobile** (SettingsScreen.tsx:521): "Disable 2FA"

✅ Identical.

**PROPOSED**:

### 2FA setup — QR code instruction (web/desktop only)
- **Web** (SettingsPage.tsx:973-974): "Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)"
- **Desktop** (SettingsPage.tsx:721-722): same

✅ Identical.

**PROPOSED**:

### 2FA setup — Manual entry prefix (web/desktop only)
- **Web** (SettingsPage.tsx:979): "Manual entry: " *(secret follows)*
- **Desktop** (SettingsPage.tsx:728): same

✅ Identical.

**PROPOSED**:

### 2FA setup — Code input placeholder
- **Web** (SettingsPage.tsx:984): "Enter 6-digit code"
- **Desktop** (SettingsPage.tsx:732): same
- **Mobile** (SettingsScreen.tsx:364): "000000"

⚠️ Mobile uses literal placeholder digits; web/desktop use descriptive copy.

**PROPOSED**: (update mobile to use same as web and desktop)

### 2FA setup — Mobile-specific heading + body
- **Mobile** (SettingsScreen.tsx:276): "Add to Your Authenticator App"
- **Mobile** (SettingsScreen.tsx:279-282): "Open your authenticator app (Google Authenticator, 1Password, Authy, Microsoft Authenticator, etc.) and add NoteSync, then enter the 6-digit code it gives you."

⚠️ Mobile-only flow. The mobile flow doesn't show a QR code (no second device available), so the copy is purpose-built.

**PROPOSED heading**: Add to Authenticator App

**PROPOSED body**: Open your authenticator app (Google Authenticator, 1Password, Authy, etc.) and add NoteSync, then enter the 6-digit code it gives you.

### 2FA setup — Open in authenticator button (mobile only)
- **Mobile** (SettingsScreen.tsx:314): "Open in authenticator app"

**PROPOSED**:

### 2FA setup — Copy setup key button (mobile only)
- **Mobile** (SettingsScreen.tsx:341): "Copy setup key"

**PROPOSED**:

### 2FA setup — Verify button
- **Web** (SettingsPage.tsx:1011): "Verify & Enable" / "Verifying..."
- **Desktop** (SettingsPage.tsx:759): same
- **Mobile** (SettingsScreen.tsx:398): same

✅ Identical.

**PROPOSED**:

### 2FA setup — Cancel button (web/desktop only)
- **Web** (SettingsPage.tsx:1017): "Cancel"
- **Desktop** (SettingsPage.tsx:765): "Cancel"
- **Mobile**: handled by header back button (no inline button)

✅ Identical (web + desktop).

**PROPOSED**:

### 2FA backup codes — heading
- **Web** (SettingsPage.tsx:945): "2FA enabled successfully!"
- **Desktop** (SettingsPage.tsx:693): same
- **Mobile** (SettingsScreen.tsx:203): part of backup codes screen

✅ Identical (web + desktop).

**PROPOSED**:

### 2FA backup codes — description
- **Web** (SettingsPage.tsx:946-947): "Save these backup codes in a safe place. Each code can only be used once."
- **Desktop** (SettingsPage.tsx:694-695): same as web
- **Mobile** (SettingsScreen.tsx:205-207): "Each code can be used once if you lose access to your authenticator app. Store them somewhere safe — they will not be shown again."

⚠️ Different copy. Mobile is more contextual.

**PROPOSED**: (Use the mobile text in web and desktop)

### 2FA backup codes — Copy button
- **Web** (SettingsPage.tsx:959): "Copy"
- **Desktop** (SettingsPage.tsx:707): "Copy"
- **Mobile** (SettingsScreen.tsx:244): "Copy codes"

⚠️ Web/Desktop "Copy", mobile "Copy codes".

**PROPOSED**: (Use the web and desktop text in mobile)

### 2FA backup codes — Done button
- **Web** (SettingsPage.tsx:965): "Done"
- **Desktop** (SettingsPage.tsx:713): "Done"
- **Mobile** (SettingsScreen.tsx:257): "Done"

✅ Identical.

**PROPOSED**:

### 2FA disable — Code input placeholder
- **Web** (SettingsPage.tsx:1035): "Enter current TOTP code"
- **Desktop** (SettingsPage.tsx:783): same
- **Mobile** (SettingsScreen.tsx:440): "000000"

⚠️ Mobile uses literal placeholder digits; web/desktop use descriptive copy.

**PROPOSED**: Enter code

### 2FA disable — Confirm button
- **Web** (SettingsPage.tsx:1061): "Confirm Disable" / "Disabling..."
- **Desktop** (SettingsPage.tsx:809): same
- **Mobile** (SettingsScreen.tsx:468): "Confirm disable"

⚠️ Capitalization differs (Title Case vs sentence case).

**PROPOSED**: Confirm Disable" / "Disabling...

### 2FA disable — Mobile-specific heading + body
- **Mobile** (SettingsScreen.tsx:419-423):
  - title: "Disable Two-Factor Authentication"
  - description: "Enter the current 6-digit code from your authenticator app to confirm."

⚠️ Mobile-only. Web/desktop have inline code input without separate heading.

**PROPOSED title**: Disable Two-Factor Authentication

**PROPOSED description**: Enter the 6-digit code from your authenticator app to confirm.

---

## Section: Keyboard Shortcuts (web + desktop only)

### Filter input — placeholder
- **Web** (SettingsPage.tsx:1117): "Filter shortcuts..."
- **Desktop** (SettingsPage.tsx:954): same

✅ Identical.

**PROPOSED**:

### No-results message
- **Web** (SettingsPage.tsx:1131): "No shortcuts found."
- **Desktop** (SettingsPage.tsx:968): same

✅ Identical.

**PROPOSED**:

---

## Section: About

### Version — row label
- **Web** (SettingsPage.tsx:1140): "Version"
- **Desktop** (SettingsPage.tsx:977): "Version"
- **Mobile** (SettingsScreen.tsx:428): "Version"

✅ Identical.

**PROPOSED**:

### Feedback — row label
- **Web** (SettingsPage.tsx:1143): "Feedback"
- **Desktop** (SettingsPage.tsx:980): "Feedback"
- **Mobile** (SettingsScreen.tsx:443): "Feedback"

✅ Identical.

**PROPOSED**:

### Feedback — value
- **Web** (SettingsPage.tsx:1148): "Coming Soon" *(disabled button)*
- **Desktop** (SettingsPage.tsx:985): same
- **Mobile** (SettingsScreen.tsx:447): "Coming soon" *(text, not a button)*

⚠️ Capitalization differs ("Coming Soon" vs "Coming soon"). Visual presentation also differs.

**PROPOSED**: Coming Soon

---

## Section: Admin (web + desktop only)

### Global AI Enabled — toggle
- **Web** (SettingsPage.tsx:1157-1163): label "Global AI Enabled", info "When disabled, AI features (completions, summaries, tags, rewrite, transcription, Q&A) are turned off for all users."
- **Desktop** (SettingsPage.tsx:994-1000): same

✅ Identical.

**PROPOSED**:

### Approved Emails — instruction text
- **Web** (SettingsPage.tsx:1172-1173): "One email per line. Only these emails can register new accounts."
- **Desktop** (SettingsPage.tsx:1009-1010): same

✅ Identical.

**PROPOSED**:

### Approved Emails — input placeholder
- **Web** (SettingsPage.tsx:1180): "user@example.com"
- **Desktop** (SettingsPage.tsx:1017): same

✅ Identical.

**PROPOSED**:

### Approved Emails — Save button + states
- **Web** (SettingsPage.tsx:1188-1191): "Save" / "Saving..." / "Saved" / "Failed to save"
- **Desktop** (SettingsPage.tsx:1025-1028): same

✅ Identical.

**PROPOSED**:

### User Management — table headers
- Both: "User", "Role", "2FA", "Actions"

✅ Identical.

**PROPOSED**:

### User Management — role badges
- Both: "Admin" *(badge)*, "User" *(text)*

✅ Identical.

**PROPOSED**:

### User Management — 2FA badges
- Both: "On" *(badge)*, "Off" *(text)*

✅ Identical.

**PROPOSED**:

### User Management — row buttons
- Both: "Reset Password", "Delete"

✅ Identical.

**PROPOSED**:

### User Management — empty state
- Both: "No users found."

✅ Identical.

**PROPOSED**:

### User Management — Reset Password dialog
- Both:
  - title: "Reset password for {email}"
  - input placeholder: "New password"
  - confirm button: "Reset"

✅ Identical.

**PROPOSED**:

### User Management — Delete dialog
- Both:
  - title: "Delete user {email}?"
  - description: "This action cannot be undone. All user data will be permanently deleted."
  - confirm button: "Delete"

✅ Identical.

**PROPOSED**:

---

## Sub-Screens reachable from Settings

### Change Password page/screen — heading + body

- **Web** (`packages/ns-web/src/pages/ChangePasswordPage.tsx:59`): "Change your password"
- **Desktop** (`packages/ns-desktop/src/pages/ChangePasswordPage.tsx:55`): "Change your password"
- **Mobile** (`packages/ns-mobile/src/screens/ChangePasswordScreen.tsx:80-81`):
  - heading: "Change Your Password"
  - subheading: "Enter your current password, then choose a new one."

⚠️ Mobile uses Title Case heading + has a subheading; web/desktop use sentence case + no subheading.

**PROPOSED heading**: Change Your Password

**PROPOSED subheading (mobile)**:

### Change Password — input placeholders

- All three: "Current password", "New password", "Confirm new password"

✅ Identical.

**PROPOSED**:

### Change Password — passwords-do-not-match error
- **Web/Desktop**: "Passwords do not match"
- **Mobile**: "Passwords do not match."

⚠️ Mobile has trailing period.

**PROPOSED**: Passwords do not match

### Change Password — submit button
- All three: "Change password" / "Changing..."

✅ Identical (sentence case across all).

**PROPOSED**:

### Change Password — Cancel button (mobile only)
- **Mobile** (ChangePasswordScreen.tsx:149): "Cancel"

**PROPOSED**:

### Change Password — success alert (mobile only)
- **Mobile** (ChangePasswordScreen.tsx:48-51):
  - title: "Password changed"
  - message: "Your password has been updated."

**PROPOSED title**:

**PROPOSED message**: Your password has been updated

### Two-Factor Authentication screen
*All 2FA strings are listed under Section: Security above.*

---

## "Claude" reference inventory (full sweep)

### User-facing — needs change
1. ns-web `SettingsPage.tsx:755` — Auto-Approve description
2. ns-desktop `SettingsPage.tsx:919` — Auto-Approve description
3. ns-mobile `SettingsScreen.tsx:881` — Auto-Approve description (shorter wording)

### Internal-only — no user impact

These references exist in code comments, JSDoc, function names, and test fixtures. They do not appear in the UI. Listed for awareness only — leave as-is unless you want to do a separate brand-neutralization refactor.

- `packages/ns-web/src/hooks/useAiSettings.ts:10` — JSDoc comment
- `packages/ns-web/src/lib/chatHistory.ts:1, 5, 10, 12, 16, 34, 37, 77, 99` — comments + exported function `buildHistoryForClaude`
- `packages/ns-web/src/lib/chatExport.ts:2` — comment
- `packages/ns-web/src/components/ConfirmationCard.tsx:2, 13` — comments
- `packages/ns-web/src/components/AIAssistantPanel.tsx:10, 120, 124, 334, 534, 1153, 1156, 1189, 1210, 2126` — comments + import of `buildHistoryForClaude`
- `packages/ns-web/src/__tests__/chatHistory.test.ts:5, 127, 133, 141` — describe block + import
- `packages/ns-web/src/__tests__/linkifyCitations.test.ts` — multiple test fixture titles ("Claude Code Use Cases")
- `packages/ns-desktop/src/components/ConfirmationCard.tsx:2, 13` — comments
- `packages/ns-desktop/src/components/AudioRecorder.tsx:82` — comment
- `packages/ns-mobile/src/__tests__/linkifyCitations.test.ts` — multiple test fixture titles
- `packages/ns-mobile/src/__tests__/resolveWikiLinks.test.ts` — test fixture titles
- `packages/ns-mobile/src/api/ai.ts:399` — comment
- `packages/ns-mobile/src/lib/linkifyCitations.ts:11, 15` — comments
- `packages/ns-mobile/src/lib/chatHistory.ts:5, 9, 27, 67` — comments
- `packages/ns-mobile/src/components/notes/ConfirmationCard.tsx:4, 42` — comments
- `packages/ns-mobile/src/screens/AiScreen.tsx:65` — comment

If you'd like me to also rename the exported `buildHistoryForClaude` helper to something brand-neutral (e.g. `buildHistoryForAssistant`) as part of this audit, flag it in the **General notes** section below.

---

## General notes / global decisions

Use this section for changes that aren't tied to a single setting:

- **Capitalization policy**: Title Case has been applied to setting *labels* across all platforms; *descriptions / info text* are sentence case. Anything below to revisit?

  **Decision**: We should continue to use Title Case

- **Period at end of info text**: 
  - Some descriptions end in `.`, some don't (e.g. "Enable sparingly" vs "Enable sparingly."). Should we standardize?

  **Decision**: We can standardize to not using a period at the end of info text

- **Function-name backticks**: Auto-approve descriptions reference internal tool names like `delete_note`. Keep these or replace with human-readable phrasing?

  **Decision**: We can keep them

- **Brand-neutralize internal `Claude` identifiers** (e.g. rename `buildHistoryForClaude`)?

  **Decision**: Yes, rename this to buildHistoryForAIAssistant

- **Other notes**: 
