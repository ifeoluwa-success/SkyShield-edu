# Frontend Integration Audit

**Date:** May 2026  
**Scope:** SkyShield Edu frontend (`frontend/`) vs `api.txt` / backend APIs

---

## Architecture (conventions to follow)

| Layer | Location | Notes |
|-------|----------|--------|
| HTTP client | `src/services/api.ts` | Axios instance, JWT interceptors, refresh queue |
| Domain APIs | `src/services/*.ts` | One module per domain (not in `api.ts`) |
| Types | `src/types/` | Shared TS interfaces |
| Pages | `src/pages/{dashboard,tutor,admin}/` | Lazy-loaded via `App.lazy.tsx` |
| Layout shell | `role-dashboard` + `RoleDashboard.css` | Admin-style cards/sections |
| Auth routing | `src/lib/authRouting.ts` | Role → home path |
| List unwrap | `src/lib/apiUtils.ts` | `{ results: [] }` pagination |

---

## API integration status

### `api.ts` (HTTP layer)

- JWT attached on requests; refresh on 401 (non-auth endpoints).
- Auth endpoints excluded from refresh loop (`/users/login/`, `/users/token/refresh/`, `/users/register/`).
- Session expiry clears storage and redirects to `/login`.

### Service modules

| Service | Endpoints | Status |
|---------|-----------|--------|
| `authService.ts` | login, register, profile, devices, sessions | Integrated |
| `analyticsService.ts` | dashboard, performance, trends, skills, learning-path, comparison, **platform/** | Integrated |
| `scenarioStaffService.ts` | staff scenarios CRUD, assign, performance | Integrated (unwrap list) |
| `simulationService.ts` | scenarios, sessions, certifications | Integrated |
| `courseService.ts` | courses, enrollments, certificates | Integrated |
| `tutorService.ts` | tutor portal, exercises, materials | Integrated (unwrap on lists) |
| `contentService.ts` | library, paths, bookmarks | Integrated |
| `incidentService.ts` | mission runs | Integrated |

### Platform analytics APIs (admin / supervisor / instructor)

| Endpoint | Frontend consumer |
|----------|-------------------|
| `GET /analytics/platform/overview/` | `AdminDashboardPage`, `TutorAnalyticsPage` |
| `GET /analytics/platform/users/` | `AdminDashboardPage` |
| `GET /analytics/platform/performance-trends/` | `AdminDashboardPage`, `TutorAnalyticsPage` |
| `GET /analytics/platform/certifications/` | `AdminDashboardPage`, `TutorAnalyticsPage` |
| `GET /analytics/platform/retries/` | `AdminDashboardPage`, `TutorAnalyticsPage` |
| `GET /core/admin/stats/` | `AdminDashboardPage` (legacy system activity) |

---

## Feature modules

### Supervisor scenario management (`/tutor/scenarios`, `/admin/scenarios`)

**Page:** `TutorScenariosPage.tsx`  
**Service:** `scenarioStaffService.ts`

- Create / edit / duplicate / archive scenarios
- Filter by publish status, search
- Assign trainees with max attempts
- Per-scenario performance snapshot
- **Gap (future):** full step editor, assignment list modal, revoke UI, cooldown hours in assign form

### Admin analytics (`/admin/stats`)

**Page:** `AdminDashboardPage.tsx`

- User base + role distribution
- Simulation engagement KPIs
- Certification charts + leaderboard
- Performance trends table + CSV export
- Retry analytics
- 24h system activity (legacy core API)

### Staff analytics (`/tutor/analytics`, `/admin/analytics`)

**Page:** `TutorAnalyticsPage.tsx`

- Tutor-scoped stats (students, materials)
- Platform KPIs for supervisor/admin/instructor
- Platform trends, certs, retries (staff roles)

### Trainee analytics (`/dashboard/analytics`)

**Page:** `dashboard/AnalyticsPage.tsx`

- User performance, skills, comparison, trends
- Uses `analyticsService` + `simulationService`

### Trainee certifications (`/dashboard/certificates`)

**Page:** `CertificationsPage.tsx`

- Course certificates via `courseService.getMyCertificates()`
- Simulation badges via `simulationService.getUserCertifications()`

### Retry / attempts

- **Platform:** `getPlatformRetryAnalytics()` on admin/staff dashboards
- **Per scenario:** `max_attempts` on staff scenario form + assignment
- **Trainee:** `CourseDetailPage` shows attempts vs `max_simulation_attempts`
- **Gap:** dedicated trainee “my assignments” retry UI

---

## Role dashboards

| Role | Home | Primary surfaces |
|------|------|------------------|
| Trainee | `/dashboard` | simulations, courses, analytics, certificates |
| Supervisor | `/tutor/dashboard` | scenarios, students, analytics, grading |
| Instructor | `/tutor/dashboard` | materials, exercises, analytics |
| Admin | `/admin/dashboard` | platform stats at `/admin/stats`, scenarios |

**Auth:** single `/login` for all roles; post-login redirect via `getHomePathForRole()`.

---

## UI consistency

- Prefer `role-dashboard` wrapper on portal pages.
- Shared analytics widgets: `src/components/analytics/`, `AnalyticsComponents.css`.
- Buttons: `btn-primary` / `btn-secondary` (RoleDashboard) — some older pages still use `primary-button` (migrate gradually).
- Toasts: `Toast` component.
- Loading: `PageLoader`, skeletons on `CertificationsPage`.

---

## Known gaps & recommended next steps

1. **Error boundaries** — add route-level `ErrorBoundary` wrapper in `App.tsx`.
2. **React Query** — `@tanstack/react-query` is installed but underused; migrate dashboard fetches for caching.
3. **Chart library** — CSS bar charts only; add Recharts if interactive charts are required.
4. **Scenario editor** — rich step/hint JSON editor for staff scenarios.
5. **Assignment management** — list/revoke assignments UI using `getScenarioAssignments` / `revokeScenarioAssignment`.
6. **Instructor scenarios** — currently supervisor/admin only (matches backend).
7. **MeetingRoom.tsx** — unrelated TS build error; fix separately.
8. **Export reports** — CSV on admin trends; extend to PDF via tutor reports API.
9. **Real-time analytics** — polling or WebSocket not implemented; use manual Refresh.
10. **Accessibility** — audit modals/tables for ARIA on remaining tutor pages.

---

## Performance notes

- Routes lazy-loaded in `App.lazy.tsx`.
- Use `unwrapList` to avoid `.map is not a function` on paginated APIs.
- `Promise.allSettled` on trainee analytics for graceful partial failure.
- Avoid duplicate fetches: prefer single `load()` with parallel requests (admin dashboard pattern).

---

## Verification checklist

- [ ] Admin login → `/admin/dashboard` → Platform Stats loads without redirect loop
- [ ] Supervisor → Scenarios list loads; create draft works
- [ ] Trainee → Dashboard analytics loads
- [ ] Platform stats show role counts consistent with backend (~963 users)
- [ ] Performance trends table populates when simulation data exists
- [ ] Certification section shows Beginner/Intermediate/Advanced/Expert counts
