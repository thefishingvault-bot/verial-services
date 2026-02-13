# Customer Jobs Local Notes

## Canonical Routes
- `/customer/jobs`
- `/customer/jobs/new`
- `/customer/jobs/[id]`
- `/customer/jobs/[id]/edit`
- `/customer/jobs/list` (compatibility redirect to `/customer/jobs`)

## Quick Test Steps
1. Open `/customer/jobs/list` and verify it redirects to `/customer/jobs`.
2. Open `/customer/jobs` and verify filter/sort controls render and cards are clickable.
3. Create a job in `/customer/jobs/new` with valid title/description and confirm redirect to detail page.
4. Verify detail page shows status badges, description, quotes section, Q&A section, and lifecycle tracker.
5. From detail page, test `Edit job`, `Cancel job`, and `Copy job link` actions.
6. If job is cancelled/closed, test `Re-open job` action.
