#!/bin/bash
# Reassemble Aetos One Meet v2.0.0 APK from parts (run in this folder)
cat AetosOneMeet-v2.0.0.apk.part-* > AetosOneMeet-v2.0.0-release-nofcm.apk
sha256sum -c AetosOneMeet-v2.0.0.apk.sha256 && echo "APK OK - install AetosOneMeet-v2.0.0-release-nofcm.apk"
