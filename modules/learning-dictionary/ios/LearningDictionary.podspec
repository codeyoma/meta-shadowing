Pod::Spec.new do |s|
  s.name           = 'LearningDictionary'
  s.version        = '1.0.0'
  s.summary        = 'System dictionary lookup for visible learning words'
  s.description    = 'Presents the built-in dictionary without extracting definition content.'
  s.author         = 'Meta Shadowing'
  s.homepage       = 'https://github.com/codeyoma/meta-shadowing'
  s.platforms      = {
    :ios => '26.0'
  }
  s.source         = { git: 'https://github.com/codeyoma/meta-shadowing.git' }
  s.license        = { type: 'MIT', file: '../LICENSE' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
