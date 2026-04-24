-- Phase E follow-up: persist confirmation-card state on chat_messages so
-- applied/discarded/failed cards survive a page refresh. Pending/applying
-- cards are in-flight and intentionally NOT persisted — if the user
-- refreshes mid-action, the card is dropped and they can re-ask.

ALTER TABLE "chat_messages"
  ADD COLUMN "confirmation" JSONB;
