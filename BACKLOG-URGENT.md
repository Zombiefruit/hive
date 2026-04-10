# Backlog — Non-blocking Items

All urgent/blocking issues from the original backlog have been resolved.

## Remaining tech debt (non-blocking)

- **H4**: 196 empty catch blocks across 65 files — needs incremental cleanup
- **M2**: 4 duplicate NotificationItem interfaces — should consolidate to shared type
- **M5**: useEffect dependency arrays missing deps in DetailDrawer
- **M6**: Skill ID polling every 3s — should be event-driven
- **Bridge double-restart**: Cosmetic — restartBridge() triggers twice per cycle
