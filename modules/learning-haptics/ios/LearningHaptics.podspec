Pod::Spec.new do |s|
  s.name           = 'LearningHaptics'
  s.version        = '1.0.0'
  s.summary        = 'Short learning-cycle haptics'
  s.description    = 'Haptics-only Core Haptics feedback with device-local opt-out.'
  s.author         = 'Project contributors'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '26.0'
  }
  s.source         = { git: '' }
  s.static_framework = true
  s.frameworks = 'CoreHaptics'

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
