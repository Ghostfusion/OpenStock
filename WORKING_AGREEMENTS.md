# Working Agreements

Rules this repository is worked under. They apply to every change, whether written by a
person or an agent. Where a rule and a habit disagree, the rule wins.

---

## 1. Never commit or document sensitive information

Never commit or document sensitive information. No API keys, secrets, private keys, wallet
material, tokens, passwords, or personal data in code, tests, fixtures, docs, commit messages,
or logs.

- Adapter credentials stay in environment variables.
- Read credentials from the environment only.
- Never add an environment variable to a test in a way that makes the test depend on it.

This covers the whole surface, not just source files: commit messages, test fixtures, example
configs, documentation, screenshots, and log output are all in scope.

---

## 2. Always commit and push after a code or document change

Always commit and push code after a code or document change. A code change is not finished when
the file is written; it is finished when the change is committed and pushed.

A change that exists only in the working tree is not delivered.

---

## 3. Fix defects on the spot

Fix defects on the spot without asking, unless the owner decides otherwise or a logic decision is
needed. When a defect is found in the code being worked on, fix it as part of the same change
rather than reporting it and moving on.

Defer only when the owner explicitly decides to defer, and record the deferral.

---

## 4. Never make code changes unless they are defects

Keep the change surface limited to defect fixes. Do not add unrelated features, refactors,
renames, abstractions, drive-by cleanups, or speculative improvements.

Note unrelated observations instead of changing them.

---

## 5. Keep documentation in sync with code changes

Always keep corresponding documentation in sync with code changes. A code change updates the
documents and generated artifacts that describe it, in the same change. This includes concept and
integration docs, coding-standards guidance, and the generated stubs and docstrings.

Maintainer-owned files such as `RELEASES.md` are updated by maintainers, not by agents.

---

## Deferrals

A deferral is a decision, not a default. Record it where the work is tracked, with the reason and
the owner who decided it. An unrecorded deferral is an unfinished change.
