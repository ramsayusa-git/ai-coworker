#!/bin/bash
B=http://localhost:5173
cd "/home/krishna/ai-work-space/ai-coworker/Livekit Clone/lattice-web"
printf 'Landing SFC      => '; curl -s -o /dev/null -w '%{http_code}\n' "$B/src/views/Landing.vue"
curl -s "$B/src/views/Landing.vue" | grep -o 'type=style[^"]*' > /tmp/st.txt
i=0
while read -r q; do
  i=$((i+1))
  printf 'style block %-4s => ' "$i"
  curl -s -o /dev/null -w '%{http_code}\n' "$B/src/views/Landing.vue?vue&$q"
done < /tmp/st.txt
printf 'compile errors   => '
curl -s "$B/src/views/Landing.vue" | grep -ci "Internal Server Error\|Missed semicolon" || true
