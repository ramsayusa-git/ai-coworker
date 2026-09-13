# Keep stack traces readable in release builds. Without these a crash report
# from a user's phone is a wall of a/b/c and mapping.txt has to be applied by
# hand before it says anything.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# ViewModels are instantiated reflectively by AndroidViewModelFactory, so their
# constructors are never referenced statically and R8 is free to remove them.
-keepclassmembers class * extends androidx.lifecycle.ViewModel {
    <init>(...);
}

# Keep the DSP + protocol classes readable in crash reports.
-keepnames class com.aetostechlabs.aetosonehealth.proto.** { *; }
-keepnames class com.aetostechlabs.aetosonehealth.dsp.** { *; }
