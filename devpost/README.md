# Devpost Learn integration

The six upstream skills are installed in `.agents/skills/`, scoped to this repository. They are learning instructions for the coding agent, not runtime dependencies of Venn.

Source: https://github.com/challengepost/learn-ai-basics

Pinned upstream revision: `a0f065781873e8a7ed9a9a705a8dafa6a0810439`.

## Current state

- `1-start`: complete.
- `2-scope`: `scope.md` approved.
- `3-prd`: `prd.md` approved (extracted from the approved plan and scope).
- `4-spec`: `spec.md` approved (extracted from the approved engineering roadmap).
- `5-build`: fast mode. Code for slices 1–8 is written and mechanically verified; no slice is checked off because each still needs its live provider or device evidence and the learner's hands-on check. See `checklist.md`.
- `6-ship`: not started. No submission, video, or deployment is claimed.

The personal learner profile is ignored by git. That prevents accidental commits by default; it does not make the AI conversation private or erase committed history.

## Continue the curriculum

Open Codex in this repository. Project skills should be available on the next turn. Invoke `2-scope` to review the draft. If skill discovery needs a refresh, start a new session in this folder; each installed `SKILL.md` can also be read directly.

Keep the learner in charge of consequential choices. Carry forward their existing plan and concise communication style. Do not turn the curriculum into another long questionnaire.

After scope approval, write the PRD from agreed behavior, then the technical spec from agreed implementation choices. Mark a document `approved` only after clear learner approval of the displayed document. A single clear approval counts; silence does not. Do not label the engineering roadmap as approved curriculum progress.

At build time, create `devpost/checklist.md` using `5-build`'s exact slice fields. Choose learn or fast mode with the learner. Both require verified code, saved checkpoints, early hands-on feedback, final review, and an app map grounded in the finished code.

## Shipping artifacts

According to the upstream curriculum, prepare a short demo video and a public GitHub repository. Venn's public repository already exists. Exact deadlines, eligibility, video limits, judging criteria, and submission fields must be checked against the actual event page/form before submission; that page was not supplied.

Deployment is optional for the curriculum. An externally reachable HTTPS endpoint is nevertheless needed to exercise Venn's live Photon webhook and remote Shortcut flow. That is a technical dependency of this design, not an extra hackathon rule.

The learner writes their own submission answers, exit survey, and optional community posts. The agent can identify gaps and correct spelling/grammar, but does not draft those answers under this curriculum. No external posts or submissions have been authorized or made.

## Upstream attribution

The installed skill directories retain upstream instructions and supporting templates/references. See `.agents/skills/LEARN_AI_BASICS_LICENSE` for the upstream MIT license. Keep curriculum files separate from learner progress in `devpost/`.
