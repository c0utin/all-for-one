#!/bin/bash

TODAY=$(date +%Y-%m-%d)

task add "Meditation" wait:${TODAY}T07:30 due:${TODAY}T08:00
task add "Language study" wait:${TODAY}T08:00 due:${TODAY}T09:00
task add "TraceFi" project:tracefi wait:${TODAY}T09:00 due:${TODAY}T10:00
task add "Work on TraceFi (main block)" project:tracefi wait:${TODAY}T10:00 due:${TODAY}T12:00
task add "Workout" wait:${TODAY}T13:30 due:${TODAY}T15:00
task add "Code Synergy" wait:${TODAY}T16:30 due:${TODAY}T19:30
task add "Study math" project:math wait:${TODAY}T21:00 due:${TODAY}T22:00

echo "YOU BROKE REPEAT $TODAY"
