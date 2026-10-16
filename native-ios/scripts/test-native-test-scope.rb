#!/usr/bin/env ruby
require 'minitest/autorun'
require 'tmpdir'
require 'fileutils'
require 'open3'
require_relative 'native-test-scope'

class NativeTestScopeTest < Minitest::Test
  ROOT = File.expand_path('../..', __dir__)

  def plan(*paths)
    NativeTestScope.plan({ 'paths' => paths }, root: ROOT)
  end

  def test_stage_scope_excludes_other_product_screens
    scope = plan('native-ios/App/Browsing/StageDetailHeader.swift')
    assert_equal ['stages'], scope.fetch('screens')
    assert_includes scope['selectors'], '-only-testing:NativeFoundationUITests/ProductUITests/testStageCardsGroupStatisticsActionAndPracticeWithoutClipping'
    refute scope['selectors'].any? { |s| s.include?('PlayerUITests') || s.include?('Settings') || s.include?('Typography') }
  end

  def test_shared_logic_selects_related_integrations_without_consumer_screen_expansion
    scope = plan('native-ios/App/Player/LearningStudyTime.swift')
    assert_empty scope['screens']
    assert_equal ['-only-testing:NativeMediaIntegrationTests/LearningStudyTimeTests'], scope['selectors']
  end

  def test_dictionary_tokenizer_is_logic_not_a_screen
    scope = plan('native-ios/App/Reference/DictionaryWords.swift')
    assert_empty scope['screens']
    assert_equal ['-only-testing:NativeMediaIntegrationTests/DictionaryOwnershipTests'], scope['selectors']
  end

  def test_shared_preference_source_owns_its_group_and_editor_views
    scope = plan('native-ios/App/Settings/LearningPreferencesView.swift')
    assert_includes scope['selectors'], '-only-testing:NativeFoundationUITests/PlayerUITests/testFailedGroupingEditRetryUpdatesOpenEditor'
    assert_includes scope['screens'], 'rate'
    assert_includes scope['screens'], 'typography'
  end

  def test_reviewed_ui_helper_selects_only_consuming_methods_in_mixed_classes
    Dir.mktmpdir('native-helper-scope-') do |root|
      helper = 'native-ios/Tests/AppUITests/LearningPlayerActions.swift'
      path = 'native-ios/Tests/AppUITests/MixedUITests.swift'
      FileUtils.mkdir_p(File.dirname(File.join(root, path)))
      File.write(File.join(root, helper), "extension App {\n    @MainActor @discardableResult func revealStage() {}\n}\n")
      File.write(File.join(root, path), <<~'SWIFT')
        class MixedUITests {
            @MainActor func testStage() { openStages() }
            @MainActor func testSettings() { openSettings() }
            private func openStages() { app.revealStage(1) }
            private func openSettings() { app.tapSettings() }
        }
      SWIFT
      scope = NativeTestScope.plan({ 'paths' => [helper] }, root: root)
      assert_equal ['-only-testing:NativeFoundationUITests/MixedUITests/testStage'], scope['selectors']
    end
  end

  def test_package_scope_does_not_schedule_ui_or_other_packages
    scope = plan('native-ios/Packages/LearningPersistence/Sources/LearningPersistence/SQLiteLearningStore.swift')
    assert_equal ['LearningPersistence'], scope['packages']
    assert_empty scope['screens']
    refute scope['selectors'].any? { |s| s.include?('NativeFoundationUITests') }
  end

  def test_unknown_app_code_fails_instead_of_skipping_or_running_every_screen
    assert_raises(RuntimeError) { plan('native-ios/App/Browsing/NewScreen.swift') }
  end

  def test_docs_and_tooling_changes_produce_explicit_build_only_scope
    scope = plan('native-ios/README.md', 'native-ios/scripts/native-pre-push.rb')
    assert_empty scope['screens']
    assert_empty scope['selectors']
  end

  def test_settings_edit_does_not_select_dedicated_editor_or_deletion_screens
    scope = plan('native-ios/App/Settings/SettingsView.swift')
    refute scope['selectors'].any? { |s| s.match?(/Font|Rate|Reveal|Deletion|LocalReset/) }
  end

  def test_options_edit_does_not_select_unrelated_player_rendering
    scope = plan('native-ios/App/Player/LearningOptionsView.swift')
    refute_includes scope['selectors'], '-only-testing:NativeMediaIntegrationTests/PlayerLayoutRenderingTests'
  end

  def test_confirmation_journeys_have_single_screen_ownership
    bookshelf = plan('native-ios/App/Browsing/BookManagementMenu.swift')['selectors']
    data = plan('native-ios/App/Settings/DataManagementView.swift')['selectors']
    assert_includes bookshelf, '-only-testing:NativeFoundationUITests/AppleServicesUITests/testDownloadConfirmationInLightAndDarkAtLargestText'
    refute bookshelf.any? { |selector| selector.include?('/testDataConfirmations') }
    assert_includes data, '-only-testing:NativeFoundationUITests/AppleServicesUITests/testDataConfirmationsInLightAndDarkAtLargestText'
    refute data.any? { |selector| selector.include?('/testDownloadConfirmation') }
  end

  def test_ui_helper_with_unreviewed_consumers_blocks_instead_of_build_only_pass
    assert_raises(RuntimeError) { plan('native-ios/Tests/AppUITests/UIElementWaits.swift') }
  end

  def test_integration_helper_with_unreviewed_consumers_blocks_instead_of_build_only_pass
    assert_raises(RuntimeError) { plan('native-ios/Tests/MediaIntegrationTests/MediaFixtureFactory.swift') }
  end

  def test_player_edit_excludes_standalone_rate_editor_rendering
    scope = plan('native-ios/App/Player/LearningPlayerView.swift')
    refute_includes scope['selectors'], '-only-testing:NativeMediaIntegrationTests/PlayerLayoutRenderingTests'
    refute scope['selectors'].any? { |selector| selector.include?('/testRate') }
    assert_includes scope['selectors'], '-only-testing:NativeMediaIntegrationTests/PlayerLayoutRenderingTests/testShortContentCentersBetweenActualFixedBars'
  end

  def test_audit_only_test_changes_have_explicit_audit_screen_ownership
    scope = plan('native-ios/Tests/AppUITests/VoiceOverSemanticsUITests.swift')
    assert_equal %w[bookshelf options player rate settings stages typography], scope.fetch('audit_screens')
    assert_empty scope['screens'], 'Test maintenance must not pretend app screen source changed'
  end

  def test_reviewed_helper_owns_the_audit_screens_of_its_voiceover_consumers
    scope = plan('native-ios/Tests/AppUITests/LearningPlayerActions.swift')
    assert scope['selectors'].any? { |selector| selector.include?('/VoiceOverSemanticsUITests/') }
    assert_equal %w[bookshelf options player rate settings stages typography], scope['audit_screens']
  end

  def test_experience_popup_selects_its_actual_behavior_test
    scope = plan('native-ios/App/Browsing/ExperiencePopover.swift')
    assert_includes scope['selectors'], '-only-testing:NativeFoundationUITests/ProductUITests/testExperiencePopoverShowsCurrentLevelWithoutChangingProgress'
  end

  def test_missing_scope_or_unfiltered_flags_are_rejected
    assert_raises(KeyError) { NativeTestScope.validate!({}) }
    assert_raises(RuntimeError) { NativeTestScope.validate!('version' => 1, 'screens' => [], 'packages' => [], 'selectors' => ['-skip-testing:NativeFoundationUITests']) }
  end

  def test_edited_method_in_mixed_screen_file_does_not_select_untouched_methods
    Dir.mktmpdir('native-method-scope-') do |root|
      path = 'native-ios/Tests/AppUITests/ProductUITests.swift'
      FileUtils.mkdir_p(File.dirname(File.join(root, path)))
      File.write(File.join(root, path), "class ProductUITests {\n    @MainActor func testStageCard() {\n        print(1)\n    }\n    @MainActor func testSettings() {\n        print(2)\n    }\n}\n")
      scope = NativeTestScope.plan({ 'paths' => [path], 'hunks' => { path => [[3, 1]] } }, root: root)
      assert_equal ['-only-testing:NativeFoundationUITests/ProductUITests/testStageCard'], scope['selectors']
    end
  end

  def test_new_test_class_needs_no_hardcoded_method_names
    Dir.mktmpdir('native-method-scope-') do |root|
      path = 'native-ios/Tests/AppUITests/NewScreenUITests.swift'
      FileUtils.mkdir_p(File.dirname(File.join(root, path)))
      File.write(File.join(root, path), "class NewScreenUITests {\n    @MainActor func testNewScreen() {}\n}\n")
      scope = NativeTestScope.plan({ 'paths' => [path], 'hunks' => { path => [[1, 3]] } }, root: root)
      assert_equal ['-only-testing:NativeFoundationUITests/NewScreenUITests/testNewScreen'], scope['selectors']
    end
  end

  def test_swift_audit_scope_keeps_navigation_inside_selected_screens
    Dir.mktmpdir('native-audit-scope-') do |root|
      source = File.join(ROOT, 'native-ios/Tests/AppUITests/ScreenTestScope.swift')
      main = File.join(root, 'main.swift')
      executable = File.join(root, 'scope-test')
      File.write(main, <<~'SWIFT')
        import Foundation
        let full = try ScreenTestScope(value: nil)
        precondition(full.needsStages && full.needsLearning && full.needsSettings)
        let stages = try ScreenTestScope(value: "stages")
        precondition(stages.contains("stages") && stages.needsStages)
        precondition(!stages.needsLearning && !stages.needsSettings && !stages.contains("bookshelf"))
        let settings = try ScreenTestScope(value: "settings")
        precondition(settings.needsSettings && !settings.needsStages && !settings.needsLearning)
        let rate = try ScreenTestScope(value: "rate")
        precondition(rate.needsLearning && rate.needsStages && !rate.needsSettings)
        precondition(!rate.contains("options") && !rate.contains("player"))
        let typography = try ScreenTestScope(value: "typography")
        precondition(typography.needsSettings && !typography.contains("settings"))
        for invalid in ["", "unknown", "stages,", ",player"] {
            precondition((try? ScreenTestScope(value: invalid)) == nil)
        }
      SWIFT
      _output, _error, compiled = Open3.capture3('swiftc', source, main, '-o', executable)
      assert compiled.success?, 'Swift audit scope must compile'
      _output, _error, passed = Open3.capture3(executable)
      assert passed.success?, 'Swift audit scope must honor selected navigation and reject invalid input'
    end
  end
end
