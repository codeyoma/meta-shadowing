#!/bin/bash
set -euo pipefail
tool=$(basename "$0")
printf '%s %s\n' "$tool" "$*" >> "$FIXTURE_OPERATIONS"
case "$tool" in
  swift)
    if [ "$FIXTURE_CASE" = package-failure ]; then exit 17; fi
    if [ "$FIXTURE_CASE" = empty-package ]; then
      printf 'Test run with 0 tests passed.\n'
    else
      printf '✔ Test run with 3 tests in 1 suite passed after 0.1 seconds.\n'
    fi
    if [ "$FIXTURE_CASE" = package-skipped ]; then printf '➜ Test skipped() skipped: "Controlled fixture"\n'; fi ;;
  xcodegen) exit 0 ;;
  xcodebuild)
    result=''
    while [ "$#" -gt 0 ]; do
      if [ "$1" = -resultBundlePath ]; then result=$2; shift; fi
      shift
    done
    test -n "$result"
    if [ "$FIXTURE_CASE" != missing-result ]; then mkdir -p "$result"; touch "$result/Info.plist"; fi
    if [ "$FIXTURE_CASE" = build-failure ]; then exit 19; fi ;;
  xcrun)
    case "$1" in
      simctl)
        test "$2 $3" = 'list devices'
        runtime=com.apple.CoreSimulator.SimRuntime.iOS-27-0
        if [ "$FIXTURE_CASE" = old-runtime ]; then runtime=com.apple.CoreSimulator.SimRuntime.iOS-26-5; fi
        printf '{"devices":{"%s":[{"udid":"11111111-1111-1111-1111-111111111111","name":"MetaShadowing Native Fixture iOS 27","state":"Booted","isAvailable":true}]}}\n' "$runtime" ;;
      xcresulttool)
        if [ "$4" = tests ]; then
          if [ "$FIXTURE_CASE" = missing-class ]; then
            printf '{"testNodes":[{"nodeType":"Test Case","nodeIdentifier":"OtherTests/example()","result":"Passed"}]}\n'
          else
            printf '{"testNodes":[{"nodeType":"UI test bundle","name":"NativeFoundationUITests","children":[{"nodeType":"Test Case","nodeIdentifier":"OfflineAcceptanceUITests/testOfflineDownloadFailsWithoutBlockingBundledLearning()","result":"Passed"},{"nodeType":"Test Case","nodeIdentifier":"OfflineAcceptanceUITests/testDownloadedLessonSurvivesOfflineRelaunchWithoutNewCredit()","result":"Passed"},{"nodeType":"Test Case","nodeIdentifier":"ReferenceToolsUITests/testDictionaryClosesWithoutClosingAnalysisOrClearingSelection()","result":"Passed"}]},{"nodeType":"Unit test bundle","name":"NativeMediaIntegrationTests","children":[{"nodeType":"Test Case","nodeIdentifier":"VoiceMonitorGainTests/extendedGainDoublesMicrophoneAmplitudeWithoutBoostingMedia()","result":"Passed"}]}]}\n'
          fi
          exit 0
        fi
        case "$FIXTURE_CASE" in
          failed-result) printf '{"result":"Failed","totalTestCount":61,"passedTests":60,"failedTests":1,"skippedTests":0}\n' ;;
          skipped-result) printf '{"result":"Passed","totalTestCount":61,"passedTests":60,"failedTests":0,"skippedTests":1}\n' ;;
          empty-result) printf '{"result":"Passed","totalTestCount":0,"passedTests":0,"failedTests":0,"skippedTests":0}\n' ;;
          *) printf '{"result":"Passed","totalTestCount":61,"passedTests":61,"failedTests":0,"skippedTests":0}\n' ;;
        esac ;;
      *) exit 23 ;;
    esac ;;
  *) exit 29 ;;
esac
