import { useState, useEffect, useRef, useCallback } from "react";
import { fetchMeetingContext, type MeetingContextNote } from "../api/ai.ts";

const POLL_INTERVAL_MS = 45_000; // Poll every 45 seconds
const MIN_TRANSCRIPT_LENGTH = 50; // Need at least ~50 chars of transcript before searching

export interface MeetingContextState {
  /** Currently surfaced notes, ordered by most recent first */
  relevantNotes: MeetingContextNote[];
  /** Whether a context search is currently in flight */
  isSearching: boolean;
}

/**
 * Polls the meeting-context API during recording to surface relevant notes.
 * Only active when `isRecording` is true and `liveTranscript` has content.
 */
export function useMeetingContext(
  isRecording: boolean,
  liveTranscript: string,
): MeetingContextState {
  const [relevantNotes, setRelevantNotes] = useState<MeetingContextNote[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Track all note IDs we've already surfaced to avoid duplicates
  const seenNoteIdsRef = useRef<Set<string>>(new Set());
  const lastTranscriptRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doSearch = useCallback(async (transcript: string) => {
    if (transcript.length < MIN_TRANSCRIPT_LENGTH) return;
    if (transcript === lastTranscriptRef.current) return; // No new content
    lastTranscriptRef.current = transcript;

    setIsSearching(true);
    try {
      // Use the last ~2000 chars as the context window
      const contextWindow = transcript.slice(-2000);
      const result = await fetchMeetingContext(
        contextWindow,
        Array.from(seenNoteIdsRef.current),
      );

      if (result.relevantNotes.length > 0) {
        // Add new notes to the front, mark as seen
        const newNotes = result.relevantNotes.filter(
          (n) => !seenNoteIdsRef.current.has(n.id),
        );
        for (const n of newNotes) {
          seenNoteIdsRef.current.add(n.id);
        }
        if (newNotes.length > 0) {
          setRelevantNotes((prev) => [...newNotes, ...prev]);
        }
      }
    } catch (err) {
      // Non-fatal — don't disrupt the recording
      console.warn("Meeting context search failed:", err);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Start/stop polling based on recording state
  useEffect(() => {
    if (isRecording) {
      // Initial search after a short delay to let transcript build
      const initialTimeout = setTimeout(() => {
        doSearch(liveTranscript);
      }, 5000);

      // Then poll at regular intervals
      timerRef.current = setInterval(() => {
        doSearch(liveTranscript);
      }, POLL_INTERVAL_MS);

      return () => {
        clearTimeout(initialTimeout);
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };
    } else {
      // Reset when recording stops
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setRelevantNotes([]);
      seenNoteIdsRef.current = new Set();
      lastTranscriptRef.current = "";
    }
  }, [isRecording, doSearch, liveTranscript]);

  return { relevantNotes, isSearching };
}
