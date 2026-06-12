# Codex Deployment Guardrails

- Korean user-facing changes must keep the existing product tone and layout density.
- Before editing, inspect the current dirty worktree. Do not mix unrelated dirty changes into a commit. If the same file already has unrelated edits and the requested work needs that file, either isolate the patch precisely or say the file is already dirty before committing.
- If the user asks to deploy this app, deploy the production domain unless they explicitly ask for preview only.
- Production URL is `https://wellnessbox-attendance.vercel.app`.
- After any deployment, verify the production URL with `curl.exe -I https://wellnessbox-attendance.vercel.app` and confirm:
  - HTTP status is `200`.
  - The deployment is `target production` in `vercel inspect wellnessbox-attendance.vercel.app`.
  - `Content-Security-Policy` does not block the user's expected embedding context. In particular, do not reintroduce restrictive `frame-ancestors` such as only `'self'` and Notion unless the user explicitly asks.
- Preview deployments under `*.vercel.app` may return `401` because Vercel deployment protection is enabled for all except custom domains. Do not treat a protected preview URL as the final working deployment.
- If a screenshot says "`wellnessbox-attendance.vercel.app`에서 연결을 거부했습니다" inside another page, check response headers first. This usually means iframe embedding was blocked by `Content-Security-Policy: frame-ancestors` or `X-Frame-Options`, not that the app server is down.
