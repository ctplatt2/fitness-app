# Lift Log: ideas for next time

Written 2026-11-15 after two QA rounds. Roughly ordered by value within each group.

## Start here

1. **Edit a finished workout.** Today a logged workout can only be deleted. Fixing one wrong number means deleting and re-entering the session.
2. **Weekly review.** At the end of each plan week, one card: sessions done and skipped, run minutes, records, and how energy and soreness trended. Uses data already collected.
3. **Loaded timed exercises.** Farmer Carry is a timed exercise, so there is nowhere to record the dumbbell weight. Add a "weight and time" exercise type.

## Training

4. **Calendar awareness.** Plan days are named Mon to Sun but the plan moves by position, so a missed day shifts everything. Show "2 days behind" and offer to skip ahead or shift the week.
5. **Check-ins filled from the log.** "Back squat: load × 5" and "Trap-bar deadlift: load × 5" can be read from logged sets instead of typed.
6. **Interval timer.** The Thursday session has 30 s hard / 90 s easy bike intervals and timed shuffles. A work/rest interval timer with sounds would replace a separate app.
7. **Sticky exercise notes.** A per-exercise note (seat height, grip, cue) shown every time that exercise comes up.
8. **Easy-run check.** With a max heart rate in Settings, mark each Strava run as in or above Zone 2 and show it against the plan's "conversational" target.
9. **Hold-back suggestions.** When soreness is "A lot" or energy is "Low" two sessions running, suggest repeating the weight instead of adding to it.
10. **Next-block handoff.** At "Plan complete", a button that copies results (check-ins, records, sessions missed) as a prompt for ChatGPT or Claude to write the next 12 weeks in the app's format.

## Data and safety

11. **Backups that happen without thinking.** Offer "Back up now" on the workout summary screen, and make the reminder weekly. Everything still lives only on the phone.
12. **Phone and Mac in sync.** Larger project: sync through a private file (iCloud Drive or a private gist) so the Mac shows the same log.
13. **Undo for deletes.** A short "Undo" bar after deleting a workout, cardio entry or exercise, instead of confirmations.
14. **Rename and edit library exercises** while keeping their history attached.

## Polish

15. **Body measurements** alongside body weight, and lifts shown relative to body weight.
16. **Each-side sets.** Split squats and single-leg work are logged as one number; allow left and right.
17. **Automated end-to-end tests** (Playwright) for the core loop: start, log, finish, history, delete. These are currently checked by hand in the browser.

## Known limits

- Still untested on a real phone: backup share sheet, lock-screen timer sound, notifications.
- A web app cannot read Apple Health or run on Apple Watch.
- Editing a plan through the tap-to-edit screens, or converting units, rewrites its text and drops `//` comment lines.
- Removing a custom exercise from the library has no confirmation (its logged history stays).
