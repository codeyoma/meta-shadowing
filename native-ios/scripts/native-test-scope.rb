#!/usr/bin/env ruby
# Screen ownership is explicit. Unknown app source needs a reviewed mapping,
# never an implicit full-suite fallback or an empty successful selection.
require 'json'

module NativeTestScope
  VERSION = 1
  PACKAGES = %w[LearningDomain LearningPersistence AppFoundation LearningMedia LearningReference AppleServices].freeze
  AUDIT_SCREENS = %w[bookshelf options player rate settings stages typography].freeze
  SCREEN_FILES = {
    'bookshelf' => %w[LibraryView BookCardView BookCardProgress BookManagementMenu BookTagsView],
    'stages' => %w[StagePathView StageDetailHeader StageFamilyView],
    'player' => %w[LearningPlayerView LearningControlsView LearningContentView VideoLearningView LessonVideoSurface LessonOrientation VoiceMonitorControls LearningRewardView],
    'options' => %w[LearningOptionsView AllSentencesView],
    'guide' => %w[LearningGuideView],
    'rate' => %w[RateEditorView LearningPreferencesView],
    'typography' => %w[TypographyEditorView LearningPreferencesView],
    'reveal' => %w[RevealSpeedEditorView LearningPreferencesView],
    'grouping' => %w[LearningPreferencesView],
    'settings' => %w[SettingsView LearningPreferencesView],
    'sync' => %w[CloudSyncView], 'data' => %w[DataManagementView],
    'experience' => %w[ExperiencePopover StudyStatusToolbar],
    'analysis' => %w[AnalysisBrowserView AnalysisDetailView AnalysisDictionaryButton SentenceRelationGraphView SentenceCopyButton],
    'dictionary' => %w[DictionaryHost PlayerDictionaryText],
    'diagnostics' => %w[DeveloperDownloadLabView DeveloperToolsView DeveloperDownloadView],
    'launch' => %w[LaunchGateView LaunchArtworkView],
    'navigation' => %w[RootView MetaShadowingApp ProductTabsView],
    'probes' => %w[SyntheticLearningProbeView SyntheticMediaProbeView PreviewLessonView PreviewLibraryView]
  }.freeze
  INTEGRATIONS = {
    'bookshelf' => %w[BookCardLayoutRenderingTests BookshelfSelectionRenderingTests],
    'stages' => %w[StageDetailRenderingTests StageDetailSummaryTests BrowsingInteractionTests LearningEntryTests],
    'player' => %w[LearningRewardRenderingTests LearningFlowTests LearningStudyTimeTests],
    'options' => %w[LearningFlowTests],
    'guide' => %w[LearningGuideTests],
    'rate' => [], 'typography' => [],
    'reveal' => %w[LearningFlowTests], 'grouping' => %w[LearningFlowTests],
    'settings' => [], 'sync' => [], 'data' => [], 'experience' => [],
    'analysis' => %w[AnalysisLoadingTimingTests SentenceGraphRenderingTests SentenceArrowheadRenderingTests SentenceRelationGeometryTests SentenceRelationPortTests ReferenceLifecycleTests],
    'dictionary' => %w[DictionaryOwnershipTests ReferenceLifecycleTests],
    'diagnostics' => %w[DownloadLabTests DevelopmentLibraryTests],
    'launch' => %w[LaunchArtworkTests LaunchAppearanceTests LaunchInteractionTests],
    'navigation' => %w[BrowsingInteractionTests LearningEntryTests],
    'probes' => %w[SyntheticMediaSetupTests NativeLifecycleTests]
  }.freeze
  # Mixed-screen test classes are selected by method, never by the whole class.
  UI = {
    'bookshelf' => { 'BookshelfUITests' => /./, 'AppleServicesUITests' => /DownloadAndRemoval|DownloadConfirmation/, 'VoiceOverSemanticsUITests' => /./ },
    'stages' => { 'ProductUITests' => /\AtestStage/, 'VoiceOverSemanticsUITests' => /./ },
    'player' => { 'PlayerUITests' => /\Atest(?:PortraitGroupedVideo|FullscreenDock|FullscreenPopovers|VideoFullscreen|Brief|ResumePlaying|NextIs|InstalledLesson|RevealLevel|VideoStays|SubtitleToggle|VideoHint|ProgressTrack|RepeatAndBackground|GroupedVideoAndSilent|AudioLayout|AllSentences|SaveFailure|RealAudio)/, 'ProductAccessibilityUITests' => /./, 'VoiceOverSemanticsUITests' => /./ },
    'options' => { 'PlayerUITests' => /Options|AllSentences|UngroupedPlayerCanEdit/, 'VoiceOverSemanticsUITests' => /testPrincipalScreens/ },
    'guide' => { 'PlayerUITests' => /GuideExplains/ },
    'rate' => { 'PlayerUITests' => /RateEdit|RateEditor|GlobalPreference/, 'ProductUITests' => /RateEditor/, 'VoiceOverSemanticsUITests' => /./ },
    'typography' => { 'PlayerUITests' => /FontPopovers/, 'ProductUITests' => /FontSettings/, 'VoiceOverSemanticsUITests' => /testPrincipalScreens/ },
    'reveal' => { 'PlayerUITests' => /Reveal|SilentSpeed/, 'ProductUITests' => /RevealPreset/ },
    'grouping' => { 'PlayerUITests' => /FullscreenGrouping|FailedGroupingEdit/ },
    'settings' => { 'ProductUITests' => /LearningSettings|SettingsPreviews|BooksStagesSettings/, 'AppleServicesUITests' => /ServiceSettingsRemainReachable|FreeDownloadsAndSettings/, 'VoiceOverSemanticsUITests' => /testPrincipalScreens/ },
    'sync' => { 'AppleServicesUITests' => /SyncToggle/ },
    'data' => { 'AppleServicesUITests' => /LocalReset|Deletion|DataConfirmations/ },
    'experience' => { 'ProductUITests' => /ExperiencePopover/ },
    'analysis' => { 'ReferenceToolsUITests' => /./ },
    'dictionary' => { 'ReferenceToolsUITests' => /Dictionary|ConnectedTokens|VisiblePlayerWord/ },
    'diagnostics' => { 'DownloadLabUITests' => /./, 'AppleServicesUITests' => /DeveloperTools/ },
    'launch' => {},
    'navigation' => { 'ProductUITests' => /BooksStagesSettings/, 'NativeFoundationUITests' => /LibraryDetailForeground/ },
    'probes' => { 'NativeMediaUITests' => /./, 'NativeFoundationUITests' => /./ }
  }.freeze
  LOGIC = {
    'StageDetailSummary' => %w[StageDetailSummaryTests], 'LearningEntry' => %w[LearningEntryTests],
    'LearningFlow' => %w[LearningFlowTests LearningStudyTimeTests], 'LearningStudyTime' => %w[LearningStudyTimeTests],
    'BrowsingTapFeedback' => %w[BrowsingInteractionTests NativeHapticTests],
    'BrandStyle' => %w[BrandPaletteTests], 'LearningFont' => %w[PlayerLayoutRenderingTests],
    'LearningTextLayout' => %w[PlayerLayoutRenderingTests], 'PlayerLayoutDiagnostics' => %w[PlayerLayoutRenderingTests],
    'DictionaryRequestOwner' => %w[DictionaryOwnershipTests], 'DictionaryPresenter' => %w[DictionaryOwnershipTests],
    'DictionaryWords' => %w[DictionaryOwnershipTests],
    'SentenceRelationGeometry' => %w[SentenceRelationGeometryTests SentenceRelationPortTests],
    'ReferenceTestSyntax' => %w[AnalysisLoadingTimingTests],
    'DevelopmentLibraryCatalog' => %w[DevelopmentLibraryTests], 'DevelopmentDuoAssets' => %w[DevelopmentLibraryTests],
    'DeveloperDownloadLabModel' => %w[DownloadLabTests], 'DeveloperDownloadLabTransport' => %w[DownloadLabTests],
    'ProductTestFixtures' => %w[SyntheticMediaSetupTests], 'SyntheticMediaFixtures' => %w[SyntheticMediaSetupTests],
    'ServiceTestCloud' => %w[DownloadLabTests], 'ServiceTestAssets' => %w[DownloadLabTests]
  }.freeze
  UI_HELPERS = {
    'LearningPlayerActions' => %w[revealStage revealBrowsingElement assertBrowsingXP exitLearningThroughOptions]
  }.freeze
  PACKAGE_INTEGRATIONS = {
    'LearningDomain' => %w[StageDetailSummaryTests LearningFlowTests],
    'LearningPersistence' => %w[LearningStudyTimeTests LearningFlowTests],
    'AppFoundation' => %w[LearningEntryTests StageDetailSummaryTests LearningFlowTests],
    'LearningMedia' => %w[NativeLifecycleTests NativeHapticTests AudioQueueTransportTests VideoSegmentTransportTests VoiceMonitorGainTests],
    'LearningReference' => %w[ReferenceLifecycleTests AnalysisLoadingTimingTests DictionaryOwnershipTests],
    'AppleServices' => %w[DownloadLabTests DevelopmentLibraryTests]
  }.freeze

  def self.plan(change, root: Dir.pwd)
    paths = change.fetch('paths')
    raise 'Invalid changed paths' unless paths.is_a?(Array) && paths.all? { |p| p.is_a?(String) && !p.start_with?('/') && !p.split('/').include?('..') && !p.include?("\0") }
    screens, suites, packages, selectors = [], [], [], []
    edited_audit_tests = false
    paths.each do |path|
      stem = File.basename(path, '.swift')
      if path.start_with?('native-ios/App/') && path.end_with?('.swift')
        owners = SCREEN_FILES.select { |_, files| files.include?(stem) }.keys
        raise "Unmapped native app source: #{path}" if owners.empty? && !LOGIC.key?(stem)
        screens.concat(owners)
        suites.concat(LOGIC.fetch(stem, []))
      elsif path =~ %r{\Anative-ios/Packages/([^/]+)/}
        package = Regexp.last_match(1)
        raise 'Unmapped native package' unless PACKAGES.include?(package)
        packages << package
        suites.concat(PACKAGE_INTEGRATIONS.fetch(package))
      elsif path.start_with?('native-ios/Tests/MediaIntegrationTests/') && path.end_with?('.swift')
        if File.file?(File.join(root, path))
          names = File.read(File.join(root, path)).scan(/\b(?:struct|class) (\w+Tests)\b/).flatten
          raise 'Integration test helper needs explicit consumer ownership' if names.empty?
          suites.concat(names)
        end
      elsif path.start_with?('native-ios/Tests/AppUITests/') && path.end_with?('.swift')
        if stem == 'ScreenTestScope'
          edited_audit_tests = true
          selectors << '-only-testing:NativeFoundationUITests/VoiceOverSemanticsUITests'
          next
        end
        if UI_HELPERS.key?(stem)
          consumers = ui_helper_consumers(root, stem)
          selectors.concat(consumers)
          edited_audit_tests ||= consumers.any? { |selector| selector.include?('/VoiceOverSemanticsUITests/') }
          next
        end
        names = changed_ui_methods(File.join(root, path), change.fetch('hunks', {}).fetch(path, []))
        raise 'UI test helper needs explicit consumer ownership' if names.empty? && File.file?(File.join(root, path))
        edited_audit_tests ||= stem == 'VoiceOverSemanticsUITests' && !names.empty?
        selectors.concat(names.map { |name| "-only-testing:NativeFoundationUITests/#{stem}/#{name}" })
      elsif path == 'native-ios/App/Localizable.xcstrings'
        suites << 'LocalizationBaseTests'
      elsif path.start_with?('native-ios/App/Assets.xcassets/')
        suites << 'BrandPaletteTests'
      elsif path.start_with?('assets/brand/')
        suites << 'LaunchArtworkTests'
      end
    end
    screens.uniq.sort.each do |screen|
      suites.concat(INTEGRATIONS.fetch(screen))
      UI.fetch(screen).each do |suite, pattern|
        file = File.join(root, 'native-ios/Tests/AppUITests', "#{suite}.swift")
        methods = File.file?(file) ? File.read(file).scan(/\bfunc (test\w+)\s*\(/).flatten.grep(pattern) : []
        selectors.concat(methods.map { |name| "-only-testing:NativeFoundationUITests/#{suite}/#{name}" })
      end
    end
    if screens.include?('rate') || screens.include?('player')
      file = File.join(root, 'native-ios/Tests/MediaIntegrationTests/PlayerLayoutRenderingTests.swift')
      methods = File.file?(file) ? File.read(file).scan(/\bfunc (test\w+)\s*\(/).flatten : []
      methods.select! { |name| name.start_with?('testRate') ? screens.include?('rate') : screens.include?('player') }
      selectors.concat(methods.map { |name| "-only-testing:NativeMediaIntegrationTests/PlayerLayoutRenderingTests/#{name}" })
    end
    selectors.concat(suites.uniq.map { |suite| "-only-testing:NativeMediaIntegrationTests/#{suite}" })
    audit_screens = screens.uniq & AUDIT_SCREENS
    # With no changed app audit screen, edits to the audit journey itself own its
    # explicit principal screens. This is recorded, never inferred from an empty value.
    audit_screens = AUDIT_SCREENS if audit_screens.empty? && edited_audit_tests
    change.merge('version' => VERSION, 'screens' => screens.uniq.sort, 'packages' => packages.uniq.sort,
                 'audit_screens' => audit_screens.sort, 'selectors' => selectors.uniq.sort)
  end

  def self.ui_declarations(path)
    return [] unless File.file?(path)
    File.readlines(path).each_with_index.filter_map do |line, index|
      match = /^    (?:@\w+(?:\([^)]*\))? )*(?:(?:private|override) )?func (\w+)\s*\(/.match(line)
      [index + 1, match[1]] if match
    end
  end

  # A reviewed helper owns its actual callers, including a test file's local
  # wrapper methods, rather than every method of each mixed-screen test class.
  def self.ui_helper_consumers(root, stem)
    helpers = UI_HELPERS.fetch(stem)
    directory = File.join(root, 'native-ios/Tests/AppUITests')
    declared = ui_declarations(File.join(directory, "#{stem}.swift")).map(&:last)
    raise 'UI helper declarations need reviewed ownership' if declared.empty? || !(declared - helpers).empty?
    selectors = Dir.glob(File.join(directory, '*UITests.swift')).flat_map do |file|
      lines = File.readlines(file)
      declarations = ui_declarations(file)
      bodies = declarations.each_with_index.to_h do |(line, name), index|
        finish = declarations[index + 1]&.first || lines.length + 1
        [name, lines[(line - 1)...(finish - 1)].join.split('{', 2).last.to_s]
      end
      callers = helpers.dup
      loop do
        found = bodies.select { |_, body| callers.any? { |name| body.match?(/\b#{Regexp.escape(name)}\s*\(/) } }.keys
        expanded = (callers + found).uniq
        break if expanded == callers
        callers = expanded
      end
      (bodies.keys & callers).grep(/\Atest/).map do |name|
        "-only-testing:NativeFoundationUITests/#{File.basename(file, '.swift')}/#{name}"
      end
    end
    raise 'UI helper has no reviewed test consumers' if selectors.empty?
    selectors
  end

  def self.changed_ui_methods(path, hunks)
    return [] unless File.file?(path)
    declarations = ui_declarations(path)
    tests = declarations.map(&:last).grep(/\Atest/)
    return tests if hunks.empty?
    selected = hunks.flat_map do |start, count|
      finish = start + [count, 1].max - 1
      hits = declarations.each_with_index.select do |(line, _), index|
        line <= finish && (declarations[index + 1]&.first || Float::INFINITY) > start
      end.map { |(line, name), _| name }
      # Imports/class setup and shared helpers affect this test file's methods.
      hits.empty? || hits.any? { |name| !name.start_with?('test') } ? tests : hits
    end
    selected.uniq
  end

  def self.validate!(scope)
    raise 'Invalid scoped test plan' unless scope.fetch('version') == VERSION &&
      scope.fetch('screens').is_a?(Array) && (scope['screens'] - SCREEN_FILES.keys).empty? &&
      scope.fetch('packages').is_a?(Array) && (scope['packages'] - PACKAGES).empty? &&
      scope.fetch('audit_screens', scope['screens']).is_a?(Array) && (scope.fetch('audit_screens', scope['screens']) - SCREEN_FILES.keys).empty? &&
      scope.fetch('selectors').is_a?(Array) && scope['selectors'].all? { |flag| flag.is_a?(String) && flag.match?(%r{\A-only-testing:(NativeFoundationUITests|NativeMediaIntegrationTests)/\w+(?:/test\w+)?\z}) }
    scope
  end

  def self.verify_selection!(scope, inventory)
    selectors = validate!(scope).fetch('selectors')
    raise 'Empty native selection' if selectors.empty?
    raise 'Invalid compiled inventory' unless inventory.fetch('errors').empty?
    identifiers = inventory.fetch('values').flat_map do |value|
      raise 'Disabled compiled tests' unless value.fetch('disabledTests').empty?
      value.fetch('enabledTests').map { |test| test.fetch('identifier') }
    end
    selectors.each do |flag|
      selector = flag.delete_prefix('-only-testing:')
      raise 'Selector has no compiled test' unless identifiers.any? do |id|
        id.start_with?(selector + '/') || id.sub(/\([^()]*\)\z/, '') == selector
      end
    end
  end
end

if $PROGRAM_NAME == __FILE__
  begin
    command, input, output = ARGV
    raise 'Expected scope command and input/output paths' unless ARGV.length == 3
    scope = JSON.parse(File.read(input))
    case command
    when 'plan'
      File.write(output, JSON.pretty_generate(NativeTestScope.plan(scope)))
    when 'selection'
      File.write(output, JSON.generate(NativeTestScope.validate!(scope).fetch('selectors')))
    when 'verify'
      NativeTestScope.verify_selection!(scope, JSON.parse(File.read(output)))
    else
      raise 'Unknown scope command'
    end
  rescue StandardError => error
    warn "FAIL: Native scope selection failed (#{error.class}); review the private scope inputs and mappings."
    exit 1
  end
end
