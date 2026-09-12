Pod::Spec.new do |s|
  s.name           = 'PackageStore'
  s.version        = '1.0.0'
  s.summary        = 'Verified StoreKit package purchases'
  s.description    = 'Local Expo bridge for non-consumable ownership and restore.'
  s.author         = 'Project contributors'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '26.0'
  }
  s.source         = { git: '' }
  s.static_framework = true
  s.frameworks = 'StoreKit'

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
