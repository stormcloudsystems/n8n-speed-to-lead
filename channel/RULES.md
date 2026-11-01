# n8n template library: rules (primary sources, read 2026-10-20)

Nothing has been submitted; no creator account was created.

Sources:
- https://support.n8n.io/article/becoming-an-n8n-template-creator-and-getting-help
- https://n8n.notion.site/n8n-Creator-hub-7bd2cbe0fce0449198ecb23ff4a2f76f (Creator Hub)
- https://n8n.notion.site/p/Template-submission-guidelines-9959894476734da3b402c90b124b1f77
- https://n8n.notion.site/Sticky-note-guidelines-for-templates-2aa5b6e0c94f8058b0aefddd02655887

Process
- Sign up as a creator (creators.n8n.io/register), submit in the Creator Dashboard. New creators submit one
  template at a time; the next after approval. Verified after 3 approved templates. Review "usually within a week".

Content rules that apply to this workflow, and status
| Rule (summarized) | Status in workflow/speed-to-lead.json |
|---|---|
| Exactly one yellow overview sticky, top-left, 100-300 words, with `### How it works` and `### Setup` | Met; unit test W7 |
| White section stickies (<50 words) grouping nodes, required for 4+ node workflows | Met (2); unit test W8 |
| Rename all nodes to describe their purpose | Met (manual check) |
| Use a Set node to group variables the user must configure | Met: **Settings** |
| No hardcoded API keys / credentials; remove personal identifiers and real e-mail addresses | Met: only `@example.com`; unit test W5 |
| Description in clear English Markdown, no HTML, ~200 words; sections Who's it for / How it works / How to set up / Requirements / How to customize | Draft in `template-submission.md` |
| Title: action verb + thing + to/on/in/from + where, sentence case, main nodes, no emojis/hype | Draft title below |
| Be original, not low-effort; check the library for similar templates | UNVERIFIED: the library was not searched for overlapping speed-to-lead templates; owner/verifier should check before submitting |
| Community nodes need a self-hosted disclaimer | Not applicable (stock nodes only) |
