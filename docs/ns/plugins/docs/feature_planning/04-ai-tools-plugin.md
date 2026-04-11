# 04 — AI Tools Plugin

**Status:** Planned
**Phase:** 2 — Extract Built-in Plugins
**Priority:** High

## Summary

Extract the agentic AI assistant tools into `@notesync/plugin-ai-tools`. Currently hardcoded in `assistantTools.ts` and `aiService.ts`. Each tool becomes a self-contained unit that registers via the plugin API.

## Current Implementation (to extract)

| File | Responsibility |
|---|---|
| `services/assistantTools.ts` | 16 tool definitions + executors |
| `services/aiService.ts` | `answerWithTools()` — agentic loop, `answerMeetingQuestion()` |
| `routes/ai.ts` | `/ai/ask` endpoint with tool routing |

## Plugin Structure

```
packages/ns-plugin-ai-tools/
  src/
    index.ts              # Plugin class
    manifest.json
    tools/
      search.ts           # search_notes
      listFolders.ts       # list_folders
      listTags.ts          # list_tags
      stats.ts             # get_note_stats
      recent.ts            # get_recent_notes
      content.ts           # get_note_content
      backlinks.ts         # get_backlinks
      open.ts              # open_note
      create.ts            # create_note
      updateContent.ts     # update_note_content
      move.ts              # move_note
      tag.ts               # tag_note
      generateTags.ts      # generate_tags
      generateSummary.ts   # generate_summary
      deleteNote.ts        # delete_note
      deleteFolder.ts      # delete_folder
    toolRunner.ts          # Agentic loop (answerWithTools)
  package.json
```

## Tool Interface

Each tool implements a standard interface:

```typescript
export interface AssistantTool {
  definition: Anthropic.Tool;          // Schema for Claude
  describe(input: Record<string, unknown>): string;  // Activity text
  execute(input: Record<string, unknown>, userId: string, vault: VaultAPI): Promise<ToolResult>;
}
```

## Registration

```typescript
export default class AIToolsPlugin implements Plugin {
  register(host: NoteSync) {
    // Register each tool
    host.ai.registerTool(searchNotesTool);
    host.ai.registerTool(createNoteTool);
    host.ai.registerTool(moveNoteTool);
    // ... etc

    // Register the agentic runner
    host.ai.registerRunner("tools", toolRunner);
  }
}
```

## Third-Party Tool Extensibility

Other plugins can register their own tools:

```typescript
// @notesync/plugin-jira
export default class JiraPlugin implements Plugin {
  register(host: NoteSync) {
    host.ai.registerTool({
      definition: {
        name: "create_jira_ticket",
        description: "Create a Jira ticket from a note or action item",
        input_schema: { ... }
      },
      execute: async (input, userId, vault) => {
        // Call Jira API
      }
    });
  }
}
```

Claude automatically sees all registered tools — the user asks "create a Jira ticket from my meeting notes" and it just works.

## Tasks

- [ ] Create `packages/ns-plugin-ai-tools/`
- [ ] Define `AssistantTool` interface in plugin-api
- [ ] Extract each tool into its own module
- [ ] Extract `answerWithTools` agentic loop
- [ ] Register tools via plugin API
- [ ] Allow third-party tool registration
- [ ] Verify all AI tests still pass
