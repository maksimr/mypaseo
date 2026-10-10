# Action labels

Action labels use Title Case. Write "Import Session", not "Import session".

## What counts as an action label

- Button text, including segmented toggles ("Branch vs Base")
- Menu items ("Import Session", "Archive")
- `title` and `aria-label` on icon buttons ("New Workspace", "Remove Image 2")
- Dialog titles and `aria-label`s named after the action that opened them ("Import Session into mypaseo")

Sentences keep sentence case. That covers `confirm()`/`alert()`/`prompt()` text, descriptions, placeholders, empty states, status text ("Loading…") and labels of plain inputs ("Variable name").

## Title Case rules

Capitalize every word except these, unless the word comes first or last:

- articles: a, an, the
- conjunctions: and, but, or, nor
- short prepositions: at, by, for, in, into, of, on, to, vs

Keep the casing of names and code identifiers (`PATH`, mypaseo).

## Wording

- Start with a verb: "Add Project", "Discard Changes", "Load More".
- Say "Remove", never "Delete". The confirm text spells out what is lost for good.
- Don't repeat the entity the action belongs to. A workspace menu says "Archive" and "Remove", not "Archive Workspace"; a project menu says "Remove", not "Remove Project". Name an entity only when it differs from the one the action sits on ("Import Session" in a project menu, "New Workspace" on a project row). `aria-label`s keep the entity, since screen readers hear them out of context ("Remove Image 2").
- One action, one name. If the sidebar menu says "Import Session", every other entry point says "Import Session" too, never "Import an existing session".
- No trailing "…" on actions. Keep "…" for in-progress status ("Loading…") and placeholders.
- Keyboard hints go in parentheses at the end: "Send (Enter)", "Close (Esc)".

Labels that come from the daemon, like permission action `label`s, are rendered as-is.
