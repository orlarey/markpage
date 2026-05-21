# Diff block

A pre-`feat`/`fix` snippet, followed by the diff that lands the
change. The dispatcher classifies each line by its leading marker:
`+` / `-` for additions / removals, `@@` for hunks, `+++` / `---`
for the file headers, anything else is context.

```diff
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,5 +1,6 @@
 function greet(name: string): string {
-  return `Hello, ${name}`;
+  if (!name) return 'Hello, stranger';
+  return `Hello, ${name}!`;
 }
```

Inline code like `git diff` flows through unchanged because only
the dedicated fence triggers the special rendering.
