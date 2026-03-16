# 2D Measurement Angle Lock

## Goal

Allow users to hold `Shift` after placing the first measurement point to lock the measurement angle to 15-degree increments.

## Approach

- [x] Capture the implementation plan before changing code.
- [x] Add a measurement helper that constrains a draft endpoint to 15-degree angular increments from the draft start.
- [x] Apply the constraint to both live preview updates and the final committed point while `Shift` is held.
- [x] Recompute the draft immediately when `Shift` is pressed or released during an active measurement.
- [x] Add focused unit and component coverage for the new behavior.
- [x] Run focused verification on the touched viewer files.
