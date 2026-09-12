Pod::Spec.new do |s|
  s.name           = 'ProgressCloud'
  s.version        = '1.0.0'
  s.summary        = 'Private learning progress backup'
  s.description    = 'Account-isolated CloudKit backup transport for Expo.'
  s.author         = 'Project contributors'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '26.0'
  }
  s.source         = { git: '' }
  s.static_framework = true
  s.frameworks = 'CloudKit', 'CryptoKit'
  s.swift_version = '6.0'

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
