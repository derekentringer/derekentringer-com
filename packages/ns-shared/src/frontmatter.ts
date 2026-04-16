import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

/**
 * Frontmatter metadata fields recognized by NoteSync.
 * Standard fields (title, date, updated, tags, description, aliases) are
 * portable across tools (Obsidian, Jekyll, Hugo, etc.).
 * NoteSync-specific fields (favorite) are safely ignored by other tools.
 */
export interface FrontmatterData {
  title?: string;
  date?: string; // ISO 8601
  updated?: string; // ISO 8601
  tags?: string[];
  description?: string;
  aliases?: string[];
  favorite?: boolean;
}

/**
 * Result of parsing a note's content string for frontmatter.
 */
export interface ParsedFrontmatter {
  /** Recognized NoteSync fields extracted from the YAML block */
  metadata: FrontmatterData;
  /** The note body after the frontmatter block */
  body: string;
  /** The raw YAML string between the --- delimiters (without delimiters) */
  rawYaml: string;
  /** Fields in the YAML block that NoteSync does not recognize — preserved on round-trip */
  unknownFields: Record<string, unknown>;
}

const FRONTMATTER_REGEX = /^---[ \t]*\n([\s\S]*?\n)?---[ \t]*(?:\n|$)/;

const KNOWN_FIELDS = new Set<string>([
  "title",
  "date",
  "updated",
  "tags",
  "description",
  "aliases",
  "favorite",
]);

/**
 * Parse a note content string and extract YAML frontmatter.
 * If no valid frontmatter block is found, returns empty metadata and the full
 * content as the body.
 */
export function parseFrontmatter(content: string): ParsedFrontmatter {
  const match = content.match(FRONTMATTER_REGEX);

  if (!match) {
    return {
      metadata: {},
      body: content,
      rawYaml: "",
      unknownFields: {},
    };
  }

  const rawYaml = (match[1] ?? "").replace(/\n$/, "");
  const body = content.slice(match[0].length);

  if (!rawYaml.trim()) {
    return {
      metadata: {},
      body,
      rawYaml: "",
      unknownFields: {},
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parseYaml(rawYaml) as Record<string, unknown>;
  } catch {
    // Malformed YAML — treat entire content as body
    return {
      metadata: {},
      body: content,
      rawYaml: "",
      unknownFields: {},
    };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      metadata: {},
      body: content,
      rawYaml: "",
      unknownFields: {},
    };
  }

  const metadata: FrontmatterData = {};
  const unknownFields: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(parsed)) {
    if (!KNOWN_FIELDS.has(key)) {
      unknownFields[key] = value;
      continue;
    }

    switch (key) {
      case "title":
        if (typeof value === "string") metadata.title = value;
        break;
      case "date":
        if (typeof value === "string") metadata.date = value;
        else if (value instanceof Date) metadata.date = value.toISOString();
        break;
      case "updated":
        if (typeof value === "string") metadata.updated = value;
        else if (value instanceof Date) metadata.updated = value.toISOString();
        break;
      case "tags":
      case "aliases":
        if (Array.isArray(value)) {
          metadata[key] = value
            .map((v) => (typeof v === "string" ? v : String(v)))
            .filter(Boolean);
        } else if (typeof value === "string") {
          // Single value: treat as one-element array
          metadata[key] = [value];
        }
        break;
      case "description":
        if (typeof value === "string") metadata.description = value;
        break;
      case "favorite":
        if (typeof value === "boolean") metadata.favorite = value;
        break;
    }
  }

  return { metadata, body, rawYaml, unknownFields };
}

/**
 * Serialize frontmatter metadata and a body string into a full note content
 * string with a YAML frontmatter block.
 *
 * Unknown fields are appended after known fields to preserve round-trip data
 * from other tools (Obsidian, Jekyll, etc.).
 *
 * Produces an empty frontmatter block (---\n---) if metadata and unknownFields
 * are both empty.
 */
export function serializeFrontmatter(
  metadata: FrontmatterData,
  body: string,
  unknownFields?: Record<string, unknown>,
): string {
  const obj: Record<string, unknown> = {};

  // Known fields in a stable order
  if (metadata.title !== undefined) obj.title = metadata.title;
  if (metadata.date !== undefined) obj.date = metadata.date;
  if (metadata.updated !== undefined) obj.updated = metadata.updated;
  if (metadata.tags !== undefined && metadata.tags.length > 0)
    obj.tags = metadata.tags;
  if (metadata.description !== undefined)
    obj.description = metadata.description;
  if (metadata.aliases !== undefined && metadata.aliases.length > 0)
    obj.aliases = metadata.aliases;
  if (metadata.favorite !== undefined) obj.favorite = metadata.favorite;

  // Append unknown fields
  if (unknownFields) {
    for (const [key, value] of Object.entries(unknownFields)) {
      obj[key] = value;
    }
  }

  const hasFields = Object.keys(obj).length > 0;
  const yamlStr = hasFields
    ? stringifyYaml(obj, {
        lineWidth: 0,
        defaultStringType: "PLAIN",
        defaultKeyType: "PLAIN",
      }).trimEnd()
    : "";

  // The yaml library doesn't quote ISO 8601 date strings by default in PLAIN
  // mode, but other tools expect them quoted to avoid parser ambiguity.
  // We don't force quotes here — the yaml library handles it correctly for
  // YAML 1.2 where bare date-like strings are valid plain scalars.

  const frontmatter = yamlStr ? `---\n${yamlStr}\n---` : "---\n---";

  return body ? `${frontmatter}\n${body}` : frontmatter + "\n";
}

/**
 * Update a single field in the frontmatter of a note content string.
 * If the note has no frontmatter, one is created.
 * Setting a value to `undefined` removes the field.
 */
export function updateFrontmatterField(
  content: string,
  field: string,
  value: unknown,
): string {
  const { metadata, body, unknownFields } = parseFrontmatter(content);

  if (KNOWN_FIELDS.has(field)) {
    if (value === undefined) {
      delete metadata[field as keyof FrontmatterData];
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (metadata as any)[field] = value;
    }
  } else {
    if (value === undefined) {
      delete unknownFields[field];
    } else {
      unknownFields[field] = value;
    }
  }

  return serializeFrontmatter(metadata, body, unknownFields);
}

/**
 * Remove a field from the frontmatter of a note content string.
 * Convenience wrapper around updateFrontmatterField with undefined value.
 */
export function removeFrontmatterField(
  content: string,
  field: string,
): string {
  return updateFrontmatterField(content, field, undefined);
}

/**
 * Extract the note body without frontmatter.
 * Equivalent to parseFrontmatter(content).body but avoids building
 * the full metadata object when only the body is needed.
 */
export function stripFrontmatter(content: string): string {
  const match = content.match(FRONTMATTER_REGEX);
  return match ? content.slice(match[0].length) : content;
}

/**
 * Check whether a content string has a frontmatter block.
 */
export function hasFrontmatter(content: string): boolean {
  return FRONTMATTER_REGEX.test(content);
}

/**
 * Build a frontmatter block from Note-level fields and inject it into content.
 * Used for migrating existing notes that have metadata in the database but no
 * frontmatter in their content string.
 *
 * If the content already has frontmatter, it is merged (existing fields take
 * precedence over the provided values, so we don't overwrite user edits).
 */
export function injectFrontmatter(
  content: string,
  fields: {
    title?: string;
    createdAt?: string;
    updatedAt?: string;
    tags?: string[];
    summary?: string;
    favorite?: boolean;
  },
): string {
  const existing = parseFrontmatter(content);

  // Merge: existing frontmatter values take precedence
  const metadata: FrontmatterData = {
    title: existing.metadata.title ?? fields.title,
    date: existing.metadata.date ?? fields.createdAt,
    updated: existing.metadata.updated ?? fields.updatedAt,
    tags:
      existing.metadata.tags && existing.metadata.tags.length > 0
        ? existing.metadata.tags
        : fields.tags && fields.tags.length > 0
          ? fields.tags
          : undefined,
    description: existing.metadata.description ?? fields.summary ?? undefined,
    aliases: existing.metadata.aliases,
    favorite:
      existing.metadata.favorite !== undefined
        ? existing.metadata.favorite
        : fields.favorite || undefined,
  };

  const body = existing.body || content;
  return serializeFrontmatter(metadata, body, existing.unknownFields);
}
