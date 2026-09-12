# The app ships no reflection-based serialization, so the defaults suffice.
# Keep the DSP + protocol classes readable in crash reports.
-keepnames class com.aetostechlabs.aetosonehealth.proto.** { *; }
-keepnames class com.aetostechlabs.aetosonehealth.dsp.** { *; }
