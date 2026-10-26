# Optional pictures for availability respondents

Approved: the user selected both instant selfies and goofy illustrated avatars, built in a separate worktree. Scope is the name entry on availability Venns and their respondent list; deployment is not part of this request.

## Experience

Beside Your name, show a round picture preview with an optional picture chooser. Offer six original illustrated faces, including a tongue-out face, and a selfie booth. People can change or remove their picture without creating another response. Keep Venn's cream/purple styling, large text, clear selected states, keyboard access, and phone layouts.

The booth starts the front camera only on a deliberate tap. It shows a mirrored preview and supports capture, review, retake, and use photo. Cancel, unmount, page hiding, or a late camera grant after closing must stop every camera track. Unsupported, denied, or missing cameras leave the response usable and offer photo selection and the illustrated faces. No audio, face recognition, filters, or external image service.

Browser capture/upload becomes a cropped small JPEG before submission. The server decodes, verifies, resizes, and re-encodes it, removing metadata. Reject oversized, corrupt, or unsupported images with a safe error; preserve the user's answer on failed saves.

## Data and visibility

Pictures are scoped to the existing browser response, not a claimed name or a Google identity. Store an allowlisted avatar ID or a normalized JPEG with a separate random picture key. Omitted picture input preserves an existing picture for compatibility; explicit null removes it. Replacing/removing a photo invalidates its old picture key.

Own responses may include their picture metadata. Only a browser with a saved response can request respondent names and picture metadata, using the existing explicit names toggle. Photo bytes are served through a protected, private/no-store route scoped to that Venn and the requesting respondent. Anonymous views, aggregate JSON, link previews, calendar overlays and notification summaries must not expose photos. Normal poll reads select metadata and never fetch everyone's photo bytes. Existing names JSON remains compatible.

Unsaved manual drafts retain picture choices alongside names and selections, including explicit removal. The existing 24-hour expiry, changed-server-answer protection and optional-storage behavior remain. Photos disappear when their response/poll is deleted through existing retention.

## Acceptance

- Choose, save, reload, change and remove an avatar/photo; respondent count stays one.
- A second respondent sees pictures only after answering and opting to show respondents; an anonymous browser cannot fetch the JPEG even with its URL.
- Camera capture, retake, cancellation, late grants, denied/unsupported cameras, file selection and track cleanup have browser coverage with synthetic media.
- Corrupt/oversized images and arbitrary avatar IDs are rejected; normalization removes metadata.
- Desktop and 390px layouts remain usable without page overflow; capture controls are accessible and motion respects reduced-motion preferences.
- Existing calendar, availability, privacy, concurrency and legacy journeys pass.

Physical iPhone camera permission/capture remains a separate device check; synthetic browser media must not be described as a physical-device pass.
