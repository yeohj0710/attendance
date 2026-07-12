# Admin Attendance Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make attendance editing immediately visible and reliable, correct 여형준's 2026-07-12 check-in to 10:35 KST, then verify and deploy production.

**Architecture:** Keep the existing Next.js/Firebase API and audit-log path. Replace the off-screen desktop editor interaction with an accessible modal editor, add clear mutation feedback and validation, and use a one-purpose audited maintenance script for the production data correction.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, Firebase Admin, Vercel

---

### Task 1: Reproduce and lock the editor behavior

**Files:**
- Modify: `components/admin/AdminApp.tsx`
- Test: local admin page in browser

- [ ] Confirm that clicking `수정` only mutates `form` while the editor remains below/aside from the long record list, producing no visible response at the clicked row.
- [ ] Record the root cause and preserve the existing PATCH API contract.

### Task 2: Build a visible, accessible editor

**Files:**
- Modify: `components/admin/AdminApp.tsx`

- [ ] Open record edits in a fixed modal with record identity, explicit close/cancel controls, overlay dismissal, and Escape-key handling.
- [ ] Keep record creation available as a separate action and reuse the same form fields.
- [ ] Add required fields, disabled submit state, visible success/error feedback, and scroll-safe mobile layout.
- [ ] Keep the existing `/api/admin/attendance/:id` PATCH path and audit reason payload.

### Task 3: Correct the production attendance record

**Files:**
- Create: `scripts/fix-attendance-check-in.mjs`
- Modify: `package.json`

- [ ] Query employees by exact name `여형준` and require exactly one match.
- [ ] Query the deterministic 2026-07-12 record, print the before state, and refuse unexpected employee/date targets.
- [ ] Update only `check_in_at`, `source`, `updated_by`, and `updated_at`; create a matching audit record containing before/after data and reason.
- [ ] Run the script with `2026-07-12T10:35:00+09:00`, then re-read and print the saved value.

### Task 4: Verify, review, commit, push, deploy

**Files:**
- Review all task-scoped diffs while preserving unrelated pre-existing worktree changes.

- [ ] Run `npm run typecheck` and `npm run build`.
- [ ] Exercise the editor in desktop and mobile browser widths; verify click, cancel, Escape, validation, save, and feedback.
- [ ] Review the diff for regression, accessibility, data integrity, and accidental inclusion of unrelated dirty changes.
- [ ] Commit the task-scoped files, push `main`, and deploy production.
- [ ] Verify `https://wellnessbox-attendance.vercel.app` returns HTTP 200, inspect target production, and check embedding headers.
