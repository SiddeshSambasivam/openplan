---
id: demo-export-notes-as-pdf
title: Demo: export notes as PDF
status: alignment
type: feature
source: claude-code
folders: [Demo]
demo: true
created: {now}
updated: {now}
---
# Demo: export notes as PDF

## Summary

People ask for a way to send a note to someone who does not use Notes. This plan adds Export as PDF to the note menu. The PDF keeps headings, lists, checkboxes and images, and it always uses the light theme.

## Current state

- The note menu has Copy link and Duplicate. Nothing in it makes a file.
- 212 support tickets in the last 90 days ask for PDF or print.
- `export/markdown.ts` already turns a note into markdown for Copy as markdown.

## Approach

Render the note to HTML with the renderer the editor uses, then print that HTML to a PDF on the device. Nothing leaves the device until the person sends the file. Images keep their stored size up to the page width, and a tall image splits across pages.

## Steps

1. Add Export as PDF to the note menu in `notes/NoteMenu.tsx`.
2. Build the print document in `export/pdf.ts` from the editor's renderer.
3. Save the file through the system save dialog, named after the note's title.
4. Test headings, lists, checkboxes and a note with 50 images.

## Risks and open questions

- A note with hundreds of images may take several seconds to export. The questions on the Alignment tab ask what size to plan for.
- Fonts on the person's device may differ from the app's. The PDF embeds the app's font so the page looks the same everywhere.
