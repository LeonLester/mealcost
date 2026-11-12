#!/usr/bin/env bash
# Runs inside the Android emulator: installs the debug APK, starts it and drives the WebView over DevTools.
set -u
mkdir -p shots
APP=com.coachleonidas.mealcost
adb install -r dist/mealcost-debug.apk
adb shell am start -n $APP/.MainActivity
sleep 10
adb exec-out screencap -p > shots/00-launch.png
adb logcat -d -s Capacitor:V Capacitor/Console:V chromium:E AndroidRuntime:E > shots/logcat-launch.txt || true
if adb shell pidof $APP >/dev/null; then echo "app is running"; else echo "APP CRASHED"; cat shots/logcat-launch.txt; exit 1; fi
python3 tests/android/smoke.py
code=$?
adb logcat -d -s Capacitor:V Capacitor/Console:V chromium:E AndroidRuntime:E > shots/logcat-end.txt || true
exit $code
